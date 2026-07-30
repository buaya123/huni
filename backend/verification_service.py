import hashlib
import random

from datetime import datetime, timezone




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
    purpose="verify_email",
):
    code = generate_code()

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

    docs = await db.email_verifications.find({
        "email": email.lower(),
        "purpose": purpose,
    }).to_list(None)

    print("COUNT:", len(docs))

    for i, d in enumerate(docs):
        print(
            i,
            d["_id"],
            d["email"],
            d["code_hash"],
            d["attempts"],
        )

    verification = docs[0] if docs else None

    saved = await db.email_verifications.find_one({
        "user_id": user_id,
        "purpose": purpose,
    })

    expected_hash = hash_code(code)

    print("GENERATED CODE:", code)
    print("EXPECTED HASH :", expected_hash)
    print("SAVED HASH    :", saved["code_hash"])
    print("HASH MATCH    :", expected_hash == saved["code_hash"])

    return code


async def verify_code(db, email, code, purpose="verify_email"):
    print("EMAIL:", email)
    verification = await db.email_verifications.find_one(
        {
            "email": email.lower(),
            "purpose": purpose,
        },
        sort=[("created_at", -1)]
    )
    print("VERIFICATION:", verification)
    if not verification:
        return False, "Verification not found.", None

    expires_at = verification["expires_at"]

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now() > expires_at:
        await db.email_verifications.delete_one({
            "_id": verification["_id"]
        })
        return False, "Verification code expired.", None

    if verification["attempts"] >= MAX_ATTEMPTS:
        await db.email_verifications.delete_one({
            "_id": verification["_id"]
        })
        return False, "Too many attempts.",None

    entered_hash = hash_code(code)

    print("ENTERED CODE:", code)
    print("ENTERED HASH:", entered_hash)
    print("STORED HASH :", verification["code_hash"])

    if entered_hash != verification["code_hash"]:
        await db.email_verifications.update_one(
            {"_id": verification["_id"]},
            {"$inc": {"attempts": 1}},
        )

        return False, "Invalid verification code.", None

    await db.email_verifications.delete_one({
        "_id": verification["_id"]
    })

    return True, None, verification


from datetime import timedelta


async def resend_verification(
    db,
    user_id: str,
    email: str,
    purpose="verify_email",
):
    verification = await db.email_verifications.find_one(
    {
        "email": email.lower(),
        "purpose": purpose,
    },
    sort=[("created_at", -1)]
)

    if not verification:
        return False, "Verification request not found.", None

    elapsed = (now() - verification["last_sent_at"]).total_seconds()

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
                "expires_at": now() + timedelta(minutes=CODE_EXPIRY_MINUTES),
            }
        },
    )

    return True, None, code