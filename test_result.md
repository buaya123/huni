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
  test_sequence: 10
  run_ui: false

test_plan:
  current_focus:
    - "EXP + Tokens economy: rank_for_exp, /me/economy, XP awards on login/post/comment/react"
    - "Campaign refactor: partner submits offer only, admin approval sets budget + per-person"
    - "Redeem debits budgets + credits EXP/Tokens; auto-pauses when depleted"
    - "Huni Store: admin CRUD + public browse + subcategory validation"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Iteration 9 backend complete. Added partner role, campaigns collection, redemptions collection (unique compound index), 15+ new endpoints, admin approval workflow. Verified end-to-end curl flow. Please run backend tests focused on: (1) admin promoting user→partner with business info, (2) partner creating a campaign → pending status, (3) admin approving/rejecting + notification created, (4) partner scanning huni:user:<id> QR resolves and lists only that partner's live campaigns, (5) redeem awards points + is idempotent (409 on repeat), (6) user reads /me/points and /me/redemptions correctly, (7) role guards (non-partner cannot create campaigns; non-admin cannot approve). Test credentials in /app/memory/test_credentials.md."
  - agent: "testing"
    message: "Iteration 9 backend PASSED 11/11 (partner promotion, campaign CRUD w/ validation + role guards, admin approve/reject w/ notifications, QR scan across all code formats, redeem w/ points + duplicate 409, public perks feed, points/history endpoints, edit-resets-to-pending, toggle-enabled preserves status). No regressions. Ready for frontend testing when user approves."
  - agent: "main"
    message: "Bug fixes: (1) Notification handler didn't route campaign_id — added handling for reward → /rewards, campaign_approved|rejected → /partner. Added meta icons for new types. (2) Admin campaign rows were truncated with no review path — made rows Pressable, added full-detail review modal (partner info, reward, full description, terms, dates, redemption count, previous reject reason) with Approve/Reject inline, plus a cross-platform reject-reason modal (replaces iOS-only Alert.prompt). Frontend testing agent confirmed both fixes PASS."
  - agent: "testing"
    message: "Bug fixes for Iteration 9 verified PASS: notification → /partner routing works, campaign approval visible in hub with correct status. Admin review modal shows full untruncated details, cross-platform reject reason modal works, rejection reason persists in list + reopens correctly with 'Previous rejection reason' shown in red."
  - agent: "main"
    message: "Iteration 10 — Economy overhaul. Renamed points → EXP (permanent, rank-only); added `tokens` (spendable). New rank system with 10 named titles + 15% growth after Lv 10, computed by `rank_for_exp()`. New XP triggers: daily_login (+5 once/day via /auth/login), create_post (+15) + first_post_bonus (+10 once/day), comment (+8, cap 5/day), react (+1, cap 20/day, positive add only, non-self). Campaign flow refactored: partner submits offer only (no reward inputs); admin approval takes `exp_per_redemption`, `tokens_per_redemption`, `budget_exp`, `budget_tokens`. Redemption debits budgets + credits user; auto-pauses when budget can't fund next redemption (`state=depleted`). New Huni Store: `store_items` collection with full admin CRUD (POST/GET/PATCH/DELETE /admin/store/items), public GET /store/items with active-date filter, GET /store/categories returning the category tree. New endpoint /me/economy returns exp + tokens + rank + progress. Data migration on startup copies points→exp, adds tokens=0, backfills campaign budget fields. Frontend: new /huni-guide (about screen), /store (browse + coming-soon buy), /admin/store (CRUD), simplified partner campaign create (no reward inputs), admin approval budget modal with 4 fields, rewards screen shows rank progress bar + tokens card + EXP/tokens per redemption, profile shows Lv+EXP pill + tokens pill + rank title. Settings has links to Store + Guide + Admin Store Manager. Backend verified via curl (seed+economy+categories+store item CRUD). Please test the new economy backend endpoints comprehensively."
  - agent: "testing"
    message: "Iteration 10 backend tests: 6/7 PASS initially. XP awards + rank + campaign approve-with-budget + redemption debit + store CRUD + backwards compat + role guards all PASS. One failure: depleted campaigns still appeared in GET /campaigns public feed."
  - agent: "main"
    message: "Fix applied: added `if item['state'] == 'depleted': continue` filter in list_active_campaigns after _hydrate_campaign call."
  - agent: "testing"
    message: "Re-test PASS 7/7. Depleted campaigns now hidden from public feed; partner still sees their depleted campaigns via /partner/campaigns/{id}; redemption on depleted campaign correctly blocked with 400. Iteration 10 backend fully verified."
  - agent: "main"
    message: "Bug/feature bundle: (1) QR code was using `qrcode` npm which relies on Canvas API and fails silently on native/mobile. Switched to `react-native-qrcode-svg` (with `react-native-svg`) — renders as inline SVG cross-platform. (2) User profile screen (/user/[id].tsx) now shows Lv + rank title + EXP total — /api/users/{id} already returned these via public_user(). (3) Bookmarks: new `bookmarks` collection with unique (post_id, user_id) index. Endpoints POST /api/posts/{id}/bookmark (toggle) & GET /api/me/bookmarks (list). `_hydrate_post` now returns `is_bookmarked` + `bookmark_count`. Comment-creation hook notifies all bookmarkers of a post (except commenter, post author, and parent-comment author to avoid dupes) via new notification type `bookmark_update`. PostCard has a bookmark icon in both feed and detail modes. New /bookmarks screen listed in Settings under Rewards. Notifications typeMeta updated for `bookmark_update`. Backend needs verification of the new bookmark endpoints + notification hook."
  - agent: "testing"
    message: "✅ ALL BACKEND TESTS PASSED (11/11) - Iteration 9 backend is fully functional. Tested all flows: (1) Admin promotion to partner with business info ✓, (2) Partner campaign creation with all reward types + validation ✓, (3) Admin approval/rejection with notifications ✓, (4) Public campaigns feed (only approved) ✓, (5) Partner scan with all code formats ✓, (6) Redemption flow with points, duplicate prevention (409), role guards ✓, (7) User points & history ✓, (8) Partner editing resets to pending ✓, (9) All role guards working ✓. No issues found. Backend ready for production."
  - agent: "testing"
    message: "✅ BUG FIX TESTING COMPLETE (2/2 PASS) - Tested 2 bug fixes: (1) Partner notification routes to Partner Hub (/partner) when tapping campaign_approved notification ✓, (2) Admin can review full campaign details in modal (not truncated) + reject with custom reason (cross-platform TextInput, not iOS Alert.prompt) + rejection reason persists in both list and modal ✓. All bug fixes verified and working correctly."


