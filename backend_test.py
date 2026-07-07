#!/usr/bin/env python3
"""
Backend test script for Huni Iteration 9 - Partner + Campaigns + QR Redemption
Tests all backend endpoints for the new partner role, campaigns, and redemption flows.
"""
import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from environment
BASE_URL = "https://huni-qr-campaigns.preview.emergentagent.com/api"

# Test credentials (from /app/memory/test_credentials.md)
ADMIN_EMAIL = "demo1@huni.app"
PARTNER_EMAIL = "demo2@huni.app"
USER_EMAIL = "demo3@huni.app"
PASSWORD = "demo1234"

# Global state
admin_token: Optional[str] = None
partner_token: Optional[str] = None
user_token: Optional[str] = None
demo2_id: Optional[str] = None
demo3_id: Optional[str] = None
campaign_points_id: Optional[str] = None
campaign_discount_id: Optional[str] = None
campaign_both_id: Optional[str] = None

def log(msg: str, level: str = "INFO"):
    """Log a message with color coding."""
    colors = {
        "INFO": "\033[94m",  # Blue
        "PASS": "\033[92m",  # Green
        "FAIL": "\033[91m",  # Red
        "WARN": "\033[93m",  # Yellow
    }
    reset = "\033[0m"
    print(f"{colors.get(level, '')}{level}: {msg}{reset}")

def test_seed():
    """Seed the database with demo users."""
    log("Seeding database with demo users...")
    try:
        resp = requests.post(f"{BASE_URL}/dev/seed", timeout=10)
        if resp.status_code == 200:
            log("✓ Database seeded successfully", "PASS")
            return True
        else:
            log(f"✗ Seed failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Seed error: {e}", "FAIL")
        return False

def test_login():
    """Test login for all three users."""
    global admin_token, partner_token, user_token, demo2_id, demo3_id
    
    log("Testing login for admin, partner, and user...")
    
    # Login as admin (demo1)
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            admin_token = data["token"]
            log(f"✓ Admin login successful (role: {data['user'].get('role', 'N/A')})", "PASS")
        else:
            log(f"✗ Admin login failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin login error: {e}", "FAIL")
        return False
    
    # Login as partner (demo2)
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": PARTNER_EMAIL,
            "password": PASSWORD
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            partner_token = data["token"]
            demo2_id = data["user"]["id"]
            log(f"✓ Partner login successful (role: {data['user'].get('role', 'N/A')}, id: {demo2_id})", "PASS")
        else:
            log(f"✗ Partner login failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner login error: {e}", "FAIL")
        return False
    
    # Login as user (demo3)
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": USER_EMAIL,
            "password": PASSWORD
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            user_token = data["token"]
            demo3_id = data["user"]["id"]
            log(f"✓ User login successful (role: {data['user'].get('role', 'N/A')}, id: {demo3_id})", "PASS")
        else:
            log(f"✗ User login failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ User login error: {e}", "FAIL")
        return False
    
    return True

