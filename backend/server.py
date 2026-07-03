"""Huni backend - anonymous social app.

FastAPI + MongoDB (motor). JWT auth with bcrypt password hashing.
Emergent-managed Google Auth via session tokens.
WebSockets for realtime chat + notifications.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import jwt
from bcrypt import checkpw, gensalt, hashpw
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ["JWT_ALGORITHM"]
JWT_EXPIRE_DAYS = int(os.environ["JWT_EXPIRE_DAYS"])
EMERGENT_SESSION_URL = os.environ.get(
    "EMERGENT_SESSION_URL",
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
)
GOOGLE_SESSION_DAYS = int(os.environ.get("GOOGLE_SESSION_DAYS", "7"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Huni API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("huni")


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
    payload = {
        "sub": user_id,
        "iat": int(now().timestamp()),
        "exp": int((now() + timedelta(days=JWT_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


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
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Accept either a JWT (email/password auth) OR a session_token (Google auth)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()

    # 1) try JWT first (short-circuits when signature valid)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload["sub"]
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if user:
            return user
    except jwt.PyJWTError:
        pass

    # 2) try session_token (Google auth)
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        # normalise expires_at to tz-aware then check
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
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password": 0})
            if user:
                return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------- models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    birthdate: str = Field(min_length=8, max_length=10)  # "YYYY-MM-DD"


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
    content_type: str = Field(default="image/jpeg", pattern="^image/(jpeg|png|webp|gif)$")


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


class BlockIn(BaseModel):
    target_user_id: str


class BioUpdate(BaseModel):
    bio: str = Field(max_length=200)


# ---------- utility: sanitize user for public output ----------
def public_user(u: Dict[str, Any]) -> Dict[str, Any]:
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
    }


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


# ---------- routes: auth ----------
@api.post("/auth/register", response_model=AuthOut)
async def register(inp: RegisterIn) -> AuthOut:
    email = inp.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # birthdate must parse as YYYY-MM-DD
    try:
        datetime.strptime(inp.birthdate, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid birthdate. Use YYYY-MM-DD.")

    alias = await gen_unique_alias()
    user = {
        "id": new_id(),
        "email": email,
        "password": hash_pw(inp.password),
        "first_name": inp.first_name.strip(),
        "last_name": inp.last_name.strip(),
        "birthdate": inp.birthdate,
        "picture": "",
        "auth_provider": "password",
        "alias": alias,
        "bio": "",
        "helpful_score": 0,
        "post_count": 0,
        "comment_count": 0,
        "report_count": 0,
        "joined_at": now().isoformat(),
        "alias_regens": 0,
        "last_alias_regen": None,
    }
    await db.users.insert_one(user)
    token = make_token(user["id"])
    return AuthOut(token=token, user=public_user(user))


@api.post("/auth/google/session", response_model=AuthOut)
async def google_session(inp: GoogleSessionIn) -> AuthOut:
    """Exchange an Emergent session_id (from the hosted Google flow) for our own auth token.

    Upserts the user by email and stores a session_token in `user_sessions`.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client_h:
            resp = await client_h.get(
                EMERGENT_SESSION_URL,
                headers={"X-Session-ID": inp.session_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google session lookup failed: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = resp.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google session missing email")
    session_token: str = data["session_token"]
    picture: str = data.get("picture", "") or ""
    full_name: str = data.get("name", "") or ""
    parts = full_name.split(" ", 1) if full_name else ["", ""]
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ""

    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {
                "picture": picture or existing.get("picture", ""),
                "first_name": existing.get("first_name") or first_name,
                "last_name": existing.get("last_name") or last_name,
                "auth_provider": existing.get("auth_provider") or "google",
                "google_id": data.get("id") or existing.get("google_id"),
            }},
        )
        user_id = existing["id"]
    else:
        alias = await gen_unique_alias()
        user_id = new_id()
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "password": "",  # no password for google users
            "first_name": first_name,
            "last_name": last_name,
            "birthdate": "",
            "picture": picture,
            "google_id": data.get("id"),
            "auth_provider": "google",
            "alias": alias,
            "bio": "",
            "helpful_score": 0,
            "post_count": 0,
            "comment_count": 0,
            "report_count": 0,
            "joined_at": now().isoformat(),
            "alias_regens": 0,
            "last_alias_regen": None,
        })

    expires_at = now() + timedelta(days=GOOGLE_SESSION_DAYS)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": now(),
            "expires_at": expires_at,
        }},
        upsert=True,
    )
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return AuthOut(token=session_token, user=public_user(user))


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)) -> Dict[str, str]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_many({"session_token": token})
    return {"status": "ok"}


@api.post("/auth/login", response_model=AuthOut)
async def login(inp: LoginIn) -> AuthOut:
    email = inp.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(inp.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user["id"])
    return AuthOut(token=token, user=public_user(user))


@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return public_user(user)


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


# ---------- routes: posts ----------
async def _hydrate_post(p: Dict[str, Any], viewer_id: Optional[str]) -> Dict[str, Any]:
    author = await db.users.find_one({"id": p["author_id"]}, {"_id": 0, "password": 0})
    reactions = p.get("reactions", {})
    my_reaction = None
    if viewer_id and viewer_id in p.get("reactors", {}):
        my_reaction = p["reactors"][viewer_id]
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
    }


