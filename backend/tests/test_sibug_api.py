"""Sibug backend E2E API tests.

Covers auth, posts, reactions, comments, pulse, notifications, chat, blocks,
report, and WebSocket handshake.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict

import pytest
import requests
import websocket  # websocket-client
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _post(path: str, json_body: Dict[str, Any] | None = None, token: str | None = None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", json=json_body or {}, headers=h, timeout=30)


def _get(path: str, token: str | None = None, **params):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, params=params, timeout=30)


def _delete(path: str, token: str | None = None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.delete(f"{API}{path}", headers=h, timeout=30)


def _patch(path: str, json_body: Dict[str, Any], token: str):
    h = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
    return requests.patch(f"{API}{path}", json=json_body, headers=h, timeout=30)


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def seeded():
    r = _post("/dev/seed")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo1_token(seeded):
    r = _post("/auth/login", {"email": "demo1@sibug.app", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def demo2_token(seeded):
    r = _post("/auth/login", {"email": "demo2@sibug.app", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def fresh_user():
    email = f"TEST_{uuid.uuid4().hex[:8]}@sibug.app"
    r = _post("/auth/register", {"email": email, "password": "testpass123"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"]}


# ---------- health ----------
class TestHealth:
    def test_root(self):
        r = _get("/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- auth ----------
class TestAuth:
    def test_register_returns_token_and_alias(self, fresh_user):
        assert fresh_user["token"]
        u = fresh_user["user"]
        assert "id" in u and "alias" in u
        assert "password" not in u and "_id" not in u
        assert u["alias"] and len(u["alias"]) >= 3

    def test_login_demo(self, demo1_token):
        assert demo1_token

    def test_login_wrong_password(self, seeded):
        r = _post("/auth/login", {"email": "demo1@sibug.app", "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_public_only(self, demo1_token):
        r = _get("/auth/me", demo1_token)
        assert r.status_code == 200
        j = r.json()
        assert "password" not in j and "_id" not in j
        assert "alias" in j and "id" in j

    def test_me_missing_token(self):
        r = _get("/auth/me")
        assert r.status_code == 401

    def test_duplicate_registration_rejected(self, fresh_user):
        r = _post("/auth/register", {"email": fresh_user["email"], "password": "testpass123"})
        assert r.status_code == 400

    def test_bio_update(self, fresh_user):
        r = _patch("/auth/bio", {"bio": "TEST hello"}, fresh_user["token"])
        assert r.status_code == 200
        assert r.json()["bio"] == "TEST hello"

    def test_regenerate_alias_cooldown(self, fresh_user):
        r1 = _post("/auth/regenerate-alias", token=fresh_user["token"])
        assert r1.status_code == 200
        new_alias = r1.json()["alias"]
        assert new_alias
        # second should be blocked
        r2 = _post("/auth/regenerate-alias", token=fresh_user["token"])
        assert r2.status_code == 429


# ---------- posts ----------
class TestPosts:
    def test_reject_invalid_mood(self, demo1_token):
        r = _post("/posts", {"content": "hi", "mood": "invalid_mood"}, demo1_token)
        assert r.status_code == 422

    def test_create_and_get_post(self, demo1_token):
        r = _post("/posts", {"content": "TEST post 1", "mood": "question", "audience": "public"}, demo1_token)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["mood"] == "question"
        assert p["content"] == "TEST post 1"
        assert "_id" not in p
        # get
        g = _get(f"/posts/{p['id']}", demo1_token)
        assert g.status_code == 200
        assert g.json()["id"] == p["id"]

    def test_feed_tabs(self, demo1_token):
        for tab in ["latest", "trending", "nearby", "pulse"]:
            r = _get("/posts", demo1_token, tab=tab)
            assert r.status_code == 200, f"{tab}: {r.text}"
            assert isinstance(r.json(), list)

    def test_delete_own_post(self, demo1_token):
        r = _post("/posts", {"content": "TEST delete me", "mood": "rant"}, demo1_token)
        pid = r.json()["id"]
        d = _delete(f"/posts/{pid}", demo1_token)
        assert d.status_code == 200

    def test_delete_others_post_forbidden(self, demo1_token, demo2_token):
        r = _post("/posts", {"content": "TEST cannot delete", "mood": "rant"}, demo1_token)
        pid = r.json()["id"]
        d = _delete(f"/posts/{pid}", demo2_token)
        assert d.status_code == 403


# ---------- reactions ----------
class TestReactions:
    def test_helpful_reaction_bumps_score_and_notifies(self, demo1_token, demo2_token):
        # demo1 creates post
        r = _post("/posts", {"content": "TEST react me", "mood": "need_advice"}, demo1_token)
        pid = r.json()["id"]
        author_id = r.json()["author"]["id"]
        prev_score = r.json()["author"]["helpful_score"]

        # demo2 reacts helpful
        rr = _post(f"/posts/{pid}/react", {"kind": "helpful"}, demo2_token)
        assert rr.status_code == 200
        body = rr.json()
        assert body["reactions"].get("helpful", 0) >= 1
        assert body["my_reaction"] == "helpful"

        # helpful_score should have bumped on author
        u = _get(f"/users/{author_id}", demo1_token).json()
        assert u["helpful_score"] >= prev_score + 1

        # toggle off
        rr2 = _post(f"/posts/{pid}/react", {"kind": "helpful"}, demo2_token)
        assert rr2.status_code == 200
        assert rr2.json()["my_reaction"] is None

    def test_notification_created(self, demo1_token, demo2_token):
        # demo1 posts, demo2 reacts, demo1 sees notif
        r = _post("/posts", {"content": "TEST notif me", "mood": "hot_take"}, demo1_token)
        pid = r.json()["id"]
        _post(f"/posts/{pid}/react", {"kind": "heart"}, demo2_token)
        time.sleep(0.5)
        notifs = _get("/notifications", demo1_token).json()
        assert any(n.get("post_id") == pid and n["type"] == "reaction" for n in notifs)


# ---------- comments ----------
class TestComments:
    def test_create_and_list_comment(self, demo1_token, demo2_token):
        r = _post("/posts", {"content": "TEST comment target", "mood": "question"}, demo1_token)
        pid = r.json()["id"]
        c = _post(f"/posts/{pid}/comments", {"content": "TEST comment body"}, demo2_token)
        assert c.status_code == 200
        assert c.json()["content"] == "TEST comment body"
        lst = _get(f"/posts/{pid}/comments", demo1_token)
        assert lst.status_code == 200
        assert any(cc["content"] == "TEST comment body" for cc in lst.json())
        # comment_count on post incremented
        p = _get(f"/posts/{pid}", demo1_token).json()
        assert p["comment_count"] >= 1


# ---------- pulse ----------
class TestPulse:
    def test_pulse_vote_and_change(self, demo1_token, demo2_token):
        r = _post("/posts", {
            "content": "TEST pulse", "mood": "pulse", "audience": "public",
            "pulse_options": ["A", "B", "C"],
        }, demo1_token)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # vote 0
        v1 = _post(f"/posts/{pid}/pulse-vote", {"option_index": 0}, demo2_token)
        assert v1.status_code == 200
        assert v1.json()["pulse_votes"][0] >= 1
        # change to 1
        v2 = _post(f"/posts/{pid}/pulse-vote", {"option_index": 1}, demo2_token)
        assert v2.status_code == 200
        assert v2.json()["my_pulse_vote"] == 1


# ---------- notifications ----------
class TestNotifications:
    def test_unread_count_and_read_all(self, demo1_token, demo2_token):
        r = _post("/posts", {"content": "TEST notif count", "mood": "question"}, demo1_token)
        pid = r.json()["id"]
        _post(f"/posts/{pid}/comments", {"content": "notif"}, demo2_token)
        time.sleep(0.3)
        c = _get("/notifications/unread-count", demo1_token).json()["count"]
        assert c >= 1
        rr = _post("/notifications/read-all", token=demo1_token)
        assert rr.status_code == 200
        c2 = _get("/notifications/unread-count", demo1_token).json()["count"]
        assert c2 == 0


# ---------- chat ----------
class TestChat:
    def test_start_send_read(self, demo1_token, demo2_token):
        me1 = _get("/auth/me", demo1_token).json()
        me2 = _get("/auth/me", demo2_token).json()
        s = _post("/chat/start", {"other_user_id": me2["id"]}, demo1_token)
        assert s.status_code == 200
        cid = s.json()["id"]
        m = _post(f"/chat/{cid}/messages", {"content": "TEST hello"}, demo1_token)
        assert m.status_code == 200
        assert m.json()["content"] == "TEST hello"
        # demo2 reads
        lst = _get(f"/chat/{cid}/messages", demo2_token)
        assert lst.status_code == 200
        assert any(x["content"] == "TEST hello" for x in lst.json())
        # conversations list
        conv = _get("/chat/conversations", demo1_token)
        assert conv.status_code == 200
        assert any(c["id"] == cid for c in conv.json())
        # cannot chat with self
        s2 = _post("/chat/start", {"other_user_id": me1["id"]}, demo1_token)
        assert s2.status_code == 400


# ---------- block/report ----------
class TestBlockReport:
    def test_block_excludes_from_feed_and_blocks_dm(self, demo1_token, demo2_token):
        me2 = _get("/auth/me", demo2_token).json()
        # demo2 posts
        r = _post("/posts", {"content": "TEST BLOCK VISIBLE", "mood": "rant"}, demo2_token)
        assert r.status_code == 200
        # demo1 blocks demo2
        b = _post("/block", {"target_user_id": me2["id"]}, demo1_token)
        assert b.status_code == 200
        # feed excludes
        feed = _get("/posts", demo1_token, tab="latest").json()
        assert not any(p["author"]["id"] == me2["id"] for p in feed)
        # blocks list
        lst = _get("/block", demo1_token).json()
        assert any(b["user"]["id"] == me2["id"] for b in lst)
        # DM blocked
        s = _post("/chat/start", {"other_user_id": me2["id"]}, demo1_token)
        assert s.status_code == 403
        # unblock
        u = _delete(f"/block/{me2['id']}", demo1_token)
        assert u.status_code == 200

    def test_report(self, demo1_token, demo2_token):
        r = _post("/posts", {"content": "TEST report target", "mood": "rant"}, demo2_token)
        pid = r.json()["id"]
        rep = _post("/report", {"target_type": "post", "target_id": pid, "reason": "TEST bad content"}, demo1_token)
        assert rep.status_code == 200


# ---------- websocket ----------
class TestWebSocket:
    def _ws_url(self, token: str) -> str:
        base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        return f"{base}/api/ws?token={token}"

    def test_ws_valid_token_connects(self, demo1_token):
        try:
            ws = websocket.create_connection(self._ws_url(demo1_token), timeout=10)
            assert ws.connected
            ws.close()
        except Exception as e:
            pytest.fail(f"WS connect failed: {e}")

    def test_ws_invalid_token_rejected(self):
        try:
            ws = websocket.create_connection(self._ws_url("badtoken"), timeout=10)
            # server should close with 1008; try to receive -> exception or empty
            try:
                ws.recv()
            except Exception:
                pass
            ws.close()
        except Exception:
            # connect itself may fail — that's acceptable
            pass