def test_admin_promote_to_partner():
    """Test admin promoting demo2 to partner role with business info."""
    log("\n=== TEST 1: Admin promotes user to partner role ===")
    
    # Promote demo2 to partner
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/users/{demo2_id}/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "role": "partner",
                "business_name": "Test Cafe",
                "business_type": "cafe"
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            log(f"✓ Admin promoted demo2 to partner: {data}", "PASS")
        else:
            log(f"✗ Admin promotion failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin promotion error: {e}", "FAIL")
        return False
    
    # Verify via GET /api/auth/me as demo2
    try:
        resp = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {partner_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("role") == "partner" and data.get("business_name") == "Test Cafe" and data.get("business_type") == "cafe":
                log(f"✓ Verified demo2 is now partner with business info: {data.get('business_name')}, {data.get('business_type')}", "PASS")
            else:
                log(f"✗ Role verification failed: {data}", "FAIL")
                return False
        else:
            log(f"✗ GET /auth/me failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Role verification error: {e}", "FAIL")
        return False
    
    # Test non-admin cannot promote (should get 403)
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/users/{demo3_id}/role",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"role": "partner"},
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ Non-admin correctly blocked from promoting users (403)", "PASS")
        else:
            log(f"✗ Non-admin should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Non-admin test error: {e}", "FAIL")
        return False
    
    return True

def test_partner_create_campaigns():
    """Test partner creating campaigns with different reward types."""
    global campaign_points_id, campaign_discount_id, campaign_both_id
    
    log("\n=== TEST 2: Partner creates campaigns ===")
    
    # Test 1: reward_type="points" + points_amount=25 (should succeed)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "title": "Points Campaign",
                "description": "Earn 25 points with your purchase",
                "reward_type": "points",
                "points_amount": 25,
                "discount_label": "",
                "terms": "Valid for all purchases"
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            campaign_points_id = data["id"]
            if data.get("status") == "pending":
                log(f"✓ Points campaign created successfully (status: pending, id: {campaign_points_id})", "PASS")
            else:
                log(f"✗ Points campaign status should be 'pending', got '{data.get('status')}'", "FAIL")
                return False
        else:
            log(f"✗ Points campaign creation failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Points campaign error: {e}", "FAIL")
        return False
    
    # Test 2: reward_type="discount" + discount_label="10% off drinks" (should succeed)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "title": "Discount Campaign",
                "description": "Get 10% off all drinks",
                "reward_type": "discount",
                "points_amount": 0,
                "discount_label": "10% off drinks",
                "terms": "Valid for beverages only"
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            campaign_discount_id = data["id"]
            if data.get("status") == "pending":
                log(f"✓ Discount campaign created successfully (status: pending, id: {campaign_discount_id})", "PASS")
            else:
                log(f"✗ Discount campaign status should be 'pending', got '{data.get('status')}'", "FAIL")
                return False
        else:
            log(f"✗ Discount campaign creation failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Discount campaign error: {e}", "FAIL")
        return False
    
    # Test 3: reward_type="both" + points_amount=50 + discount_label="Free pastry" (should succeed)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "title": "Both Campaign",
                "description": "Get 50 points and a free pastry",
                "reward_type": "both",
                "points_amount": 50,
                "discount_label": "Free pastry",
                "terms": "One per customer"
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            campaign_both_id = data["id"]
            if data.get("status") == "pending":
                log(f"✓ Both campaign created successfully (status: pending, id: {campaign_both_id})", "PASS")
            else:
                log(f"✗ Both campaign status should be 'pending', got '{data.get('status')}'", "FAIL")
                return False
        else:
            log(f"✗ Both campaign creation failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Both campaign error: {e}", "FAIL")
        return False
    
    # Test 4: reward_type="points" + points_amount=0 (should 422)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "title": "Invalid Points Campaign",
                "description": "This should fail",
                "reward_type": "points",
                "points_amount": 0,
                "discount_label": "",
                "terms": ""
            },
            timeout=10
        )
        if resp.status_code == 422:
            log("✓ Points campaign with 0 points correctly rejected (422)", "PASS")
        else:
            log(f"✗ Should get 422 for 0 points, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Invalid points campaign error: {e}", "FAIL")
        return False
    
    # Test 5: reward_type="discount" + discount_label="" (should 422)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "title": "Invalid Discount Campaign",
                "description": "This should fail",
                "reward_type": "discount",
                "points_amount": 0,
                "discount_label": "",
                "terms": ""
            },
            timeout=10
        )
        if resp.status_code == 422:
            log("✓ Discount campaign with empty label correctly rejected (422)", "PASS")
        else:
            log(f"✗ Should get 422 for empty discount_label, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Invalid discount campaign error: {e}", "FAIL")
        return False
    
    # Test 6: Regular user (non-partner) should get 403
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "title": "User Campaign",
                "description": "This should fail",
                "reward_type": "points",
                "points_amount": 10,
                "discount_label": "",
                "terms": ""
            },
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ Regular user correctly blocked from creating campaigns (403)", "PASS")
        else:
            log(f"✗ Regular user should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ User campaign test error: {e}", "FAIL")
        return False
    
    return True

