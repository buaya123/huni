#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 7 — Image uploads on posts & comments (June 2026)
- New backend: POST /api/uploads (auth, base64 JSON body {data, content_type}) -> {id}; GET /api/images/{id} serves binary image (no auth, cache headers). db.images collection.
- PostCreate + CommentCreate accept image_ids (max 4). Hydrated posts/comments return "images": [ids]. Comments can be image-only (content optional; 422 if both empty).
- Frontend: src/utils/imagePicker.ts (expo-image-picker gallery-only + expo-image-manipulator resize 1080/jpeg 0.7 + sequential upload); src/components/PostImages.tsx (Reddit-style paging carousel w/ 1/N counter + dots + fullscreen ImageViewer modal).
- create.tsx: "Photos (n/4)" picker grid with remove; post/[id].tsx: image button in comment input, pending thumbnails, comment image thumbnails (tap -> fullscreen viewer).
- Backend flows already verified via python script: upload, serve, post w/ 3 images, image-only comment, text+2-images comment, empty comment 422, feed includes images.
- Prior iteration: Reddit-style threaded comments (max 3 indent levels, collapsible, score-sorted) — already user-verified except vote-bug fix.

## Iteration 8 — Ads system with roles (June 2026)
- Roles: users.role (user|advertiser|admin). ADMIN_EMAILS env (demo1@huni.app is admin). Admin promotes via POST /api/admin/users/{id}/role.
- Ads: POST /api/ads (advertiser/admin), GET /api/ads/mine (with stats), GET/PATCH/DELETE /api/ads/{id}, GET /api/ads/{id}/analytics (totals+14d daily+recent clicks), POST /api/ads/{id}/impression, POST /api/ads/{id}/click.
- Admin: GET /api/admin/users?q=, POST /api/admin/users/{id}/role, GET /api/admin/ads, GET/PATCH /api/admin/settings (ad_every_n_posts, default 5).
- Feed injection: GET /api/posts interleaves weighted-random ads (type:"ad") every N posts (except pulse tab); small feeds get 1 ad after 2nd post.
- Ad comments reuse /api/posts/{ad_id}/comments; comments_enabled=false -> 403; ad owner/admin can DELETE any comment on their ad.
- Frontend: AdCard (sponsored badge, business name, Learn more click-tracking, impression on mount), /ad/[id] detail w/ CommentsSection (extracted shared component, also used by post/[id]), /ads Ad Manager (list+toggle), /ads/create, /ads/[id] analytics (totals, bar chart, settings, delete), /admin panel (density, user roles, all ads), settings rows gated by role, notifications route is_ad -> /ad/{id}.
- Backend flows verified via /tmp/test_ads.py — all passing. UI smoke: feed ad + Ad Manager verified.

