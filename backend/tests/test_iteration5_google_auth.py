"""Huni backend iteration 5 tests — expanded signup + Emergent Google Auth.

Coverage:
- /auth/register with new required fields (first_name, last_name, birthdate)
- /auth/register birthdate validation
- /auth/google/session: bogus session_id → 401
- Bearer duality: JWT + session_token both work on /auth/me
- Logout: session_token removed from user_sessions, JWT unaffected
- Seed users carry new fields

We cannot patch httpx from the backend process, so we simulate a "successful"
Google session by directly inserting into db.user_sessions and using MongoDB
to seed a `google` user. This exercises the bearer-token duality end-to-end.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://candid-local.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "huni_db")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


@pytest.fixture(scope="session", autouse=True)
def seed_once():
    r = requests.post(f"{API}/dev/seed", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _new_email():
    return f"TEST_i5_{uuid.uuid4().hex[:10]}@huni.app"


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _valid_signup_payload(email=None):
    return {
        "email": email or _new_email(),
        "password": "testpass123",
        "first_name": "Juan",
        "last_name": "Dela Cruz",
        "birthdate": "2000-01-15",
    }


# ---------- Signup schema ----------
class TestRegisterNewFields:
    def test_valid_signup_returns_new_fields(self):
        p = _valid_signup_payload()
        r = requests.post(f"{API}/auth/register", json=p)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"]
        u = data["user"]
        assert u["first_name"] == "Juan"
        assert u["last_name"] == "Dela Cruz"
        assert u["birthdate"] == "2000-01-15"
        assert u["auth_provider"] == "password"
        # /auth/me with returned JWT works
        me = requests.get(f"{API}/auth/me", headers=_h(data["token"]))
        assert me.status_code == 200
        assert me.json()["id"] == u["id"]

    def test_missing_first_name_422(self):
        p = _valid_signup_payload()
        p.pop("first_name")
        r = requests.post(f"{API}/auth/register", json=p)
        assert r.status_code == 422, r.text

    def test_missing_last_name_422(self):
        p = _valid_signup_payload()
        p.pop("last_name")
        r = requests.post(f"{API}/auth/register", json=p)
        assert r.status_code == 422, r.text

    def test_missing_birthdate_422(self):
        p = _valid_signup_payload()
        p.pop("birthdate")
        r = requests.post(f"{API}/auth/register", json=p)
        assert r.status_code == 422, r.text

    def test_bad_birthdate_slash_format_422(self):
        p = _valid_signup_payload()
        p["birthdate"] = "12/12/2000"
        r = requests.post(f"{API}/auth/register", json=p)
        # 422 either from pydantic (length 10 but pattern wrong -> passes length; date parse fails -> 422 from handler)
        assert r.status_code == 422, r.text

    def test_bad_birthdate_impossible_date_422(self):
        p = _valid_signup_payload()
        p["birthdate"] = "2000-13-45"
        r = requests.post(f"{API}/auth/register", json=p)
        assert r.status_code == 422, r.text


class TestSeedUsersCarryNewFields:
    def test_demo_user_has_names_and_birthdate(self):
        r = requests.post(f"{API}/auth/login", json={"email": "demo1@huni.app", "password": "demo1234"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u.get("first_name")
        assert u.get("last_name")
        assert u.get("birthdate")


# ---------- Google session endpoint (real Emergent — bogus id → 401) ----------
class TestGoogleSessionEndpointBogus:
    def test_bogus_session_id_returns_401(self):
        r = requests.post(f"{API}/auth/google/session", json={"session_id": "definitely-not-a-real-session"})
        assert r.status_code == 401, r.text

    def test_missing_session_id_422(self):
        r = requests.post(f"{API}/auth/google/session", json={})
        assert r.status_code == 422, r.text


# ---------- Bearer duality: JWT + session_token both accepted ----------
class TestBearerDuality:
    def test_jwt_and_session_token_both_accepted_on_me(self):
        # (1) JWT path — register a normal user
        p = _valid_signup_payload()
        reg = requests.post(f"{API}/auth/register", json=p).json()
        jwt_token = reg["token"]
        user_id = reg["user"]["id"]

        me1 = requests.get(f"{API}/auth/me", headers=_h(jwt_token))
        assert me1.status_code == 200
        assert me1.json()["id"] == user_id
        assert me1.json()["auth_provider"] == "password"

        # (2) session_token path — simulate a Google session (insert directly)
        session_token = f"TEST_sess_{uuid.uuid4().hex}"
        _db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        })
        try:
            me2 = requests.get(f"{API}/auth/me", headers=_h(session_token))
            assert me2.status_code == 200, me2.text
            assert me2.json()["id"] == user_id
        finally:
            _db.user_sessions.delete_many({"session_token": session_token})

    def test_expired_session_token_rejected(self):
        p = _valid_signup_payload()
        reg = requests.post(f"{API}/auth/register", json=p).json()
        user_id = reg["user"]["id"]
        session_token = f"TEST_exp_{uuid.uuid4().hex}"
        _db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc) - timedelta(days=10),
            "expires_at": datetime.now(timezone.utc) - timedelta(days=1),
        })
        try:
            r = requests.get(f"{API}/auth/me", headers=_h(session_token))
            assert r.status_code == 401, r.text
        finally:
            _db.user_sessions.delete_many({"session_token": session_token})

    def test_invalid_bearer_rejected(self):
        r = requests.get(f"{API}/auth/me", headers=_h("not.a.jwt.and.no.session"))
        assert r.status_code == 401


# ---------- Logout ----------
class TestLogout:
    def test_logout_deletes_session_token(self):
        p = _valid_signup_payload()
        reg = requests.post(f"{API}/auth/register", json=p).json()
        user_id = reg["user"]["id"]
        session_token = f"TEST_logout_{uuid.uuid4().hex}"
        _db.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        })
        # confirm it works
        assert requests.get(f"{API}/auth/me", headers=_h(session_token)).status_code == 200
        # logout
        lo = requests.post(f"{API}/auth/logout", headers=_h(session_token))
        assert lo.status_code == 200
        # subsequent /auth/me returns 401
        after = requests.get(f"{API}/auth/me", headers=_h(session_token))
        assert after.status_code == 401
        # DB doc gone
        assert _db.user_sessions.find_one({"session_token": session_token}) is None

    def test_logout_with_jwt_is_noop(self):
        p = _valid_signup_payload()
        reg = requests.post(f"{API}/auth/register", json=p).json()
        jwt_token = reg["token"]
        lo = requests.post(f"{API}/auth/logout", headers=_h(jwt_token))
        assert lo.status_code == 200
        # JWT still works
        me = requests.get(f"{API}/auth/me", headers=_h(jwt_token))
        assert me.status_code == 200