def test_admin_campaign_approval():
    """Test admin listing, approving, and rejecting campaigns."""
    log("\n=== TEST 3: Admin lists + approves + rejects campaigns ===")
    
    # Test 1: GET /api/admin/campaigns?status=pending
    try:
        resp = requests.get(
            f"{BASE_URL}/admin/campaigns?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if len(data) >= 3:
                log(f"✓ Admin can list pending campaigns (found {len(data)})", "PASS")
            else:
                log(f"✗ Expected at least 3 pending campaigns, got {len(data)}", "FAIL")
                return False
        else:
            log(f"✗ Admin list campaigns failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin list campaigns error: {e}", "FAIL")
        return False
    
    # Test 2: Approve points campaign
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_points_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "approved" and data.get("state") == "live":
                log(f"✓ Admin approved points campaign (status: approved, state: live)", "PASS")
            else:
                log(f"✗ Approved campaign should have status=approved and state=live, got status={data.get('status')}, state={data.get('state')}", "FAIL")
                return False
        else:
            log(f"✗ Admin approve failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin approve error: {e}", "FAIL")
        return False
    
    # Test 3: Approve both campaign
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_both_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "approved":
                log(f"✓ Admin approved both campaign", "PASS")
            else:
                log(f"✗ Approved campaign should have status=approved, got {data.get('status')}", "FAIL")
                return False
        else:
            log(f"✗ Admin approve both campaign failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin approve both campaign error: {e}", "FAIL")
        return False
    
    # Test 4: Reject discount campaign
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_discount_id}/reject",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "Discount percentage too high"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "rejected":
                log(f"✓ Admin rejected discount campaign (reason: {data.get('rejected_reason')})", "PASS")
            else:
                log(f"✗ Rejected campaign should have status=rejected, got {data.get('status')}", "FAIL")
                return False
        else:
            log(f"✗ Admin reject failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Admin reject error: {e}", "FAIL")
        return False
    
    # Test 5: Verify notification was created for partner
    try:
        resp = requests.get(
            f"{BASE_URL}/notifications",
            headers={"Authorization": f"Bearer {partner_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            # Should have at least 2 notifications (1 approval, 1 rejection)
            if len(data) >= 2:
                log(f"✓ Partner received notifications (count: {len(data)})", "PASS")
            else:
                log(f"✗ Expected at least 2 notifications, got {len(data)}", "FAIL")
                return False
        else:
            log(f"✗ Get notifications failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Get notifications error: {e}", "FAIL")
        return False
    
    # Test 6: Non-admin should get 403
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_points_id}/approve",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ Non-admin correctly blocked from approving campaigns (403)", "PASS")
        else:
            log(f"✗ Non-admin should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Non-admin approve test error: {e}", "FAIL")
        return False
    
    return True

