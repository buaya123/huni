#!/usr/bin/env python3
"""
Test #4 RETEST: Auto-Pause / Depleted State
Verify that depleted campaigns are filtered out from GET /api/campaigns
"""
import requests
import time
import json

BASE_URL = "https://input-row-behavior.preview.emergentagent.com/api"

def login(email, password):
    """Login and return token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        print(f"❌ Login failed for {email}: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    return data.get("token")

def register_new_user():
    """Register a new user for testing"""
    timestamp = int(time.time())
    email = f"depleted_test_{timestamp}@huni.app"
    password = "demo1234"
    alias = f"depltest{timestamp}"
    
    resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email,
        "password": password,
        "first_name": "Depleted",
        "last_name": "Test",
        "birthdate": "1990-01-01"
    })
    if resp.status_code != 200:
        print(f"❌ Registration failed: {resp.status_code} {resp.text}")
        return None, None
    
    data = resp.json()
    print(f"✅ Registered new user: {email}")
    return data.get("token"), data.get("user", {}).get("id")

def get_campaigns(token):
    """Get public campaigns list"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/campaigns", headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET /campaigns failed: {resp.status_code} {resp.text}")
        return None
    return resp.json()

def create_campaign(token, title):
    """Partner creates a campaign"""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "title": title,
        "description": "Test campaign with minimal budget for exactly 1 redemption",
        "reward_type": "both",
        "discount_label": "Free coffee",
        "terms": "One per customer",
        "start_date": time.strftime("%Y-%m-%d"),
        "end_date": time.strftime("%Y-%m-%d", time.localtime(time.time() + 86400 * 7))
    }
    resp = requests.post(f"{BASE_URL}/partner/campaigns", json=payload, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Create campaign failed: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    print(f"✅ Partner created campaign: {data['id']} (status={data['status']})")
    return data

def approve_campaign(token, campaign_id, exp_per=100, tokens_per=100, budget_exp=100, budget_tokens=100):
    """Admin approves campaign with budget"""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "exp_per_redemption": exp_per,
        "tokens_per_redemption": tokens_per,
        "budget_exp": budget_exp,
        "budget_tokens": budget_tokens
    }
    resp = requests.post(f"{BASE_URL}/admin/campaigns/{campaign_id}/approve", json=payload, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Approve campaign failed: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    print(f"✅ Admin approved campaign: {campaign_id} (status={data['status']}, state={data['state']})")
    return data

def scan_user(token, user_id):
    """Partner scans user QR code"""
    headers = {"Authorization": f"Bearer {token}"}
    code = f"huni:user:{user_id}"
    resp = requests.post(f"{BASE_URL}/partner/scan", json={"code": code}, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Scan failed: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    print(f"✅ Partner scanned user: {data['user']['alias']} ({len(data['campaigns'])} campaigns available)")
    return data

def redeem_campaign(token, campaign_id, user_id):
    """Partner redeems campaign for user"""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"campaign_id": campaign_id, "user_id": user_id}
    resp = requests.post(f"{BASE_URL}/partner/redeem", json=payload, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Redeem failed: {resp.status_code} {resp.text}")
        return None, resp.status_code
    data = resp.json()
    redemption = data.get("redemption", {})
    exp_awarded = redemption.get("exp_awarded", 0)
    tokens_awarded = redemption.get("tokens_awarded", 0)
    print(f"✅ Redemption successful: +{exp_awarded} EXP, +{tokens_awarded} tokens")
    return data, resp.status_code

def get_partner_campaign(token, campaign_id):
    """Partner views their own campaign"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{BASE_URL}/partner/campaigns/{campaign_id}", headers=headers)
    if resp.status_code != 200:
        print(f"❌ GET partner campaign failed: {resp.status_code} {resp.text}")
        return None
    return resp.json()

def main():
    print("=" * 80)
    print("TEST #4 RETEST: Auto-Pause / Depleted State")
    print("Verifying that depleted campaigns are filtered from GET /api/campaigns")
    print("=" * 80)
    
    # Step 1: Login as admin, partner, and user
    print("\n[Step 1] Login as admin, partner, and user")
    admin_token = login("demo1@huni.app", "demo1234")
    partner_token = login("demo2@huni.app", "demo1234")
    user_token = login("demo3@huni.app", "demo1234")
    
    if not all([admin_token, partner_token, user_token]):
        print("❌ FAILED: Could not login all users")
        return False
    
    # Get user3 ID
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    user3_id = resp.json()["id"]
    print(f"✅ All users logged in (user3_id={user3_id})")
    
    # Step 2: Partner creates small-budget campaign
    print("\n[Step 2] Partner creates campaign with title='Small budget test'")
    campaign = create_campaign(partner_token, "Small budget test")
    if not campaign:
        print("❌ FAILED: Could not create campaign")
        return False
    campaign_id = campaign["id"]
    
    # Step 3: Admin approves with exactly 1 redemption worth of budget
    print("\n[Step 3] Admin approves with exp_per=100, tokens_per=100, budget_exp=100, budget_tokens=100")
    approved = approve_campaign(admin_token, campaign_id, 
                                exp_per=100, tokens_per=100, 
                                budget_exp=100, budget_tokens=100)
    if not approved or approved["state"] != "live":
        print(f"❌ FAILED: Campaign not live (state={approved.get('state') if approved else 'None'})")
        return False
    
    # Step 4: Verify campaign appears in public feed for user3
    print("\n[Step 4] Verify GET /campaigns includes this campaign (state=live)")
    campaigns = get_campaigns(user_token)
    if not campaigns:
        print("❌ FAILED: Could not get campaigns")
        return False
    
    campaign_ids = [c["id"] for c in campaigns]
    if campaign_id not in campaign_ids:
        print(f"❌ FAILED: Campaign {campaign_id} not in public feed (expected state=live)")
        return False
    
    campaign_in_feed = next(c for c in campaigns if c["id"] == campaign_id)
    print(f"✅ Campaign appears in public feed (state={campaign_in_feed['state']}, remaining_exp={campaign_in_feed.get('remaining_exp')}, remaining_tokens={campaign_in_feed.get('remaining_tokens')})")
    
    # Step 5: Partner scans user3 QR and redeems
    print("\n[Step 5] Partner scans demo3 QR and redeems campaign")
    scan_result = scan_user(partner_token, user3_id)
    if not scan_result:
        print("❌ FAILED: Could not scan user")
        return False
    
    redeem_result, status_code = redeem_campaign(partner_token, campaign_id, user3_id)
    if not redeem_result:
        print(f"❌ FAILED: Could not redeem campaign (status={status_code})")
        return False
    
    # Fetch campaign to check remaining budget
    campaign_after_redeem = get_partner_campaign(partner_token, campaign_id)
    if campaign_after_redeem:
        print(f"✅ Campaign redeemed (remaining_exp={campaign_after_redeem.get('remaining_exp')}, remaining_tokens={campaign_after_redeem.get('remaining_tokens')})")
    else:
        print(f"⚠️ Could not fetch campaign after redemption")
    
    # Step 6: KEY TEST - Register new user and verify depleted campaign does NOT appear
    print("\n[Step 6] 🔑 KEY TEST: Register new user and verify depleted campaign is NOT in feed")
    new_user_token, new_user_id = register_new_user()
    if not new_user_token:
        print("❌ FAILED: Could not register new user")
        return False
    
    new_user_campaigns = get_campaigns(new_user_token)
    if not new_user_campaigns:
        print("❌ FAILED: Could not get campaigns for new user")
        return False
    
    new_user_campaign_ids = [c["id"] for c in new_user_campaigns]
    if campaign_id in new_user_campaign_ids:
        depleted_campaign = next(c for c in new_user_campaigns if c["id"] == campaign_id)
        print(f"❌ FAILED: Depleted campaign {campaign_id} STILL APPEARS in public feed!")
        print(f"   Campaign state: {depleted_campaign.get('state')}")
        print(f"   Remaining exp: {depleted_campaign.get('remaining_exp')}")
        print(f"   Remaining tokens: {depleted_campaign.get('remaining_tokens')}")
        return False
    
    print(f"✅ PASS: Depleted campaign {campaign_id} correctly filtered out from public feed")
    print(f"   New user sees {len(new_user_campaigns)} campaigns (depleted campaign not included)")
    
    # Step 7: Verify partner can still see depleted campaign
    print("\n[Step 7] Verify partner can still see campaign with state=depleted")
    partner_campaign = get_partner_campaign(partner_token, campaign_id)
    if not partner_campaign:
        print("❌ FAILED: Partner cannot view their own campaign")
        return False
    
    if partner_campaign["state"] != "depleted":
        print(f"❌ FAILED: Campaign state is {partner_campaign['state']}, expected 'depleted'")
        return False
    
    print(f"✅ Partner can still see campaign (state={partner_campaign['state']}, remaining_exp={partner_campaign.get('remaining_exp')}, remaining_tokens={partner_campaign.get('remaining_tokens')})")
    
    # Step 8: Verify redemption attempt returns 400
    print("\n[Step 8] Verify POST /partner/redeem for depleted campaign returns 400")
    _, status_code = redeem_campaign(partner_token, campaign_id, new_user_id)
    if status_code != 400:
        print(f"❌ FAILED: Expected 400, got {status_code}")
        return False
    
    print(f"✅ Redemption correctly blocked with 400 (campaign depleted)")
    
    # Step 9: Smoke test - verify non-depleted campaigns still appear
    print("\n[Step 9] Smoke test: Verify non-depleted campaigns still appear in feed")
    all_campaigns = get_campaigns(new_user_token)
    if not all_campaigns:
        print("⚠️ WARNING: No campaigns in feed (might be expected if all are depleted)")
    else:
        non_depleted = [c for c in all_campaigns if c["state"] != "depleted"]
        print(f"✅ Public feed shows {len(non_depleted)} non-depleted campaigns")
        for c in non_depleted[:3]:  # Show first 3
            print(f"   - {c['title']} (state={c['state']}, remaining_exp={c.get('remaining_exp')}, remaining_tokens={c.get('remaining_tokens')})")
    
    print("\n" + "=" * 80)
    print("✅ TEST #4 PASSED: Depleted campaigns are correctly filtered from public feed")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
