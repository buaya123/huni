# Huni — Product Requirements (v1)

## Concept
Anonymous, mobile-first discussion app for Buug, Zamboanga Sibugay (Philippines) and nearby. Persistent alias, mood-tagged posts, flat comments with replies, thumbs on comments, 1:1 realtime chat, local pulse polls, safety-first.

## Positioning
> Honest. Local. Things.

## v1 features (shipped)
- **Auth** — email/password JWT (first/last/birthdate/email/password) **and** hosted Google OAuth. Unified bearer accepts either token.
- **Persistent alias** — auto-generated on signup, regeneratable once per 7 days.
- **Feed** — 4 tabs: Latest · Trending · Nearby · Pulse. Blocked authors excluded.
- **Post composer** — title (≤100) + content (≤2000) + 9 mood tags + audience (Public/Nearby) + optional Pulse poll options.
- **Feed card** — title bold+bigger, content preview clipped with "...", one-liner top-3 reactions summary. Tap → detail to react.
- **Post detail** — full content, 4 reactions (heart/helpful/hug/laugh), flat comments with replies, comment thumbs 👍👎 (up bumps commenter helpful_score).
- **Comment replies** — flat structurally; each reply carries `parent_comment_id` and shows a "replying to @X" chip.
- **1:1 chat** — WebSockets, block-aware, read receipts, unread badges.
- **Notifications** — comment / reply / reaction / message with unread badge.
- **Profile** — Posts | Comments toggle (Comments shows original threads deduped). Pull-to-refresh only (no auto-refresh). Bio + helpful/posts/comments stats. Logout via Settings only.
- **Settings** — block list with inline unblock, privacy notes, logout.
- **Safety** — block, report (post/comment/message/user), kindness banner on composer.

## v1.1 features (shipped post-launch)
- **Reddit-style threaded comments** — indent rails (max 3 visual levels), collapsible threads with "X replies" pill, top comments sorted by score. Shared `CommentsSection` component (posts + ads).
- **Image uploads** — up to 4 images per post AND per comment (image-only comments allowed). Gallery-only picker, resize 1080px/jpeg 0.7, base64 in Mongo (`images` collection), served via `GET /api/images/{id}`. Reddit-style paging carousel (1/N counter, dots, fullscreen viewer).
- **Ads system (monetization)** — roles `user|advertiser|admin` (`ADMIN_EMAILS` env bootstraps admins; admin promotes advertisers). Ads = sponsored posts with business name (not alias), title, content, images, link. Weighted feed injection (weight 1-10, global "1 ad every N posts" admin setting, no ads in Pulse tab). Impression/click tracking. Advertiser Ad Manager (`/ads`): create/toggle/delete ads, analytics (totals, unique viewers, 14-day daily chart, click timestamps). Ad comments reusable with enable/disable + owner moderation delete. Admin panel (`/admin`): ad density, role management, all-ads toggles. No payments (manual/offline deals for now).

## Tech
- Backend: FastAPI · Motor (async MongoDB) · PyJWT · bcrypt · httpx · WebSockets
- Frontend: Expo SDK 54 · TypeScript · expo-router · @expo/vector-icons · expo-secure-store · expo-web-browser · react-native-safe-area-context
- Env-only credentials: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_DAYS`, `EMERGENT_SESSION_URL`, `GOOGLE_SESSION_DAYS`, `ENABLE_DEV_SEED`

## Data model
`users` (+`role`), `user_sessions` (TTL), `posts` (+`image_ids`), `comments` (+`parent_comment_id`, `image_ids`), `images`, `ads`, `ad_events`, `settings`, `notifications` (+`is_ad`), `conversations`, `messages`, `blocks`, `reports`. Indexes on startup.

## Deploy checklist (v1)
- [x] `POST /api/dev/seed` gated behind `ENABLE_DEV_SEED=true`
- [x] All credentials in env files, `.env.example` provided
- [x] `README.md` with full docs
- [x] Google Auth + email auth verified end-to-end (48+ pytest, all green)
- [ ] Rotate `JWT_SECRET` in production
- [ ] Set `ENABLE_DEV_SEED=false` (or unset) in production
- [ ] Trigger native iOS/Android build for real device testing

## v2 backlog
- Kindness-nudge LLM at composer time
- Push notifications
- Comment sort options (currently score-first default)
- Rate limiting (slowapi)
- Share link placeholder on post detail
- Ad payments (Stripe/PayPal) when moving past manual deals
- Set real owner email in `ADMIN_EMAILS` (currently demo1@huni.app)
