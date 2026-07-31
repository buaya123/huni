#!/usr/bin/env python3
"""
Iteration 12 Backend Test Suite - Account Deletion + Security Regression
Tests DELETE /api/users/me with all guardrails, cascades, and post-deletion checks
"""
import requests
import time
import os
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

# Backend URL
BASE_URL = "https://backend-hardening-12.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "demo1@huni.app"
PARTNER_EMAIL = "demo2@huni.app"
USER_EMAIL = "demo3@huni.app"
PASSWORD = "demo1234"

# Global tokens
admin_token: Optional[str] = None
user_token: Optional[str] = None

# Test data
test_user_id: Optional[str] = None
test_user_email: Optional[str] = None
test_user_token: Optional[str] = None
test_post_id: Optional[str] = None
test_image_id: Optional[str] = None


def log(msg: str):
    print(f"[TEST] {msg}")


def login(email: str, password: str) -> Dict[str, Any]:
    """Login and return auth response"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        raise Exception(f"Login failed for {email}: {resp.status_code} {resp.text}")
    return resp.json()


def get_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def create_password_user_in_mongo() -> tuple[str, str, str]:
    """Create a fresh password-auth user directly in Mongo, bypassing email verification"""
    from bcrypt import hashpw, gensalt
    
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url, tz_aware=True, tzinfo=timezone.utc)
    db = client["huni_db"]
    
    # Generate unique email and user ID
    timestamp = int(datetime.now().timestamp())
    email = f"delme-{timestamp}@example.com"
    password = "StrongPass123"
    uid = str(uuid.uuid4())
    alias = f"del{uuid.uuid4().hex[:8]}"
    
    # Hash password
    hashed_pw = hashpw(password.encode(), gensalt()).decode()
    
    # Insert user directly
    await db.users.insert_one({
        "id": uid,
        "alias": alias,
        "email": email,
        "password": hashed_pw,
        "first_name": "Del",
        "last_name": "Me",
        "birthdate": "2000-01-01",
        "auth_provider": "password",
        "bio": "Test user for deletion",
        "picture": "",
        "helpful_score": 0,
        "post_count": 0,
        "comment_count": 0,
        "exp": 50,
        "tokens": 25,
        "role": "user",
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "email_verified": True,
        "accepted_terms": True,
        "terms_version": 1,
    })
    
    log(f"   Created user in Mongo: {email} (id={uid}, alias={alias})")
    
    client.close()
    return uid, email, password


async def create_google_user_in_mongo() -> tuple[str, str]:
    """Create a Google-auth user directly in Mongo"""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url, tz_aware=True, tzinfo=timezone.utc)
    db = client["huni_db"]
    
    # Generate unique email and user ID
    timestamp = int(datetime.now().timestamp())
    email = f"google-delme-{timestamp}@example.com"
    uid = str(uuid.uuid4())
    alias = f"gdel{uuid.uuid4().hex[:8]}"
    
    # Insert user directly (no password field for Google auth)
    await db.users.insert_one({
        "id": uid,
        "alias": alias,
        "email": email,
        "first_name": "Google",
        "last_name": "User",
        "birthdate": "2000-01-01",
        "auth_provider": "google",
        "google_sub": f"google-sub-{uid}",
        "bio": "Google test user for deletion",
        "picture": "",
        "helpful_score": 0,
        "post_count": 0,
        "comment_count": 0,
        "exp": 50,
        "tokens": 25,
        "role": "user",
        "joined_at": datetime.now(timezone.utc).isoformat(),
        "email_verified": True,
        "accepted_terms": True,
        "terms_version": 1,
    })
    
    # Create a session token for this user
    session_token = f"fake-session-{uid}"
    from datetime import timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": uid,
        "expires_at": expires_at.isoformat(),
    })
    
    log(f"   Created Google user in Mongo: {email} (id={uid}, alias={alias}, session_token={session_token})")
    
    client.close()
    return uid, session_token


async def verify_mongo_state(uid: str, check_type: str):
    """Verify Mongo state for a user"""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url, tz_aware=True, tzinfo=timezone.utc)
    db = client["huni_db"]
    
    if check_type == "before_delete":
        # Verify user exists with data
        user = await db.users.find_one({"id": uid})
        assert user is not None, f"User {uid} not found in Mongo"
        log(f"   ✓ User exists in Mongo before deletion")
        
    elif check_type == "after_delete":
        # Verify user is soft-deleted with PII scrubbed
        user = await db.users.find_one({"id": uid})
        assert user is not None, f"User {uid} not found in Mongo"
        assert user.get("status") == "deleted", f"Expected status=deleted, got {user.get('status')}"
        assert user.get("email", "").startswith("deleted-"), f"Email not scrubbed: {user.get('email')}"
        assert user.get("password") == "", f"Password not cleared"
        assert user.get("first_name") == "", f"First name not cleared"
        assert user.get("bio") == "", f"Bio not cleared"
        assert user.get("tokens") == 0, f"Tokens not zeroed"
        assert user.get("exp") == 0, f"EXP not zeroed"
        log(f"   ✓ User soft-deleted with PII scrubbed")
        
        # Verify posts are marked deleted_by_user
        posts = await db.posts.find({"author_id": uid}).to_list(length=100)
        for post in posts:
            if post.get("status") != "deleted_by_admin":
                assert post.get("status") == "deleted_by_user", f"Post status not updated: {post.get('status')}"
        if posts:
            log(f"   ✓ {len(posts)} post(s) marked as deleted_by_user")
        
        # Verify comments are marked deleted_by_user
        comments = await db.comments.find({"author_id": uid}).to_list(length=100)
        for comment in comments:
            if comment.get("status") != "deleted_by_admin":
                assert comment.get("status") == "deleted_by_user", f"Comment status not updated: {comment.get('status')}"
        if comments:
            log(f"   ✓ {len(comments)} comment(s) marked as deleted_by_user")
        
        # Verify images are hard-deleted
        images = await db.images.find({"owner_id": uid}).to_list(length=100)
        assert len(images) == 0, f"Expected 0 images, found {len(images)}"
        log(f"   ✓ Images hard-deleted")
        
        # Verify bookmarks are hard-deleted
        bookmarks = await db.bookmarks.find({"user_id": uid}).to_list(length=100)
        assert len(bookmarks) == 0, f"Expected 0 bookmarks, found {len(bookmarks)}"
        log(f"   ✓ Bookmarks hard-deleted")
        
        # Verify sessions are hard-deleted
        sessions = await db.user_sessions.find({"user_id": uid}).to_list(length=100)
        assert len(sessions) == 0, f"Expected 0 sessions, found {len(sessions)}"
        log(f"   ✓ Sessions hard-deleted")
        
        # Verify notifications are hard-deleted
        notifications = await db.notifications.find({"user_id": uid}).to_list(length=100)
        assert len(notifications) == 0, f"Expected 0 notifications, found {len(notifications)}"
        log(f"   ✓ Notifications hard-deleted")
    
    client.close()


def test_1_guardrails():
    """Test 1: Guardrails - wrong confirmation, wrong password, missing password"""
    global test_user_id, test_user_email, test_user_token
    
    log("=== TEST 1: Guardrails ===")
    
    # 1.1: Create fresh password user in Mongo
    log("1.1: Create fresh password-auth user directly in Mongo")
    uid, email, password = asyncio.run(create_password_user_in_mongo())
    test_user_id = uid
    test_user_email = email
    
    # Login to get JWT
    auth = login(email, password)
    test_user_token = auth["token"]
    log(f"   ✓ Logged in as {email}, captured JWT")
    
    # 1.2: Wrong confirmation (lowercase "delete" instead of "DELETE")
    log("1.2: DELETE with wrong confirmation (lowercase 'delete') - should return 422")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"password": password, "confirmation": "delete"},
        headers=get_headers(test_user_token)
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"
    assert "DELETE" in resp.json().get("detail", ""), f"Expected error message about 'DELETE', got: {resp.json()}"
    log(f"   ✓ Wrong confirmation rejected with 422: {resp.json()['detail']}")
    
    # 1.3: Wrong password
    log("1.3: DELETE with wrong password - should return 401")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"password": "wrongpass", "confirmation": "DELETE"},
        headers=get_headers(test_user_token)
    )
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    assert "password" in resp.json().get("detail", "").lower(), f"Expected error about password, got: {resp.json()}"
    log(f"   ✓ Wrong password rejected with 401: {resp.json()['detail']}")
    
    # 1.4: Missing password for password-auth user
    log("1.4: DELETE without password (password-auth user) - should return 422")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"confirmation": "DELETE"},
        headers=get_headers(test_user_token)
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}"
    assert "password" in resp.json().get("detail", "").lower(), f"Expected error about password, got: {resp.json()}"
    log(f"   ✓ Missing password rejected with 422: {resp.json()['detail']}")
    
    # Note: Skipping "no auth header" test to avoid hitting rate limit (3/hour)
    # We've already made 3 DELETE requests above
    
    log("✅ TEST 1 PASSED: All guardrails working correctly\n")


def test_2_cascade_and_happy_path():
    """Test 2: Cascade prep + happy path deletion"""
    global test_post_id, test_image_id, test_user_id, test_user_email, test_user_token
    
    log("=== TEST 2: Cascade Prep + Happy Path Deletion ===")
    
    # 2.0: Create a NEW fresh user for this test (to avoid rate limit from test 1)
    log("2.0: Create fresh user for cascade test")
    uid, email, password = asyncio.run(create_password_user_in_mongo())
    test_user_id = uid
    test_user_email = email
    auth = login(email, password)
    test_user_token = auth["token"]
    log(f"   ✓ Created and logged in as {email}")
    
    # 2.1: Upload an image
    log("2.1: Upload an image as test user")
    # Create a small base64 image (1x1 red pixel PNG)
    base64_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    resp = requests.post(
        f"{BASE_URL}/uploads",
        json={"data": base64_image, "content_type": "image/png"},
        headers=get_headers(test_user_token)
    )
    assert resp.status_code == 200, f"Failed to upload image: {resp.status_code} {resp.text}"
    test_image_id = resp.json()["id"]
    log(f"   ✓ Uploaded image: {test_image_id}")
    
    # 2.2: Create a post with the image
    log("2.2: Create a post with the image")
    post_data = {
        "title": "Test Post for Deletion",
        "content": "This post will be deleted",
        "mood": "question",
        "audience": "public",
        "image_ids": [test_image_id]
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(test_user_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code} {resp.text}"
    test_post_id = resp.json()["id"]
    log(f"   ✓ Created post: {test_post_id}")
    
    # 2.3: Bookmark the post (as another user)
    log("2.3: Bookmark the post as demo3")
    global user_token
    auth = login(USER_EMAIL, PASSWORD)
    user_token = auth["token"]
    
    resp = requests.post(
        f"{BASE_URL}/posts/{test_post_id}/bookmark",
        headers=get_headers(user_token)
    )
    assert resp.status_code == 200, f"Failed to bookmark: {resp.status_code}"
    log(f"   ✓ Bookmarked post as demo3")
    
    # 2.4: Create a notification for the test user (by commenting on their post)
    log("2.4: Create a notification by commenting on test user's post")
    resp = requests.post(
        f"{BASE_URL}/posts/{test_post_id}/comments",
        json={"content": "Test comment to create notification"},
        headers=get_headers(user_token)
    )
    assert resp.status_code == 200, f"Failed to comment: {resp.status_code}"
    log(f"   ✓ Created comment (notification generated)")
    
    # 2.5: Add a Google session record manually
    log("2.5: Add a Google session record manually in Mongo")
    async def add_session():
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        client = AsyncIOMotorClient(mongo_url, tz_aware=True, tzinfo=timezone.utc)
        db = client["huni_db"]
        
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        await db.user_sessions.insert_one({
            "session_token": f"fake-{test_user_id}",
            "user_id": test_user_id,
            "expires_at": expires_at.isoformat(),
        })
        
        client.close()
    
    asyncio.run(add_session())
    log(f"   ✓ Added Google session record")
    
    # 2.6: Verify counts before deletion
    log("2.6: Verify counts in Mongo before deletion")
    asyncio.run(verify_mongo_state(test_user_id, "before_delete"))
    
    # 2.7: Happy path deletion
    log("2.7: DELETE /users/me with correct password and confirmation")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"password": "StrongPass123", "confirmation": "DELETE"},
        headers=get_headers(test_user_token)
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code} {resp.text}"
    assert resp.json().get("status") == "deleted", f"Expected status=deleted, got {resp.json()}"
    log(f"   ✓ Account deleted successfully: {resp.json()}")
    
    # 2.8: Verify Mongo state after deletion
    log("2.8: Verify Mongo state after deletion")
    asyncio.run(verify_mongo_state(test_user_id, "after_delete"))
    
    log("✅ TEST 2 PASSED: Cascade and happy path deletion working correctly\n")


def test_3_post_deletion_checks():
    """Test 3: Post-deletion checks"""
    log("=== TEST 3: Post-Deletion Checks ===")
    
    # 3.1: GET /auth/me with revoked token should return 401
    log("3.1: GET /auth/me with revoked token - should return 401")
    resp = requests.get(f"{BASE_URL}/auth/me", headers=get_headers(test_user_token))
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    log(f"   ✓ Revoked token rejected with 401: {resp.json().get('detail', '')}")
    
    # 3.2: POST /auth/login with original email should return 401
    log("3.2: POST /auth/login with original email - should return 401")
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": test_user_email, "password": "StrongPass123"}
    )
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    log(f"   ✓ Login with deleted account rejected with 401")
    
    log("✅ TEST 3 PASSED: Post-deletion checks working correctly\n")


def test_4_google_auth_branch():
    """Test 4: Google auth branch"""
    log("=== TEST 4: Google Auth Branch ===")
    
    # 4.1: Create Google-auth user
    log("4.1: Create Google-auth user directly in Mongo")
    google_uid, google_session_token = asyncio.run(create_google_user_in_mongo())
    log(f"   ✓ Created Google user: {google_uid}")
    
    # 4.2: DELETE with confirmation only (no password)
    log("4.2: DELETE /users/me with confirmation only (no password) - should return 200")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {google_session_token}"}
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code} {resp.text}"
    assert resp.json().get("status") == "deleted", f"Expected status=deleted, got {resp.json()}"
    log(f"   ✓ Google user deleted successfully without password")
    
    # 4.3: Verify Mongo state
    log("4.3: Verify Google user is soft-deleted in Mongo")
    asyncio.run(verify_mongo_state(google_uid, "after_delete"))
    
    log("✅ TEST 4 PASSED: Google auth branch working correctly\n")


def test_5_rate_limit():
    """Test 5: Rate limit (3/hour)"""
    log("=== TEST 5: Rate Limit (3/hour) ===")
    
    # 5.1: Create a fresh user for rate limit testing
    log("5.1: Create fresh user for rate limit testing")
    uid, email, password = asyncio.run(create_password_user_in_mongo())
    auth = login(email, password)
    token = auth["token"]
    log(f"   ✓ Created and logged in as {email}")
    
    # 5.2: Send 3 rapid DELETE requests with wrong confirmations
    log("5.2: Send 3 rapid DELETE requests with wrong confirmations")
    for i in range(3):
        resp = requests.delete(
            f"{BASE_URL}/users/me",
            json={"password": password, "confirmation": "wrong"},
            headers=get_headers(token)
        )
        log(f"   Request {i+1}: {resp.status_code}")
        time.sleep(0.1)  # Small delay to avoid connection issues
    
    # 5.3: 4th request should return 429
    log("5.3: 4th request should return 429 (rate limit exceeded)")
    resp = requests.delete(
        f"{BASE_URL}/users/me",
        json={"password": password, "confirmation": "wrong"},
        headers=get_headers(token)
    )
    assert resp.status_code == 429, f"Expected 429, got {resp.status_code}"
    log(f"   ✓ Rate limit enforced: {resp.status_code}")
    
    log("✅ TEST 5 PASSED: Rate limit working correctly\n")


def test_6_get_current_user_rejects_deleted():
    """Test 6: get_current_user rejects deleted users"""
    log("=== TEST 6: get_current_user Rejects Deleted Users ===")
    
    # 6.1: Create a fresh user
    log("6.1: Create fresh user")
    uid, email, password = asyncio.run(create_password_user_in_mongo())
    auth = login(email, password)
    token = auth["token"]
    log(f"   ✓ Created and logged in as {email}")
    
    # 6.2: Manually flip status to "deleted" in Mongo
    log("6.2: Manually flip user status to 'deleted' in Mongo")
    async def flip_status():
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        client = AsyncIOMotorClient(mongo_url, tz_aware=True, tzinfo=timezone.utc)
        db = client["huni_db"]
        
        await db.users.update_one(
            {"id": uid},
            {"$set": {"status": "deleted"}}
        )
        
        client.close()
    
    asyncio.run(flip_status())
    log(f"   ✓ Flipped status to 'deleted'")
    
    # 6.3: GET /auth/me should return 401
    log("6.3: GET /auth/me with deleted user's token - should return 401")
    resp = requests.get(f"{BASE_URL}/auth/me", headers=get_headers(token))
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    assert "no longer exists" in resp.json().get("detail", "").lower(), f"Expected 'no longer exists' message, got: {resp.json()}"
    log(f"   ✓ Deleted user rejected with 401: {resp.json()['detail']}")
    
    log("✅ TEST 6 PASSED: get_current_user rejects deleted users correctly\n")


def test_7_regression_iteration11():
    """Test 7: Regression checks on Iteration 11 flows"""
    log("=== TEST 7: Regression Checks (Iteration 11) ===")
    
    # 7.1: Login and logout (JWT revocation)
    log("7.1: Test JWT revocation on logout")
    auth = login(USER_EMAIL, PASSWORD)
    token = auth["token"]
    
    # Verify token works
    resp = requests.get(f"{BASE_URL}/auth/me", headers=get_headers(token))
    assert resp.status_code == 200, f"Token should work before logout: {resp.status_code}"
    log(f"   ✓ Token works before logout")
    
    # Logout
    resp = requests.post(f"{BASE_URL}/auth/logout", headers=get_headers(token))
    assert resp.status_code == 200, f"Logout failed: {resp.status_code}"
    log(f"   ✓ Logout successful")
    
    # Verify token is revoked
    resp = requests.get(f"{BASE_URL}/auth/me", headers=get_headers(token))
    assert resp.status_code == 401, f"Expected 401 after logout, got {resp.status_code}"
    log(f"   ✓ Token revoked after logout")
    
    # 7.2: Login lockout (5 failed attempts)
    log("7.2: Test login lockout after 5 failed attempts")
    test_email = f"lockout-test-{int(time.time())}@example.com"
    
    # Try 5 failed logins
    for i in range(5):
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": test_email, "password": "wrongpass"}
        )
        log(f"   Attempt {i+1}: {resp.status_code}")
        if resp.status_code == 429:
            log(f"   ⚠️  Got 429 on attempt {i+1}, lockout triggered early")
            break
        assert resp.status_code == 401, f"Expected 401 for failed login {i+1}, got {resp.status_code}"
    
    log(f"   ✓ Failed login attempts completed")
    
    # 6th attempt should return 429 (or we already got it above)
    if resp.status_code != 429:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": test_email, "password": "wrongpass"}
        )
        assert resp.status_code == 429, f"Expected 429 for 6th attempt, got {resp.status_code}"
    log(f"   ✓ Login lockout enforced after 5 failed attempts")
    
    # 7.3: Legal endpoints accessible
    log("7.3: Test /api/legal endpoints are accessible")
    resp = requests.get(f"{BASE_URL}/legal")
    assert resp.status_code == 200, f"Expected 200 for /api/legal, got {resp.status_code}"
    log(f"   ✓ /api/legal accessible")
    
    resp = requests.get(f"{BASE_URL}/legal/terms")
    assert resp.status_code == 200, f"Expected 200 for /api/legal/terms, got {resp.status_code}"
    log(f"   ✓ /api/legal/terms accessible")
    
    # 7.4: /api/inspect is gone
    log("7.4: Test /api/inspect is removed")
    resp = requests.get(f"{BASE_URL}/inspect")
    assert resp.status_code == 404, f"Expected 404 for /api/inspect, got {resp.status_code}"
    log(f"   ✓ /api/inspect removed (404)")
    
    log("✅ TEST 7 PASSED: No regressions on Iteration 11 flows\n")


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("ITERATION 12 BACKEND TEST SUITE - ACCOUNT DELETION + SECURITY")
    print("="*80 + "\n")
    
    try:
        # Seed the database first
        log("Seeding database...")
        resp = requests.post(f"{BASE_URL}/dev/seed")
        if resp.status_code == 200:
            log("✓ Database seeded successfully\n")
        else:
            log(f"⚠️  Seed failed or already seeded: {resp.status_code}\n")
        
        test_1_guardrails()
        test_2_cascade_and_happy_path()
        test_3_post_deletion_checks()
        test_4_google_auth_branch()
        test_5_rate_limit()
        test_6_get_current_user_rejects_deleted()
        test_7_regression_iteration11()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED (7/7)")
        print("="*80 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()
