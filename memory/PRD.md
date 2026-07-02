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

## Tech
- Backend: FastAPI · Motor (async MongoDB) · PyJWT · bcrypt · httpx · WebSockets
- Frontend: Expo SDK 54 · TypeScript · expo-router · @expo/vector-icons · expo-secure-store · expo-web-browser · react-native-safe-area-context
- Env-only credentials: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_DAYS`, `EMERGENT_SESSION_URL`, `GOOGLE_SESSION_DAYS`, `ENABLE_DEV_SEED`

## Data model
`users`, `user_sessions` (TTL), `posts`, `comments` (+`parent_comment_id`), `notifications`, `conversations`, `messages`, `blocks`, `reports`. Indexes on startup.

## Deploy checklist (v1)
- [x] `POST /api/dev/seed` gated behind `ENABLE_DEV_SEED=true`
- [x] All credentials in env files, `.env.example` provided
- [x] `README.md` with full docs
- [x] Google Auth + email auth verified end-to-end (48+ pytest, all green)
- [ ] Rotate `JWT_SECRET` in production
- [ ] Set `ENABLE_DEV_SEED=false` (or unset) in production
- [ ] Trigger native iOS/Android build for real device testing

## v2 backlog
- Image posting (base64)
- Kindness-nudge LLM at composer time
- Push notifications
- Admin/moderation dashboard
- Comment sort by score (up - down)
- Rate limiting (slowapi)
- Optional monetization: paid Pulse Spotlight for local businesses
