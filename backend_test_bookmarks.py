#!/usr/bin/env python3
"""
Bookmarks + User Rank Endpoints Test Suite
Tests bookmark toggle, bookmark list, bookmark notifications, and user rank fields
"""
import requests
import time
from typing import Dict, Any, Optional

# Backend URL
BASE_URL = "https://huni-qr-campaigns.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "demo1@huni.app"
PARTNER_EMAIL = "demo2@huni.app"
USER_EMAIL = "demo3@huni.app"
PASSWORD = "demo1234"

# Global tokens
admin_token: Optional[str] = None
partner_token: Optional[str] = None
user_token: Optional[str] = None

# Test data
demo1_id: Optional[str] = None
demo2_id: Optional[str] = None
demo3_id: Optional[str] = None
test_post_id: Optional[str] = None
test_post_id_2: Optional[str] = None
ad_post_id: Optional[str] = None


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


def seed_database():
    """Seed the database with test data"""
    log("Seeding database...")
    resp = requests.post(f"{BASE_URL}/dev/seed")
    if resp.status_code != 200:
        log(f"   Warning: Seed failed with {resp.status_code}, continuing anyway...")
    else:
        log("   ✓ Database seeded")


def test_1_user_rank_fields():
    """Test 1: GET /api/users/{id} includes rank fields"""
    global user_token, partner_token, demo2_id, demo3_id
    
    log("=== TEST 1: GET /api/users/{id} includes rank fields ===")
    
    # Login as demo3
    log("1.1: Login as demo3")
    auth3 = login(USER_EMAIL, PASSWORD)
    user_token = auth3["token"]
    demo3_id = auth3["user"]["id"]
    log(f"   ✓ Logged in as demo3 (id: {demo3_id})")
    
    # Login as demo2 to get their ID
    log("1.2: Login as demo2 to get their ID")
    auth2 = login(PARTNER_EMAIL, PASSWORD)
    partner_token = auth2["token"]
    demo2_id = auth2["user"]["id"]
    log(f"   ✓ Logged in as demo2 (id: {demo2_id})")
    
    # Get demo2's profile as demo3
    log("1.3: GET /api/users/{demo2_id} as demo3")
    resp = requests.get(f"{BASE_URL}/users/{demo2_id}", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get user: {resp.status_code} {resp.text}"
    user_data = resp.json()
    
    # Verify rank fields
    log("1.4: Verify response includes rank fields")
    required_fields = ["exp", "points", "tokens", "rank_level", "rank_title"]
    for field in required_fields:
        assert field in user_data, f"Missing field: {field}"
        log(f"   ✓ Field '{field}' present: {user_data[field]}")
    
    # Verify types
    assert isinstance(user_data["exp"], int), f"exp should be int, got {type(user_data['exp'])}"
    assert isinstance(user_data["points"], int), f"points should be int, got {type(user_data['points'])}"
    assert isinstance(user_data["tokens"], int), f"tokens should be int, got {type(user_data['tokens'])}"
    assert isinstance(user_data["rank_level"], int), f"rank_level should be int, got {type(user_data['rank_level'])}"
    assert isinstance(user_data["rank_title"], str), f"rank_title should be str, got {type(user_data['rank_title'])}"
    
    # Verify points === exp (legacy alias)
    assert user_data["points"] == user_data["exp"], f"points should equal exp: {user_data['points']} != {user_data['exp']}"
    
    log(f"   ✓ All rank fields present with correct types")
    log(f"   ✓ demo2 rank: Level {user_data['rank_level']}, {user_data['rank_title']}, {user_data['exp']} EXP, {user_data['tokens']} tokens")
    
    log("✅ TEST 1 PASSED: User rank fields working correctly\n")


def test_2_bookmark_toggle():
    """Test 2: POST /api/posts/{post_id}/bookmark — toggle"""
    global test_post_id, admin_token, demo1_id
    
    log("=== TEST 2: POST /api/posts/{post_id}/bookmark — toggle ===")
    
    # Create a post as demo3
    log("2.1: Create a post as demo3")
    post_data = {
        "title": "Bookmark Test Post",
        "content": "Testing bookmark functionality",
        "mood": "question",
        "audience": "public"
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code} {resp.text}"
    test_post_id = resp.json()["id"]
    log(f"   ✓ Post created (id: {test_post_id})")
    
    # Login as demo2
    log("2.2: Login as demo2 (will bookmark demo3's post)")
    # Already logged in from test 1
    
    # Bookmark the post
    log("2.3: POST /api/posts/{post_id}/bookmark as demo2 (add)")
    resp = requests.post(f"{BASE_URL}/posts/{test_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to bookmark: {resp.status_code} {resp.text}"
    bookmark_result = resp.json()
    
    assert bookmark_result["status"] == "added", f"Expected status='added', got {bookmark_result['status']}"
    assert bookmark_result["is_bookmarked"] == True, f"Expected is_bookmarked=True"
    log(f"   ✓ Bookmark added (status: {bookmark_result['status']}, is_bookmarked: {bookmark_result['is_bookmarked']})")
    
    # Get the post as demo2 - should show is_bookmarked=True, bookmark_count=1
    log("2.4: GET /api/posts/{post_id} as demo2 - verify is_bookmarked=True, bookmark_count=1")
    resp = requests.get(f"{BASE_URL}/posts/{test_post_id}", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get post: {resp.status_code}"
    post_data = resp.json()
    
    assert post_data["is_bookmarked"] == True, f"Expected is_bookmarked=True, got {post_data['is_bookmarked']}"
    assert post_data["bookmark_count"] == 1, f"Expected bookmark_count=1, got {post_data['bookmark_count']}"
    log(f"   ✓ Post shows is_bookmarked=True, bookmark_count=1")
    
    # Get the same post as demo3 (owner) - should show is_bookmarked=False, bookmark_count=1
    log("2.5: GET /api/posts/{post_id} as demo3 (owner) - verify is_bookmarked=False, bookmark_count=1")
    resp = requests.get(f"{BASE_URL}/posts/{test_post_id}", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get post: {resp.status_code}"
    post_data = resp.json()
    
    assert post_data["is_bookmarked"] == False, f"Expected is_bookmarked=False (owner didn't bookmark), got {post_data['is_bookmarked']}"
    assert post_data["bookmark_count"] == 1, f"Expected bookmark_count=1, got {post_data['bookmark_count']}"
    log(f"   ✓ Post shows is_bookmarked=False (owner didn't bookmark), bookmark_count=1")
    
    # Bookmark again as demo2 - should remove
    log("2.6: POST /api/posts/{post_id}/bookmark again as demo2 (remove)")
    resp = requests.post(f"{BASE_URL}/posts/{test_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to toggle bookmark: {resp.status_code}"
    bookmark_result = resp.json()
    
    assert bookmark_result["status"] == "removed", f"Expected status='removed', got {bookmark_result['status']}"
    assert bookmark_result["is_bookmarked"] == False, f"Expected is_bookmarked=False"
    log(f"   ✓ Bookmark removed (status: {bookmark_result['status']}, is_bookmarked: {bookmark_result['is_bookmarked']})")
    
    # Get the post again - should show is_bookmarked=False, bookmark_count=0
    log("2.7: GET /api/posts/{post_id} as demo2 - verify is_bookmarked=False, bookmark_count=0")
    resp = requests.get(f"{BASE_URL}/posts/{test_post_id}", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get post: {resp.status_code}"
    post_data = resp.json()
    
    assert post_data["is_bookmarked"] == False, f"Expected is_bookmarked=False, got {post_data['is_bookmarked']}"
    assert post_data["bookmark_count"] == 0, f"Expected bookmark_count=0, got {post_data['bookmark_count']}"
    log(f"   ✓ Post shows is_bookmarked=False, bookmark_count=0")
    
    # Try to bookmark unknown post - should 404
    log("2.8: POST /api/posts/{unknown_id}/bookmark - should return 404")
    resp = requests.post(f"{BASE_URL}/posts/unknown-post-id-12345/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 404, f"Expected 404 for unknown post, got {resp.status_code}"
    log(f"   ✓ Unknown post returns 404")
    
    log("✅ TEST 2 PASSED: Bookmark toggle working correctly\n")


def test_3_my_bookmarks():
    """Test 3: GET /api/me/bookmarks"""
    global test_post_id_2
    
    log("=== TEST 3: GET /api/me/bookmarks ===")
    
    # Create a second post as demo3
    log("3.1: Create a second post as demo3")
    post_data = {
        "title": "Second Bookmark Test Post",
        "content": "Another post for bookmark testing",
        "mood": "question",
        "audience": "public"
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code}"
    test_post_id_2 = resp.json()["id"]
    log(f"   ✓ Second post created (id: {test_post_id_2})")
    
    # Bookmark both posts as demo2
    log("3.2: Bookmark both posts as demo2")
    resp1 = requests.post(f"{BASE_URL}/posts/{test_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp1.status_code == 200, f"Failed to bookmark post 1: {resp1.status_code}"
    
    resp2 = requests.post(f"{BASE_URL}/posts/{test_post_id_2}/bookmark", headers=get_headers(partner_token))
    assert resp2.status_code == 200, f"Failed to bookmark post 2: {resp2.status_code}"
    log(f"   ✓ Both posts bookmarked")
    
    # Get bookmarks as demo2
    log("3.3: GET /api/me/bookmarks as demo2 - should return 2 posts")
    resp = requests.get(f"{BASE_URL}/me/bookmarks", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get bookmarks: {resp.status_code}"
    bookmarks = resp.json()
    
    assert len(bookmarks) == 2, f"Expected 2 bookmarks, got {len(bookmarks)}"
    log(f"   ✓ Got 2 bookmarks")
    
    # Verify posts are fully hydrated with author and is_bookmarked=True
    log("3.4: Verify bookmarks are fully hydrated")
    for bm in bookmarks:
        assert "id" in bm, "Missing id field"
        assert "title" in bm, "Missing title field"
        assert "author" in bm, "Missing author field"
        assert "is_bookmarked" in bm, "Missing is_bookmarked field"
        assert bm["is_bookmarked"] == True, f"Expected is_bookmarked=True, got {bm['is_bookmarked']}"
        assert bm["author"]["id"] == demo3_id, f"Expected author to be demo3, got {bm['author']['id']}"
    log(f"   ✓ All bookmarks fully hydrated with author and is_bookmarked=True")
    
    # Un-bookmark one post
    log("3.5: Un-bookmark first post")
    resp = requests.post(f"{BASE_URL}/posts/{test_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to un-bookmark: {resp.status_code}"
    log(f"   ✓ First post un-bookmarked")
    
    # Get bookmarks again - should return 1 post
    log("3.6: GET /api/me/bookmarks as demo2 - should return 1 post")
    resp = requests.get(f"{BASE_URL}/me/bookmarks", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get bookmarks: {resp.status_code}"
    bookmarks = resp.json()
    
    assert len(bookmarks) == 1, f"Expected 1 bookmark, got {len(bookmarks)}"
    assert bookmarks[0]["id"] == test_post_id_2, f"Expected post 2, got {bookmarks[0]['id']}"
    log(f"   ✓ Got 1 bookmark (post 2)")
    
    log("✅ TEST 3 PASSED: My bookmarks working correctly\n")


def test_4_bookmark_watcher_notification():
    """Test 4: Bookmark-watcher notification on new comment"""
    global admin_token, demo1_id
    
    log("=== TEST 4: Bookmark-watcher notification on new comment ===")
    
    # Create a fresh post as demo3
    log("4.1: Create a fresh post as demo3")
    post_data = {
        "title": "Bookmark Notification Test",
        "content": "Testing bookmark watcher notifications",
        "mood": "question",
        "audience": "public"
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code}"
    notification_test_post_id = resp.json()["id"]
    log(f"   ✓ Post created (id: {notification_test_post_id})")
    
    # Bookmark as demo2
    log("4.2: Bookmark post as demo2")
    resp = requests.post(f"{BASE_URL}/posts/{notification_test_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to bookmark: {resp.status_code}"
    log(f"   ✓ Post bookmarked by demo2")
    
    # Get demo2's current notification count
    log("4.3: Get demo2's current notification count")
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    notifications_before = resp.json()
    notification_count_before = len(notifications_before)
    log(f"   ✓ Demo2 has {notification_count_before} notifications")
    
    # Login as admin (demo1)
    log("4.4: Login as admin (demo1)")
    auth1 = login(ADMIN_EMAIL, PASSWORD)
    admin_token = auth1["token"]
    demo1_id = auth1["user"]["id"]
    log(f"   ✓ Logged in as admin (id: {demo1_id})")
    
    # Post a top-level comment as admin
    log("4.5: Post top-level comment as admin on bookmarked post")
    comment_data = {"content": "nice"}
    resp = requests.post(f"{BASE_URL}/posts/{notification_test_post_id}/comments", 
                        json=comment_data, 
                        headers=get_headers(admin_token))
    assert resp.status_code == 200, f"Failed to create comment: {resp.status_code} {resp.text}"
    comment = resp.json()
    comment_id = comment["id"]
    log(f"   ✓ Comment created (id: {comment_id})")
    
    # Wait a moment for notification to be created
    time.sleep(0.5)
    
    # Get demo2's notifications - should have a new bookmark_update notification
    log("4.6: GET /api/notifications as demo2 - should have new bookmark_update notification")
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    notifications_after = resp.json()
    
    assert len(notifications_after) > notification_count_before, f"Expected new notification, got {len(notifications_after)} (was {notification_count_before})"
    log(f"   ✓ Demo2 now has {len(notifications_after)} notifications (was {notification_count_before})")
    
    # Find the bookmark_update notification
    log("4.7: Verify bookmark_update notification details")
    bookmark_notif = None
    for notif in notifications_after:
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == notification_test_post_id:
            bookmark_notif = notif
            break
    
    assert bookmark_notif is not None, "bookmark_update notification not found"
    assert bookmark_notif["type"] == "bookmark_update", f"Expected type='bookmark_update', got {bookmark_notif['type']}"
    assert bookmark_notif["post_id"] == notification_test_post_id, f"Expected post_id={notification_test_post_id}"
    assert bookmark_notif["actor_alias"] == auth1["user"]["alias"], f"Expected actor_alias={auth1['user']['alias']}"
    assert bookmark_notif["content_preview"].startswith("💬 New comment on a post you saved:"), \
        f"Expected content_preview to start with '💬 New comment on a post you saved:', got {bookmark_notif['content_preview']}"
    assert bookmark_notif["is_ad"] == False, f"Expected is_ad=False"
    log(f"   ✓ bookmark_update notification found with correct details")
    log(f"   ✓ actor_alias: {bookmark_notif['actor_alias']}")
    log(f"   ✓ content_preview: {bookmark_notif['content_preview']}")
    
    # Verify admin (commenter) did NOT receive this notification
    log("4.8: Verify admin did NOT receive bookmark_update notification")
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(admin_token))
    assert resp.status_code == 200, f"Failed to get admin notifications: {resp.status_code}"
    admin_notifications = resp.json()
    
    admin_bookmark_notif = None
    for notif in admin_notifications:
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == notification_test_post_id:
            admin_bookmark_notif = notif
            break
    
    assert admin_bookmark_notif is None, "Admin should NOT receive bookmark_update notification (they are the commenter)"
    log(f"   ✓ Admin did not receive bookmark_update notification (correct)")
    
    # Verify post author (demo3) received regular comment notification but NOT bookmark_update
    log("4.9: Verify post author (demo3) received comment notification but NOT bookmark_update")
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get demo3 notifications: {resp.status_code}"
    demo3_notifications = resp.json()
    
    # Should have comment notification
    comment_notif = None
    bookmark_notif_demo3 = None
    for notif in demo3_notifications:
        if notif.get("type") == "comment" and notif.get("post_id") == notification_test_post_id:
            comment_notif = notif
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == notification_test_post_id:
            bookmark_notif_demo3 = notif
    
    assert comment_notif is not None, "Post author should receive comment notification"
    assert bookmark_notif_demo3 is None, "Post author should NOT receive bookmark_update notification (avoid dupes)"
    log(f"   ✓ Post author received comment notification but NOT bookmark_update (correct)")
    
    # Test: Reply to comment (parent_comment_id set) should NOT trigger bookmark_update
    log("4.10: Reply to comment (parent_comment_id set) - should NOT trigger bookmark_update")
    notification_count_before_reply = len(notifications_after)
    
    reply_data = {"content": "reply to comment", "parent_comment_id": comment_id}
    resp = requests.post(f"{BASE_URL}/posts/{notification_test_post_id}/comments", 
                        json=reply_data, 
                        headers=get_headers(admin_token))
    assert resp.status_code == 200, f"Failed to create reply: {resp.status_code}"
    log(f"   ✓ Reply created")
    
    time.sleep(0.5)
    
    # Get demo2's notifications again
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    notifications_after_reply = resp.json()
    
    # Count bookmark_update notifications for this post
    bookmark_update_count = 0
    for notif in notifications_after_reply:
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == notification_test_post_id:
            bookmark_update_count += 1
    
    # Should still be 1 (from the top-level comment, not the reply)
    assert bookmark_update_count == 1, f"Expected 1 bookmark_update notification (reply should not trigger), got {bookmark_update_count}"
    log(f"   ✓ Reply did not trigger bookmark_update notification (correct)")
    
    # Test: User bookmarks their OWN post and comments - should NOT receive bookmark_update
    log("4.11: User bookmarks their own post and comments - should NOT receive bookmark_update")
    
    # Create a post as demo2
    post_data = {
        "title": "Demo2's Own Post",
        "content": "Testing self-bookmark",
        "mood": "question",
        "audience": "public"
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code}"
    demo2_post_id = resp.json()["id"]
    
    # Bookmark own post as demo2
    resp = requests.post(f"{BASE_URL}/posts/{demo2_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to bookmark own post: {resp.status_code}"
    
    # Comment on own post as demo2
    comment_data = {"content": "commenting on my own post"}
    resp = requests.post(f"{BASE_URL}/posts/{demo2_post_id}/comments", 
                        json=comment_data, 
                        headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to comment on own post: {resp.status_code}"
    
    time.sleep(0.5)
    
    # Get demo2's notifications
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    demo2_notifications = resp.json()
    
    # Should NOT have bookmark_update for own post
    self_bookmark_notif = None
    for notif in demo2_notifications:
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == demo2_post_id:
            self_bookmark_notif = notif
            break
    
    assert self_bookmark_notif is None, "User should NOT receive bookmark_update for their own post"
    log(f"   ✓ User did not receive bookmark_update for own post (correct)")
    
    log("✅ TEST 4 PASSED: Bookmark-watcher notification working correctly\n")


def test_5_bookmarks_on_ad_posts():
    """Test 5: Bookmarks on ad posts"""
    global ad_post_id
    
    log("=== TEST 5: Bookmarks on ad posts ===")
    
    # Get the feed to find an ad post
    log("5.1: GET /api/posts to find an ad post")
    resp = requests.get(f"{BASE_URL}/posts", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get posts: {resp.status_code}"
    posts = resp.json()
    
    # Find an ad post
    ad_post = None
    for post in posts:
        if post.get("type") == "ad":
            ad_post = post
            ad_post_id = post["id"]
            break
    
    if ad_post is None:
        log("   ⚠️  No ad posts found in feed, skipping ad bookmark test")
        log("   Note: This is not a failure, just means no ads are currently in the feed")
        log("✅ TEST 5 SKIPPED: No ad posts available\n")
        return
    
    log(f"   ✓ Found ad post (id: {ad_post_id})")
    
    # Bookmark the ad post as demo2
    log("5.2: Bookmark ad post as demo2")
    resp = requests.post(f"{BASE_URL}/posts/{ad_post_id}/bookmark", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to bookmark ad: {resp.status_code}"
    log(f"   ✓ Ad post bookmarked")
    
    # Get demo2's current notification count
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    notifications_before = resp.json()
    notification_count_before = len(notifications_before)
    
    # Comment on the ad post as admin
    log("5.3: Comment on ad post as admin")
    comment_data = {"content": "comment on ad"}
    resp = requests.post(f"{BASE_URL}/posts/{ad_post_id}/comments", 
                        json=comment_data, 
                        headers=get_headers(admin_token))
    
    # Note: Ad posts might have comments_enabled=false, so this might fail with 403
    if resp.status_code == 403:
        log(f"   ⚠️  Ad post has comments disabled (403), cannot test notification suppression")
        log("✅ TEST 5 PARTIAL: Ad bookmark works, but cannot test notification (comments disabled)\n")
        return
    
    assert resp.status_code == 200, f"Failed to comment on ad: {resp.status_code}"
    log(f"   ✓ Comment created on ad post")
    
    time.sleep(0.5)
    
    # Get demo2's notifications - should NOT have bookmark_update for ad post
    log("5.4: Verify NO bookmark_update notification for ad post")
    resp = requests.get(f"{BASE_URL}/notifications", headers=get_headers(partner_token))
    assert resp.status_code == 200, f"Failed to get notifications: {resp.status_code}"
    notifications_after = resp.json()
    
    # Check for bookmark_update notification for the ad post
    ad_bookmark_notif = None
    for notif in notifications_after:
        if notif.get("type") == "bookmark_update" and notif.get("post_id") == ad_post_id:
            ad_bookmark_notif = notif
            break
    
    assert ad_bookmark_notif is None, "bookmark_update notification should NOT fire for ad posts"
    log(f"   ✓ No bookmark_update notification for ad post (correct)")
    
    log("✅ TEST 5 PASSED: Bookmark on ad posts does not trigger notifications\n")


def test_6_role_guards():
    """Test 6: Role guards"""
    log("=== TEST 6: Role guards ===")
    
    # Test without auth token - should get 401
    log("6.1: POST /api/posts/{id}/bookmark without auth - should return 401")
    resp = requests.post(f"{BASE_URL}/posts/{test_post_id}/bookmark")
    assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"
    log(f"   ✓ Bookmark endpoint requires auth (401)")
    
    log("6.2: GET /api/me/bookmarks without auth - should return 401")
    resp = requests.get(f"{BASE_URL}/me/bookmarks")
    assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"
    log(f"   ✓ My bookmarks endpoint requires auth (401)")
    
    log("6.3: GET /api/users/{id} without auth - should return 401")
    resp = requests.get(f"{BASE_URL}/users/{demo2_id}")
    assert resp.status_code == 401, f"Expected 401 without auth, got {resp.status_code}"
    log(f"   ✓ User profile endpoint requires auth (401)")
    
    # Any authed user can bookmark any post
    log("6.4: Any authed user can bookmark any post")
    # Already tested in previous tests - demo2 bookmarked demo3's posts
    log(f"   ✓ Any authed user can bookmark (verified in previous tests)")
    
    log("✅ TEST 6 PASSED: Role guards working correctly\n")


def test_7_backward_compat():
    """Test 7: Backward compatibility quick check"""
    log("=== TEST 7: Backward compatibility quick check ===")
    
    # Create a post - should award XP
    log("7.1: Create a post as demo3 - should award XP")
    resp = requests.get(f"{BASE_URL}/me/economy", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get economy: {resp.status_code}"
    econ_before = resp.json()
    exp_before = econ_before["exp"]
    
    post_data = {
        "title": "Backward Compat Test",
        "content": "Testing XP awards still work",
        "mood": "question",
        "audience": "public"
    }
    resp = requests.post(f"{BASE_URL}/posts", json=post_data, headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to create post: {resp.status_code}"
    log(f"   ✓ Post created")
    
    # Check XP increased
    resp = requests.get(f"{BASE_URL}/me/economy", headers=get_headers(user_token))
    assert resp.status_code == 200, f"Failed to get economy: {resp.status_code}"
    econ_after = resp.json()
    exp_after = econ_after["exp"]
    
    assert exp_after > exp_before, f"Expected XP to increase, got {exp_before} -> {exp_after}"
    log(f"   ✓ XP increased from {exp_before} to {exp_after} (+{exp_after - exp_before})")
    
    # Check /me/economy still works
    log("7.2: GET /me/economy - verify structure")
    assert "exp" in econ_after, "Missing exp field"
    assert "tokens" in econ_after, "Missing tokens field"
    assert "rank" in econ_after, "Missing rank field"
    log(f"   ✓ /me/economy working (exp: {econ_after['exp']}, tokens: {econ_after['tokens']}, rank: {econ_after['rank']['title']})")
    
    log("✅ TEST 7 PASSED: Backward compatibility working correctly\n")


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BOOKMARKS + USER RANK ENDPOINTS TEST SUITE")
    print("="*80 + "\n")
    
    try:
        # Seed database first
        seed_database()
        
        # Run tests
        test_1_user_rank_fields()
        test_2_bookmark_toggle()
        test_3_my_bookmarks()
        test_4_bookmark_watcher_notification()
        test_5_bookmarks_on_ad_posts()
        test_6_role_guards()
        test_7_backward_compat()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED (7/7)")
        print("="*80 + "\n")
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        raise


if __name__ == "__main__":
    main()
