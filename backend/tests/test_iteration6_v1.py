"""Iteration 6 tests — comment replies, dev/seed gate, logout removal in profile."""
import os
import sys
import uuid
import importlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001"
BASE_URL = BASE_URL.rstrip("/")

sys.path.insert(0, "/app/backend")


def _register(session: requests.Session):
    tag = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_i6_{tag}@huni.app",
        "password": "TestPass123",
        "first_name": "Test",
        "last_name": tag,
        "birthdate": "1998-04-12",
    }
    r = session.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- 1) dev/seed gate ----------
class TestDevSeedGate:
    def test_seed_enabled_returns_users_posts_created(self):
        # ENABLE_DEV_SEED=true is set at rest per problem statement
        r = requests.post(f"{BASE_URL}/api/dev/seed")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "users" in j and "posts_created" in j
        assert isinstance(j["users"], int) and isinstance(j["posts_created"], int)

    def test_seed_disabled_returns_404_via_mocked_env(self, monkeypatch):
        """Import server module directly (in-process) and hit the handler with ENABLE_DEV_SEED unset -> 404.

        NOTE: server.py calls load_dotenv() at import which re-populates os.environ from
        backend/.env. So we import first, then monkeypatch after — the handler reads
        os.environ at call-time, not at import-time.
        """
        server = importlib.import_module("server")
        import asyncio
        from fastapi import HTTPException

        # unset -> 404
        monkeypatch.delenv("ENABLE_DEV_SEED", raising=False)
        with pytest.raises(HTTPException) as exc:
            asyncio.get_event_loop().run_until_complete(server.seed_data())
        assert exc.value.status_code == 404

        # 'false' -> 404
        monkeypatch.setenv("ENABLE_DEV_SEED", "false")
        with pytest.raises(HTTPException) as exc2:
            asyncio.get_event_loop().run_until_complete(server.seed_data())
        assert exc2.value.status_code == 404

        # explicit 'true' -> normal response
        monkeypatch.setenv("ENABLE_DEV_SEED", "true")
        res = asyncio.get_event_loop().run_until_complete(server.seed_data())
        assert "users" in res and "posts_created" in res


# ---------- 2/3) comment reply flow ----------
class TestCommentReplies:
    @pytest.fixture(scope="class")
    def users(self):
        s = requests.Session()
        t1, u1 = _register(s)
        t2, u2 = _register(s)
        t3, u3 = _register(s)
        return (t1, u1), (t2, u2), (t3, u3)

    @pytest.fixture(scope="class")
    def post(self, users):
        (t1, u1), *_ = users
        r = requests.post(
            f"{BASE_URL}/api/posts",
            headers=_auth(t1),
            json={"title": "Reply thread", "content": "reply here", "mood": "question", "audience": "public"},
        )
        assert r.status_code == 200
        return r.json()

    def test_top_level_comment_has_null_parent_fields(self, users, post):
        (_, _), (t2, _), _ = users
        r = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t2), json={"content": "top level"})
        assert r.status_code == 200
        c = r.json()
        assert c["parent_comment_id"] is None
        assert c["reply_to_alias"] is None
        return c["id"]

    def test_reply_creates_comment_with_parent_and_alias(self, users, post):
        (_, u1), (t2, u2), (t3, _) = users
        # top-level by user2
        top = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t2), json={"content": "top"}).json()
        # reply by user3
        r = requests.post(
            f"{BASE_URL}/api/posts/{post['id']}/comments",
            headers=_auth(users[2][0]),
            json={"content": "hello reply", "parent_comment_id": top["id"]},
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["parent_comment_id"] == top["id"]
        assert c["reply_to_alias"] == u2["alias"]

    def test_list_comments_returns_parent_and_reply_to_alias(self, users, post):
        (t1, _), (t2, u2), (t3, _) = users
        top = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t2), json={"content": "parent-x"}).json()
        requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t3), json={"content": "reply-x", "parent_comment_id": top["id"]})
        r = requests.get(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t1))
        assert r.status_code == 200
        rows = r.json()
        reply = next((x for x in rows if x["content"] == "reply-x"), None)
        assert reply is not None
        assert reply["parent_comment_id"] == top["id"]
        assert reply["reply_to_alias"] == u2["alias"]
        # top level should have both null
        toprow = next(x for x in rows if x["id"] == top["id"])
        assert toprow["parent_comment_id"] is None
        assert toprow["reply_to_alias"] is None

    def test_nonexistent_parent_returns_404(self, users, post):
        t2 = users[1][0]
        r = requests.post(
            f"{BASE_URL}/api/posts/{post['id']}/comments",
            headers=_auth(t2),
            json={"content": "ghost reply", "parent_comment_id": "does-not-exist-" + uuid.uuid4().hex},
        )
        assert r.status_code == 404
        assert "Parent comment not found" in r.text

    def test_parent_from_different_post_returns_404(self, users, post):
        t1, t2 = users[0][0], users[1][0]
        other = requests.post(f"{BASE_URL}/api/posts", headers=_auth(t1), json={"title": "other", "content": "other", "mood": "rant", "audience": "public"}).json()
        parent_on_other = requests.post(f"{BASE_URL}/api/posts/{other['id']}/comments", headers=_auth(t1), json={"content": "on other"}).json()
        r = requests.post(
            f"{BASE_URL}/api/posts/{post['id']}/comments",
            headers=_auth(t2),
            json={"content": "cross-post reply", "parent_comment_id": parent_on_other["id"]},
        )
        assert r.status_code == 404

    def test_deleted_parent_returns_404(self, users, post):
        t2, t3 = users[1][0], users[2][0]
        parent = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t2), json={"content": "will delete"}).json()
        d = requests.delete(f"{BASE_URL}/api/comments/{parent['id']}", headers=_auth(t2))
        assert d.status_code == 200
        r = requests.post(
            f"{BASE_URL}/api/posts/{post['id']}/comments",
            headers=_auth(t3),
            json={"content": "reply to deleted", "parent_comment_id": parent["id"]},
        )
        assert r.status_code == 404