## Test tracking (Iteration 10)

backend:
  - task: "XP awards on user actions (daily_login, create_post, comment, react)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested XP award system: (1) Daily login awards +5 XP once per day ✓, (2) Second login same day does not award XP (daily cap working) ✓, (3) Create post awards +15 XP + first_post_bonus +10 XP once per day ✓, (4) Second post awards only +15 XP ✓, (5) Comment awards +8 XP with cap of 5/day ✓, (6) React on other user's post awards +1 XP with cap of 20/day ✓, (7) Toggle off reaction does not award XP ✓, (8) Self-react does not award XP ✓. All XP award flows working correctly with proper daily caps."
  
  - task: "Rank system (rank_for_exp, /me/economy endpoint)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested rank helper: (1) /me/economy returns complete rank structure with level, title, exp, exp_current_level, exp_next_level, progress_percent ✓, (2) Rank calculations are coherent (level >= 1, progress 0-100%, exp in expected range) ✓, (3) Rank titles are valid (New Neighbor, Resident, Regular, etc.) ✓. Rank system working correctly."
  
  - task: "Campaign budget flow (partner submit, admin approve with budgets, redemption debits)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested campaign budget flow: (1) Partner creates campaign without reward fields, status=pending, all budgets=0 ✓, (2) Admin approves with exp_per=25, tokens_per=50, budget_exp=500, budget_tokens=1000, status=approved, state=live ✓, (3) Validation: budget_exp < exp_per_redemption rejected with 422 ✓, (4) Validation: budget_tokens < tokens_per_redemption rejected with 422 ✓, (5) Partner scan shows campaign with correct rewards ✓, (6) Redemption credits user +25 EXP, +50 tokens ✓, (7) User economy updated correctly ✓, (8) Campaign budgets debited (remaining_exp=475, remaining_tokens=950) ✓, (9) Redemption appears in user's history ✓. All budget flows working correctly."
  
  - task: "Auto-pause / depleted state"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "⚠️ PARTIAL - Tested auto-pause/depleted: (1) Campaign with budget for 1 redemption created and approved ✓, (2) Redemption successful, budget depleted ✓, (3) Campaign state correctly shows 'depleted' (remaining_exp=0, remaining_tokens=0) ✓, (4) ❌ ISSUE: Depleted campaign still appears in public feed GET /campaigns (should be filtered out) - the endpoint only filters by status=approved and enabled=True, but does not filter by computed state. The campaign correctly shows state=depleted in the response, but should not appear at all. (5) Redemption attempt on depleted campaign correctly blocked with 400 ✓. FIX NEEDED: GET /campaigns endpoint should filter out campaigns where _campaign_status_effective() returns 'depleted'."
      - working: true
        agent: "testing"
        comment: "✅ PASS - RETEST SUCCESSFUL after fix. Verified depleted campaign filtering: (1) Partner created campaign 'Small budget test' with minimal budget (exp_per=100, tokens_per=100, budget_exp=100, budget_tokens=100) for exactly 1 redemption ✓, (2) Admin approved, campaign appeared in public feed with state=live ✓, (3) Partner redeemed for demo3, budget depleted to 0/0 ✓, (4) 🔑 KEY FIX VERIFIED: New user registered and GET /campaigns correctly EXCLUDED the depleted campaign from public feed ✓, (5) Partner can still view their depleted campaign via GET /partner/campaigns/{id} with state=depleted ✓, (6) Redemption attempt on depleted campaign correctly blocked with 400 'Campaign EXP budget depleted' ✓, (7) Smoke test: Non-depleted campaigns still appear in feed ✓. Fix working correctly: lines 1608-1610 in list_active_campaigns now filter out campaigns where item['state'] == 'depleted' after _hydrate_campaign."
  
  - task: "Huni Store CRUD (admin endpoints + public browse + subcategory validation)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested Huni Store: (1) GET /store/categories returns correct structure with 4 categories (appearance, seasonal, events, collections) and all subcategories ✓, (2) Admin creates store item successfully ✓, (3) Wrong subcategory validation rejected with 422 ✓, (4) Non-admin blocked from creating items with 403 ✓, (5) Admin GET /admin/store/items returns all items ✓, (6) Admin GET single item works ✓, (7) Admin PATCH updates item (price, enabled) ✓, (8) Wrong subcategory in PATCH rejected with 422 ✓, (9) Public GET /store/items does not show disabled items ✓, (10) Category filter works correctly ✓, (11) Admin DELETE removes item ✓, (12) Deleted item returns 404 ✓. All store CRUD operations working correctly."
  
  - task: "Backward compatibility (/me/points legacy alias, public_user fields)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested backward compatibility: (1) GET /me/points (legacy alias) returns points, exp, tokens, redemptions, rank ✓, (2) points === exp verified ✓, (3) GET /auth/me (public_user) includes points, exp, tokens, rank_level, rank_title ✓, (4) points === exp in public_user verified ✓. All backward compatibility working correctly."
  
  - task: "Role guards (admin/partner/user permissions)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested role guards: (1) Regular user blocked from POST /admin/store/items with 403 ✓, (2) Regular user blocked from POST /partner/campaigns with 403 ✓, (3) Regular user blocked from POST /partner/scan with 403 ✓, (4) Regular user blocked from POST /partner/redeem with 403 ✓. All role guards working correctly."

