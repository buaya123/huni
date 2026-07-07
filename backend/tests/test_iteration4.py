"""Huni backend iteration 4 regression tests.

Focus areas:
- POST /api/posts now REQUIRES `title` (1..100 chars); response includes `title`
- Seed posts include `title`
- GET /api/posts/{id}/comments returns up/down/my_reaction fields
- POST /api/comments/{comment_id}/react toggles up/down and manages helpful_score
- Author cannot bump their own helpful_score
"""
import os
import uuid
import pytest
import requests

<<<<<<< HEAD

=======
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://huni-qr-campaigns.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
>>>>>>> feature/huni-store


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
    d = r.json()
    return d["token"], d["user"], email


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Post title validation ----------
class TestPostTitle:
    def test_missing_title_422(self):
        tok, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_h(tok), json={
            "content": "content only", "mood": "question", "audience": "public"
        })
        assert r.status_code == 422, r.text

    def test_empty_title_422(self):
        tok, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_h(tok), json={
            "title": "", "content": "hello", "mood": "question"
        })
        assert r.status_code == 422, r.text

    def test_title_too_long_422(self):
        tok, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_h(tok), json={
            "title": "x" * 101, "content": "hello", "mood": "question"
        })
        assert r.status_code == 422, r.text

    def test_title_max_101_boundary_101_rejected_100_accepted(self):
        tok, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_h(tok), json={
            "title": "x" * 100, "content": "hello", "mood": "question"
        })
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "x" * 100

    def test_response_includes_title(self):
        tok, _, _ = _register()
        r = requests.post(f"{API}/posts", headers=_h(tok), json={
            "title": "TEST Title Here", "content": "Body content", "mood": "hot_take"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST Title Here"
        assert data["content"] == "Body content"
        # GET too
        g = requests.get(f"{API}/posts/{data['id']}", headers=_h(tok))
        assert g.status_code == 200
        assert g.json()["title"] == "TEST Title Here"

    def test_seed_posts_have_titles(self):
        tok, _, _ = _register()
        r = requests.get(f"{API}/posts?tab=latest&limit=30", headers=_h(tok))
        assert r.status_code == 200
        posts = r.json()
        assert len(posts) > 0
        # every post should have a non-empty title
        missing = [p["id"] for p in posts if not p.get("title")]
        assert not missing, f"posts without titles: {missing}"


# ---------- Comment reactions ----------
class TestCommentReactions:
    def _make_post_and_comment(self, author_tok, commenter_tok=None):
        p = requests.post(f"{API}/posts", headers=_h(author_tok), json={
            "title": "TEST comment reactions", "content": "body", "mood": "question"
        }).json()
        tok_for_comment = commenter_tok or author_tok
        c = requests.post(f"{API}/posts/{p['id']}/comments", headers=_h(tok_for_comment),
                          json={"content": "hello"}).json()
        return p, c

    def test_fresh_comments_have_zero_reaction_fields(self):
        tA, _, _ = _register()
        p, c = self._make_post_and_comment(tA)
        # list comments
        r = requests.get(f"{API}/posts/{p['id']}/comments", headers=_h(tA))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1
        row = rows[0]
        assert row["up"] == 0
        assert row["down"] == 0
        assert row["my_reaction"] is None
        # Also on creation response
        assert c["up"] == 0 and c["down"] == 0 and c["my_reaction"] is None

    def test_toggle_up_off(self):
        tA, uA, _ = _register()
        tB, uB, _ = _register()
        p, c = self._make_post_and_comment(tA, commenter_tok=tA)
        # B ups the comment
        r1 = requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        assert r1.status_code == 200
        j = r1.json()
        assert j["up"] == 1 and j["down"] == 0 and j["my_reaction"] == "up"
        # B toggles off
        r2 = requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"}).json()
        assert r2["up"] == 0 and r2["my_reaction"] is None

    def test_switch_up_to_down(self):
        tA, _, _ = _register()
        tB, _, _ = _register()
        p, c = self._make_post_and_comment(tA)
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        r = requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "down"}).json()
        assert r["up"] == 0
        assert r["down"] == 1
        assert r["my_reaction"] == "down"

    def test_helpful_score_bump_and_undo(self):
        tA, uA, _ = _register()   # comment author
        tB, uB, _ = _register()   # reactor
        p, c = self._make_post_and_comment(tA)
        # baseline helpful score
        base = requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"]
        # B ups → +1
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        after_up = requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"]
        assert after_up == base + 1
        # B toggles off → back to base
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        after_toggle = requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"]
        assert after_toggle == base

    def test_helpful_score_switch_up_to_down(self):
        tA, uA, _ = _register()
        tB, _, _ = _register()
        p, c = self._make_post_and_comment(tA)
        base = requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"]
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        assert requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"] == base + 1
        # switch to down → -1 (back to base)
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "down"})
        assert requests.get(f"{API}/users/{uA['id']}", headers=_h(tB)).json()["helpful_score"] == base

    def test_author_cannot_bump_own_helpful(self):
        tA, uA, _ = _register()
        p, c = self._make_post_and_comment(tA)
        base = requests.get(f"{API}/users/{uA['id']}", headers=_h(tA)).json()["helpful_score"]
        # Author ups own comment → should NOT increment helpful_score
        r = requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tA), json={"kind": "up"})
        assert r.status_code == 200
        after = requests.get(f"{API}/users/{uA['id']}", headers=_h(tA)).json()["helpful_score"]
        assert after == base

    def test_my_reaction_perspective(self):
        """my_reaction is per-viewer."""
        tA, _, _ = _register()
        tB, _, _ = _register()
        tC, _, _ = _register()
        p, c = self._make_post_and_comment(tA)
        requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tB), json={"kind": "up"})
        # B sees my_reaction == 'up'
        bview = requests.get(f"{API}/posts/{p['id']}/comments", headers=_h(tB)).json()[0]
        assert bview["my_reaction"] == "up"
        # C sees my_reaction == None but up==1
        cview = requests.get(f"{API}/posts/{p['id']}/comments", headers=_h(tC)).json()[0]
        assert cview["my_reaction"] is None
        assert cview["up"] == 1

    def test_invalid_kind_422(self):
        tA, _, _ = _register()
        p, c = self._make_post_and_comment(tA)
        r = requests.post(f"{API}/comments/{c['id']}/react", headers=_h(tA), json={"kind": "heart"})
        assert r.status_code == 422
