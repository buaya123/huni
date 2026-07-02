# Sibug — Product Requirements

## Product concept
Sibug is a mobile-first anonymous social app for the Buug/Zamboanga Sibugay community in the Philippines. Users get a persistent alias, share thoughts by mood, run local pulse polls, comment (flat), react, and chat 1:1 — safely and anonymously.

## Positioning
"Ask honestly. Share freely. Stay anonymous. Respect others."

## MVP features implemented
- **Auth**: email/password JWT + auto-generated persistent alias (regeneratable once per 7 days)
- **Home feed** with 4 tabs: Latest · Trending · Nearby · Pulse
- **Create Post** with 9 mood tags + audience (Public/Nearby) + Pulse polls
- **Post detail** with flat comments and 4-emoji reactions (heart, helpful, hug, laugh)
- **Pulse polls** with tap-to-vote and live percentages
- **Notifications tab** (comments/reactions/messages) with unread badge
- **1:1 realtime chat** via WebSockets (reconnects automatically)
- **Profile** with alias, helpful score, posts, comments, bio, join date, recent posts
- **Settings** with block list (unblock inline), privacy notes, logout
- **Safety**: report post/comment/user, block user, kindness disclaimer on post composer
- **Persistent alias** with locked identity (7-day cooldown to regenerate)

## Tech stack
- Backend: FastAPI + Motor (async MongoDB), PyJWT, bcrypt, WebSockets
- Frontend: Expo Router (React Native, SDK 54), TypeScript, `@expo/vector-icons` (Ionicons), `react-native-safe-area-context`, `react-native-gesture-handler`, `expo-secure-store`, `AsyncStorage`
- Design: Warm coral (#F06543) accent on cream (#FBF9F6) surface, Bento rounded cards, pill mood chips.

## Backend endpoints (all under `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/regenerate-alias`, `PATCH /auth/bio`
- `POST /posts`, `GET /posts?tab=`, `GET /posts/{id}`, `DELETE /posts/{id}`, `POST /posts/{id}/react`, `POST /posts/{id}/pulse-vote`
- `GET /posts/{id}/comments`, `POST /posts/{id}/comments`, `DELETE /comments/{id}`
- `GET /notifications`, `POST /notifications/read-all`, `GET /notifications/unread-count`
- `GET /users/{id}`, `GET /users/{id}/posts`
- `POST /chat/start`, `GET /chat/conversations`, `GET /chat/{id}/messages`, `POST /chat/{id}/messages`
- `POST /block`, `DELETE /block/{target_id}`, `GET /block`, `POST /report`
- `WS /ws?token=` for realtime chat + notification pings
- `POST /dev/seed` for demo data

## Monetization ideas (anonymity-safe)
1. Local business "Pulse spotlight" — a business can buy a highlighted pulse poll slot (no user targeting).
2. Optional supporter tier for badges + longer post length (no ads, aliases still anonymous).
3. Anonymous classifieds inside the "Buy/Sell" mood (per-post promotion fee).

## Launch strategies for Buug
1. Seed content via local college groups.
2. Distribute physical QR posters at the Buug plaza, coffee shops, terminals.
3. Barangay-style "ask anything" livestreams that pull top pulse questions.
4. Partner with local FB pages to cross-promote confessions & safety alerts.
5. Local moderators recruited from long-time helpful-score users.

## Risks & mitigations
1. Trolls & harassment → block/report + rate limiting (ready in backend structure).
2. Doxxing → moderation-ready reports + explicit warning at composer.
3. Slow low-end Android → no blur, no gradients on lists, solid surfaces.
4. Empty-feed cold start → seed script + local moderator posts.
5. Legal concerns (Safety Concern posts) → moderation queue + admin architecture ready.

## v2 features to add later
- Image posting (base64) with NSFW filter
- School/work circle audience
- Real-time typing indicators in chat
- Toxicity nudge (kindness friction) via LLM
- Public admin/moderation dashboard
