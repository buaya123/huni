"""Huni backend - anonymous social app.

FastAPI + MongoDB (motor). JWT auth with bcrypt password hashing.
WebSockets for realtime chat + notifications.
"""

import logging
import os
import random
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone, time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import jwt
from bcrypt import checkpw, gensalt, hashpw
from bson.binary import Binary
from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

from core.config import (
    ADMIN_EMAILS,
    CORS_ORIGINS,
    DB_NAME,
    ENABLE_DEV_SEED,
    ENABLE_DOCS,
    ENVIRONMENT,
    FIREBASE_PROJECT_ID,
    GOOGLE_SESSION_DAYS,
    IS_PRODUCTION,
    JWT_ALGORITHM,
    JWT_EXPIRE_DAYS,
    JWT_SECRET,
    MAX_IMAGE_BYTES,
    MIN_PASSWORD_LENGTH,
    MIN_SIGNUP_AGE,
    MONGO_URL,
    TRUSTED_HOSTS,
)
from core.image_processor import InvalidImage, process_image
from core.login_guard import (
    clear_login_attempts,
    is_locked_out,
    register_failed_login,
)
from core.rate_limit import limiter
from core.security import SecurityHeadersMiddleware
from email_service import send_verification_email
from routes import legal
from verification_service import (
    create_verification,
    resend_verification,
    verify_code,
)

FIREBASE_KEY = Path(__file__).parent / "serviceAccountKey.json"

if not firebase_admin._apps and FIREBASE_KEY.exists():
    try:
        cred = credentials.Certificate(str(FIREBASE_KEY))
        firebase_admin.initialize_app(cred)
    except Exception:  # noqa: BLE001
        logging.getLogger("huni").exception("Firebase init failed")

client = AsyncIOMotorClient(
    MONGO_URL,
    tz_aware=True,
    tzinfo=timezone.utc,
)
db = client[DB_NAME]

security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("huni")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await _run_startup()
    try:
        yield
    finally:
        client.close()


app = FastAPI(
    title="Huni API",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
    lifespan=lifespan,
)

api = APIRouter(prefix="/api")

# ---- middleware (order: outer → inner) ----
if TRUSTED_HOSTS and TRUSTED_HOSTS != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)

# CORS must be added BEFORE the app processes routes so preflights are handled.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=bool(CORS_ORIGINS) and CORS_ORIGINS != ["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Content-Type"],
    max_age=600,
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."},
        headers={"Retry-After": "60"},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # Never log request body — may contain passwords / PII.
    safe_errors = [
        {
            "loc": err.get("loc"),
            "msg": err.get("msg"),
            "type": err.get("type"),
        }
        for err in exc.errors()
    ]
    logger.info(
        "Validation error on %s %s (%d fields)",
        request.method,
        request.url.path,
        len(safe_errors),
    )
    return JSONResponse(status_code=422, content={"detail": safe_errors})


app.include_router(legal.router, prefix="/api")




# ---------- helpers ----------
def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def hash_pw(pw: str) -> str:
    return hashpw(pw.encode("utf-8"), gensalt()).decode("utf-8")


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(user_id: str) -> str:
    now_dt = now()
    payload = {
        "sub": user_id,
        "iat": int(now_dt.timestamp()),
        "exp": int((now_dt + timedelta(days=JWT_EXPIRE_DAYS)).timestamp()),
        "jti": new_id(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _password_ok(pw: str) -> bool:
    """Basic complexity — length + at least one letter + one digit."""
    if len(pw) < MIN_PASSWORD_LENGTH:
        return False
    return bool(re.search(r"[A-Za-z]", pw)) and bool(re.search(r"\d", pw))


ADJECTIVES = [
    "Quiet", "Brave", "Kind", "Silent", "Golden", "Warm", "Sunny", "Coastal",
    "Curious", "Gentle", "Bold", "Humble", "Wild", "Clever", "Calm", "Lucky",
    "Mellow", "Bright", "Swift", "Steady", "Rustic", "Cozy", "Merry", "Free",
]
NOUNS = [
    "Tarsier", "Mango", "Coconut", "Fisher", "Palm", "Wave", "Reef", "Sunset",
    "Firefly", "Bamboo", "Harbor", "Lantern", "Kite", "Sailor", "Dreamer",
    "Wanderer", "Nomad", "Voyager", "Pilgrim", "Poet", "Scribe", "Sage",
    "Owl", "Falcon", "Turtle", "Dolphin",
]


async def gen_unique_alias() -> str:
    for _ in range(20):
        alias = f"{random.choice(ADJECTIVES)}{random.choice(NOUNS)}{random.randint(10, 999)}"
        exists = await db.users.find_one({"alias": alias}, {"_id": 1})
        if not exists:
            return alias
    return f"User{new_id()[:8]}"



async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    """Accept either a JWT (email/password auth) OR a session_token (Google auth)."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing token")

    token = credentials.credentials

    # 1) try JWT first (expiration IS verified, plus revocation check)
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        user_id = payload["sub"]

        # Revocation check — a token can be revoked on /auth/logout or by admin.
        jti = payload.get("jti") or token[-24:]  # legacy fallback
        revoked = await db.revoked_tokens.find_one({"jti": jti}, {"_id": 1})
        if revoked:
            raise HTTPException(status_code=401, detail="Token has been revoked")

        user = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "password": 0},
        )
        if user:
            if user.get("status") == "banned":
                raise HTTPException(status_code=403, detail="Account suspended")
            if user.get("status") == "deleted":
                raise HTTPException(status_code=401, detail="Account no longer exists")
            return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        pass

    # 2) try session_token (Google auth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        exp = session.get("expires_at")
        exp_dt: Optional[datetime] = None
        if isinstance(exp, datetime):
            exp_dt = exp
        elif isinstance(exp, str):
            try:
                exp_dt = datetime.fromisoformat(exp)
            except ValueError:
                exp_dt = None
        if exp_dt and exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        if exp_dt and exp_dt > now():
            user = await db.users.find_one(
                {"id": session["user_id"]},
                {"_id": 0, "password": 0},
            )
            if user:
                if user.get("status") == "banned":
                    raise HTTPException(status_code=403, detail="Account suspended")
                if user.get("status") == "deleted":
                    raise HTTPException(status_code=401, detail="Account no longer exists")
                return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")



# ---------- models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    birthdate: str = Field(min_length=8, max_length=10)  # "YYYY-MM-DD"


class FirebaseAuthIn(BaseModel):
    id_token: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str = Field(min_length=1)


class AuthOut(BaseModel):
    token: str
    user: Dict[str, Any]


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=2000)
    mood: str = Field(pattern="^(need_advice|confession|rant|question|local_update|hot_take|buy_sell|safety|pulse)$")
    audience: str = Field(default="public", pattern="^(public|nearby)$")
    pulse_options: Optional[List[str]] = None  # for pulse-type posts
    image_ids: Optional[List[str]] = None  # max 4


class CommentCreate(BaseModel):
    content: str = Field(default="", max_length=1000)
    parent_comment_id: Optional[str] = None
    image_ids: Optional[List[str]] = None  # max 4


class UploadIn(BaseModel):
    data: str  # base64-encoded image (raw or data URI)
    content_type: str = Field(
        default="image/jpeg",
        pattern="^image/(jpeg|png)$",
    )


class AdCreate(BaseModel):
    business_name: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=1000)
    link_url: Optional[str] = Field(default=None, max_length=500)
    image_ids: Optional[List[str]] = None  # max 4
    frequency_weight: int = Field(default=5, ge=1, le=10)


class AdUpdate(BaseModel):
    business_name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    content: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    link_url: Optional[str] = Field(default=None, max_length=500)
    image_ids: Optional[List[str]] = None
    frequency_weight: Optional[int] = Field(default=None, ge=1, le=10)
    enabled: Optional[bool] = None
    comments_enabled: Optional[bool] = None


class RoleUpdate(BaseModel):
    role: str = Field(pattern="^(user|advertiser|partner)$")
    business_name: Optional[str] = Field(default=None, max_length=80)
    business_type: Optional[str] = Field(default=None, max_length=60)


class CampaignCreate(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=2, max_length=1000)
    discount_label: str = Field(default="", max_length=80)  # optional in-store perk (e.g. "10% off")
    terms: str = Field(default="", max_length=500)
    image_ids: Optional[List[str]] = None
    start_date: Optional[str] = Field(default=None, max_length=10)  # YYYY-MM-DD
    end_date: Optional[str] = Field(default=None, max_length=10)
    redemption_policy: str = Field(
        default="once",
        pattern="^(once|cooldown|unlimited)$",
    )

    cooldown_value: int = Field(
        default=1,
        ge=1,
        le=365,
    )

    cooldown_unit: str = Field(
        default="days",
        pattern="^(minutes|hours|days|weeks|months)$",
    )


class CampaignUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, min_length=2, max_length=1000)
    discount_label: Optional[str] = Field(default=None, max_length=80)
    terms: Optional[str] = Field(default=None, max_length=500)
    image_ids: Optional[List[str]] = None
    start_date: Optional[str] = Field(default=None, max_length=10)
    end_date: Optional[str] = Field(default=None, max_length=10)
    enabled: Optional[bool] = None
    redemption_policy: Optional[str] = Field(
        default=None,
        pattern="^(once|cooldown|unlimited)$",
    )

    cooldown_value: Optional[int] = Field(
        default=None,
        ge=1,
        le=365,
    )

    cooldown_unit: Optional[str] = Field(
        default=None,
        pattern="^(minutes|hours|days|weeks|months)$",
    )


class CampaignApproveIn(BaseModel):
    exp_per_redemption: int = Field(default=0, ge=0, le=10000)
    tokens_per_redemption: int = Field(default=0, ge=0, le=100000)
    budget_exp: int = Field(default=0, ge=0, le=10_000_000)
    budget_tokens: int = Field(default=0, ge=0, le=10_000_000)


class CampaignRejectIn(BaseModel):
    reason: str = Field(default="", max_length=300)


# class PartnerScanIn(BaseModel):
#     code: str = Field(min_length=1, max_length=500)  # QR payload — "huni:user:<id>" or just user id

class PartnerScanIn(BaseModel):
    code: str
    partner_id: str | None = None

class PartnerRedeemIn(BaseModel):
    campaign_id: str
    user_id: str
    note: Optional[str] = Field(default=None, max_length=200)
    partner_id: str | None = None

class ScannerAssignIn(BaseModel):
    user_id: str


class StoreItemIn(BaseModel):
    category: str = Field(pattern="^(appearance|seasonal|events|collections)$")
    subcategory: str = Field(max_length=40)
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    price_tokens: int = Field(default=0, ge=0, le=1_000_000)
    stock: int = Field(default=-1, ge=-1, le=1_000_000)  # -1 = unlimited
    image_id: Optional[str] = Field(default=None, max_length=200)
    hex_color: Optional[str] = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")  # for background_colors
    enabled: bool = True
    active_from: Optional[str] = Field(default=None, max_length=10)
    active_until: Optional[str] = Field(default=None, max_length=10)
    sort_order: int = Field(default=0, ge=0, le=10_000)


class StoreItemUpdate(BaseModel):
    category: Optional[str] = Field(default=None, pattern="^(appearance|seasonal|events|collections)$")
    subcategory: Optional[str] = Field(default=None, max_length=40)
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    price_tokens: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    stock: Optional[int] = Field(default=None, ge=-1, le=1_000_000)
    image_id: Optional[str] = Field(default=None, max_length=200)
    hex_color: Optional[str] = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")
    enabled: Optional[bool] = None
    active_from: Optional[str] = Field(default=None, max_length=10)
    active_until: Optional[str] = Field(default=None, max_length=10)
    sort_order: Optional[int] = Field(default=None, ge=0, le=10_000)


class EquipIn(BaseModel):
    slot: str = Field(pattern="^(bg_color|bg_pattern|border|avatar)$")
    item_id: Optional[str] = Field(default=None, max_length=200)


class AdSettingsIn(BaseModel):
    ad_every_n_posts: int = Field(ge=2, le=20)


class ReactionIn(BaseModel):
    kind: str = Field(pattern="^(heart|helpful|hug|laugh)$")


class CommentReactionIn(BaseModel):
    kind: str = Field(pattern="^(up|down)$")


class PulseVoteIn(BaseModel):
    option_index: int


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class ChatStartIn(BaseModel):
    other_user_id: str


class ReportIn(BaseModel):
    target_type: str = Field(pattern="^(post|comment|message|user)$")
    target_id: str
    reason: str = Field(max_length=300)

class ResolveReportIn(BaseModel):
    action: str                 # delete_post, dismiss, suspend_user
    violation: str              # spam, hate_speech, etc.
    note: str = ""
    notify: bool = True


class BlockIn(BaseModel):
    target_user_id: str


class BioUpdate(BaseModel):
    bio: str = Field(max_length=200)

class ScannerAssignInput(BaseModel):
    user_id: str

class RegisterOut(BaseModel):
    verification_required: bool
    email: str

class VerifyEmailIn(BaseModel):
    email: EmailStr
    code: str

class ResendVerificationIn(BaseModel):
    email: EmailStr


# ---------- utility: sanitize user for public output ----------
RANK_TITLES: List[Tuple[int, str]] = [
    (1, "New Neighbor"),
    (5, "Resident"),
    (10, "Regular"),
    (20, "Contributor"),
    (30, "Local Guide"),
    (40, "Community Builder"),
    (50, "Town Champion"),
    (60, "Community Pillar"),
    (75, "Huni Elder"),
    (100, "Legend"),
]

# Base XP thresholds for levels 1-10 as specified
_BASE_RANK_THRESHOLDS: List[int] = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200]


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled exception during %s %s",
        request.method,
        request.url.path,
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error."
        },
    )

def _build_rank_thresholds(max_level: int = 100) -> List[int]:
    """Cumulative XP required to reach each level index (0-based). +15% per level after level 10."""
    thresholds = list(_BASE_RANK_THRESHOLDS)
    # From level 11 onward, increase last step by ~15%
    last_step = thresholds[-1] - thresholds[-2]  # step from 9→10
    while len(thresholds) < max_level:
        last_step = int(round(last_step * 1.15))
        thresholds.append(thresholds[-1] + last_step)
    return thresholds


RANK_THRESHOLDS: List[int] = _build_rank_thresholds(100)


def rank_for_exp(exp: int) -> Dict[str, Any]:
    """Compute {level, title, exp_current_level, exp_next_level, progress_percent}."""
    exp = max(0, int(exp or 0))
    level = 1
    for i, threshold in enumerate(RANK_THRESHOLDS):
        if exp >= threshold:
            level = i + 1
        else:
            break
    # Title = last title whose min_level <= current level
    title = RANK_TITLES[0][1]
    for min_lvl, name in RANK_TITLES:
        if level >= min_lvl:
            title = name
    exp_at_level = RANK_THRESHOLDS[level - 1] if level - 1 < len(RANK_THRESHOLDS) else RANK_THRESHOLDS[-1]
    exp_next = RANK_THRESHOLDS[level] if level < len(RANK_THRESHOLDS) else exp_at_level  # max level
    span = max(1, exp_next - exp_at_level)
    progress = int(round(((exp - exp_at_level) / span) * 100)) if level < len(RANK_THRESHOLDS) else 100
    return {
        "level": level,
        "title": title,
        "exp": exp,
        "exp_current_level": exp_at_level,
        "exp_next_level": exp_next,
        "progress_percent": max(0, min(100, progress)),
    }


def public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    exp = int(u.get("exp", u.get("points", 0)) or 0)
    rank = rank_for_exp(exp)
    return {
        "id": u["id"],
        "alias": u["alias"],
        "helpful_score": u.get("helpful_score", 0),
        "post_count": u.get("post_count", 0),
        "comment_count": u.get("comment_count", 0),
        "bio": u.get("bio", ""),
        "joined_at": u.get("joined_at"),
        "first_name": u.get("first_name", ""),
        "last_name": u.get("last_name", ""),
        "birthdate": u.get("birthdate", ""),
        "picture": u.get("picture", ""),
        "auth_provider": u.get("auth_provider", "password"),
        "role": u.get("role", "user"),
        # legacy alias for existing UI code
        "points": exp,
        "exp": exp,
        "tokens": int(u.get("tokens", 0) or 0),
        "rank_level": rank["level"],
        "rank_title": rank["title"],
        "business_name": u.get("business_name", ""),
        "business_type": u.get("business_type", ""),

        "accepted_terms": u.get("accepted_terms", False),
        "accepted_terms_at": u.get("accepted_terms_at"),
        "terms_version": u.get("terms_version", 1),
        
    }


async def award_xp(user_id: str, amount: int, reason: str) -> None:
    """Fire-and-forget XP grant. Silently ignores zero/negative amounts."""
    if amount <= 0:
        return
    try:
        await db.users.update_one({"id": user_id}, {"$inc": {"exp": amount}})
        await db.xp_ledger.insert_one({
            "id": new_id(),
            "user_id": user_id,
            "amount": amount,
            "reason": reason,
            "created_at": now().isoformat(),
        })
    except Exception:  # noqa: BLE001
        pass


async def bump_daily(user_id: str, key: str) -> int:
    """Increment today's counter for `key`, resetting when the day changes. Returns the new count."""
    today = now().date().isoformat()
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "daily_stats": 1})
    stats = ((doc or {}).get("daily_stats") or {})
    if stats.get("date") != today:
        stats = {"date": today}
    new_count = int(stats.get(key, 0)) + 1
    stats[key] = new_count
    await db.users.update_one({"id": user_id}, {"$set": {"daily_stats": stats}})
    return new_count