def test_public_campaigns_feed():
    """Test public campaigns feed returns only approved+enabled+in-date-range."""
    log("\n=== TEST 4: Public campaigns feed ===")
    
    try:
        resp = requests.get(
            f"{BASE_URL}/campaigns",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            # Should have 2 approved campaigns (points and both), not the rejected one
            approved_count = len([c for c in data if c.get("status") == "approved"])
            rejected_count = len([c for c in data if c.get("status") == "rejected"])
            pending_count = len([c for c in data if c.get("status") == "pending"])
            
            if rejected_count == 0 and pending_count == 0:
                log(f"✓ Public feed shows only approved campaigns (approved: {approved_count}, rejected: {rejected_count}, pending: {pending_count})", "PASS")
            else:
                log(f"✗ Public feed should not show rejected/pending campaigns (approved: {approved_count}, rejected: {rejected_count}, pending: {pending_count})", "FAIL")
                return False
        else:
            log(f"✗ Public campaigns feed failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Public campaigns feed error: {e}", "FAIL")
        return False
    
    return True

def test_partner_scan_flow():
    """Test partner scan flow with different code formats."""
    log("\n=== TEST 5: Partner scan flow ===")
    
    # Test 1: Scan with "huni:user:<id>" format
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/scan",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"code": f"huni:user:{demo3_id}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("user") and data.get("campaigns"):
                # Should only show partner's approved+live campaigns
                campaigns = data["campaigns"]
                log(f"✓ Partner scan with 'huni:user:<id>' successful (user: {data['user'].get('alias')}, campaigns: {len(campaigns)})", "PASS")
                
                # Verify campaigns are only this partner's
                for c in campaigns:
                    if c.get("partner_id") != demo2_id:
                        log(f"✗ Scan returned campaign from different partner", "FAIL")
                        return False
            else:
                log(f"✗ Scan response missing user or campaigns: {data}", "FAIL")
                return False
        else:
            log(f"✗ Partner scan failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner scan error: {e}", "FAIL")
        return False
    
    # Test 2: Scan with "huni://user/<id>" format
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/scan",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"code": f"huni://user/{demo3_id}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("user"):
                log(f"✓ Partner scan with 'huni://user/<id>' successful", "PASS")
            else:
                log(f"✗ Scan response missing user: {data}", "FAIL")
                return False
        else:
            log(f"✗ Partner scan with huni:// failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner scan huni:// error: {e}", "FAIL")
        return False
    
    # Test 3: Scan with raw UUID
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/scan",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"code": demo3_id},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("user"):
                log(f"✓ Partner scan with raw UUID successful", "PASS")
            else:
                log(f"✗ Scan response missing user: {data}", "FAIL")
                return False
        else:
            log(f"✗ Partner scan with raw UUID failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner scan raw UUID error: {e}", "FAIL")
        return False
    
    # Test 4: Scan with JSON format
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/scan",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"code": json.dumps({"user_id": demo3_id})},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("user"):
                log(f"✓ Partner scan with JSON format successful", "PASS")
            else:
                log(f"✗ Scan response missing user: {data}", "FAIL")
                return False
        else:
            log(f"✗ Partner scan with JSON failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner scan JSON error: {e}", "FAIL")
        return False
    
    # Test 5: Bad code should 404
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/scan",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"code": "invalid-code-12345"},
            timeout=10
        )
        if resp.status_code == 404:
            log("✓ Partner scan with bad code correctly returns 404", "PASS")
        else:
            log(f"✗ Bad code should return 404, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner scan bad code error: {e}", "FAIL")
        return False
    
    return True