# ---------- 4) notifications on reply ----------
class TestReplyNotifications:
    def test_reply_creates_reply_notification_and_no_self_notif(self):
        s = requests.Session()
        t_author, u_author = _register(s)  # post author
        t_c, u_c = _register(s)             # top-level commenter
        t_r, u_r = _register(s)             # replier

        # post by author
        post = requests.post(f"{BASE_URL}/api/posts", headers=_auth(t_author),
                             json={"title": "n", "content": "n", "mood": "question", "audience": "public"}).json()
        # top-level comment by commenter -> notif to post author of type=comment
        top = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_c),
                            json={"content": "top level to notify"}).json()
        # check author has 'comment' notification
        notifs_author = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_author)).json()
        assert any(n["type"] == "comment" and n.get("actor_alias") == u_c["alias"] for n in notifs_author)

        # reply by replier -> notif to commenter of type=reply
        requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_r),
                      json={"content": "reply notify", "parent_comment_id": top["id"]}).json()
        notifs_c = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_c)).json()
        assert any(n["type"] == "reply" and n.get("actor_alias") == u_r["alias"] for n in notifs_c), notifs_c

        # replier replies to own comment -> no self-notification
        own = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_r),
                            json={"content": "own top"}).json()
        before = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_r)).json()
        requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_r),
                      json={"content": "self reply", "parent_comment_id": own["id"]})
        after = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_r)).json()
        # replier should NOT gain a 'reply' notif from itself
        self_reply_notifs = [n for n in after if n["type"] == "reply" and n.get("actor_alias") == u_r["alias"]]
        assert len(self_reply_notifs) == 0

    def test_reply_does_not_create_comment_notification_for_post_author(self):
        s = requests.Session()
        t_author, _ = _register(s)
        t_c, _ = _register(s)
        t_r, _ = _register(s)
        post = requests.post(f"{BASE_URL}/api/posts", headers=_auth(t_author),
                             json={"title": "n2", "content": "n2", "mood": "question", "audience": "public"}).json()
        top = requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_c),
                            json={"content": "top"}).json()
        notifs_before = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_author)).json()
        comment_count_before = sum(1 for n in notifs_before if n["type"] == "comment")
        # reply from t_r
        requests.post(f"{BASE_URL}/api/posts/{post['id']}/comments", headers=_auth(t_r),
                      json={"content": "r", "parent_comment_id": top["id"]})
        notifs_after = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(t_author)).json()
        comment_count_after = sum(1 for n in notifs_after if n["type"] == "comment")
        assert comment_count_after == comment_count_before  # no extra 'comment' notif for a reply