## Test tracking (Bookmarks + User Rank)

backend:
  - task: "GET /api/users/{id} includes rank fields"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested user rank fields: (1) GET /users/{demo2_id} as demo3 returns all required fields: exp, points, tokens, rank_level, rank_title ✓, (2) All fields have correct types (int for exp/points/tokens/rank_level, string for rank_title) ✓, (3) points === exp (legacy alias) verified ✓, (4) Rank data is sensible (Level 1, New Neighbor, 45 EXP, 0 tokens) ✓. User rank fields working correctly."

  - task: "POST /api/posts/{post_id}/bookmark — toggle"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested bookmark toggle: (1) POST /bookmark as demo2 on demo3's post returns {status: 'added', is_bookmarked: true} ✓, (2) GET /posts/{id} as demo2 shows is_bookmarked=true, bookmark_count=1 ✓, (3) Same GET as demo3 (owner) shows is_bookmarked=false, bookmark_count=1 ✓, (4) POST /bookmark again returns {status: 'removed', is_bookmarked: false} ✓, (5) GET shows is_bookmarked=false, bookmark_count=0 ✓, (6) POST /bookmark on unknown_id returns 404 ✓. Bookmark toggle working correctly."

  - task: "GET /api/me/bookmarks"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested my bookmarks: (1) Demo2 bookmarked 2 different posts ✓, (2) GET /me/bookmarks returns list of 2 posts ✓, (3) Posts are fully hydrated with author and is_bookmarked=true ✓, (4) Un-bookmarked one post ✓, (5) GET /me/bookmarks returns 1 post ✓. My bookmarks endpoint working correctly."

  - task: "Bookmark-watcher notification on new comment"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested bookmark notification flow: (1) Demo3 created post, demo2 bookmarked it ✓, (2) Admin posted top-level comment ✓, (3) Demo2 received NEW notification with type='bookmark_update', correct post_id, actor_alias=admin's alias, content_preview starting with '💬 New comment on a post you saved:', is_ad=false ✓, (4) Admin (commenter) did NOT receive bookmark_update notification ✓, (5) Post author (demo3) received comment notification but NOT bookmark_update (avoid dupes) ✓, (6) Reply to comment (parent_comment_id set) did NOT trigger bookmark_update ✓, (7) User bookmarking their own post and commenting did NOT receive bookmark_update ✓. All bookmark notification flows working correctly."

  - task: "Bookmarks on ad posts (notification suppression)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Verified bookmark notification suppression for ads: (1) Code review shows ads are stored in separate 'ads' collection, not 'posts' collection ✓, (2) Bookmark endpoint (line 1028) only checks 'posts' collection, so ads cannot be bookmarked (correct behavior) ✓, (3) Comment endpoint (lines 1977-1981) checks both 'posts' and 'ads' collections and sets is_ad flag ✓, (4) Bookmark notification logic (line 2052) has 'if not inp.parent_comment_id and not is_ad:' which correctly prevents bookmark_update notifications for ad posts ✓. Implementation is correct - ads cannot be bookmarked, and even if they could, the notification hook would not fire due to is_ad check."

  - task: "Role guards (bookmark endpoints require auth)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested role guards: (1) POST /posts/{id}/bookmark without auth returns 401 ✓, (2) GET /me/bookmarks without auth returns 401 ✓, (3) GET /users/{id} without auth returns 401 ✓, (4) Any authed user can bookmark any post (verified in previous tests) ✓. All role guards working correctly."

  - task: "Backward compatibility (XP awards + economy)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "✅ PASS - Tested backward compatibility: (1) POST /posts still awards XP (+15 verified) ✓, (2) GET /me/economy returns correct structure with exp, tokens, rank ✓. No regression in existing XP/economy flows."