async def award_xp_daily_capped(user_id: str, key: str, cap: int, per_hit_xp: int, reason: str) -> None:
    """Award XP up to `cap` times per day for `key`."""
    n = await bump_daily(user_id, key)
    if n <= cap:
        await award_xp(user_id, per_hit_xp, reason)


async def award_xp_once_per_day(user_id: str, key: str, xp_amount: int, reason: str) -> bool:
    """Award `xp_amount` if this is the first time today for `key`. Returns True if awarded."""
    n = await bump_daily(user_id, key)
    if n == 1:
        await award_xp(user_id, xp_amount, reason)
        return True
    return False


async def create_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    message: str,
    post_id: str | None = None,
    violation: str | None = None,
    moderator_note: str | None = None,
):
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "type": type,
        "title": title,
        "message": message,
        "post_id": post_id,
        "violation": violation,
        "moderator_note": moderator_note,
        "created_at": now().isoformat(),
        "read": False,
    })

    await ws_manager.send_to(
        user_id,
        {
            "type": "notification",
        },
    )

async def notify_post_removed(
    *,
    post: dict,
    violation: str,
    moderator_note: str,
) -> None:

    recipients: set[str] = set()

    #
    # 1. Notify the author
    #
    await create_notification(
        user_id=post["author_id"],
        type="moderation",
        title="Post Removed",
        message="Your post was removed by a moderator for violating the Community Guidelines.",
        post_id=post["id"],
        violation=violation,
        moderator_note=moderator_note,
    )

    recipients.add(post["author_id"])

    #
    # 2. Commenters
    #
    comments = await db.comments.find(
        {
            "post_id": post["id"],
            "status": "active",
        },
        {
            "_id": 0,
            "author_id": 1,
        },
    ).to_list(None)

    for c in comments:
        uid = c["author_id"]

        if uid in recipients:
            continue

        recipients.add(uid)

        await create_notification(
            user_id=uid,
            type="moderation_post_removed",
            title="Discussion Closed",
            message="A post you commented on has been removed by moderators.",
            post_id=post["id"],
        )

    #
    # 3. Reactors
    #
    for uid in (post.get("reactors") or {}).keys():

        if uid in recipients:
            continue

        recipients.add(uid)

        await create_notification(
            user_id=uid,
            type="moderation_post_removed",
            title="Post Removed",
            message="A post you reacted to has been removed by moderators.",
            post_id=post["id"],
        )

    #
    # 4. Bookmarkers
    #
    bookmarks = await db.bookmarks.find(
        {
            "post_id": post["id"],
        },
        {
            "_id": 0,
            "user_id": 1,
        },
    ).to_list(None)

    for b in bookmarks:

        uid = b["user_id"]

        if uid in recipients:
            continue

        recipients.add(uid)

        await create_notification(
            user_id=uid,
            type="moderation_post_removed",
            title="Saved Post Removed",
            message="One of your bookmarked posts has been removed by moderators.",
            post_id=post["id"],
        )




async def maybe_promote_admin(user: Dict[str, Any]) -> Dict[str, Any]:
    """Promote a user to admin if their email is in ADMIN_EMAILS."""
    if user.get("email", "").lower() in ADMIN_EMAILS and user.get("role") != "admin":
        await db.users.update_one({"id": user["id"]}, {"$set": {"role": "admin"}})
        user["role"] = "admin"
    return user


def require_role(user: Dict[str, Any], *roles: str) -> None:
    if user.get("role", "user") not in roles:
        raise HTTPException(status_code=403, detail="Not allowed")

async def get_partner_for_user(
    user_id: str,
    partner_id: str,
):
    return await db.users.find_one(
        {
            "id": partner_id,
            "role": "partner",
            "scanners.user_id": user_id,
        },
        {
            "_id": 0,
        },
    )



# ---------- websocket manager ----------
class WSManager:
    def __init__(self) -> None:
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self.connections.get(user_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns and user_id in self.connections:
            del self.connections[user_id]

    async def send_to(self, user_id: str, message: Dict[str, Any]) -> None:
        for ws in list(self.connections.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                pass


ws_manager = WSManager()


# ---------- routes: root/health ----------
@api.get("/")
async def root() -> Dict[str, str]:
    return {"app": "Huni", "status": "ok"}


async def create_user(
    *,
    email: str,
    auth_provider: str,
    first_name: str = "",
    last_name: str = "",
    birthdate: str = "",
    password: str = "",
    picture: str = "",
):
    alias = await gen_unique_alias()

    user = {
        "id": new_id(),
        "email": email.lower().strip(),
        "password": hash_pw(password) if password else "",
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
        "birthdate": birthdate,
        "picture": picture,
        "auth_provider": auth_provider,
        "alias": alias,
        "bio": "",
        "helpful_score": 0,
        "post_count": 0,
        "comment_count": 0,
        "report_count": 0,
        "joined_at": now().isoformat(),
        "alias_regens": 0,
        "last_alias_regen": None,
        "email_verified": auth_provider != "password",
        "email_verified_at": now().isoformat() if auth_provider != "password" else None,
         "accepted_terms": False,
        "accepted_terms_at": None,
        "terms_version": 1,
    }

    await db.users.insert_one(user)

    return user

@api.post("/auth/verify-email", response_model=AuthOut)
async def verify_email(body: VerifyEmailIn):

    success, message, verification = await verify_code(
        db=db,
        email=body.email,
        code=body.code,
    )

    if not success:

        if message == "Verification code expired.":
            raise HTTPException(
                status_code=410,
                detail=message,
            )

        if message == "Too many attempts.":
            raise HTTPException(
                status_code=429,
                detail=message,
            )

        raise HTTPException(
            status_code=400,
            detail=message,
        )

    user = await db.users.find_one({
        "email": body.email.lower(),
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "email_verified": True,
                "email_verified_at": now(),
            }
        },
    )

    user["email_verified"] = True
    user["email_verified_at"] = now()

    token = make_token(user["id"])

    return AuthOut(
        token=token,
        user=public_user(user),
    )


@api.post("/auth/resend-verification")
async def resend_email(body: ResendVerificationIn):

    user = await db.users.find_one({
        "email": body.email.lower()
    })

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    if user.get("email_verified"):
        raise HTTPException(
            status_code=409,
            detail="Email already verified."
        )

    success, message, code = await resend_verification(
        db=db,
        user_id=user["id"],
        email=user["email"],
    )

    if not success:
        if "Please wait" in message:
            raise HTTPException(
                status_code=429,
                detail=message,
            )

        raise HTTPException(
            status_code=400,
            detail=message,
        )

    send_verification_email(
        user["email"],
        code,
    )

    return {
        "success": True
    }


@api.post("/auth/register", response_model=RegisterOut)
@limiter.limit("5/minute")
async def register(request: Request, inp: RegisterIn) -> Dict[str, Any]:
    email = inp.email.lower().strip()

    if not _password_ok(inp.password):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters "
                "and contain both letters and numbers."
            ),
        )

    existing = await db.users.find_one({"email": email}, {"_id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        bd = datetime.strptime(inp.birthdate, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid birthdate. Use YYYY-MM-DD.")

    today = now().date()
    age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
    if age < MIN_SIGNUP_AGE:
        raise HTTPException(
            status_code=422,
            detail=f"You must be at least {MIN_SIGNUP_AGE} years old to sign up.",
        )
    if bd.date() > today:
        raise HTTPException(status_code=422, detail="Birthdate cannot be in the future.")

    user = await create_user(
        email=email,
        password=inp.password,
        first_name=inp.first_name,
        last_name=inp.last_name,
        birthdate=inp.birthdate,
        auth_provider="password",
    )

    code = await create_verification(
        db=db,
        user_id=user["id"],
        email=user["email"],
    )

    try:
        send_verification_email(user["email"], code)
    except Exception:
        await db.users.delete_one({"id": user["id"]})
        await db.email_verifications.delete_many(
            {"user_id": user["id"], "purpose": "verify_email"}
        )
        logger.exception("Verification email failed for %s", email)
        raise HTTPException(
            status_code=500,
            detail="Unable to send verification email.",
        )

    return {"verification_required": True, "email": user["email"]}


@api.post("/auth/logout")
async def logout(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, str]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()

        # Revoke Google session tokens (delete)
        await db.user_sessions.delete_many({"session_token": token})

        # Revoke JWTs (blacklist by jti until natural expiry)
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[JWT_ALGORITHM],
                options={"verify_exp": False},
            )
            jti = payload.get("jti") or token[-24:]
            exp = payload.get("exp")
            expires_at = (
                datetime.fromtimestamp(exp, tz=timezone.utc)
                if isinstance(exp, (int, float))
                else now() + timedelta(days=JWT_EXPIRE_DAYS)
            )
            await db.revoked_tokens.update_one(
                {"jti": jti},
                {"$set": {"jti": jti, "expires_at": expires_at}},
                upsert=True,
            )
        except jwt.PyJWTError:
            pass
    return {"status": "ok"}


@api.post("/auth/login", response_model=AuthOut)
@limiter.limit("10/minute")
async def login(request: Request, inp: LoginIn) -> AuthOut:
    email = inp.email.lower().strip()
    lockout_key = f"email:{email}"

    if await is_locked_out(db, lockout_key):
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Please try again in a few minutes.",
        )

    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(inp.password, user.get("password", "")):
        await register_failed_login(db, lockout_key)
        # Generic message — don't disclose whether email exists.
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.get("email_verified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in.",
        )
    if user.get("status") == "banned":
        raise HTTPException(status_code=403, detail="Account suspended")

    await clear_login_attempts(db, lockout_key)
    user = await maybe_promote_admin(user)
    await award_xp_once_per_day(user["id"], "daily_login", 5, "daily_login")
    fresh = await db.users.find_one({"id": user["id"]})
    token = make_token(user["id"])
    return AuthOut(token=token, user=public_user(fresh or user))



@api.post("/auth/firebase", response_model=AuthOut)
@limiter.limit("10/minute")
async def firebase_login(request: Request, inp: FirebaseAuthIn = Body(...)) -> AuthOut:
    try:
        decoded = firebase_auth.verify_id_token(
            inp.id_token,
            check_revoked=True,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    # Optional project restriction — refuse tokens from other Firebase projects.
    if FIREBASE_PROJECT_ID and decoded.get("aud") != FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=401, detail="Firebase project mismatch")

    if not decoded.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email not verified with Google")

    email = (decoded.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Firebase token has no email")

    user = await db.users.find_one({"email": email})

    if user is None:
        full_name = (decoded.get("name") or "").strip()
        parts = full_name.split(" ", 1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""

        user = await create_user(
            email=email,
            auth_provider="google",
            first_name=first_name,
            last_name=last_name,
            birthdate="",
            password="",
            picture=decoded.get("picture", ""),
        )

    if user.get("status") == "banned":
        raise HTTPException(status_code=403, detail="Account suspended")

    user = await maybe_promote_admin(user)
    token = make_token(user["id"])
    return AuthOut(token=token, user=public_user(user))
@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return public_user(user)

@api.post("/legal/accept")
async def accept_legal(
    user=Depends(get_current_user),
):
    accepted_at = now().isoformat()

    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "accepted_terms": True,
                "accepted_terms_at": accepted_at,
                "terms_version": 1,
            }
        },
    )

    return {
        "success": True,
        "accepted_terms": True,
        "accepted_terms_at": accepted_at,
        "terms_version": 1,
    }


@api.post("/auth/regenerate-alias")
async def regenerate_alias(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    # limit: 1 regen per 7 days
    last = user.get("last_alias_regen")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if now() - last_dt < timedelta(days=7):
                raise HTTPException(status_code=429, detail="You can regenerate alias once every 7 days.")
        except ValueError:
            pass
    new_alias = await gen_unique_alias()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"alias": new_alias, "last_alias_regen": now().isoformat()},
         "$inc": {"alias_regens": 1}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return public_user(updated)