## Iteration 9 — Partner role + Campaigns + QR Redemption (July 2026)
- New role `partner` (users.role enum now user|advertiser|partner|admin). `RoleUpdate` accepts partner + optional business_name/business_type.
- users.points (int, default 0) + business_name/business_type surfaced via `public_user()`.
- Campaigns model: {id, partner_id, title, description, reward_type[points|discount|both], points_amount, discount_label, terms, image_ids, start_date, end_date, status[pending|approved|rejected], enabled, redemption_count, rejected_reason}. `_campaign_status_effective` computes `state` (pending|live|paused|scheduled|expired|rejected) based on dates + toggles.
- Redemptions collection: {id, campaign_id, user_id, partner_id, points_awarded, discount_applied, redeemed_at} with unique compound index on (campaign_id, user_id) → 1-per-user-per-campaign.
- Partner endpoints: POST/GET/PATCH/DELETE /api/partner/campaigns[/id]; POST /api/partner/scan (parses "huni:user:<id>" | "huni://user/<id>" | JSON | raw id, returns user + partner's live campaigns w/ already_redeemed flag); POST /api/partner/redeem (409 on duplicate); GET /api/partner/redemptions.
- Public endpoints: GET /api/campaigns (live campaigns for perks discovery), GET /api/campaigns/{id}, GET /api/me/points, GET /api/me/redemptions.
- Admin endpoints: GET /api/admin/campaigns?status=[pending|approved|rejected|all], POST /api/admin/campaigns/{id}/approve, POST /api/admin/campaigns/{id}/reject (with reason). Approval/rejection notifies partner via db.notifications + WS. Editing a campaign as partner resets it to `pending` status.
- Frontend: /qr (profile QR w/ share, points, links to /rewards & /perks), /perks + /perks/[id] (user-facing catalog), /rewards (points card + history), /partner (hub w/ campaigns list + stats + Scan/New CTA), /partner/campaigns/create + /[id] (edit/toggle/delete), /partner/scan (expo-camera QR scanner + manual entry modal + apply campaign inline), /partner/redemptions (partner log). Profile screen now shows QR icon on banner + points pill + Perks pill. Settings adds Rewards + Partner sections gated by role. Admin panel adds Campaign approvals + Make partner (with business info modal).
- New deps: qrcode (data-url QR gen), expo-camera (~17.0.10). Camera permission declared in app.json for iOS/Android.
- Firebase-admin init made lazy (skips if serviceAccountKey.json absent) so backend boots without that file.
- Backend flow test (curl script): seed → login admin/partner/user → promote to partner → create campaign → admin approve → public list → scan user QR → redeem (200) → repeat redeem (409) → user points=50, 1 redemption. All PASS (bugfix: strip _id from redemption doc before returning).


## Test tracking (Iteration 9)

backend:
  - task: "Partner role + admin promotion with business info"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added `partner` to RoleUpdate; POST /api/admin/users/{id}/role accepts role=partner + optional business_name/business_type. Verified promoting demo2 → partner via curl."
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested admin promotion flow: (1) Admin successfully promoted demo2 to partner with business_name='Test Cafe' and business_type='cafe', (2) Verified via GET /auth/me that demo2 has role=partner with correct business info, (3) Non-admin correctly blocked with 403. All role guards working correctly."
  - task: "Campaign CRUD + status flow (partner)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST/GET/PATCH/DELETE /api/partner/campaigns[/id]. Editing content resets status → pending. Requires partner or admin role."
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested campaign CRUD: (1) Partner created 3 campaigns (points, discount, both) all with status=pending, (2) Validation working: points_amount=0 rejected with 422, empty discount_label rejected with 422, (3) Regular user blocked from creating campaigns with 403, (4) Partner editing campaign title correctly reset status to pending, (5) Toggling enabled did NOT reset status (remained approved). All flows working correctly."
  - task: "Admin campaign approval + rejection"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/admin/campaigns/{id}/approve|reject. Notifies partner via db.notifications + WS. GET /api/admin/campaigns?status=pending|approved|rejected|all."
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested admin approval flow: (1) GET /admin/campaigns?status=pending returned 3 pending campaigns, (2) Admin approved 2 campaigns (status=approved, state=live), (3) Admin rejected 1 campaign with reason, (4) Partner received 4 notifications (approvals + rejection), (5) Non-admin correctly blocked with 403. All approval/rejection flows and notifications working correctly."
  - task: "Partner QR scan + redeem (1-per-user-per-campaign)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/partner/scan parses huni:user:<id>|huni://user/<id>|JSON|raw. POST /api/partner/redeem awards points + records discount + increments user.points + notifies user. Unique index (campaign_id,user_id) → 409 on duplicate. Bugfix: pop _id from redemption doc."
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested scan + redeem flow: (1) Partner scan with 'huni:user:<id>' format resolved user and returned 3 live campaigns, (2) All code formats work: huni://user/<id>, raw UUID, JSON, (3) Bad code correctly returns 404, (4) Redemption awarded 25 points (50→75), (5) User points correctly updated, (6) Redemption record created, (7) Campaign redemption_count incremented, (8) Duplicate redemption correctly blocked with 409, (9) Cannot redeem rejected campaign (400). All scan and redemption flows working correctly."
  - task: "User-facing perks + points + redemption history"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/campaigns (live only, filtered by dates), GET /api/campaigns/{id}, GET /api/me/points, GET /api/me/redemptions."
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested user-facing endpoints: (1) GET /campaigns returned only approved campaigns (3 approved, 0 rejected, 0 pending), (2) GET /me/points returned correct points (75) and redemption count (2), (3) GET /me/redemptions returned list of 2 redemptions. All user-facing endpoints working correctly."

frontend:
  - task: "Profile QR + points pill + entry to /perks and /rewards"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/profile.tsx, frontend/app/qr.tsx, frontend/src/components/ProfileQR.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Profile banner shows QR icon (→ /qr) + Settings icon. Profile card shows points pill + Perks pill. /qr renders a QR data URL (qrcode pkg) encoding huni:user:<id> with Share button."
  - task: "Partner Hub + campaign create/edit/scan/log"
    implemented: true
    working: "NA"
    file: "frontend/app/partner/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "/partner (hub), /partner/campaigns/create (wizard), /partner/campaigns/[id] (edit/toggle/delete), /partner/scan (expo-camera QR + manual code modal), /partner/redemptions."
  - task: "Admin panel — partner promotion + campaign approvals"
    implemented: true
    working: "NA"
    file: "frontend/app/admin.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Users list now supports Partner promotion (with business_name/type modal). New Campaign approvals section with Approve/Reject buttons."

metadata:
  test_sequence: 9
  run_ui: false

test_plan:
  current_focus:
    - "Partner role + admin promotion with business info"
    - "Campaign CRUD + status flow (partner)"
    - "Admin campaign approval + rejection"
    - "Partner QR scan + redeem (1-per-user-per-campaign)"
    - "User-facing perks + points + redemption history"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Iteration 9 backend complete. Added partner role, campaigns collection, redemptions collection (unique compound index), 15+ new endpoints, admin approval workflow. Verified end-to-end curl flow. Please run backend tests focused on: (1) admin promoting user→partner with business info, (2) partner creating a campaign → pending status, (3) admin approving/rejecting + notification created, (4) partner scanning huni:user:<id> QR resolves and lists only that partner's live campaigns, (5) redeem awards points + is idempotent (409 on repeat), (6) user reads /me/points and /me/redemptions correctly, (7) role guards (non-partner cannot create campaigns; non-admin cannot approve). Test credentials in /app/memory/test_credentials.md."
  - agent: "testing"
    message: "✅ ALL BACKEND TESTS PASSED (11/11) - Iteration 9 backend is fully functional. Tested all flows: (1) Admin promotion to partner with business info ✓, (2) Partner campaign creation with all reward types + validation ✓, (3) Admin approval/rejection with notifications ✓, (4) Public campaigns feed (only approved) ✓, (5) Partner scan with all code formats ✓, (6) Redemption flow with points, duplicate prevention (409), role guards ✓, (7) User points & history ✓, (8) Partner editing resets to pending ✓, (9) All role guards working ✓. No issues found. Backend ready for production."
