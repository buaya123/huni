"""Huni backend regression tests (iteration 2).

Focus areas:
- App rename to 'Huni' (root, DB name via seed emails)
- New endpoint GET /api/users/{user_id}/commented-posts
- Regression: auth, posts, comments, reactions, pulse, notifications, chat, block, report, WS
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://huni-qr-campaigns.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="session", autouse=True)
def seed_once():
    r = requests.post(f"{API}/dev/seed", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _register():
    email = f"TEST_{uuid.uuid4().hex[:10]}@huni.app"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "User",
        "birthdate": "2000-01-15",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"], email


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Rebrand ----------
class TestRebrand:
    def test_root_returns_huni(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        body = r.json()
        assert body.get("app") == "Huni", body
        assert body.get("status") == "ok"

    def test_seed_creates_huni_emails(self):
        r = requests.post(f"{API}/dev/seed")
        assert r.status_code == 200
        # login demo1@huni.app validates DB has the huni emails
        lr = requests.post(f"{API}/auth/login", json={"email": "demo1@huni.app", "password": "demo1234"})
        assert lr.status_code == 200, lr.text


# ---------- Auth ----------
class TestAuth:
    def test_register_and_login(self):
        token, user, email = _register()
        assert token and user["id"] and user["alias"]
        # login again
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"})
        assert lr.status_code == 200
        assert lr.json()["user"]["id"] == user["id"]

    def test_login_wrong_pw(self):
        r = requests.post(f"{API}/auth/login", json={"email": "demo1@huni.app", "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- Posts feed tabs ----------
class TestPostsFeed:
    def test_latest(self):
        token, _, _ = _register()
        r = requests.get(f"{API}/posts?tab=latest", headers=_headers(token))
        assert r.status_code == 200
        posts = r.json()
        assert isinstance(posts, list) and len(posts) > 0
        # iter8: feed can be interleaved with ads (type='ad'); assert only on real posts
        real = [p for p in posts if p.get("type") != "ad"]
        assert real, "expected at least one non-ad post"
        assert "id" in real[0] and "author" in real[0] and "mood" in real[0]

    def test_trending(self):
        token, _, _ = _register()
        r = requests.get(f"{API}/posts?tab=trending", headers=_headers(token))
        assert r.status_code == 200

    def test_nearby(self):
        token, _, _ = _register()
        r = requests.get(f"{API}/posts?tab=nearby", headers=_headers(token))
        assert r.status_code == 200
        for p in r.json():
            if p.get("type") == "ad":
                continue  # iter8: ads may be injected — skip
            assert p["audience"] == "nearby"

    def test_pulse(self):
        token, _, _ = _register()
        r = requests.get(f"{API}/posts?tab=pulse", headers=_headers(token))
        assert r.status_code == 200
        for p in r.json():
            # iter8: pulse tab must have no ads
            assert p.get("type") != "ad", "pulse tab should not inject ads"
            assert p["mood"] == "pulse"


# ---------- Post CRUD + reactions ----------
class TestPostCRUD:
    def test_create_and_get(self):
        token, user, _ = _register()
        r = requests.post(f"{API}/posts", headers=_headers(token), json={
            "title": "TEST hello", "content": "TEST hello huni", "mood": "hot_take", "audience": "public"
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        g = requests.get(f"{API}/posts/{pid}", headers=_headers(token))
        assert g.status_code == 200
        assert g.json()["content"] == "TEST hello huni"
        assert g.json()["author"]["id"] == user["id"]

    def test_reaction_toggle(self):
        token, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_headers(token), json={"title": "TEST reactme", "content": "reactme", "mood": "question"})
        pid = r.json()["id"]
        # another user reacts
        t2, _, _ = _register()
        rr = requests.post(f"{API}/posts/{pid}/react", headers=_headers(t2), json={"kind": "heart"})
        assert rr.status_code == 200
        assert rr.json()["reactions"].get("heart", 0) == 1
        # toggle off
        rr2 = requests.post(f"{API}/posts/{pid}/react", headers=_headers(t2), json={"kind": "heart"})
        assert rr2.json()["reactions"].get("heart", 0) == 0

    def test_pulse_vote(self):
        token, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_headers(token), json={
            "title": "TEST pulse", "content": "pulse?", "mood": "pulse", "pulse_options": ["A", "B"]
        })
        pid = r.json()["id"]
        v = requests.post(f"{API}/posts/{pid}/pulse-vote", headers=_headers(token), json={"option_index": 1})
        assert v.status_code == 200
        assert v.json()["pulse_votes"][1] == 1


# ---------- Comments + commented-posts ----------
class TestCommentedPosts:
    def test_commented_posts_dedup_and_hydration(self):
        token, user, _ = _register()
        # get 2 seeded posts
        feed = requests.get(f"{API}/posts?tab=latest&limit=10", headers=_headers(token)).json()
        assert len(feed) >= 2
        p1, p2 = feed[0]["id"], feed[1]["id"]

        # comment on both
        for pid, txt in [(p1, "TEST first comment"), (p2, "TEST second comment")]:
            c = requests.post(f"{API}/posts/{pid}/comments", headers=_headers(token), json={"content": txt})
            assert c.status_code == 200

        # comment again on p1 (should still dedupe to a single entry)
        c = requests.post(f"{API}/posts/{p1}/comments", headers=_headers(token), json={"content": "TEST first again"})
        assert c.status_code == 200

        r = requests.get(f"{API}/users/{user['id']}/commented-posts", headers=_headers(token))
        assert r.status_code == 200
        items = r.json()
        # deduped: 2 posts
        ids = [p["id"] for p in items]
        assert len(ids) == 2, f"expected 2 unique posts got {ids}"
        assert set(ids) == {p1, p2}
        # my_comment_preview + my_comment_at present
        for p in items:
            assert "my_comment_preview" in p and p["my_comment_preview"]
            assert "my_comment_at" in p and p["my_comment_at"]
        # sorted by latest comment_at desc — p1 (commented last) must be first
        assert items[0]["id"] == p1

    def test_commented_posts_excludes_deleted(self):
        token, user, _ = _register()
        # create my own post
        r = requests.post(f"{API}/posts", headers=_headers(token), json={"title": "TEST mine", "content": "TEST mine", "mood": "question"})
        pid = r.json()["id"]
        # another user comments
        t2, u2, _ = _register()
        requests.post(f"{API}/posts/{pid}/comments", headers=_headers(t2), json={"content": "hi"})
        # confirm it appears
        r1 = requests.get(f"{API}/users/{u2['id']}/commented-posts", headers=_headers(t2))
        assert pid in [p["id"] for p in r1.json()]
        # delete the post
        d = requests.delete(f"{API}/posts/{pid}", headers=_headers(token))
        assert d.status_code == 200
        # commented-posts should now exclude
        r2 = requests.get(f"{API}/users/{u2['id']}/commented-posts", headers=_headers(t2))
        assert pid not in [p["id"] for p in r2.json()]


# ---------- Notifications ----------
class TestNotifications:
    def test_unread_and_read_all(self):
        # setup: user A gets a reaction from user B
        tA, uA, _ = _register()
        p = requests.post(f"{API}/posts", headers=_headers(tA), json={"title": "TEST notif me", "content": "notif me", "mood": "question"}).json()
        tB, _, _ = _register()
        requests.post(f"{API}/posts/{p['id']}/react", headers=_headers(tB), json={"kind": "heart"})
        time.sleep(0.3)
        c = requests.get(f"{API}/notifications/unread-count", headers=_headers(tA))
        assert c.status_code == 200 and c.json()["count"] >= 1
        n = requests.get(f"{API}/notifications", headers=_headers(tA))
        assert n.status_code == 200 and len(n.json()) >= 1
        ra = requests.post(f"{API}/notifications/read-all", headers=_headers(tA))
        assert ra.status_code == 200
        c2 = requests.get(f"{API}/notifications/unread-count", headers=_headers(tA))
        assert c2.json()["count"] == 0


# ---------- Chat ----------
class TestChat:
    def test_chat_flow(self):
        tA, uA, _ = _register()
        tB, uB, _ = _register()
        s = requests.post(f"{API}/chat/start", headers=_headers(tA), json={"other_user_id": uB["id"]})
        assert s.status_code == 200
        cid = s.json()["id"]
        m = requests.post(f"{API}/chat/{cid}/messages", headers=_headers(tA), json={"content": "hi"})
        assert m.status_code == 200
        lm = requests.get(f"{API}/chat/{cid}/messages", headers=_headers(tB))
        assert lm.status_code == 200 and len(lm.json()) == 1
        lc = requests.get(f"{API}/chat/conversations", headers=_headers(tB))
        assert any(c["id"] == cid for c in lc.json())


# ---------- Block/Report ----------
class TestBlockReport:
    def test_block_then_unblock(self):
        tA, _, _ = _register()
        tB, uB, _ = _register()
        r = requests.post(f"{API}/block", headers=_headers(tA), json={"target_user_id": uB["id"]})
        assert r.status_code == 200
        lst = requests.get(f"{API}/block", headers=_headers(tA)).json()
        assert any(b["user"]["id"] == uB["id"] for b in lst)
        u = requests.delete(f"{API}/block/{uB['id']}", headers=_headers(tA))
        assert u.status_code == 200
        lst2 = requests.get(f"{API}/block", headers=_headers(tA)).json()
        assert not any(b["user"]["id"] == uB["id"] for b in lst2)

    def test_report(self):
        tA, _, _ = _register()
        tB, uB, _ = _register()
        r = requests.post(f"{API}/report", headers=_headers(tA), json={
            "target_type": "user", "target_id": uB["id"], "reason": "spam TEST"
        })
        assert r.status_code == 200


# ---------- WebSocket ----------
class TestWebsocket:
    def test_ws_with_valid_token(self):
        try:
            import websocket  # websocket-client
        except ImportError:
            pytest.skip("websocket-client not installed")
        token, _, _ = _register()
        ws_url = BASE.replace("https://", "wss://").replace("http://", "ws://") + f"/api/ws?token={token}"
        ws = websocket.create_connection(ws_url, timeout=10)
        ws.close()

    def test_ws_bad_token_rejected(self):
        try:
            import websocket
        except ImportError:
            pytest.skip("websocket-client not installed")
        ws_url = BASE.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws?token=bogus"
        with pytest.raises(Exception):
            websocket.create_connection(ws_url, timeout=5)