@api.patch("/auth/bio")
async def update_bio(inp: BioUpdate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    await db.users.update_one({"id": user["id"]}, {"$set": {"bio": inp.bio.strip()}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return public_user(updated)


class DeleteAccountIn(BaseModel):
    password: Optional[str] = Field(default=None, max_length=128)
    confirmation: str = Field(min_length=1, max_length=32)


@api.delete("/users/me")
@limiter.limit("3/hour")
async def delete_my_account(
    request: Request,
    inp: DeleteAccountIn,
    authorization: Optional[str] = Header(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    """Permanently delete the current account.

    Safeguards:
      • Must send `confirmation == "DELETE"` (case-sensitive).
      • Password-auth users must send their current password.
      • Google-auth users only need the confirmation string.
      • Rate limited to 3 attempts per hour per user.

    Effects (soft delete of the user record; hard delete of owned media):
      • users → status="deleted", PII scrubbed, password cleared, tokens=0, exp=0
      • posts / comments authored by user → status="deleted_by_user"
      • images / bookmarks / blocks / sessions / notifications → hard delete
      • JWT & Google sessions revoked
    """
    if inp.confirmation != "DELETE":
        raise HTTPException(
            status_code=422,
            detail='You must type "DELETE" exactly to confirm.',
        )

    auth_provider = user.get("auth_provider", "password")
    if auth_provider == "password":
        if not inp.password:
            raise HTTPException(
                status_code=422,
                detail="Password is required to delete your account.",
            )
        # get_current_user strips the password hash — re-fetch it here.
        secret_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 1})
        stored = (secret_doc or {}).get("password") or ""
        if not stored or not verify_pw(inp.password, stored):
            await register_failed_login(db, f"delete:{user['id']}")
            raise HTTPException(status_code=401, detail="Incorrect password.")

    uid = user["id"]
    now_iso = now().isoformat()
    tombstone_email = f"deleted-{uid}@huni.deleted"

    # 1) Scrub the user document (soft delete)
    await db.users.update_one(
        {"id": uid},
        {
            "$set": {
                "status": "deleted",
                "deleted_at": now_iso,
                "email": tombstone_email,
                "password": "",
                "first_name": "",
                "last_name": "",
                "bio": "",
                "picture": "",
                "birthdate": "",
                "google_sub": None,
                "firebase_uid": None,
                "business_name": "",
                "business_type": "",
                "tokens": 0,
                "exp": 0,
                "role": "user",
            }
        },
    )

    # 2) Mark authored posts + comments deleted
    await db.posts.update_many(
        {"author_id": uid, "status": {"$ne": "deleted_by_admin"}},
        {"$set": {"status": "deleted_by_user", "deleted_at": now_iso}},
    )
    await db.comments.update_many(
        {"author_id": uid, "status": {"$ne": "deleted_by_admin"}},
        {"$set": {"status": "deleted_by_user", "deleted_at": now_iso}},
    )

    # 3) Hard delete owned media and personal data
    await db.images.delete_many({"owner_id": uid})
    await db.bookmarks.delete_many({"user_id": uid})
    await db.blocks.delete_many({"$or": [{"blocker_id": uid}, {"target_user_id": uid}]})
    await db.notifications.delete_many({"user_id": uid})
    await db.email_verifications.delete_many({"user_id": uid})
    await db.user_sessions.delete_many({"user_id": uid})
    await db.login_attempts.delete_many({"key": f"email:{user.get('email', '').lower()}"})

    # 4) Revoke the current JWT (if the caller used one)
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[JWT_ALGORITHM],
                options={"verify_exp": False},
            )
            jti = payload.get("jti") or token[-24:]
            exp = payload.get("exp")
            expires_at = (
                datetime.fromtimestamp(exp, tz=timezone.utc)
                if isinstance(exp, (int, float))
                else now() + timedelta(days=JWT_EXPIRE_DAYS)
            )
            await db.revoked_tokens.update_one(
                {"jti": jti},
                {"$set": {"jti": jti, "expires_at": expires_at}},
                upsert=True,
            )
        except jwt.PyJWTError:
            pass

    logger.info("Account deleted: %s (provider=%s)", uid, auth_provider)
    return {"status": "deleted"}


# ---------- routes: posts ----------
async def _hydrate_post(p: Dict[str, Any], viewer_id: Optional[str]) -> Dict[str, Any]:
    author = await db.users.find_one({"id": p["author_id"]}, {"_id": 0, "password": 0})
    reactions = p.get("reactions", {})
    my_reaction = None
    if viewer_id and viewer_id in p.get("reactors", {}):
        my_reaction = p["reactors"][viewer_id]
    is_bookmarked = False
    if viewer_id:
        bm = await db.bookmarks.find_one({"post_id": p["id"], "user_id": viewer_id})
        is_bookmarked = bool(bm)
    return {
        "id": p["id"],
        "author": public_user(author) if author else {"id": p["author_id"], "alias": "Unknown"},
        "title": p.get("title", ""),
        "content": p["content"],
        "mood": p["mood"],
        "audience": p.get("audience", "public"),
        "created_at": p["created_at"],
        "reactions": reactions,
        "reaction_total": sum(reactions.values()) if reactions else 0,
        "my_reaction": my_reaction,
        "comment_count": p.get("comment_count", 0),
        "pulse_options": p.get("pulse_options"),
        "pulse_votes": p.get("pulse_votes"),
        "my_pulse_vote": (p.get("pulse_voters", {}) or {}).get(viewer_id) if viewer_id else None,
        "images": p.get("image_ids", []) or [],
        "status": p.get("status", "active"),
        "is_bookmarked": is_bookmarked,
        "bookmark_count": p.get("bookmark_count", 0),
    }


@api.post("/posts")
@limiter.limit("20/hour")
async def create_post(
    request:Request,
    inp: PostCreate,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:

    doc: Dict[str, Any] = {
        "id": new_id(),
        "author_id": user["id"],
        "title": inp.title.strip(),
        "content": inp.content.strip(),
        "mood": inp.mood,
        "audience": inp.audience,
        "created_at": now().isoformat(),
        "reactions": {},
        "reactors": {},
        "comment_count": 0,
        "status": "active",
        "image_ids": (inp.image_ids or [])[:4],
    }

    if inp.mood == "pulse" and inp.pulse_options:
        doc["pulse_options"] = inp.pulse_options[:4]
        doc["pulse_votes"] = [0] * len(doc["pulse_options"])
        doc["pulse_voters"] = {}

    await db.posts.insert_one(doc)

    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"post_count": 1}},
    )

    # XP awards
    await award_xp(user["id"], 15, "create_post")
    await award_xp_once_per_day(user["id"], "first_post_bonus", 10, "first_post_of_day")

    return await _hydrate_post(doc, user["id"])