@api.post("/posts")
async def create_post(inp: PostCreate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    doc: Dict[str, Any] = {
        "id": new_id(),
        "author_id": user["id"],
        "title": inp.title.strip(),
        "content": inp.content.strip(),
        "mood": inp.mood,
        "audience": inp.audience,
        "created_at": now().isoformat(),
        "reactions": {},   # kind -> count
        "reactors": {},    # user_id -> kind
        "comment_count": 0,
        "status": "active",
        "image_ids": (inp.image_ids or [])[:4],
    }
    if inp.mood == "pulse" and inp.pulse_options:
        doc["pulse_options"] = inp.pulse_options[:4]
        doc["pulse_votes"] = [0] * len(doc["pulse_options"])
        doc["pulse_voters"] = {}
    await db.posts.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"post_count": 1}})
    return await _hydrate_post(doc, user["id"])


@api.get("/posts")
async def list_posts(
    tab: str = Query(default="latest", pattern="^(latest|trending|nearby|pulse)$"),
    limit: int = 30,
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
        return [await _hydrate_post(p, user["id"]) for _, p in scored[:limit]]

    cursor = db.posts.find(query, {"_id": 0}).sort(sort).limit(limit)
    rows = await cursor.to_list(limit)
    return [await _hydrate_post(p, user["id"]) for p in rows]


@api.get("/posts/{post_id}")
async def get_post(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    return await _hydrate_post(p, user["id"])


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    p = await db.posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    if p["author_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "deleted"}})
    return {"status": "ok"}


@api.post("/posts/{post_id}/react")
async def react_post(post_id: str, inp: ReactionIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one({"id": post_id})
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
    p = await db.posts.find_one({"id": post_id})
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


# ---------- routes: image uploads ----------
MAX_IMAGE_B64_LEN = 8 * 1024 * 1024  # ~6MB binary


@api.post("/uploads")
async def upload_image(inp: UploadIn, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    data = inp.data
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]
    if len(data) > MAX_IMAGE_B64_LEN:
        raise HTTPException(status_code=413, detail="Image too large")
    try:
        base64.b64decode(data[:100], validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    image_id = new_id()
    await db.images.insert_one({
        "id": image_id,
        "owner_id": user["id"],
        "data": data,
        "content_type": inp.content_type,
        "created_at": now().isoformat(),
    })
    return {"id": image_id}


@api.get("/images/{image_id}")
async def get_image(image_id: str) -> Response:
    img = await db.images.find_one({"id": image_id})
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        content = base64.b64decode(img["data"])
    except Exception:
        raise HTTPException(status_code=500, detail="Corrupt image")
    return Response(
        content=content,
        media_type=img.get("content_type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


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
async def create_comment(post_id: str, inp: CommentCreate, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    p = await db.posts.find_one({"id": post_id})
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
    await db.posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    await db.users.update_one({"id": user["id"]}, {"$inc": {"comment_count": 1}})

    # notify post author on top-level comment
    if not inp.parent_comment_id and p["author_id"] != user["id"]:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": p["author_id"],
            "type": "comment",
            "actor_alias": user["alias"],
            "post_id": post_id,
            "content_preview": inp.content[:80] or "📷 Photo",
            "created_at": now().isoformat(),
            "read": False,
        })
        await ws_manager.send_to(p["author_id"], {"type": "notification"})

    # notify parent-comment author on a reply
    if parent_author_id and parent_author_id != user["id"]:
        await db.notifications.insert_one({
            "id": new_id(),
            "user_id": parent_author_id,
            "type": "reply",
            "actor_alias": user["alias"],
            "post_id": post_id,
            "content_preview": inp.content[:80] or "📷 Photo",
            "created_at": now().isoformat(),
            "read": False,
        })
        await ws_manager.send_to(parent_author_id, {"type": "notification"})

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
    if c["author_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.comments.update_one({"id": comment_id}, {"$set": {"status": "deleted"}})
    await db.posts.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    return {"status": "ok"}


# ---------- routes: notifications ----------
@api.get("/notifications")
async def list_notifications(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
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
async def user_posts(user_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    rows = await db.posts.find({"author_id": user_id, "status": "active"}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return [await _hydrate_post(p, user["id"]) for p in rows]


@api.get("/users/{user_id}/commented-posts")
async def user_commented_posts(user_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """Return posts that the given user has commented on (deduped, latest-comment first)."""
    # gather distinct post_ids from user's active comments, keep newest per post
    pipeline = [
        {"$match": {"author_id": user_id, "status": "active"}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$post_id", "latest_comment_at": {"$first": "$created_at"}, "my_comment": {"$first": "$content"}}},
        {"$sort": {"latest_comment_at": -1}},
        {"$limit": 50},
    ]
    grouped = await db.comments.aggregate(pipeline).to_list(50)
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
async def list_messages(conversation_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    conv = await db.conversations.find_one({"id": conversation_id})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=403, detail="Not a participant")
    rows = await db.messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    # mark all as read
    await db.messages.update_many(
        {"conversation_id": conversation_id, "sender_id": {"$ne": user["id"]}, "read_by": {"$ne": user["id"]}},
        {"$addToSet": {"read_by": user["id"]}},
    )
    return rows


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


# ---------- websocket ----------
@api.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query(...)) -> None:
    try:
        user_id = decode_token(token)
    except HTTPException:
        await ws.close(code=1008)
        return
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
    """Seed demo users and posts. Idempotent-ish for demo purposes.

    Disabled unless ENABLE_DEV_SEED=true in the environment.
    """
    if os.environ.get("ENABLE_DEV_SEED", "false").lower() != "true":
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
            }
            await db.users.insert_one(u)
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
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
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
    await db.notifications.create_index("user_id")
    await db.conversations.create_index("participants")
    await db.messages.create_index("conversation_id")
    await db.blocks.create_index([("blocker_id", 1), ("target_user_id", 1)])
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    # TTL index — MongoDB auto-removes expired sessions
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    log.info("Huni API started")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    client.close()