def test_redeem_flow():
    """Test redemption flow with various scenarios."""
    log("\n=== TEST 6: Redeem flow ===")
    
    # Get user's initial points
    initial_points = 0
    try:
        resp = requests.get(
            f"{BASE_URL}/me/points",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            initial_points = data.get("points", 0)
            log(f"User initial points: {initial_points}")
        else:
            log(f"✗ Get initial points failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Get initial points error: {e}", "FAIL")
        return False
    
    # Test 1: Redeem points campaign (should succeed)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/redeem",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "campaign_id": campaign_points_id,
                "user_id": demo3_id
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "ok" and data.get("redemption") and data.get("user_new_points"):
                expected_points = initial_points + 25
                actual_points = data["user_new_points"]
                if actual_points == expected_points:
                    log(f"✓ Redemption successful (points: {initial_points} → {actual_points})", "PASS")
                else:
                    log(f"✗ Points mismatch: expected {expected_points}, got {actual_points}", "FAIL")
                    return False
            else:
                log(f"✗ Redemption response missing required fields: {data}", "FAIL")
                return False
        else:
            log(f"✗ Redemption failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Redemption error: {e}", "FAIL")
        return False
    
    # Test 2: Verify points were added to user
    try:
        resp = requests.get(
            f"{BASE_URL}/me/points",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            current_points = data.get("points", 0)
            expected_points = initial_points + 25
            if current_points == expected_points:
                log(f"✓ User points correctly updated (now: {current_points})", "PASS")
            else:
                log(f"✗ User points mismatch: expected {expected_points}, got {current_points}", "FAIL")
                return False
        else:
            log(f"✗ Get user points failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Get user points error: {e}", "FAIL")
        return False
    
    # Test 3: Verify redemption record exists
    try:
        resp = requests.get(
            f"{BASE_URL}/me/redemptions",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if len(data) >= 1:
                log(f"✓ Redemption record created (count: {len(data)})", "PASS")
            else:
                log(f"✗ Expected at least 1 redemption record, got {len(data)}", "FAIL")
                return False
        else:
            log(f"✗ Get redemptions failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Get redemptions error: {e}", "FAIL")
        return False
    
    # Test 4: Verify campaign redemption_count incremented
    try:
        resp = requests.get(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {partner_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            points_campaign = next((c for c in data if c["id"] == campaign_points_id), None)
            if points_campaign and points_campaign.get("redemption_count", 0) >= 1:
                log(f"✓ Campaign redemption_count incremented (count: {points_campaign['redemption_count']})", "PASS")
            else:
                log(f"✗ Campaign redemption_count not incremented", "FAIL")
                return False
        else:
            log(f"✗ Get partner campaigns failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Get partner campaigns error: {e}", "FAIL")
        return False
    
    # Test 5: Second redemption should return 409
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/redeem",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "campaign_id": campaign_points_id,
                "user_id": demo3_id
            },
            timeout=10
        )
        if resp.status_code == 409:
            log("✓ Duplicate redemption correctly blocked (409)", "PASS")
        else:
            log(f"✗ Duplicate redemption should return 409, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Duplicate redemption error: {e}", "FAIL")
        return False
    
    # Test 6: Cannot redeem pending/rejected campaign (should 400)
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/redeem",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={
                "campaign_id": campaign_discount_id,  # This was rejected
                "user_id": demo3_id
            },
            timeout=10
        )
        if resp.status_code == 400:
            log("✓ Cannot redeem rejected campaign (400)", "PASS")
        else:
            log(f"✗ Redeeming rejected campaign should return 400, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Redeem rejected campaign error: {e}", "FAIL")
        return False
    
    return True

def test_user_points_and_history():
    """Test user points and redemption history endpoints."""
    log("\n=== TEST 7: User points & history ===")
    
    # Test 1: GET /api/me/points
    try:
        resp = requests.get(
            f"{BASE_URL}/me/points",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if "points" in data and "redemptions" in data:
                log(f"✓ GET /me/points successful (points: {data['points']}, redemptions: {data['redemptions']})", "PASS")
            else:
                log(f"✗ Response missing required fields: {data}", "FAIL")
                return False
        else:
            log(f"✗ GET /me/points failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ GET /me/points error: {e}", "FAIL")
        return False
    
    # Test 2: GET /api/me/redemptions
    try:
        resp = requests.get(
            f"{BASE_URL}/me/redemptions",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) >= 1:
                log(f"✓ GET /me/redemptions successful (count: {len(data)})", "PASS")
            else:
                log(f"✗ Expected list with at least 1 redemption, got {data}", "FAIL")
                return False
        else:
            log(f"✗ GET /me/redemptions failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ GET /me/redemptions error: {e}", "FAIL")
        return False
    
    return True

def test_partner_edit_resets_to_pending():
    """Test that partner editing content resets campaign to pending."""
    log("\n=== TEST 8: Partner editing content resets to pending ===")
    
    # Test 1: Edit approved campaign's title (should reset to pending)
    try:
        resp = requests.patch(
            f"{BASE_URL}/partner/campaigns/{campaign_both_id}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"title": "Updated Both Campaign Title"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "pending":
                log(f"✓ Editing campaign title reset status to pending", "PASS")
            else:
                log(f"✗ Edited campaign should have status=pending, got {data.get('status')}", "FAIL")
                return False
        else:
            log(f"✗ Edit campaign failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Edit campaign error: {e}", "FAIL")
        return False
    
    # Re-approve the campaign for next test
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_both_id}/approve",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10
        )
        if resp.status_code == 200:
            log("Re-approved campaign for next test")
        else:
            log(f"✗ Re-approve failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Re-approve error: {e}", "FAIL")
        return False
    
    # Test 2: Toggle enabled only (should NOT reset to pending)
    try:
        resp = requests.patch(
            f"{BASE_URL}/partner/campaigns/{campaign_both_id}",
            headers={"Authorization": f"Bearer {partner_token}"},
            json={"enabled": False},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "approved":
                log(f"✓ Toggling enabled did NOT reset status (still approved)", "PASS")
            else:
                log(f"✗ Toggling enabled should keep status=approved, got {data.get('status')}", "FAIL")
                return False
        else:
            log(f"✗ Toggle enabled failed: {resp.status_code} - {resp.text}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Toggle enabled error: {e}", "FAIL")
        return False
    
    return True

def test_role_guards():
    """Test role-based access control."""
    log("\n=== TEST 9: Role guards summary ===")
    
    # Test 1: User trying POST /api/partner/campaigns → 403
    try:
        resp = requests.post(
            f"{BASE_URL}/partner/campaigns",
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "title": "User Campaign",
                "description": "Should fail",
                "reward_type": "points",
                "points_amount": 10,
                "discount_label": "",
                "terms": ""
            },
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ User blocked from POST /partner/campaigns (403)", "PASS")
        else:
            log(f"✗ User should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ User campaign test error: {e}", "FAIL")
        return False
    
    # Test 2: User trying POST /api/admin/campaigns/{id}/approve → 403
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_points_id}/approve",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ User blocked from POST /admin/campaigns/{id}/approve (403)", "PASS")
        else:
            log(f"✗ User should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ User approve test error: {e}", "FAIL")
        return False
    
    # Test 3: Partner trying POST /api/admin/campaigns/{id}/approve → 403
    try:
        resp = requests.post(
            f"{BASE_URL}/admin/campaigns/{campaign_points_id}/approve",
            headers={"Authorization": f"Bearer {partner_token}"},
            timeout=10
        )
        if resp.status_code == 403:
            log("✓ Partner blocked from POST /admin/campaigns/{id}/approve (403)", "PASS")
        else:
            log(f"✗ Partner should get 403, got {resp.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"✗ Partner approve test error: {e}", "FAIL")
        return False
    
    # Test 4: Admin can do everything (already tested in previous tests)
    log("✓ Admin can do everything (verified in previous tests)", "PASS")
    
    return True

def main():
    """Run all tests."""
    log("=" * 60)
    log("Huni Backend Test - Iteration 9 (Partner + Campaigns + QR Redemption)")
    log("=" * 60)
    
    tests = [
        ("Seed Database", test_seed),
        ("Login", test_login),
        ("Admin Promote to Partner", test_admin_promote_to_partner),
        ("Partner Create Campaigns", test_partner_create_campaigns),
        ("Admin Campaign Approval", test_admin_campaign_approval),
        ("Public Campaigns Feed", test_public_campaigns_feed),
        ("Partner Scan Flow", test_partner_scan_flow),
        ("Redeem Flow", test_redeem_flow),
        ("User Points & History", test_user_points_and_history),
        ("Partner Edit Resets to Pending", test_partner_edit_resets_to_pending),
        ("Role Guards", test_role_guards),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
                log(f"Test '{name}' FAILED", "FAIL")
        except Exception as e:
            failed += 1
            log(f"Test '{name}' FAILED with exception: {e}", "FAIL")
    
    log("\n" + "=" * 60)
    log(f"Test Results: {passed} passed, {failed} failed", "INFO")
    log("=" * 60)
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