async def _inject_ads(items: List[Dict[str, Any]],offset: int = 0,) -> List[Dict[str, Any]]:
    """Insert weighted-random ads into a feed, one every N posts (admin setting)."""
    if len(items) < 2:
        return items
    ads = await db.ads.find({"status": "active", "enabled": True}, {"_id": 0}).to_list(100)
    if not ads:
        return items
    s = await db.settings.find_one({"key": "ads"}, {"_id": 0})
    every_n = (s or {}).get("ad_every_n_posts", 5)
    slots = max(1, len(items) // every_n)
    
    last_ad_id = None

    def choose_weighted_ad():

        nonlocal last_ad_id

        candidates = ads

        if len(ads) > 1 and last_ad_id:

            filtered = [a for a in ads if a["id"] != last_ad_id]

            if filtered:
                candidates = filtered

        total = sum(ad.get("frequency_weight", 5) for ad in candidates)

        r = random.uniform(0, total)

        acc = 0

        chosen = candidates[-1]

        for ad in candidates:

            acc += ad.get("frequency_weight", 5)

            if r <= acc:
                chosen = ad
                break

        last_ad_id = chosen["id"]

        return chosen

    # weighted sampling without replacement (frequency_weight 1-10)
    

    out: List[Dict[str, Any]] = []

    for i, p in enumerate(items):

        out.append(p)

        global_index = offset + i + 1

        if global_index % every_n == 0:

            ad = choose_weighted_ad()

            if ad:
                out.append(
                    _hydrate_ad(
                        ad,
                        f"{ad['id']}-{global_index}"
                    )
                )

    return out


@api.get("/posts")
async def list_posts(
    tab: str = Query(default="latest", pattern="^(latest|trending|nearby|pulse)$"),
    offset: int = Query(0, ge=0),
    limit: int = Query(15, ge=1, le=50),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    # exclude blocked authors
    block_docs = await db.blocks.find({"blocker_id": user["id"]}).to_list(500)
    blocked_ids = [b["target_user_id"] for b in block_docs]
    query: Dict[str, Any] = {"status": "active", "author_id": {"$nin": blocked_ids}}
    sort: List[Any] = [("created_at", -1)]

    if tab == "pulse":
        query["mood"] = "pulse"
    elif tab == "nearby":
        query["audience"] = "nearby"
    elif tab == "trending":
        # trending: fetch more then sort by score in python
        cursor = db.posts.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
        rows = await cursor.to_list(100)
        scored = []
        n = now()
        for p in rows:
            try:
                created = datetime.fromisoformat(p["created_at"])
            except ValueError:
                created = n
            age_hr = max(1.0, (n - created).total_seconds() / 3600.0)
            score = (sum(p.get("reactions", {}).values()) * 2 + p.get("comment_count", 0) * 3) / (age_hr ** 0.8)
            scored.append((score, p))
        scored.sort(key=lambda x: x[0], reverse=True)
        return await _inject_ads([await _hydrate_post(p, user["id"]) for _, p in scored[:limit]])

    cursor = (
        db.posts.find(query, {"_id": 0}).sort(sort).skip(offset).limit(limit)
    )

    rows = await cursor.to_list(limit)
    hydrated = [await _hydrate_post(p, user["id"]) for p in rows]
    if tab == "pulse":
        return hydrated
    return await _inject_ads(hydrated, offset)


@api.get("/posts/{post_id}")
async def get_post(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one(
    {
        "id": post_id,
        "status": "active",
    },
    {
        "_id": 0,
    },
)
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    return await _hydrate_post(p, user["id"])


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    if p["author_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    image_ids = p.get("image_ids") or []
    if image_ids:
        await db.images.delete_many({"id": {"$in": image_ids}})

    await db.posts.update_one({"id": post_id}, {"$set": {"status": "deleted"}})
    return {"status": "ok"}


@api.post("/posts/{post_id}/react")
@limiter.limit("300/hour")
async def react_post(request:Request,post_id: str, inp: ReactionIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one(
    {
        "id": post_id,
        "status": "active",
    }
)
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    reactions = p.get("reactions", {}) or {}
    reactors = p.get("reactors", {}) or {}
    prev = reactors.get(user["id"])
    if prev == inp.kind:
        # toggle off
        reactions[prev] = max(0, reactions.get(prev, 1) - 1)
        reactors.pop(user["id"], None)
    else:
        if prev:
            reactions[prev] = max(0, reactions.get(prev, 1) - 1)
        reactions[inp.kind] = reactions.get(inp.kind, 0) + 1
        reactors[user["id"]] = inp.kind
    await db.posts.update_one({"id": post_id}, {"$set": {"reactions": reactions, "reactors": reactors}})

    # XP: like a post (capped 20/day). Only award on positive add (not on toggle off).
    if prev != inp.kind and p["author_id"] != user["id"]:
        await award_xp_daily_capped(user["id"], "react_awards", 20, 1, "like_post")

    # notification + helpful score bump
    if p["author_id"] != user["id"] and prev != inp.kind:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": p["author_id"],
            "type": "reaction",
            "actor_alias": user["alias"],
            "post_id": post_id,
            "content_preview": p["content"][:80],
            "created_at": now().isoformat(),
            "read": False,
        })
        if inp.kind == "helpful":
            await db.users.update_one({"id": p["author_id"]}, {"$inc": {"helpful_score": 1}})
        await ws_manager.send_to(p["author_id"], {"type": "notification"})

    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return await _hydrate_post(p, user["id"])


@api.post("/posts/{post_id}/pulse-vote")
async def pulse_vote(post_id: str, inp: PulseVoteIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one(
    {
        "id": post_id,
        "status": "active",
    }
)
    if not p or p.get("mood") != "pulse":
        raise HTTPException(status_code=404, detail="Pulse not found")
    options = p.get("pulse_options") or []
    if not (0 <= inp.option_index < len(options)):
        raise HTTPException(status_code=400, detail="Invalid option")
    votes = list(p.get("pulse_votes") or [0] * len(options))
    voters = dict(p.get("pulse_voters") or {})
    prev = voters.get(user["id"])
    if prev is not None:
        votes[prev] = max(0, votes[prev] - 1)
    votes[inp.option_index] += 1
    voters[user["id"]] = inp.option_index
    await db.posts.update_one({"id": post_id}, {"$set": {"pulse_votes": votes, "pulse_voters": voters}})
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return await _hydrate_post(p, user["id"])


# ---------- routes: bookmarks ----------
@api.post("/posts/{post_id}/bookmark")
async def toggle_bookmark(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one(
    {
        "id": post_id,
        "status": "active",
    },
    {
        "_id": 0,
        "id": 1,
    },
)
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    existing = await db.bookmarks.find_one({"post_id": post_id, "user_id": user["id"]})
    if existing:
        await db.bookmarks.delete_one({"post_id": post_id, "user_id": user["id"]})
        await db.posts.update_one({"id": post_id}, {"$inc": {"bookmark_count": -1}})
        return {"status": "removed", "is_bookmarked": False}
    await db.bookmarks.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "post_id": post_id,
        "created_at": now().isoformat(),
    })
    await db.posts.update_one({"id": post_id}, {"$inc": {"bookmark_count": 1}})
    return {"status": "added", "is_bookmarked": True}


@api.get("/me/bookmarks")
async def my_bookmarks(
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    rows = await (
    db.bookmarks
    .find(
        {"user_id": user["id"]},
        {"_id": 0},
    )
    .sort("created_at", -1)
    .skip(offset)
    .limit(limit)
    .to_list(limit)
)
    out: List[Dict[str, Any]] = []
    for b in rows:
        p = await db.posts.find_one({"id": b["post_id"], "status": "active"}, {"_id": 0})
        if not p:
            continue
        out.append(await _hydrate_post(p, user["id"]))
    return out


# ---------- routes: image uploads ----------
MAX_IMAGE_B64_LEN = MAX_IMAGE_BYTES


@api.post("/uploads")
@limiter.limit("60/hour")
async def upload_image(
    request: Request,
    inp: UploadIn,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:

    data = inp.data

    # Remove data URI prefix if present
    if data.startswith("data:") and "," in data:
        data = data.split(",", 1)[1]

    if len(data) > MAX_IMAGE_B64_LEN:
        raise HTTPException(
            status_code=413,
            detail="Image too large",
        )

    try:
        processed = process_image(data)
    except InvalidImage as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Image processing failed")
        raise HTTPException(status_code=500, detail="Failed to process image.")

    image_id = new_id()

    await db.images.insert_one({
        "id": image_id,
        "owner_id": user["id"],
        "data": Binary(processed.data),
        "width": processed.width,
        "height": processed.height,
        "size": processed.size_bytes,
        "format": "webp",
        "created_at": now().isoformat(),
    })

    return {"id": image_id}


@api.get("/images/{image_id}")
async def get_image(image_id: str) -> Response:
    
    img = await db.images.find_one({"id": image_id})

    if not img:
        raise HTTPException(
            status_code=404,
            detail="Image not found",
        )

    image_data = img.get("data")
    

    if not image_data:
        raise HTTPException(
            status_code=500,
            detail="Corrupt image",
        )

    return Response(
        content=bytes(image_data),
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": image_id,
        },
    )


# ---------- routes: ads ----------
def _hydrate_ad(a: Dict[str, Any], feed_key: str | None = None) -> Dict[str, Any]:
    render_id = feed_key or a["id"]

    return {
        "type": "ad",

        # Unique ID for each appearance in the feed
        "id": render_id,

        # Actual database ID
        "ad_id": a["id"],

        "advertiser_id": a["advertiser_id"],
        "business_name": a["business_name"],
        "title": a["title"],
        "content": a["content"],
        "link_url": a.get("link_url"),
        "images": a.get("image_ids", []) or [],
        "enabled": a.get("enabled", True),
        "comments_enabled": a.get("comments_enabled", True),
        "comment_count": a.get("comment_count", 0),
        "frequency_weight": a.get("frequency_weight", 5),
        "created_at": a["created_at"],
    }


async def _ad_stats(ad_id: str) -> Dict[str, Any]:
    impressions = await db.ad_events.count_documents({"ad_id": ad_id, "type": "impression"})
    clicks = await db.ad_events.count_documents({"ad_id": ad_id, "type": "click"})
    unique_viewers = len(await db.ad_events.distinct("user_id", {"ad_id": ad_id, "type": "impression"}))
    ctr = round(clicks / impressions * 100, 2) if impressions else 0.0
    return {"impressions": impressions, "clicks": clicks, "unique_viewers": unique_viewers, "ctr": ctr}


async def _get_owned_ad(ad_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    a = await db.ads.find_one({"id": ad_id, "status": "active"}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Ad not found")
    if a["advertiser_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    return a


@api.post("/ads")
async def create_ad(inp: AdCreate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "advertiser", "admin")
    doc = {
        "id": new_id(),
        "advertiser_id": user["id"],
        "business_name": inp.business_name.strip(),
        "title": inp.title.strip(),
        "content": inp.content.strip(),
        "link_url": (inp.link_url or "").strip() or None,
        "image_ids": (inp.image_ids or [])[:4],
        "frequency_weight": inp.frequency_weight,
        "enabled": True,
        "comments_enabled": True,
        "comment_count": 0,
        "status": "active",
        "created_at": now().isoformat(),
    }
    await db.ads.insert_one(doc)
    return _hydrate_ad(doc)


@api.get("/ads/mine")
async def my_ads(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    require_role(user, "advertiser", "admin")
    rows = await db.ads.find({"advertiser_id": user["id"], "status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    out = []
    for a in rows:
        item = _hydrate_ad(a)
        item["stats"] = await _ad_stats(a["id"])
        out.append(item)
    return out


@api.get("/ads/{ad_id}")
async def get_ad(ad_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    a = await db.ads.find_one({"id": ad_id, "status": "active"}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Ad not found")
    return _hydrate_ad(a)


@api.patch("/ads/{ad_id}")
async def update_ad(ad_id: str, inp: AdUpdate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    a = await _get_owned_ad(ad_id, user)
    updates: Dict[str, Any] = {}
    for field in ("business_name", "title", "content", "frequency_weight", "enabled", "comments_enabled"):
        val = getattr(inp, field)
        if val is not None:
            updates[field] = val.strip() if isinstance(val, str) else val
    if inp.link_url is not None:
        updates["link_url"] = inp.link_url.strip() or None
    if inp.image_ids is not None:
        updates["image_ids"] = inp.image_ids[:4]
    if updates:
        await db.ads.update_one({"id": ad_id}, {"$set": updates})
        a.update(updates)
    return _hydrate_ad(a)


@api.delete("/ads/{ad_id}")
async def delete_ad(ad_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await _get_owned_ad(ad_id, user)
    await db.ads.update_one({"id": ad_id}, {"$set": {"status": "deleted", "enabled": False}})
    return {"status": "ok"}


@api.get("/ads/{ad_id}/analytics")
async def ad_analytics(ad_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    a = await _get_owned_ad(ad_id, user)
    totals = await _ad_stats(ad_id)

    # daily series: last 14 days
    days: List[Dict[str, Any]] = []
    today = now().date()
    day_keys = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    counts: Dict[str, Dict[str, int]] = {k: {"impressions": 0, "clicks": 0} for k in day_keys}
    since = (today - timedelta(days=13)).isoformat()
    events = await db.ad_events.find(
        {"ad_id": ad_id, "created_at": {"$gte": since}}, {"_id": 0}
    ).to_list(50000)
    for e in events:
        day = e["created_at"][:10]
        if day in counts:
            key = "impressions" if e["type"] == "impression" else "clicks"
            counts[day][key] += 1
    for k in day_keys:
        days.append({"date": k, **counts[k]})

    # recent click timestamps (last 50)
    clicks = await db.ad_events.find(
        {"ad_id": ad_id, "type": "click"}, {"_id": 0, "created_at": 1}
    ).sort("created_at", -1).limit(50).to_list(50)

    return {
        "ad": _hydrate_ad(a),
        "totals": totals,
        "daily": days,
        "recent_clicks": [c["created_at"] for c in clicks],
    }


@api.post("/ads/{ad_id}/impression")
async def ad_impression(ad_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await db.ad_events.insert_one({
        "id": new_id(), "ad_id": ad_id, "user_id": user["id"],
        "type": "impression", "created_at": now().isoformat(),
    })
    return {"status": "ok"}


@api.post("/ads/{ad_id}/click")
async def ad_click(ad_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    a = await db.ads.find_one({"id": ad_id, "status": "active"}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Ad not found")
    await db.ad_events.insert_one({
        "id": new_id(), "ad_id": ad_id, "user_id": user["id"],
        "type": "click", "created_at": now().isoformat(),
    })
    return {"status": "ok", "link_url": a.get("link_url")}


# ---------- routes: admin ----------
@api.get("/admin/users")
async def admin_search_users(
    q: str = Query(default="", max_length=100),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    require_role(user, "admin")
    query: Dict[str, Any] = {}
    q_stripped = q.strip()
    if q_stripped:
        # Escape user input — never pass raw regex to MongoDB.
        rx = {"$regex": re.escape(q_stripped), "$options": "i"}
        query = {"$or": [{"email": rx}, {"alias": rx}, {"first_name": rx}, {"last_name": rx}]}
    rows = (
        await db.users
        .find(query, {"_id": 0, "password": 0})
        .sort("joined_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
    return [
        {
            "id": u["id"], "alias": u["alias"], "email": u.get("email", ""),
            "first_name": u.get("first_name", ""), "last_name": u.get("last_name", ""),
            "role": u.get("role", "user"),
        }
        for u in rows
    ]


@api.post("/admin/users/{user_id}/role")
async def admin_set_role(user_id: str, inp: RoleUpdate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    require_role(user, "admin")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1})
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot change an admin's role")
    updates: Dict[str, Any] = {"role": inp.role}
    if inp.role == "partner":
        if inp.business_name:
            updates["business_name"] = inp.business_name.strip()
        if inp.business_type:
            updates["business_type"] = inp.business_type.strip()
    await db.users.update_one({"id": user_id}, {"$set": updates})
    return {"status": "ok", "role": inp.role}


@api.get("/admin/ads")
async def admin_list_ads(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    require_role(user, "admin")
    rows = await db.ads.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for a in rows:
        item = _hydrate_ad(a)
        item["stats"] = await _ad_stats(a["id"])
        owner = await db.users.find_one({"id": a["advertiser_id"]}, {"_id": 0, "alias": 1, "email": 1})
        item["advertiser"] = {"alias": owner.get("alias", "?"), "email": owner.get("email", "")} if owner else None
        out.append(item)
    return out


@api.get("/admin/settings")
async def admin_get_settings(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    s = await db.settings.find_one({"key": "ads"}, {"_id": 0})
    return {"ad_every_n_posts": (s or {}).get("ad_every_n_posts", 5)}


@api.patch("/admin/settings")
async def admin_update_settings(inp: AdSettingsIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    await db.settings.update_one(
        {"key": "ads"}, {"$set": {"ad_every_n_posts": inp.ad_every_n_posts}}, upsert=True
    )
    return {"ad_every_n_posts": inp.ad_every_n_posts}


# ---------- routes: campaigns (partner + admin + public) ----------
def _campaign_status_effective(c: Dict[str, Any]) -> str:
    """Compute display status based on stored status + dates + budget."""
    if c.get("status") != "approved":
        return c.get("status", "pending")
    if not c.get("enabled", True):
        return "paused"
    today = now().date().isoformat()
    ed = c.get("end_date")
    sd = c.get("start_date")
    if ed and today > ed:
        return "expired"
    if sd and today < sd:
        return "scheduled"
    # Auto-pause if budget is depleted vs per-person allocation
    exp_per = int(c.get("exp_per_redemption", 0) or 0)
    tok_per = int(c.get("tokens_per_redemption", 0) or 0)
    rem_exp = int(c.get("remaining_exp", 0) or 0)
    rem_tok = int(c.get("remaining_tokens", 0) or 0)
    exp_ok = exp_per == 0 or rem_exp >= exp_per
    tok_ok = tok_per == 0 or rem_tok >= tok_per
    if not (exp_ok and tok_ok):
        return "depleted"
    return "live"


def _hydrate_campaign(c: Dict[str, Any], partner: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "id": c["id"],
        "partner_id": c["partner_id"],
        "partner": {
            "id": partner["id"],
            "alias": partner.get("alias", ""),
            "business_name": partner.get("business_name") or partner.get("alias", ""),
            "business_type": partner.get("business_type", ""),
        } if partner else None,
        "title": c["title"],
        "description": c["description"],
        "discount_label": c.get("discount_label", ""),
        "terms": c.get("terms", ""),
        "images": c.get("image_ids", []) or [],
        "start_date": c.get("start_date"),
        "end_date": c.get("end_date"),
        "status": c.get("status", "pending"),
        "state": _campaign_status_effective(c),
        "enabled": c.get("enabled", True),
        "rejected_reason": c.get("rejected_reason"),
        "approved_at": c.get("approved_at"),
        "redemption_count": c.get("redemption_count", 0),
        # New economy fields
        "exp_per_redemption": int(c.get("exp_per_redemption", 0) or 0),
        "tokens_per_redemption": int(c.get("tokens_per_redemption", 0) or 0),
        "budget_exp": int(c.get("budget_exp", 0) or 0),
        "budget_tokens": int(c.get("budget_tokens", 0) or 0),
        "remaining_exp": int(c.get("remaining_exp", 0) or 0),
        "remaining_tokens": int(c.get("remaining_tokens", 0) or 0),
        # Legacy — always report reward_type=discount for backwards-compat surfaces
        "reward_type": "discount" if c.get("discount_label") else "tokens",
        "points_amount": int(c.get("exp_per_redemption", 0) or 0),
        "created_at": c["created_at"],
    }

async def _campaign_redemption_state(
    campaign: Dict[str, Any],
    user_id: str,
) -> Dict[str, Any]:

    policy = campaign.get("redemption_policy", "once")

    if policy == "once":

        redemption_label = "One Time"

    elif policy == "unlimited":

        redemption_label = "Unlimited"

    else:

        value = int(campaign.get("cooldown_value", 1))
        unit = campaign.get("cooldown_unit", "days")

        if unit == "days" and value == 1:
            redemption_label = "Daily"

        elif unit == "weeks" and value == 1:
            redemption_label = "Weekly"

        elif unit == "months" and value == 1:
            redemption_label = "Monthly"

        else:

            names = {
                "minutes": "Minute",
                "hours": "Hour",
                "days": "Day",
                "weeks": "Week",
                "months": "Month",
            }

            label = names[unit]

            if value > 1:
                label += "s"

            redemption_label = f"Every {value} {label}"

    last = await db.redemptions.find_one(
        {
            "campaign_id": campaign["id"],
            "user_id": user_id,
        },
        sort=[("redeemed_at", -1)],
    )

    can_redeem = True
    next_redeem_at = None
    status_text = "Ready to Redeem"
    status_color = "green"

    if policy == "once":

        if last:

            can_redeem = False
            status_text = "Already Claimed"
            status_color = "red"

    elif policy == "cooldown":

        if last:

            redeemed = datetime.fromisoformat(last["redeemed_at"])

            value = int(campaign.get("cooldown_value", 1))
            unit = campaign.get("cooldown_unit", "days")

            if unit == "minutes":
                next_time = redeemed + timedelta(minutes=value)

            elif unit == "hours":
                next_time = redeemed + timedelta(hours=value)

            elif unit == "days":

                redeemed_date = redeemed.date()

                next_time = datetime.combine(
                    redeemed_date + timedelta(days=value),
                    time.min,
                    tzinfo=redeemed.tzinfo,
                )

            elif unit == "weeks":

                next_time = redeemed + timedelta(weeks=value)

            else:

                next_time = redeemed + timedelta(days=value * 30)

            can_redeem = now() >= next_time

            if not can_redeem:

                next_redeem_at = next_time.isoformat()
                status_color = "yellow"

                if unit == "days":
                    status_text = f"Available at {next_time.strftime('%I:%M %p').lstrip('0')}"

                else:
                    status_text = "Cooling Down"

    return {
        "already_redeemed": not can_redeem,
        "can_redeem": can_redeem,
        "next_redeem_at": next_redeem_at,
        "status_text": status_text,
        "status_color": status_color,
        "redemption_label": redemption_label,
        "redemption_policy": policy,
    }

async def _load_campaign_with_partner(c: Dict[str, Any]) -> Dict[str, Any]:
    partner = await db.users.find_one({"id": c["partner_id"]}, {"_id": 0, "password": 0})
    return _hydrate_campaign(c, partner)


@api.post("/partner/campaigns")
async def partner_create_campaign(inp: CampaignCreate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "partner", "admin")
    doc = {
        "id": new_id(),
        "partner_id": user["id"],
        "title": inp.title.strip(),
        "description": inp.description.strip(),
        "visible_to": "owner",
        "allowed_partners": [],
        "discount_label": inp.discount_label.strip(),
        "terms": inp.terms.strip(),
        "image_ids": (inp.image_ids or [])[:4],
        "start_date": (inp.start_date or "").strip() or None,
        "end_date": (inp.end_date or "").strip() or None,
        "status": "pending",  # admin approves + sets budgets
        "enabled": True,
        "redemption_count": 0,
        # Economy fields — filled in when admin approves
        "exp_per_redemption": 0,
        "tokens_per_redemption": 0,
        "budget_exp": 0,
        "budget_tokens": 0,
        "remaining_exp": 0,
        "remaining_tokens": 0,
        "redemption_policy": inp.redemption_policy,
        "cooldown_value": inp.cooldown_value,
        "cooldown_unit": inp.cooldown_unit,
        "created_at": now().isoformat(),
    }
    await db.campaigns.insert_one(doc)
    return await _load_campaign_with_partner(doc)


@api.get("/partner/campaigns")
async def partner_my_campaigns(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    require_role(user, "partner", "admin")
    q: Dict[str, Any] = {"partner_id": user["id"]}
    rows = await (
        db.campaigns
        .find(q, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
    return [_hydrate_campaign(c, user) for c in rows]


@api.get("/partner/campaigns/{campaign_id}")
async def partner_get_campaign(campaign_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "partner", "admin")
    c = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c["partner_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    return await _load_campaign_with_partner(c)


@api.patch("/partner/campaigns/{campaign_id}")
async def partner_update_campaign(campaign_id: str, inp: CampaignUpdate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "partner", "admin")
    c = await db.campaigns.find_one({"id": campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c["partner_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    updates: Dict[str, Any] = {}
    for f in ("title", "description", "discount_label", "terms", "start_date", "end_date", "enabled"):
        v = getattr(inp, f)
        if v is None:
            continue
        updates[f] = v.strip() if isinstance(v, str) else v
    if inp.image_ids is not None:
        updates["image_ids"] = inp.image_ids[:4]
    # If a partner edits content (not just toggles enabled), reset to pending
    content_edited = any(k in updates for k in ("title", "description", "discount_label", "terms", "start_date", "end_date"))
    if content_edited and user.get("role") != "admin":
        updates["status"] = "pending"
        updates["rejected_reason"] = None
        updates["approved_at"] = None
    if inp.redemption_policy is not None:
        updates["redemption_policy"] = inp.redemption_policy

    if inp.cooldown_value is not None:
        updates["cooldown_value"] = inp.cooldown_value

    if inp.cooldown_unit is not None:
        updates["cooldown_unit"] = inp.cooldown_unit

    if updates:
        await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
        c.update(updates)

    return await _load_campaign_with_partner(c)


@api.delete("/partner/campaigns/{campaign_id}")
async def partner_delete_campaign(campaign_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    require_role(user, "partner", "admin")
    c = await db.campaigns.find_one({"id": campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if c["partner_id"] != user["id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.campaigns.delete_one({"id": campaign_id})
    return {"status": "ok"}


def _parse_qr_code(code: str) -> str:
    """Accept 'huni:user:<id>' | 'huni://user/<id>' | JSON {'user_id':...} | raw id."""
    c = code.strip()
    if c.startswith("huni:user:"):
        return c.split("huni:user:", 1)[1].strip()
    if c.startswith("huni://user/"):
        return c.split("huni://user/", 1)[1].strip().split("?")[0]
    if c.startswith("{"):
        try:
            import json
            obj = json.loads(c)
            if isinstance(obj, dict) and obj.get("user_id"):
                return str(obj["user_id"])
        except Exception:
            pass
    return c


@api.post("/partner/scan")
@limiter.limit("20/minute")
async def partner_scan(
    request:Request,
    inp: PartnerScanIn,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Resolve a scanned QR to a user + list the partner's live campaigns."""

    partner = user

    if inp.partner_id:
        partner = await db.users.find_one(
            {
                "id": inp.partner_id,
                "scanners.user_id": user["id"],
            },
            {
                "_id": 0,
            },
        )

        if not partner:
            raise HTTPException(
                status_code=403,
                detail="Not allowed",
            )

    else:

        require_role(user, "partner", "admin")

    target_id = _parse_qr_code(inp.code)

    target = await db.users.find_one(
        {
            "id": target_id,
        },
        {
            "_id": 0,
            "password": 0,
        },
    )

    if not target:
        raise HTTPException(
            status_code=404,
            detail="No user matches this code",
        )

    rows = await db.campaigns.find(
        {
            "status": "approved",
        },
        {
            "_id": 0,
        },
    ).sort(
        "created_at",
        -1,
    ).to_list(50)

    today = now().date().isoformat()

    live: List[Dict[str, Any]] = []

    for c in rows:

        if c.get("visible_to", "owner") == "owner":

            if c["partner_id"] != partner["id"]:
                continue

        elif c["visible_to"] == "selected":

            if partner["id"] not in c.get("allowed_partners", []):
                continue

        if not c.get("enabled", True):
            continue

        if c.get("start_date") and today < c["start_date"]:
            continue

        if c.get("end_date") and today > c["end_date"]:
            continue

        item = _hydrate_campaign(c, partner)

        item.update(
            await _campaign_redemption_state(
                c,
                target_id,
            )
        )

        live.append(item)

    return {
        "user": public_user(target),
        "campaigns": live,
    }

@api.post("/partner/redeem")
@limiter.limit("20/minute")
async def partner_redeem(request:Request,inp: PartnerRedeemIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Apply a campaign to a user (one-shot per user per campaign)."""
    partner = user

    if inp.partner_id:
        partner = await db.users.find_one(
            {
                "id": inp.partner_id,
                "scanners.user_id": user["id"],
            },
            {
                "_id": 0,
            },
        )
        if not partner:
            raise HTTPException(
                status_code=403,
                detail="Not allowed",
            )
    else:
        require_role(user, "partner", "admin")

    c = await db.campaigns.find_one({"id": inp.campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    visibility = c.get("visible_to", "owner")
    if visibility == "owner":
        if c["partner_id"] != partner["id"]:
            raise HTTPException(
                status_code=403,
                detail="Not your campaign"
            )
    elif visibility == "selected":
        if partner["id"] not in c.get("allowed_partners", []):
            raise HTTPException(
                status_code=403,
                detail="You are not allowed to redeem this campaign."
            )
    elif visibility == "all":
        pass
    if c.get("status") != "approved" or not c.get("enabled", True):
        raise HTTPException(status_code=400, detail="Campaign is not live")
    today = now().date().isoformat()
    if c.get("start_date") and today < c["start_date"]:
        raise HTTPException(status_code=400, detail="Campaign has not started yet")
    if c.get("end_date") and today > c["end_date"]:
        raise HTTPException(status_code=400, detail="Campaign has expired")
    target = await db.users.find_one({"id": inp.user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    policy = c.get("redemption_policy", "once")

    last = await db.redemptions.find_one(
        {
            "campaign_id": c["id"],
            "user_id": inp.user_id,
        },
        sort=[("redeemed_at", -1)],
    )
    if policy == "once":
        if last:
            raise HTTPException(
                status_code=409,
                detail="This user has already redeemed this campaign",
            )
    elif policy == "cooldown":
        if last:
            redeemed = datetime.fromisoformat(last["redeemed_at"])
            value = int(c.get("cooldown_value", 1))
            unit = c.get("cooldown_unit", "days")
            if unit == "minutes":
                next_time = redeemed + timedelta(minutes=value)
            elif unit == "hours":
                next_time = redeemed + timedelta(hours=value)
            elif unit == "days":
                redeemed_date = redeemed.date()

                next_time = datetime.combine(
                    redeemed_date + timedelta(days=value),
                    time.min,
                    tzinfo=redeemed.tzinfo,
                )
            elif unit == "weeks":
                next_time = redeemed + timedelta(weeks=value)
            elif unit == "months":
                next_time = redeemed + timedelta(days=value * 30)
            else:
                next_time = redeemed
            if now() < next_time:
                raise HTTPException(
                    status_code=409,
                    detail=f"Next redemption available at {next_time.isoformat()}",
                )
    elif policy == "unlimited":
        pass
    exp_award = int(c.get("exp_per_redemption", 0) or 0)
    token_award = int(c.get("tokens_per_redemption", 0) or 0)
    discount_label = c.get("discount_label", "") or ""
    # Check budget
    rem_exp = int(c.get("remaining_exp", 0) or 0)
    rem_tok = int(c.get("remaining_tokens", 0) or 0)
    if exp_award > 0 and rem_exp < exp_award:
        raise HTTPException(status_code=400, detail="Campaign EXP budget depleted")
    if token_award > 0 and rem_tok < token_award:
        raise HTTPException(status_code=400, detail="Campaign token budget depleted")
    r_doc = {
        "id": new_id(),
        "campaign_id": c["id"],
        "campaign_title": c["title"],
        "partner_id": partner["id"],
        "partner_business_name": partner.get("business_name") or partner.get("alias", ""),
        "user_id": inp.user_id,
        "user_alias": target.get("alias", ""),
        "exp_awarded": exp_award,
        "tokens_awarded": token_award,
        # legacy alias for existing UI:
        "points_awarded": exp_award,
        "discount_applied": discount_label,
        "note": (inp.note or "").strip() or None,
        "redeemed_at": now().isoformat(),
    }
    await db.redemptions.insert_one(r_doc)
    await db.audit_logs.insert_one({

    "id": new_id(),

    "type": "campaign_redemption",

    "created_at": now().isoformat(),

    "campaign_id": c["id"],
    "campaign_title": c["title"],

    "partner_id": partner["id"],
    "partner_alias": partner.get("alias"),
    "partner_business_name": partner.get("business_name", ""),

    "scanner_id": user["id"],
    "scanner_alias": user.get("alias"),

    "customer_id": target["id"],
    "customer_alias": target.get("alias"),

    "exp_awarded": exp_award,
    "tokens_awarded": token_award,
    "discount_applied": discount_label,

    "status": "success",

})
    r_doc.pop("_id", None)
    inc_updates: Dict[str, int] = {}
    if exp_award > 0:
        inc_updates["exp"] = exp_award
    if token_award > 0:
        inc_updates["tokens"] = token_award
    if inc_updates:
        await db.users.update_one({"id": inp.user_id}, {"$inc": inc_updates})
    # Debit campaign budget
    camp_inc: Dict[str, int] = {"redemption_count": 1}
    if exp_award > 0:
        camp_inc["remaining_exp"] = -exp_award
    if token_award > 0:
        camp_inc["remaining_tokens"] = -token_award
    await db.campaigns.update_one({"id": c["id"]}, {"$inc": camp_inc})
    # notify the user
    reward_text_parts: List[str] = []
    if exp_award > 0:
        reward_text_parts.append(f"+{exp_award} EXP")
    if token_award > 0:
        reward_text_parts.append(f"+{token_award} tokens")
    if discount_label:
        reward_text_parts.append(discount_label)
    reward_text = " · ".join(reward_text_parts) if reward_text_parts else "campaign applied"
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": inp.user_id,
        "type": "reward",
        "actor_alias": user.get("business_name") or user.get("alias", ""),
        "campaign_id": c["id"],
        "content_preview": f"🎉 {c['title']} · {reward_text}",
        "created_at": now().isoformat(),
        "read": False,
    })
    await ws_manager.send_to(inp.user_id, {"type": "notification"})
    fresh_user = await db.users.find_one({"id": inp.user_id}, {"_id": 0, "exp": 1, "tokens": 1})
    return {
        "status": "ok",
        "redemption": r_doc,
        "user_new_exp": (fresh_user or {}).get("exp", 0),
        "user_new_tokens": (fresh_user or {}).get("tokens", 0),
        # legacy
        "user_new_points": (fresh_user or {}).get("exp", 0),
    }


@api.get("/partner/redemptions")
async def partner_redemptions(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    require_role(user, "partner", "admin")
    rows = await db.redemptions.find({"partner_id": user["id"]}, {"_id": 0}).sort("redeemed_at", -1).limit(200).to_list(200)
    return rows

@api.get("/partner/audit")
async def partner_audit(
    user: Dict[str, Any] = Depends(get_current_user)
) -> List[Dict[str, Any]]:

    require_role(user, "partner", "admin")

    rows = await db.audit_logs.find(
        {
            "partner_id": user["id"],
            "type": "campaign_redemption",
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)

    return rows

@api.get("/admin/audit")
async def admin_audit(
    user: Dict[str, Any] = Depends(get_current_user)
):

    require_role(user, "admin")

    rows = await db.audit_logs.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)

    return rows

@api.get("/partner/scanners")
async def partner_scanners(user: Dict[str, Any] = Depends(get_current_user)):

    require_role(user, "partner", "admin")

    partner = await db.users.find_one(
        {
            "id": user["id"]
        },
        {
            "_id": 0,
            "scanners": 1
        }
    )


    return partner.get("scanners", [])


@api.post("/partner/scanners")
async def partner_add_scanner(
    inp: ScannerAssignIn,
    user: Dict[str, Any] = Depends(get_current_user),
):

    require_role(user, "partner", "admin")

    target = await db.users.find_one(
    {
        "id": inp.user_id
    },
    {
        "_id": 0,
        "id": 1,
        "alias": 1,
        "picture": 1,
        "role": 1,
    }
)

    if not target:
        raise HTTPException(404, "User not found")

    if target.get("role", "user") not in ["user", "partner"]:
        raise HTTPException(
            400,
            "Only normal users can become scanners."
    )

    if target.get("status") == "banned":
        raise HTTPException(
            400,
            "User is banned."
        )

    exists = await db.users.find_one(
        {
            "id": user["id"],
            "scanners.user_id": target["id"]
        }
    )

    if exists:
        raise HTTPException(409, "Already assigned")

    await db.users.update_one(
        {
            "id": user["id"]
        },
        {
            "$push": {
                "scanners": {
                    "user_id": target["id"],
                    "username": target.get("alias", ""),
                    "display_name": target.get("alias", ""),
                    "avatar": target.get("picture", ""),
                    "assigned_at": now().isoformat(),
                    "active": True,
                }
            }
        }
    )

    return {"status": "ok"}


# @api.get("/scanner/partners")
# async def scanner_partners(user: Dict[str, Any] = Depends(get_current_user),):
#     rows = await db.users.find(
#         {
#             "scanners.user_id": user["id"],
#         },
#         {
#             "_id": 0,
#             "id": 1,
#             "business_name": 1,
#             "alias": 1,
#         },
#     ).to_list(50)
#     return [
#         {
#             "id": r["id"],
#             "business_name": r.get("business_name") or r.get("alias"),
#         }
#         for r in rows
#     ]

@api.get("/scanner/partners")
async def scanner_partners(
    user: Dict[str, Any] = Depends(get_current_user),
):

    partners = await db.users.find(
        {
            "scanners.user_id": user["id"],
        },
        {
            "_id": 0,
            "id": 1,
            "alias": 1,
            "business_name": 1,
            "role": 1,
            "scanners": 1,
        },
    ).to_list(50)

    return [
        {
            "id": p["id"],
            "business_name": p.get("business_name") or p.get("alias") or "Partner",
        }
        for p in partners
    ]

@api.delete("/partner/scanners/{scanner_id}")
async def partner_remove_scanner(scanner_id: str,user: Dict[str, Any] = Depends(get_current_user),):

    require_role(user, "partner", "admin")

    await db.users.update_one(
        {
            "id": user["id"]
        },
        {
            "$pull": {
                "scanners": {
                    "user_id": scanner_id
                }
            }
        }
    )

    return {
        "success":True,
        "message":"Scanner removed."
    }




# ---------- public campaigns (users browse deals) ----------
@api.get("/campaigns")
async def list_active_campaigns(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.campaigns.find({"status": "approved", "enabled": True}, {"_id": 0}).sort("created_at", -1).to_list(100)
    today = now().date().isoformat()
    out: List[Dict[str, Any]] = []
    partners_cache: Dict[str, Dict[str, Any]] = {}
    for c in rows:
        if c.get("end_date") and today > c["end_date"]:
            continue
        if c.get("start_date") and today < c["start_date"]:
            continue
        p = partners_cache.get(c["partner_id"])
        if not p:
            p = await db.users.find_one({"id": c["partner_id"]}, {"_id": 0, "password": 0})
            if p:
                partners_cache[c["partner_id"]] = p
        item = _hydrate_campaign(c, p)
        # Hide depleted (budget-out) campaigns from the public feed
        if item["state"] == "depleted":
            continue
        item.update(
            await _campaign_redemption_state(
                c,
                user["id"],
            )
        )
        out.append(item)
    return out


@api.get("/campaigns/{campaign_id}")
async def get_campaign_public(campaign_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    c = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    p = await db.users.find_one({"id": c["partner_id"]}, {"_id": 0, "password": 0})
    item = _hydrate_campaign(c, p)
    item.update(
        await _campaign_redemption_state(
            c,
            user["id"],
        )
    )
    return item


# ---------- user points + redemptions ----------
@api.get("/me/economy")
async def my_economy(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "exp": 1, "tokens": 1, "points": 1})
    exp = int((fresh or {}).get("exp", (fresh or {}).get("points", 0)) or 0)
    tokens = int((fresh or {}).get("tokens", 0) or 0)
    redemption_count = await db.redemptions.count_documents({"user_id": user["id"]})
    rank = rank_for_exp(exp)
    return {
        "exp": exp,
        "tokens": tokens,
        "redemptions": redemption_count,
        "rank": rank,
        # legacy
        "points": exp,
    }


@api.get("/me/points")
async def my_points(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Legacy alias — kept for backwards compat with existing UI."""
    econ = await my_economy(user)
    return {"points": econ["exp"], "exp": econ["exp"], "tokens": econ["tokens"], "redemptions": econ["redemptions"], "rank": econ["rank"]}


@api.get("/me/redemptions")
async def my_redemptions(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.redemptions.find({"user_id": user["id"]}, {"_id": 0}).sort("redeemed_at", -1).limit(100).to_list(100)
    return rows


# ---------- admin: campaigns ----------
@api.get("/admin/campaigns")
async def admin_list_campaigns(
    status_filter: str = Query(default="all", alias="status"),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    require_role(user, "admin")
    q: Dict[str, Any] = {}
    if status_filter in ("pending", "approved", "rejected"):
        q["status"] = status_filter
    rows = await db.campaigns.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for c in rows:
        p = await db.users.find_one({"id": c["partner_id"]}, {"_id": 0, "password": 0})
        out.append(_hydrate_campaign(c, p))
    return out


@api.post("/admin/campaigns/{campaign_id}/approve")
async def admin_approve_campaign(campaign_id: str, inp: CampaignApproveIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    c = await db.campaigns.find_one({"id": campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    # Validate: per-person must not exceed budget for whichever currency is set
    if inp.exp_per_redemption > 0 and inp.budget_exp < inp.exp_per_redemption:
        raise HTTPException(status_code=422, detail="EXP budget must be at least the per-person allocation")
    if inp.tokens_per_redemption > 0 and inp.budget_tokens < inp.tokens_per_redemption:
        raise HTTPException(status_code=422, detail="Token budget must be at least the per-person allocation")
    updates = {
        "status": "approved",
        "approved_at": now().isoformat(),
        "approved_by": user["id"],
        "rejected_reason": None,
        "exp_per_redemption": inp.exp_per_redemption,
        "tokens_per_redemption": inp.tokens_per_redemption,
        "budget_exp": inp.budget_exp,
        "budget_tokens": inp.budget_tokens,
        "remaining_exp": inp.budget_exp,
        "remaining_tokens": inp.budget_tokens,
    }
    await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    c.update(updates)
    # notify partner
    perks: List[str] = []
    if inp.exp_per_redemption > 0:
        perks.append(f"+{inp.exp_per_redemption} EXP")
    if inp.tokens_per_redemption > 0:
        perks.append(f"+{inp.tokens_per_redemption} tokens")
    perks_text = " & ".join(perks) if perks else "in-store discount only"
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": c["partner_id"],
        "type": "campaign_approved",
        "actor_alias": "Huni Admin",
        "campaign_id": campaign_id,
        "content_preview": f"✅ '{c['title']}' is now live · {perks_text}",
        "created_at": now().isoformat(),
        "read": False,
    })
    await ws_manager.send_to(c["partner_id"], {"type": "notification"})
    return await _load_campaign_with_partner(c)


@api.post("/admin/campaigns/{campaign_id}/reject")
async def admin_reject_campaign(campaign_id: str, inp: CampaignRejectIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    c = await db.campaigns.find_one({"id": campaign_id})
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    reason = inp.reason.strip() or "Does not meet guidelines"
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "rejected", "rejected_reason": reason, "approved_at": None}},
    )
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": c["partner_id"],
        "type": "campaign_rejected",
        "actor_alias": "Huni Admin",
        "campaign_id": campaign_id,
        "content_preview": f"❌ '{c['title']}' — {reason}",
        "created_at": now().isoformat(),
        "read": False,
    })
    await ws_manager.send_to(c["partner_id"], {"type": "notification"})
    c["status"] = "rejected"
    c["rejected_reason"] = reason
    return await _load_campaign_with_partner(c)


# ---------- routes: Huni Store ----------
STORE_CATEGORIES: Dict[str, List[Dict[str, str]]] = {
    "appearance": [
        {"id": "background_colors", "label": "Background Colors", "icon": "color-palette-outline"},
        {"id": "patterns", "label": "Background Patterns", "icon": "grid-outline"},
        {"id": "borders", "label": "Profile Borders", "icon": "ellipse-outline"},
        {"id": "avatar_packs", "label": "Avatar Packs", "icon": "happy-outline"},
    ],
    "seasonal": [
        {"id": "christmas", "label": "Christmas", "icon": "snow-outline"},
        {"id": "fiesta", "label": "Fiesta", "icon": "musical-notes-outline"},
        {"id": "halloween", "label": "Halloween", "icon": "skull-outline"},
        {"id": "limited", "label": "Limited-Time", "icon": "hourglass-outline"},
    ],
    "events": [
        {"id": "raffles", "label": "Raffles", "icon": "ticket-outline"},
        {"id": "competitions", "label": "Competitions", "icon": "trophy-outline"},
        {"id": "treasure_hunts", "label": "Treasure Hunts", "icon": "map-outline"},
        {"id": "activities", "label": "Community Activities", "icon": "people-outline"},
    ],
    "collections": [
        {"id": "town_sets", "label": "Town Sets", "icon": "business-outline"},
        {"id": "event_sets", "label": "Event Sets", "icon": "calendar-outline"},
        {"id": "partner_sets", "label": "Partner Sets", "icon": "briefcase-outline"},
        {"id": "legacy", "label": "Legacy Items", "icon": "medal-outline"},
    ],
}


STYLE_SLOT_MAP: Dict[tuple, str] = {
    ("appearance", "background_colors"): "bg_color",
    ("appearance", "patterns"): "bg_pattern",
    ("appearance", "borders"): "border",
    ("appearance", "avatar_packs"): "avatar",
}
STYLE_SLOTS = ("bg_color", "bg_pattern", "border", "avatar")


def _style_slot_for(category: str, subcategory: str) -> Optional[str]:
    return STYLE_SLOT_MAP.get((category, subcategory))


def _hydrate_store_item(x: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": x["id"],
        "category": x["category"],
        "subcategory": x.get("subcategory", ""),
        "name": x["name"],
        "description": x.get("description", ""),
        "price_tokens": int(x.get("price_tokens", 0) or 0),
        "stock": int(x.get("stock", -1) if x.get("stock") is not None else -1),
        "image_id": x.get("image_id"),
        "hex_color": x.get("hex_color"),
        "style_slot": _style_slot_for(x["category"], x.get("subcategory", "")),
        "enabled": bool(x.get("enabled", True)),
        "active_from": x.get("active_from"),
        "active_until": x.get("active_until"),
        "sort_order": int(x.get("sort_order", 0) or 0),
        "created_at": x.get("created_at"),
    }


@api.get("/store/categories")
async def store_categories(_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"categories": STORE_CATEGORIES}


@api.get("/store/items")
async def store_items_public(
    category: Optional[str] = Query(default=None),
    subcategory: Optional[str] = Query(default=None),
    _user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    today = now().date().isoformat()
    q: Dict[str, Any] = {"enabled": True}
    if category:
        q["category"] = category
    if subcategory:
        q["subcategory"] = subcategory
    rows = await db.store_items.find(q, {"_id": 0}).sort([("sort_order", 1), ("created_at", -1)]).to_list(500)
    out: List[Dict[str, Any]] = []
    for x in rows:
        if x.get("active_from") and today < x["active_from"]:
            continue
        if x.get("active_until") and today > x["active_until"]:
            continue
        out.append(_hydrate_store_item(x))
    return out


@api.get("/admin/store/items")
async def admin_list_store_items(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    require_role(user, "admin")
    rows = await db.store_items.find({}, {"_id": 0}).sort([("category", 1), ("sort_order", 1), ("created_at", -1)]).to_list(1000)
    return [_hydrate_store_item(x) for x in rows]


@api.post("/admin/store/items")
async def admin_create_store_item(inp: StoreItemIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    valid_subs = [s["id"] for s in STORE_CATEGORIES.get(inp.category, [])]
    if inp.subcategory not in valid_subs:
        raise HTTPException(status_code=422, detail=f"Invalid subcategory for {inp.category}")
    doc = {
        "id": new_id(),
        "category": inp.category,
        "subcategory": inp.subcategory,
        "name": inp.name.strip(),
        "description": inp.description.strip(),
        "price_tokens": inp.price_tokens,
        "stock": inp.stock,
        "image_id": inp.image_id,
        "hex_color": inp.hex_color,
        "enabled": inp.enabled,
        "active_from": (inp.active_from or "").strip() or None,
        "active_until": (inp.active_until or "").strip() or None,
        "sort_order": inp.sort_order,
        "created_at": now().isoformat(),
    }
    await db.store_items.insert_one(doc)
    doc.pop("_id", None)
    return _hydrate_store_item(doc)


@api.get("/admin/store/items/{item_id}")
async def admin_get_store_item(item_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    x = await db.store_items.find_one({"id": item_id}, {"_id": 0})
    if not x:
        raise HTTPException(status_code=404, detail="Item not found")
    return _hydrate_store_item(x)


@api.patch("/admin/store/items/{item_id}")
async def admin_update_store_item(item_id: str, inp: StoreItemUpdate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    require_role(user, "admin")
    updates: Dict[str, Any] = {}
    for f in ("category", "subcategory", "name", "description", "price_tokens", "stock", "image_id", "hex_color", "enabled", "active_from", "active_until", "sort_order"):
        v = getattr(inp, f)
        if v is None:
            continue
        updates[f] = v.strip() if isinstance(v, str) else v
    if "category" in updates or "subcategory" in updates:
        cur = await db.store_items.find_one({"id": item_id})
        if not cur:
            raise HTTPException(status_code=404, detail="Item not found")
        new_cat = updates.get("category", cur["category"])
        new_sub = updates.get("subcategory", cur.get("subcategory", ""))
        valid_subs = [s["id"] for s in STORE_CATEGORIES.get(new_cat, [])]
        if new_sub not in valid_subs:
            raise HTTPException(status_code=422, detail=f"Invalid subcategory for {new_cat}")
    if updates:
        await db.store_items.update_one({"id": item_id}, {"$set": updates})
    x = await db.store_items.find_one({"id": item_id}, {"_id": 0})
    if not x:
        raise HTTPException(status_code=404, detail="Item not found")
    return _hydrate_store_item(x)


@api.delete("/admin/store/items/{item_id}")
async def admin_delete_store_item(item_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    require_role(user, "admin")
    res = await db.store_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "ok"}


# ---------- routes: store purchase & equip ----------
@api.post("/store/items/{item_id}/purchase")
@limiter.limit("30/hour")
async def purchase_store_item(
    request: Request,
    item_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    item = await db.store_items.find_one({"id": item_id}, {"_id": 0})
    if not item or not item.get("enabled", True):
        raise HTTPException(status_code=404, detail="Item not found")

    today = now().date().isoformat()
    if item.get("active_from") and today < item["active_from"]:
        raise HTTPException(status_code=400, detail="Item not yet available")
    if item.get("active_until") and today > item["active_until"]:
        raise HTTPException(status_code=400, detail="Item no longer available")

    existing = await db.purchases.find_one({"user_id": user["id"], "item_id": item_id})
    if existing:
        raise HTTPException(status_code=409, detail="You already own this item")

    price = int(item.get("price_tokens", 0) or 0)
    stock = int(item.get("stock", -1) if item.get("stock") is not None else -1)
    if stock == 0:
        raise HTTPException(status_code=400, detail="Out of stock")

    # 1) Atomic token debit — only succeeds if balance is sufficient.
    debited = await db.users.find_one_and_update(
        {"id": user["id"], "tokens": {"$gte": price}},
        {"$inc": {"tokens": -price}},
        projection={"_id": 0, "tokens": 1},
        return_document=True,
    )
    if not debited:
        balance = int((user or {}).get("tokens", 0) or 0)
        raise HTTPException(
            status_code=400,
            detail=f"Not enough tokens (need {price}, have {balance})",
        )

    # 2) Try to record ownership. Unique index (user_id, item_id) prevents dup.
    try:
        await db.purchases.insert_one({
            "id": new_id(),
            "user_id": user["id"],
            "item_id": item_id,
            "price_paid": price,
            "purchased_at": now().isoformat(),
        })
    except Exception:
        # Refund on failure — best-effort rollback of the debit.
        await db.users.update_one({"id": user["id"]}, {"$inc": {"tokens": price}})
        raise HTTPException(status_code=409, detail="You already own this item")

    # 3) Atomic stock decrement — only if stock > 0.
    if stock > 0:
        stocked = await db.store_items.find_one_and_update(
            {"id": item_id, "stock": {"$gt": 0}},
            {"$inc": {"stock": -1}},
            return_document=True,
        )
        if not stocked:
            # Refund + roll back purchase.
            await db.users.update_one({"id": user["id"]}, {"$inc": {"tokens": price}})
            await db.purchases.delete_one({"user_id": user["id"], "item_id": item_id})
            raise HTTPException(status_code=400, detail="Out of stock")

    return {
        "status": "ok",
        "item": _hydrate_store_item(item),
        "tokens": int(debited.get("tokens", 0)),
    }


@api.get("/me/purchases")
async def my_purchases(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.purchases.find({"user_id": user["id"]}, {"_id": 0}).sort("purchased_at", -1).to_list(500)
    out: List[Dict[str, Any]] = []
    for p in rows:
        item = await db.store_items.find_one({"id": p["item_id"]}, {"_id": 0})
        if not item:
            continue
        out.append({
            "purchase_id": p["id"],
            "purchased_at": p.get("purchased_at"),
            "price_paid": int(p.get("price_paid", 0) or 0),
            "item": _hydrate_store_item(item),
        })
    return out


@api.post("/me/equip")
async def equip_style(inp: EquipIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    equipped = dict(user.get("equipped") or {})
    if inp.item_id is None:
        equipped[inp.slot] = None
    else:
        # verify ownership + slot match
        owned = await db.purchases.find_one({"user_id": user["id"], "item_id": inp.item_id})
        if not owned:
            raise HTTPException(status_code=403, detail="You don't own this item")
        item = await db.store_items.find_one({"id": inp.item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        slot = _style_slot_for(item["category"], item.get("subcategory", ""))
        if slot != inp.slot:
            raise HTTPException(status_code=400, detail=f"Item cannot be equipped in slot '{inp.slot}'")
        equipped[inp.slot] = inp.item_id
    await db.users.update_one({"id": user["id"]}, {"$set": {"equipped": equipped}})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return {"status": "ok", "equipped_styles": await _hydrate_equipped_styles(fresh or user)}


async def _hydrate_equipped_styles(u: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {s: None for s in STYLE_SLOTS}
    eq = (u or {}).get("equipped") or {}
    for slot in STYLE_SLOTS:
        iid = eq.get(slot)
        if not iid:
            continue
        item = await db.store_items.find_one({"id": iid}, {"_id": 0})
        if not item:
            continue
        out[slot] = {
            "item_id": item["id"],
            "image_id": item.get("image_id"),
            "hex_color": item.get("hex_color"),
            "name": item.get("name"),
        }
    return out


@api.get("/me/equipped_styles")
async def my_equipped_styles(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await _hydrate_equipped_styles(user)


@api.get("/users/{user_id}/equipped_styles")
async def user_equipped_styles(user_id: str, _viewer: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return await _hydrate_equipped_styles(target)


# ---------- routes: comments ----------
@api.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.comments.find({"post_id": post_id, "status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(500)
    out = []
    for c in rows:
        author = await db.users.find_one({"id": c["author_id"]}, {"_id": 0, "password": 0})
        reactions = c.get("reactions", {}) or {}
        reactors = c.get("reactors", {}) or {}
        entry = {
            "id": c["id"],
            "post_id": c["post_id"],
            "author": public_user(author) if author else {"id": c["author_id"], "alias": "Unknown"},
            "content": c["content"],
            "created_at": c["created_at"],
            "up": reactions.get("up", 0),
            "down": reactions.get("down", 0),
            "my_reaction": reactors.get(user["id"]),
            "parent_comment_id": c.get("parent_comment_id"),
            "reply_to_alias": None,
            "images": c.get("image_ids", []) or [],
        }
        if entry["parent_comment_id"]:
            parent = await db.comments.find_one({"id": entry["parent_comment_id"]}, {"author_id": 1})
            if parent:
                parent_author = await db.users.find_one({"id": parent["author_id"]}, {"alias": 1})
                if parent_author:
                    entry["reply_to_alias"] = parent_author.get("alias")
        out.append(entry)
    return out


@api.post("/posts/{post_id}/comments")
@limiter.limit("60/hour")
async def create_comment(request:Request,post_id: str, inp: CommentCreate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    is_ad = False
    p = await db.posts.find_one(
    {
        "id": post_id,
        "status": "active",
    }
)
    if not p:
        p = await db.ads.find_one({"id": post_id, "status": "active"})
        if p:
            is_ad = True
            if not p.get("comments_enabled", True):
                raise HTTPException(status_code=403, detail="Comments are disabled on this ad")
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    if not inp.content.strip() and not (inp.image_ids or []):
        raise HTTPException(status_code=422, detail="Comment needs text or an image")

    # validate parent comment (if replying) — must belong to the same post
    parent_author_id: Optional[str] = None
    parent_author_alias: Optional[str] = None
    if inp.parent_comment_id:
        parent = await db.comments.find_one({"id": inp.parent_comment_id})
        if not parent or parent.get("post_id") != post_id or parent.get("status") != "active":
            raise HTTPException(status_code=404, detail="Parent comment not found")
        parent_author_id = parent["author_id"]
        pa = await db.users.find_one({"id": parent_author_id}, {"alias": 1})
        parent_author_alias = pa.get("alias") if pa else None

    doc = {
        "id": new_id(),
        "post_id": post_id,
        "author_id": user["id"],
        "content": inp.content.strip(),
        "created_at": now().isoformat(),
        "status": "active",
        "parent_comment_id": inp.parent_comment_id,
        "image_ids": (inp.image_ids or [])[:4],
    }
    await db.comments.insert_one(doc)
    if is_ad:
        await db.ads.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    else:
        await db.posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    await db.users.update_one({"id": user["id"]}, {"$inc": {"comment_count": 1}})

    # XP: comment (capped 5/day to prevent farming)
    await award_xp_daily_capped(user["id"], "comment_awards", 5, 8, "comment")

    # notify post author / ad owner on top-level comment
    owner_id = p["advertiser_id"] if is_ad else p["author_id"]
    if not inp.parent_comment_id and owner_id != user["id"]:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": owner_id,
            "type": "comment",
            "actor_alias": user["alias"],
            "post_id": post_id,
            "is_ad": is_ad,
            "content_preview": inp.content[:80] or "📷 Photo",
            "created_at": now().isoformat(),
            "read": False,
        })
        await ws_manager.send_to(owner_id, {"type": "notification"})

    # notify parent-comment author on a reply
    if parent_author_id and parent_author_id != user["id"]:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": parent_author_id,
            "type": "reply",
            "actor_alias": user["alias"],
            "post_id": post_id,
            "is_ad": is_ad,
            "content_preview": inp.content[:80] or "📷 Photo",
            "created_at": now().isoformat(),
            "read": False,
        })
        await ws_manager.send_to(parent_author_id, {"type": "notification"})

    # notify bookmark watchers of this post (only top-level comments on real posts, not ads)
    if not inp.parent_comment_id and not is_ad:
        already_notified: set[str] = {user["id"], owner_id}
        if parent_author_id:
            already_notified.add(parent_author_id)
        watchers = await db.bookmarks.find({"post_id": post_id}, {"_id": 0, "user_id": 1}).to_list(500)
        for w in watchers:
            wid = w.get("user_id")
            if not wid or wid in already_notified:
                continue
            await db.notifications.insert_one({
                "id": new_id(),
                "user_id": wid,
                "type": "bookmark_update",
                "actor_alias": user["alias"],
                "post_id": post_id,
                "is_ad": False,
                "content_preview": f"💬 New comment on a post you're listening to: {inp.content[:80] or '📷 Photo'}",
                "created_at": now().isoformat(),
                "read": False,
            })
            await ws_manager.send_to(wid, {"type": "notification"})
            already_notified.add(wid)

    return {
        "id": doc["id"],
        "post_id": post_id,
        "author": public_user(user),
        "content": doc["content"],
        "created_at": doc["created_at"],
        "up": 0,
        "down": 0,
        "my_reaction": None,
        "parent_comment_id": inp.parent_comment_id,
        "reply_to_alias": parent_author_alias,
        "images": doc["image_ids"],
    }


@api.post("/comments/{comment_id}/react")
async def react_comment(comment_id: str, inp: CommentReactionIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    c = await db.comments.find_one({"id": comment_id})
    if not c or c.get("status") != "active":
        raise HTTPException(status_code=404, detail="Comment not found")
    reactions = c.get("reactions", {}) or {}
    reactors = c.get("reactors", {}) or {}
    prev = reactors.get(user["id"])
    if prev == inp.kind:
        reactions[prev] = max(0, reactions.get(prev, 1) - 1)
        reactors.pop(user["id"], None)
        new_kind: Optional[str] = None
    else:
        if prev:
            reactions[prev] = max(0, reactions.get(prev, 1) - 1)
        reactions[inp.kind] = reactions.get(inp.kind, 0) + 1
        reactors[user["id"]] = inp.kind
        new_kind = inp.kind
    await db.comments.update_one({"id": comment_id}, {"$set": {"reactions": reactions, "reactors": reactors}})

    # helpful score: +1 when someone gives you an "up", -1 when they take it away or switch to down
    if c["author_id"] != user["id"]:
        delta = 0
        if prev != "up" and new_kind == "up":
            delta = 1
        elif prev == "up" and new_kind != "up":
            delta = -1
        if delta:
            await db.users.update_one({"id": c["author_id"]}, {"$inc": {"helpful_score": delta}})

    author = await db.users.find_one({"id": c["author_id"]}, {"_id": 0, "password": 0})
    return {
        "id": c["id"],
        "post_id": c["post_id"],
        "author": public_user(author) if author else {"id": c["author_id"], "alias": "Unknown"},
        "content": c["content"],
        "created_at": c["created_at"],
        "up": reactions.get("up", 0),
        "down": reactions.get("down", 0),
        "my_reaction": reactors.get(user["id"]),
        "parent_comment_id": c.get("parent_comment_id"),
    }


@api.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    c = await db.comments.find_one({"id": comment_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    ad = await db.ads.find_one({"id": c["post_id"]}, {"_id": 0, "advertiser_id": 1})
    is_owner = c["author_id"] == user["id"]
    is_ad_owner = bool(ad) and ad["advertiser_id"] == user["id"]
    if not (is_owner or is_ad_owner or user.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Not allowed")

    image_ids = c.get("image_ids") or []
    if image_ids:
        await db.images.delete_many({"id": {"$in": image_ids}})

    await db.comments.update_one({"id": comment_id}, {"$set": {"status": "deleted"}})
    if ad:
        await db.ads.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    else:
        await db.posts.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    return {"status": "ok"}


# ---------- routes: notifications ----------

@api.get("/notifications")
async def list_notifications(
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:

    rows = await (
        db.notifications
        .find(
            {"user_id": user["id"]},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )

    return rows


@api.post("/notifications/read-all")
async def read_all_notifs(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"status": "ok"}


@api.get("/notifications/unread-count")
async def unread_count(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, int]:
    c = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": c}


# ---------- routes: profile / user posts ----------
@api.get("/users/{user_id}")
async def get_user(user_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return public_user(u)


@api.get("/users/{user_id}/posts")
async def user_posts(
    user_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:

    rows = await (
        db.posts
        .find(
            {"author_id": user_id, "status": "active"},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )

    return [await _hydrate_post(p, user["id"]) for p in rows]


@api.get("/users/{user_id}/commented-posts")
async def user_commented_posts(
    user_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Return posts that the given user has commented on (deduped, latest-comment first)."""
    # gather distinct post_ids from user's active comments, keep newest per post
    pipeline = [
        {"$match": {"author_id": user_id, "status": "active"}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$post_id", "latest_comment_at": {"$first": "$created_at"}, "my_comment": {"$first": "$content"}}},
        {"$sort": {"latest_comment_at": -1}},
        {"$skip": offset},
        {"$limit": limit},
    ]
    grouped = await db.comments.aggregate(pipeline).to_list(limit)
    out: List[Dict[str, Any]] = []
    for row in grouped:
        post = await db.posts.find_one({"id": row["_id"], "status": "active"}, {"_id": 0})
        if not post:
            continue
        hydrated = await _hydrate_post(post, user["id"])
        hydrated["my_comment_preview"] = row["my_comment"][:120]
        hydrated["my_comment_at"] = row["latest_comment_at"]
        out.append(hydrated)
    return out


# ---------- routes: chat ----------
def conv_id(a: str, b: str) -> str:
    return "-".join(sorted([a, b]))


@api.post("/chat/start")
async def start_chat(inp: ChatStartIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if inp.other_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot chat with yourself")
    other = await db.users.find_one({"id": inp.other_user_id}, {"_id": 0, "password": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    # check block either way
    blocked = await db.blocks.find_one({
        "$or": [
            {"blocker_id": user["id"], "target_user_id": inp.other_user_id},
            {"blocker_id": inp.other_user_id, "target_user_id": user["id"]},
        ]
    })
    if blocked:
        raise HTTPException(status_code=403, detail="Chat is blocked between users")

    cid = conv_id(user["id"], inp.other_user_id)
    existing = await db.conversations.find_one({"id": cid}, {"_id": 0})
    if not existing:
        existing = {
            "id": cid,
            "participants": [user["id"], inp.other_user_id],
            "created_at": now().isoformat(),
            "last_message": None,
            "last_message_at": now().isoformat(),
        }
        await db.conversations.insert_one(existing)
    return {"id": cid, "other": public_user(other), "last_message": existing.get("last_message"), "last_message_at": existing.get("last_message_at")}


@api.get("/chat/conversations")
async def list_conversations(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.conversations.find({"participants": user["id"]}, {"_id": 0}).sort("last_message_at", -1).to_list(100)
    out = []
    for c in rows:
        other_id = next((p for p in c["participants"] if p != user["id"]), None)
        if not other_id:
            continue
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "password": 0})
        unread = await db.messages.count_documents({"conversation_id": c["id"], "sender_id": {"$ne": user["id"]}, "read_by": {"$ne": user["id"]}})
        out.append({
            "id": c["id"],
            "other": public_user(other) if other else {"id": other_id, "alias": "Unknown"},
            "last_message": c.get("last_message"),
            "last_message_at": c.get("last_message_at"),
            "unread": unread,
        })
    return out


@api.get("/chat/{conversation_id}/messages")
async def list_messages(
    conversation_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:

    conv = await db.conversations.find_one({"id": conversation_id})

    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")

    rows = await (
        db.messages
        .find(
            {"conversation_id": conversation_id},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )

    rows.reverse()

    await db.messages.update_many(
        {
            "conversation_id": conversation_id,
            "sender_id": {"$ne": user["id"]},
            "read_by": {"$ne": user["id"]},
        },
        {
            "$addToSet": {"read_by": user["id"]},
        },
    )

    return rows

@api.get("/chat/{conversation_id}/status")
async def conversation_status(
    conversation_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:

    conv = await db.conversations.find_one({"id": conversation_id})

    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")

    other_id = next(
        (p for p in conv["participants"] if p != user["id"]),
        None,
    )

    blocked_by_me = await db.blocks.find_one({
        "blocker_id": user["id"],
        "target_user_id": other_id,
    })

    blocked_by_other = await db.blocks.find_one({
        "blocker_id": other_id,
        "target_user_id": user["id"],
    })

    return {
        "blocked": bool(blocked_by_me or blocked_by_other),
        "blocked_by_me": bool(blocked_by_me),
        "blocked_by_other": bool(blocked_by_other),
    }

@api.post("/chat/{conversation_id}/messages")
async def send_message(conversation_id: str, inp: MessageIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    conv = await db.conversations.find_one({"id": conversation_id})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    other_id = next((p for p in conv["participants"] if p != user["id"]), None)

    # check block
    blocked = await db.blocks.find_one({
        "$or": [
            {"blocker_id": user["id"], "target_user_id": other_id},
            {"blocker_id": other_id, "target_user_id": user["id"]},
        ]
    })
    if blocked:
        raise HTTPException(status_code=403, detail="Cannot message a blocked user")

    msg = {
        "id": new_id(),
        "conversation_id": conversation_id,
        "sender_id": user["id"],
        "sender_alias": user["alias"],
        "content": inp.content.strip(),
        "created_at": now().isoformat(),
        "read_by": [user["id"]],
    }
    await db.messages.insert_one(msg)
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {"last_message": msg["content"][:120], "last_message_at": msg["created_at"]}},
    )

    if other_id:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": other_id,
            "type": "message",
            "actor_alias": user["alias"],
            "conversation_id": conversation_id,
            "content_preview": msg["content"][:80],
            "created_at": now().isoformat(),
            "read": False,
        })
        await ws_manager.send_to(other_id, {"type": "message", "conversation_id": conversation_id, "message": {k: v for k, v in msg.items() if k != "_id"}})
        await ws_manager.send_to(other_id, {"type": "notification"})

    return {k: v for k, v in msg.items() if k != "_id"}


# ---------- routes: block / report ----------
@api.post("/block")
async def block_user(inp: BlockIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    if inp.target_user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    existing = await db.blocks.find_one({"blocker_id": user["id"], "target_user_id": inp.target_user_id})
    if existing:
        return {"status": "already"}
    await db.blocks.insert_one({
        "id": new_id(),
        "blocker_id": user["id"],
        "target_user_id": inp.target_user_id,
        "created_at": now().isoformat(),
    })
    return {"status": "ok"}


@api.delete("/block/{target_user_id}")
async def unblock(target_user_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await db.blocks.delete_many({"blocker_id": user["id"], "target_user_id": target_user_id})
    return {"status": "ok"}


@api.get("/block")
async def list_blocks(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.blocks.find({"blocker_id": user["id"]}, {"_id": 0}).to_list(200)
    out = []
    for b in rows:
        u = await db.users.find_one({"id": b["target_user_id"]}, {"_id": 0, "password": 0})
        if u:
            out.append({"id": b["id"], "user": public_user(u), "created_at": b["created_at"]})
    return out


@api.post("/report")
async def report(inp: ReportIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await db.reports.insert_one({
        "id": new_id(),
        "reporter_id": user["id"],
        "target_type": inp.target_type,
        "target_id": inp.target_id,
        "reason": inp.reason.strip(),
        "created_at": now().isoformat(),
        "status": "pending",
    })
    # increment report count on target user if applicable
    if inp.target_type == "user":
        await db.users.update_one({"id": inp.target_id}, {"$inc": {"report_count": 1}})
    elif inp.target_type == "post":
        p = await db.posts.find_one({"id": inp.target_id}, {"author_id": 1})
        if p:
            await db.users.update_one({"id": p["author_id"]}, {"$inc": {"report_count": 1}})
    return {"status": "ok"}


@api.get("/admin/reports")
async def admin_reports(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(get_current_user),
):
    require_role(user, "admin")

    reports = await (
        db.reports
        .find({"status": "pending"}, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )

    out = []

    for r in reports:
        reporter = await db.users.find_one(
            {"id": r["reporter_id"]},
            {"_id": 0},
        )

        target = None

        if r["target_type"] == "post":
            target = await db.posts.find_one(
                {"id": r["target_id"]},
                {"_id": 0},
            )

        elif r["target_type"] == "comment":
            target = await db.comments.find_one(
                {"id": r["target_id"]},
                {"_id": 0},
            )

        elif r["target_type"] == "user":
            target = await db.users.find_one(
                {"id": r["target_id"]},
                {"_id": 0, "password": 0},
            )

        elif r["target_type"] == "message":
            target = await db.messages.find_one(
                {"id": r["target_id"]},
                {"_id": 0},
            )

        out.append({
            **r,
            "reporter": public_user(reporter) if reporter else None,
            "target": target,
        })

    return out


@api.post("/admin/reports/{report_id}/dismiss")
async def dismiss_report(
    report_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    require_role(user, "admin")

    result = await db.reports.update_one(
        {
            "id": report_id,
        },
        {
            "$set": {
                "status": "dismissed",
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Report not found",
        )

    return {
        "status": "ok",
    }

    


@api.post("/admin/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    body: ResolveReportIn,
    user: Dict[str, Any] = Depends(get_current_user),
):
    require_role(user, "admin")

    report = await db.reports.find_one({"id": report_id})

    if not report:
        raise HTTPException(
            status_code=404,
            detail="Report not found",
        )

    if report.get("status") != "pending":
        raise HTTPException(
            status_code=400,
            detail="Report already resolved",
        )

    if body.action == "dismiss":
        await db.reports.update_one(
            {"id": report_id},
            {
                "$set": {
                    "status": "dismissed",
                    "resolved_at": now().isoformat(),
                    "resolved_by": user["id"],
                    "moderator_action": "dismiss",
                    "violation": body.violation,
                    "moderator_note": body.note,
                }
            },
        )

        return {"status": "ok"}

    if body.action == "delete_post":
        if report["target_type"] != "post":
            raise HTTPException(
                status_code=400,
                detail="This report is not for a post",
            )

        post = await db.posts.find_one(
            {
                "id": report.get("target_id")
            }
        )

        if not post:
            raise HTTPException(
                status_code=404,
                detail="Post not found",
            )
        if post.get("status") != "active":
            raise HTTPException(
                status_code=400,
                detail="Post is already unavailable",
            )

        result = await db.posts.update_one(
            {
                "id": post["id"],
            },
            {
                "$set": {
                    "status": "deleted_by_admin",
                    "deleted_at": now().isoformat(),
                    "deleted_by": user["id"],
                    "deletion_reason": body.violation,
                    "moderator_note": body.note,
                }
            },
        )
        if result.modified_count == 0:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete post",
            )
        await db.reports.update_one(
            {
                "id": report_id,
            },
            {
                "$set": {
                    "status": "resolved",
                    "resolved_at": now().isoformat(),
                    "resolved_by": user["id"],
                    "moderator_action": "delete_post",
                    "resolved_target_status": "deleted_by_admin",
                    "violation": body.violation,
                    "moderator_note": body.note,
                }
            },
        )
        if body.notify:
            await notify_post_removed(
                post=post,
                violation=body.violation,
                moderator_note=body.note,
            )
        return {
            "status": "ok",
        }

    raise HTTPException(
        status_code=400,
        detail="Unknown moderation action",
    )

# ---------- websocket ----------
@api.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query(...)) -> None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
        # Revocation check
        jti = payload.get("jti") or token[-24:]
        revoked = await db.revoked_tokens.find_one({"jti": jti}, {"_id": 1})
        if revoked:
            await ws.close(code=1008)
            return
    except jwt.PyJWTError:
        # Fall back to Google session token
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session:
            await ws.close(code=1008)
            return
        user_id = session["user_id"]

    await ws_manager.connect(user_id, ws)
    try:
        while True:
            # keep-alive; we could accept typing indicators here
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, ws)
    except Exception:
        ws_manager.disconnect(user_id, ws)


# ---------- seed ----------
@api.post("/dev/seed")
async def seed_data() -> Dict[str, Any]:
    """Seed demo users and posts.

    Only available when NOT running in production AND ENABLE_DEV_SEED=true.
    Refuses to run in production regardless of env flag.
    """
    if IS_PRODUCTION or not ENABLE_DEV_SEED:
        raise HTTPException(status_code=404, detail="Not found")
    demo_users = [
        {"email": "demo1@huni.app", "password": "demo1234", "first_name": "Ana", "last_name": "Cruz", "birthdate": "1998-04-12"},
        {"email": "demo2@huni.app", "password": "demo1234", "first_name": "Ben", "last_name": "Reyes", "birthdate": "2000-11-03"},
        {"email": "demo3@huni.app", "password": "demo1234", "first_name": "Cara", "last_name": "Lim", "birthdate": "2002-07-25"},
    ]
    created_users = []
    for du in demo_users:
        u = await db.users.find_one({"email": du["email"]})
        if not u:
            alias = await gen_unique_alias()
            u = {
                "id": new_id(),
                "email": du["email"],
                "password": hash_pw(du["password"]),
                "first_name": du["first_name"],
                "last_name": du["last_name"],
                "birthdate": du["birthdate"],
                "picture": "",
                "auth_provider": "password",
                "alias": alias,
                "bio": "",
                "helpful_score": random.randint(0, 20),
                "post_count": 0,
                "comment_count": 0,
                "report_count": 0,
                "joined_at": now().isoformat(),
                "alias_regens": 0,
                "last_alias_regen": None,
                "email_verified": True,
                "email_verified_at": now().isoformat(),
                "accepted_terms": True,
                "accepted_terms_at": now().isoformat(),
                "terms_version": 1,
            }
            await db.users.insert_one(u)
        else:
            # Bring existing seed users up to spec.
            await db.users.update_one(
                {"id": u["id"]},
                {"$set": {"email_verified": True, "email_verified_at": u.get("email_verified_at") or now().isoformat()}},
            )
        created_users.append(u["id"])

    sample = [
        ("Coffee shop hunt in Buug", "Naa bay nice nga coffee shop diri sa Buug? Craving na kaayo ko.", "question", "nearby"),
        ("Dropped my class today", "Confession: nag-drop ko sa akong online class kay ganahan na jud ko mag rest. Ok ra ba?", "confession", "public"),
        ("Third brownout this week", "Rant: brownout again for the 3rd time this week. Kapoy na jud.", "rant", "nearby"),
        ("Save first or invest first?", "Need advice: unsa mas nindot, save ug tag first job or invest? Fresh grad ko.", "need_advice", "public"),
        ("Silent hobbies win", "Hot take: silent hobbies are underrated. Reading > scrolling.", "hot_take", "public"),
        ("New tindahan near the plaza", "Local update: bag-ong tindahan sa may plaza — mura ilang ulam!", "local_update", "nearby"),
        ("Watch out near the terminal", "Safety concern: dark street near the terminal, walay street lights. Please be careful gabii.", "safety", "nearby"),
    ]
    posts_created = 0
    for title, content, mood, audience in sample:
        exists = await db.posts.find_one({"content": content})
        if exists:
            continue
        author_id = random.choice(created_users)
        p = {
            "id": new_id(),
            "author_id": author_id,
            "title": title,
            "content": content,
            "mood": mood,
            "audience": audience,
            "created_at": (now() - timedelta(hours=random.randint(0, 48))).isoformat(),
            "reactions": {"heart": random.randint(0, 5), "helpful": random.randint(0, 4)},
            "reactors": {},
            "comment_count": 0,
            "status": "active",
        }
        await db.posts.insert_one(p)
        await db.users.update_one({"id": author_id}, {"$inc": {"post_count": 1}})
        posts_created += 1

    # a pulse example
    pulse_title = "Best internet provider?"
    pulse_content = "Best internet provider sa Buug karon?"
    if not await db.posts.find_one({"content": pulse_content}):
        author_id = random.choice(created_users)
        p = {
            "id": new_id(),
            "author_id": author_id,
            "title": pulse_title,
            "content": pulse_content,
            "mood": "pulse",
            "audience": "nearby",
            "created_at": now().isoformat(),
            "reactions": {},
            "reactors": {},
            "comment_count": 0,
            "status": "active",
            "pulse_options": ["PLDT", "Globe", "Converge", "Starlink"],
            "pulse_votes": [3, 5, 2, 1],
            "pulse_voters": {},
        }
        await db.posts.insert_one(p)
        posts_created += 1

    return {"users": len(created_users), "posts_created": posts_created}


# ---------- app wiring ----------


app.include_router(api)


async def _run_startup() -> None:
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("alias", unique=True)
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("author_id")
    await db.comments.create_index("post_id")
    await db.comments.create_index([("created_at", 1)])
    await db.images.create_index("id")
    await db.ads.create_index("id")
    await db.ad_events.create_index([("ad_id", 1), ("type", 1)])
    await db.ad_events.create_index([("ad_id", 1), ("created_at", -1)])
    await db.campaigns.create_index("id", unique=True)
    await db.campaigns.create_index([("partner_id", 1), ("created_at", -1)])
    await db.campaigns.create_index("status")
    await db.redemptions.create_index("id", unique=True)
    await db.redemptions.create_index([("campaign_id", 1), ("user_id", 1), ("redeemed_at", -1)])
    await db.redemptions.create_index([("user_id", 1), ("redeemed_at", -1)])
    await db.redemptions.create_index([("partner_id", 1), ("redeemed_at", -1)])
    await db.store_items.create_index("id", unique=True)
    await db.store_items.create_index([("category", 1), ("sort_order", 1)])
    await db.store_items.create_index("enabled")
    await db.xp_ledger.create_index("id", unique=True)
    await db.xp_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.bookmarks.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.bookmarks.create_index([("user_id", 1), ("created_at", -1)])
    await db.purchases.create_index("id", unique=True)
    await db.purchases.create_index([("user_id", 1), ("item_id", 1)], unique=True)
    await db.purchases.create_index([("user_id", 1), ("purchased_at", -1)])

    # Security-related indexes
    await db.revoked_tokens.create_index("jti", unique=True)
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("key", unique=True)
    await db.login_attempts.create_index("expires_at", expireAfterSeconds=0)

    # Economy migration: backfill exp / tokens / campaign budget fields
    try:
        await db.users.update_many(
            {"exp": {"$exists": False}},
            [{"$set": {"exp": {"$ifNull": ["$points", 0]}}}],
        )
        await db.users.update_many({"tokens": {"$exists": False}}, {"$set": {"tokens": 0}})
        await db.campaigns.update_many(
            {"exp_per_redemption": {"$exists": False}},
            [{"$set": {
                "exp_per_redemption": {"$ifNull": ["$points_amount", 0]},
                "tokens_per_redemption": 0,
                "budget_exp": 0,
                "budget_tokens": 0,
                "remaining_exp": 0,
                "remaining_tokens": 0,
            }}],
        )
        await db.redemptions.update_many(
            {"exp_awarded": {"$exists": False}},
            [{"$set": {"exp_awarded": {"$ifNull": ["$points_awarded", 0]}, "tokens_awarded": 0}}],
        )
    except Exception:  # noqa: BLE001
        logger.exception("Economy migration failed (non-fatal)")

    # Seed a few mock appearance store items (idempotent — only if none exist for that subcategory).
    try:
        MOCK_STORE_ITEMS = [
            {"name": "Sunset Orange", "subcategory": "background_colors", "hex_color": "#FF7A45", "description": "Warm sunset orange for your profile banner.", "price_tokens": 40},
            {"name": "Ocean Teal", "subcategory": "background_colors", "hex_color": "#0AA1A1", "description": "Cool ocean teal — calm and pro.", "price_tokens": 40},
            {"name": "Midnight Indigo", "subcategory": "background_colors", "hex_color": "#3A1E9E", "description": "Deep indigo for the night owls.", "price_tokens": 60},
            {"name": "Grid Pattern (mock)", "subcategory": "patterns", "hex_color": None, "description": "MOCK — replace with a 1200×400 pattern PNG.", "price_tokens": 80},
            {"name": "Confetti Party (mock)", "subcategory": "patterns", "hex_color": None, "description": "MOCK — festive tile pattern placeholder.", "price_tokens": 100},
            {"name": "Gold Ring Border (mock)", "subcategory": "borders", "hex_color": None, "description": "MOCK — replace with a 512×512 PNG (transparent center).", "price_tokens": 120},
            {"name": "Fire Ring Border (mock)", "subcategory": "borders", "hex_color": None, "description": "MOCK — flame border, transparent center required.", "price_tokens": 150},
            {"name": "Cat Avatar Pack (mock)", "subcategory": "avatar_packs", "hex_color": None, "description": "MOCK — 512×512 square avatar image.", "price_tokens": 90},
            {"name": "Robot Avatar Pack (mock)", "subcategory": "avatar_packs", "hex_color": None, "description": "MOCK — 512×512 avatar. Replace image_id via Admin.", "price_tokens": 90},
        ]
        for m in MOCK_STORE_ITEMS:
            exists = await db.store_items.find_one(
                {"name": m["name"], "category": "appearance", "subcategory": m["subcategory"]},
                {"_id": 0, "id": 1},
            )
            if exists:
                continue
            await db.store_items.insert_one({
                "id": new_id(),
                "category": "appearance",
                "subcategory": m["subcategory"],
                "name": m["name"],
                "description": m["description"],
                "price_tokens": m["price_tokens"],
                "stock": -1,
                "image_id": None,
                "hex_color": m["hex_color"],
                "enabled": True,
                "active_from": None,
                "active_until": None,
                "sort_order": 0,
                "created_at": now().isoformat(),
            })
    except Exception:  # noqa: BLE001
        logger.exception("Store seed failed (non-fatal)")

    # promote configured admin emails
    if ADMIN_EMAILS:
        await db.users.update_many(
            {"email": {"$in": list(ADMIN_EMAILS)}, "role": {"$ne": "admin"}},
            {"$set": {"role": "admin"}},
        )
    await db.notifications.create_index("user_id")
    await db.conversations.create_index("participants")
    await db.messages.create_index("conversation_id")
    await db.blocks.create_index([("blocker_id", 1), ("target_user_id", 1)])
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    # TTL index — MongoDB auto-removes expired sessions
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    logger.info("Huni API started (env=%s)", ENVIRONMENT)

