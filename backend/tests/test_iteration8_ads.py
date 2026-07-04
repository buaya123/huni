"""
Iteration 8 backend tests — Ads & Admin features
Covers:
 - login-based role resolution (admin via ADMIN_EMAILS, advertiser, regular user)
 - /admin/* endpoints (settings, users, ads, role) with 403 for non-admin
 - /ads CRUD + ownership rules, /ads/mine stats, /ads/{id}/analytics daily+recent_clicks
 - Feed ad injection every N (weighted); pulse tab has no ads; disabled ads not injected
 - Ad comments (allowed / blocked when disabled / ad-owner moderation delete)
 - Impression + click tracking (unique_viewers = distinct users)
"""
import os
import time
from typing import Dict, Any, List

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


# ---------- helpers ----------
def _login(email: str, password: str = "demo1234") -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- module fixtures ----------
@pytest.fixture(scope="module")
def admin_tok() -> str:
    return _login("demo1@huni.app")


@pytest.fixture(scope="module")
def adv_tok() -> str:
    return _login("demo2@huni.app")


@pytest.fixture(scope="module")
def user_tok() -> str:
    return _login("demo3@huni.app")


@pytest.fixture(scope="module")
def admin_hdr(admin_tok):
    return _hdr(admin_tok)


@pytest.fixture(scope="module")
def adv_hdr(adv_tok):
    return _hdr(adv_tok)


@pytest.fixture(scope="module")
def user_hdr(user_tok):
    return _hdr(user_tok)


