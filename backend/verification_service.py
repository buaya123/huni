import hashlib
import random
from datetime import datetime, timedelta, timezone


CODE_LENGTH = 6
CODE_EXPIRY_MINUTES = 1
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


def now():
    return datetime.now(timezone.utc)


def generate_code():
    return "".join(random.choices("0123456789", k=CODE_LENGTH))


def hash_code(code: str):
    return hashlib.sha256(code.encode()).hexdigest()


async def create_verification(
    db,
    user_id: str,
    email: str,
    purpose: str = "verify_email",
):
    code = generate_code()

    # Remove any previous verification for this email/purpose
    await db.email_verifications.delete_many({
        "email": email.lower(),
        "purpose": purpose,
    })

    await db.email_verifications.insert_one({
        "user_id": user_id,
        "email": email.lower(),
        "purpose": purpose,
        "code_hash": hash_code(code),
        "attempts": 0,
        "created_at": now(),
        "last_sent_at": now(),
        "expires_at": now() + timedelta(minutes=CODE_EXPIRY_MINUTES),
    })

    return code


async def verify_code(
    db,
    email: str,
    code: str,
    purpose: str = "verify_email",
):
    verification = await db.email_verifications.find_one(
        {
            "email": email.lower(),
            "purpose": purpose,
        },
        sort=[("created_at", -1)],
    )

    if not verification:
        return False, "Verification not found.", None

    expires_at = verification["expires_at"]

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now() > expires_at:
        await db.email_verifications.delete_one(
            {"_id": verification["_id"]}
        )
        return False, "Verification code expired.", None

    if verification["attempts"] >= MAX_ATTEMPTS:
        await db.email_verifications.delete_one(
            {"_id": verification["_id"]}
        )
        return False, "Too many attempts.", None

    entered_hash = hash_code(code)

    if entered_hash != verification["code_hash"]:
        await db.email_verifications.update_one(
            {"_id": verification["_id"]},
            {"$inc": {"attempts": 1}},
        )

        return False, "Invalid verification code.", None

    await db.email_verifications.delete_one(
        {"_id": verification["_id"]}
    )

    return True, None, verification


async def resend_verification(
    db,
    user_id: str,
    email: str,
    purpose: str = "verify_email",
):
    verification = await db.email_verifications.find_one(
        {
            "email": email.lower(),
            "purpose": purpose,
        },
        sort=[("created_at", -1)],
    )

    if not verification:
        return False, "Verification request not found.", None

    elapsed = (
        now() - verification["last_sent_at"]
    ).total_seconds()

    if elapsed < RESEND_COOLDOWN_SECONDS:
        remaining = int(RESEND_COOLDOWN_SECONDS - elapsed)
        return False, f"Please wait {remaining} seconds.", None

    code = generate_code()

    await db.email_verifications.update_one(
        {"_id": verification["_id"]},
        {
            "$set": {
                "code_hash": hash_code(code),
                "attempts": 0,
                "last_sent_at": now(),
                "expires_at": now()
                + timedelta(minutes=CODE_EXPIRY_MINUTES),
            }
        },
    )

    return True, None, code