metadata:
  test_sequence: 13
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: "Iteration 10 backend testing COMPLETE - 6/7 PASS, 1 ISSUE FOUND. Tested all economy flows: (1) XP awards on login/post/comment/react with daily caps ✓, (2) Rank system with /me/economy endpoint ✓, (3) Campaign budget flow (partner submit, admin approve with budgets, redemption debits) ✓, (4) ⚠️ Auto-pause/depleted state PARTIAL - depleted campaigns still appear in public feed (should be filtered out), (5) Huni Store CRUD with subcategory validation ✓, (6) Backward compatibility (/me/points, public_user) ✓, (7) Role guards ✓. ONE ISSUE: GET /campaigns endpoint does not filter out campaigns where state=depleted. The endpoint should check _campaign_status_effective() and exclude campaigns with state='depleted' from the public feed. All other flows working correctly."
  - agent: "testing"
    message: "✅ TEST #4 RETEST PASSED - Depleted campaign filtering fix verified. Main agent's fix (lines 1608-1610 in server.py: filter out campaigns where state=='depleted' after _hydrate_campaign) is working correctly. Comprehensive test completed: (1) Created campaign with exactly 1 redemption budget ✓, (2) Verified it appears in public feed when live ✓, (3) Redeemed to deplete budget (remaining_exp=0, remaining_tokens=0) ✓, (4) 🔑 KEY: New user registered and depleted campaign correctly EXCLUDED from GET /campaigns ✓, (5) Partner can still see depleted campaign with state=depleted ✓, (6) Redemption blocked with 400 ✓, (7) Non-depleted campaigns still visible ✓. All backend tests now PASSING (7/7). No further issues found."
  - agent: "testing"
    message: "✅ BOOKMARKS + USER RANK TESTING COMPLETE - ALL TESTS PASSED (7/7). Comprehensive testing of new bookmark and user-rank endpoints: (1) GET /users/{id} includes all rank fields (exp, points, tokens, rank_level, rank_title) with correct types ✓, (2) POST /posts/{id}/bookmark toggle works correctly (add/remove, bookmark_count updates, is_bookmarked flag) ✓, (3) GET /me/bookmarks returns fully hydrated posts ✓, (4) Bookmark-watcher notifications work correctly: top-level comments trigger notifications, replies don't, commenter/author excluded, self-bookmark excluded ✓, (5) Ad posts correctly prevent bookmark notifications (is_ad check at line 2052) ✓, (6) All endpoints require auth (401 without token) ✓, (7) Backward compatibility verified (XP awards still work) ✓. No issues found. All bookmark and rank features working as specified."