# ---------- role resolution ----------
class TestRoles:
    def test_admin_promoted_via_env(self, admin_hdr):
        r = requests.get(f"{BASE_URL}/auth/me", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        me = r.json()
        # /auth/me returns a public-safe user (no email) — role is what we care about
        assert me["role"] == "admin", f"demo1 should be admin, got {me.get('role')}"

    def test_advertiser_role(self, adv_hdr):
        r = requests.get(f"{BASE_URL}/auth/me", headers=adv_hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] in ("advertiser", "admin")

    def test_regular_user_role(self, user_hdr):
        r = requests.get(f"{BASE_URL}/auth/me", headers=user_hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "user"


# ---------- admin endpoints ----------
class TestAdmin:
    def test_admin_settings_get(self, admin_hdr):
        r = requests.get(f"{BASE_URL}/admin/settings", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "ad_every_n_posts" in d
        assert 2 <= d["ad_every_n_posts"] <= 20

    def test_admin_settings_patch_bounds(self, admin_hdr):
        # valid
        r = requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 4}, headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["ad_every_n_posts"] == 4
        # verify persisted via GET
        g = requests.get(f"{BASE_URL}/admin/settings", headers=admin_hdr, timeout=15)
        assert g.json()["ad_every_n_posts"] == 4
        # invalid <2
        r = requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 1}, headers=admin_hdr, timeout=15)
        assert r.status_code == 422
        # invalid >20
        r = requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 50}, headers=admin_hdr, timeout=15)
        assert r.status_code == 422

    def test_admin_settings_forbidden_for_regular(self, user_hdr):
        r = requests.get(f"{BASE_URL}/admin/settings", headers=user_hdr, timeout=15)
        assert r.status_code == 403
        r = requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 3}, headers=user_hdr, timeout=15)
        assert r.status_code == 403

    def test_admin_settings_forbidden_for_advertiser(self, adv_hdr):
        r = requests.get(f"{BASE_URL}/admin/settings", headers=adv_hdr, timeout=15)
        assert r.status_code == 403

    def test_admin_users_search(self, admin_hdr):
        r = requests.get(f"{BASE_URL}/admin/users?q=demo3", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(u["email"] == "demo3@huni.app" for u in rows)
        # returned fields do not include password
        for u in rows:
            assert "password" not in u
            assert "role" in u

    def test_admin_users_forbidden(self, user_hdr, adv_hdr):
        assert requests.get(f"{BASE_URL}/admin/users?q=demo", headers=user_hdr, timeout=15).status_code == 403
        assert requests.get(f"{BASE_URL}/admin/users?q=demo", headers=adv_hdr, timeout=15).status_code == 403

    def test_admin_cannot_change_admin_role(self, admin_hdr):
        # find demo1 (admin) id
        r = requests.get(f"{BASE_URL}/admin/users?q=demo1@huni.app", headers=admin_hdr, timeout=15)
        admin_user = next(u for u in r.json() if u["email"] == "demo1@huni.app")
        # try to demote
        r = requests.post(
            f"{BASE_URL}/admin/users/{admin_user['id']}/role",
            json={"role": "user"}, headers=admin_hdr, timeout=15
        )
        assert r.status_code == 400

    def test_admin_role_toggle_user_to_advertiser_and_back(self, admin_hdr):
        # find demo3
        r = requests.get(f"{BASE_URL}/admin/users?q=demo3@huni.app", headers=admin_hdr, timeout=15)
        demo3 = next(u for u in r.json() if u["email"] == "demo3@huni.app")
        original_role = demo3["role"]
        target_role = "advertiser" if original_role == "user" else "user"

        r = requests.post(
            f"{BASE_URL}/admin/users/{demo3['id']}/role",
            json={"role": target_role}, headers=admin_hdr, timeout=15
        )
        assert r.status_code == 200
        assert r.json()["role"] == target_role

        # verify via search
        r = requests.get(f"{BASE_URL}/admin/users?q=demo3@huni.app", headers=admin_hdr, timeout=15)
        assert next(u for u in r.json() if u["email"] == "demo3@huni.app")["role"] == target_role

        # revert
        r = requests.post(
            f"{BASE_URL}/admin/users/{demo3['id']}/role",
            json={"role": original_role}, headers=admin_hdr, timeout=15
        )
        assert r.status_code == 200

    def test_admin_ads_list_has_stats_and_advertiser(self, admin_hdr):
        r = requests.get(f"{BASE_URL}/admin/ads", headers=admin_hdr, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            a = rows[0]
            assert "stats" in a and "impressions" in a["stats"]
            assert "advertiser" in a  # can be None if orphaned, else has alias/email


# ---------- ad create / mine / detail / patch / delete ----------
class TestAdsCRUD:
    ad_id: str = ""

    def test_create_ad_forbidden_for_regular(self, user_hdr):
        r = requests.post(
            f"{BASE_URL}/ads",
            json={"business_name": "X", "title": "T", "content": "C"},
            headers=user_hdr, timeout=15,
        )
        assert r.status_code == 403

    def test_create_ad_advertiser(self, adv_hdr):
        r = requests.post(
            f"{BASE_URL}/ads",
            json={
                "business_name": "TEST_i8 Coffee",
                "title": "TEST_i8 headline",
                "content": "TEST_i8 body copy",
                "link_url": "https://example.com/i8",
                "frequency_weight": 6,
            },
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "ad"
        assert d["business_name"] == "TEST_i8 Coffee"
        assert d["frequency_weight"] == 6
        assert d["enabled"] is True
        assert d["comments_enabled"] is True
        assert d["comment_count"] == 0
        TestAdsCRUD.ad_id = d["id"]

    def test_get_ad(self, adv_hdr):
        r = requests.get(f"{BASE_URL}/ads/{TestAdsCRUD.ad_id}", headers=adv_hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == TestAdsCRUD.ad_id

    def test_ads_mine_contains_new(self, adv_hdr):
        r = requests.get(f"{BASE_URL}/ads/mine", headers=adv_hdr, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        ad = next((a for a in rows if a["id"] == TestAdsCRUD.ad_id), None)
        assert ad is not None
        assert "stats" in ad
        assert set(ad["stats"].keys()) >= {"impressions", "clicks", "unique_viewers", "ctr"}

    def test_ads_mine_forbidden_for_regular(self, user_hdr):
        r = requests.get(f"{BASE_URL}/ads/mine", headers=user_hdr, timeout=15)
        assert r.status_code == 403

    def test_patch_ad_owner(self, adv_hdr):
        r = requests.patch(
            f"{BASE_URL}/ads/{TestAdsCRUD.ad_id}",
            json={"frequency_weight": 9, "comments_enabled": True, "enabled": True},
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["frequency_weight"] == 9

    def test_patch_ad_forbidden_for_other_user(self, user_hdr):
        r = requests.patch(
            f"{BASE_URL}/ads/{TestAdsCRUD.ad_id}",
            json={"enabled": False}, headers=user_hdr, timeout=15,
        )
        # 403 either from role guard or ownership guard
        assert r.status_code == 403

    def test_admin_can_patch_others_ad(self, admin_hdr):
        r = requests.patch(
            f"{BASE_URL}/ads/{TestAdsCRUD.ad_id}",
            json={"frequency_weight": 8}, headers=admin_hdr, timeout=15,
        )
        assert r.status_code == 200


# ---------- ad tracking & analytics ----------
class TestAdTracking:
    ad_id: str = ""

    @pytest.fixture(scope="class", autouse=True)
    def _create_ad(self, adv_hdr):
        r = requests.post(
            f"{BASE_URL}/ads",
            json={
                "business_name": "TEST_i8 Analytics",
                "title": "TEST_i8 analytics headline",
                "content": "TEST_i8 analytics body",
                "link_url": "https://example.com/i8-analytics",
                "frequency_weight": 5,
            },
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        TestAdTracking.ad_id = r.json()["id"]

    def test_impression_tracked(self, user_hdr, adv_hdr, admin_hdr):
        # 3 impressions from 3 distinct users
        for h in (user_hdr, adv_hdr, admin_hdr):
            r = requests.post(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/impression", headers=h, timeout=15)
            assert r.status_code == 200
        # user hits again (should not increase unique_viewers)
        requests.post(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/impression", headers=user_hdr, timeout=15)

        r = requests.get(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/analytics", headers=adv_hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["totals"]["impressions"] >= 4
        assert d["totals"]["unique_viewers"] >= 3

    def test_click_returns_link_and_tracks(self, user_hdr, adv_hdr):
        r = requests.post(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/click", headers=user_hdr, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["link_url"] == "https://example.com/i8-analytics"

        a = requests.get(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/analytics", headers=adv_hdr, timeout=15).json()
        assert a["totals"]["clicks"] >= 1
        assert len(a["recent_clicks"]) >= 1
        # daily series length = 14
        assert len(a["daily"]) == 14
        # each day has date/impressions/clicks
        for row in a["daily"]:
            assert set(row.keys()) >= {"date", "impressions", "clicks"}

    def test_analytics_forbidden_for_non_owner(self, user_hdr):
        r = requests.get(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/analytics", headers=user_hdr, timeout=15)
        assert r.status_code == 403

    def test_admin_can_access_analytics(self, admin_hdr):
        r = requests.get(f"{BASE_URL}/ads/{TestAdTracking.ad_id}/analytics", headers=admin_hdr, timeout=15)
        assert r.status_code == 200


# ---------- feed injection ----------
class TestFeedInjection:
    def test_ads_injected_every_n(self, admin_hdr, user_hdr):
        # set N=2 so feed of 30 will get several ads
        r = requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 2}, headers=admin_hdr, timeout=15)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/posts?tab=latest&limit=30", headers=user_hdr, timeout=15)
        assert r.status_code == 200
        feed = r.json()
        ads_in_feed = [x for x in feed if x.get("type") == "ad"]
        # With N=2 and multiple ads existing, at least 1 ad should appear
        assert len(ads_in_feed) >= 1, f"expected ads injected with N=2, got 0 in {len(feed)}-item feed"
        # feed ad shape sanity
        for ad in ads_in_feed:
            assert "business_name" in ad
            assert "title" in ad
            assert ad["id"]
        # restore default
        requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 4}, headers=admin_hdr, timeout=15)

    def test_pulse_has_no_ads(self, user_hdr):
        r = requests.get(f"{BASE_URL}/posts?tab=pulse&limit=30", headers=user_hdr, timeout=15)
        assert r.status_code == 200
        assert not any(x.get("type") == "ad" for x in r.json())

    def test_disabled_ad_not_injected(self, adv_hdr, admin_hdr, user_hdr):
        # create + disable a marker ad, then ensure it never appears
        r = requests.post(
            f"{BASE_URL}/ads",
            json={
                "business_name": "TEST_i8 DisabledMarker",
                "title": "should-never-appear",
                "content": "TEST_i8 disabled",
                "frequency_weight": 10,
            },
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        aid = r.json()["id"]
        # disable
        requests.patch(f"{BASE_URL}/ads/{aid}", json={"enabled": False}, headers=adv_hdr, timeout=15)
        # dense feed for many chances
        requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 2}, headers=admin_hdr, timeout=15)

        for _ in range(4):
            r = requests.get(f"{BASE_URL}/posts?tab=latest&limit=30", headers=user_hdr, timeout=15)
            assert r.status_code == 200
            assert not any(x.get("type") == "ad" and x.get("id") == aid for x in r.json()), \
                "disabled ad appeared in feed"

        # cleanup: soft-delete + restore N
        requests.delete(f"{BASE_URL}/ads/{aid}", headers=adv_hdr, timeout=15)
        requests.patch(f"{BASE_URL}/admin/settings", json={"ad_every_n_posts": 4}, headers=admin_hdr, timeout=15)


# ---------- ad comments ----------
class TestAdComments:
    ad_id: str = ""

    @pytest.fixture(scope="class", autouse=True)
    def _create(self, adv_hdr):
        r = requests.post(
            f"{BASE_URL}/ads",
            json={
                "business_name": "TEST_i8 Comments",
                "title": "TEST_i8 comment ad",
                "content": "TEST_i8 comment body",
                "frequency_weight": 3,
            },
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        TestAdComments.ad_id = r.json()["id"]

    def test_user_can_comment_on_ad(self, user_hdr, adv_hdr):
        r = requests.post(
            f"{BASE_URL}/posts/{TestAdComments.ad_id}/comments",
            json={"content": "TEST_i8 user comment on ad"},
            headers=user_hdr, timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]

        # GET reflects
        g = requests.get(f"{BASE_URL}/posts/{TestAdComments.ad_id}/comments", headers=adv_hdr, timeout=15)
        assert g.status_code == 200
        rows = g.json()
        assert any(c["id"] == cid for c in rows)

        # ad comment_count incremented
        ad = requests.get(f"{BASE_URL}/ads/{TestAdComments.ad_id}", headers=adv_hdr, timeout=15).json()
        assert ad["comment_count"] >= 1

        TestAdComments._cid = cid  # noqa: keep for delete test

    def test_ad_owner_can_delete_other_users_comment(self, adv_hdr, user_hdr):
        # user posts one, advertiser (ad owner) deletes it
        p = requests.post(
            f"{BASE_URL}/posts/{TestAdComments.ad_id}/comments",
            json={"content": "TEST_i8 comment to be moderated"},
            headers=user_hdr, timeout=15,
        )
        assert p.status_code in (200, 201)
        cid = p.json()["id"]

        d = requests.delete(f"{BASE_URL}/comments/{cid}", headers=adv_hdr, timeout=15)
        assert d.status_code in (200, 204), f"ad owner should moderate; got {d.status_code} {d.text}"

    def test_disabled_comments_return_403(self, adv_hdr, user_hdr):
        # disable comments on ad
        r = requests.patch(
            f"{BASE_URL}/ads/{TestAdComments.ad_id}",
            json={"comments_enabled": False}, headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        # attempt comment
        r = requests.post(
            f"{BASE_URL}/posts/{TestAdComments.ad_id}/comments",
            json={"content": "TEST_i8 should be rejected"},
            headers=user_hdr, timeout=15,
        )
        assert r.status_code == 403
        # re-enable
        requests.patch(
            f"{BASE_URL}/ads/{TestAdComments.ad_id}",
            json={"comments_enabled": True}, headers=adv_hdr, timeout=15,
        )


# ---------- soft delete ----------
class TestAdDelete:
    def test_delete_ad_is_soft_and_hides_from_get(self, adv_hdr):
        # create disposable
        r = requests.post(
            f"{BASE_URL}/ads",
            json={
                "business_name": "TEST_i8 Doomed",
                "title": "TEST_i8 doomed",
                "content": "TEST_i8 doomed body",
                "frequency_weight": 4,
            },
            headers=adv_hdr, timeout=15,
        )
        assert r.status_code == 200
        aid = r.json()["id"]

        d = requests.delete(f"{BASE_URL}/ads/{aid}", headers=adv_hdr, timeout=15)
        assert d.status_code == 200

        # GET now 404
        g = requests.get(f"{BASE_URL}/ads/{aid}", headers=adv_hdr, timeout=15)
        assert g.status_code == 404

        # not in /ads/mine
        rows = requests.get(f"{BASE_URL}/ads/mine", headers=adv_hdr, timeout=15).json()
        assert not any(a["id"] == aid for a in rows)
