# Huni — Anonymous Social App

> Honest. Local. Things.

Huni is a mobile-first anonymous discussion app aimed at communities in Buug, Zamboanga Sibugay (Philippines). Users sign up (Google or email/password), get a persistent random alias, and post thoughts by mood, run local pulse polls, comment with thumbs-up/down, react on posts, DM 1:1 in real time, and manage safety with block/report.

- **Frontend:** Expo (React Native) SDK 54 · TypeScript · expo-router
- **Backend:** FastAPI · Python 3.11 · Motor (async MongoDB)
- **Database:** MongoDB
- **Auth:** JWT (email/password) **and** Emergent-managed Google OAuth (session tokens)
- **Realtime:** WebSockets (chat + notification pings)

---

## Table of contents

1. [Repo layout](#repo-layout)
2. [Environment variables](#environment-variables)
3. [Local setup (from scratch)](#local-setup-from-scratch)
4. [Emergent platform setup](#emergent-platform-setup)
5. [Running the app](#running-the-app)
6. [Database](#database)
7. [API reference](#api-reference)
8. [Third-party integrations](#third-party-integrations)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

---

## Repo layout

```
/app
├── backend/                       # FastAPI service (port 8001)
│   ├── server.py                  # everything: models, routes, WS, seed
│   ├── requirements.txt
│   ├── .env                       # NEVER commit (see .env.example)
│   ├── .env.example
│   └── tests/                     # pytest suite
│
├── frontend/                      # Expo (React Native) app
│   ├── app/                       # expo-router routes
│   │   ├── _layout.tsx            # SafeArea + Auth + WS providers
│   │   ├── index.tsx              # redirect: welcome or (tabs)
│   │   ├── welcome.tsx            # onboarding + Google button
│   │   ├── signup.tsx             # first/last/email/birthdate/password + Google
│   │   ├── login.tsx              # email/password + Google
│   │   ├── (tabs)/                # bottom tabs
│   │   │   ├── _layout.tsx        # tabs config (Home, Alerts, Create, Messages, Profile)
│   │   │   ├── home.tsx           # Latest / Trending / Nearby / Pulse feeds
│   │   │   ├── notifications.tsx  # comments/reactions/messages
│   │   │   ├── create.tsx         # title + content + mood + audience + pulse
│   │   │   ├── messages.tsx       # conversation list
│   │   │   └── profile.tsx        # Posts | Comments toggle
│   │   ├── post/[id].tsx          # post detail + flat comments + comment thumbs
│   │   ├── chat/[id].tsx          # 1:1 chat with WS live delivery
│   │   ├── user/[id].tsx          # another user's public profile
│   │   └── settings.tsx           # block list + logout
│   │
│   ├── src/
│   │   ├── api/client.ts          # fetch wrapper + token + WS URL builder
│   │   ├── context/auth.tsx       # AuthProvider (JWT + Google session)
│   │   ├── context/ws.tsx         # WSProvider (auto-reconnect)
│   │   ├── components/            # Avatar, MoodChip, PostCard, EmptyState
│   │   ├── theme/tokens.ts        # colors, spacing, radius, moods
│   │   └── utils/storage          # unified secure storage (secure-store on native, localStorage on web)
│   ├── app.json                   # Expo config (slug: huni)
│   ├── package.json
│   ├── .env                       # NEVER commit
│   └── .env.example
│
├── memory/
│   ├── PRD.md                     # product spec
│   └── test_credentials.md        # dev-only demo accounts
│
└── README.md
```

---

## Environment variables

All secrets live in `.env` files. **Nothing is hard-coded in source.**

### `/app/backend/.env` (required)

| Key | Required | Purpose |
|-----|:--------:|---------|
| `MONGO_URL`             | ✔ | Mongo connection string (e.g. `mongodb://localhost:27017`) |
| `DB_NAME`               | ✔ | Database name (default: `huni_db`) |
| `JWT_SECRET`            | ✔ | Signing secret for email/password JWTs |
| `JWT_ALGORITHM`         | ✔ | Usually `HS256` |
| `JWT_EXPIRE_DAYS`       | ✔ | JWT lifetime in days (default: 30) |
| `EMERGENT_SESSION_URL`  | ✖ | Emergent OAuth session-data endpoint (default provided) |
| `GOOGLE_SESSION_DAYS`   | ✖ | Google session lifetime (default: 7) |

See `/app/backend/.env.example`.

### `/app/frontend/.env` (managed by the platform)

| Key | Managed by | Purpose |
|-----|-----------|---------|
| `EXPO_PUBLIC_BACKEND_URL`   | Emergent | Base URL for API + WS (do NOT edit) |
| `EXPO_PACKAGER_PROXY_URL`   | Emergent | Metro proxy (do NOT edit) |
| `EXPO_PACKAGER_HOSTNAME`    | Emergent | Metro hostname (do NOT edit) |

The frontend calls `${EXPO_PUBLIC_BACKEND_URL}/api/...` and never hardcodes a port.

---

## Local setup (from scratch)

You need **Python 3.11+**, **Node 20+ / yarn**, and a running **MongoDB 6+**.

```bash
# 1. clone
git clone <your-repo> huni && cd huni

# 2. backend
cd backend
cp .env.example .env         # edit values, esp. JWT_SECRET
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 3. frontend (new terminal)
cd ../frontend
cp .env.example .env         # only EXPO_PUBLIC_BACKEND_URL needed locally
yarn install
yarn start                   # opens Expo dev server; scan QR with Expo Go
```

Seed demo data:

```bash
curl -X POST http://localhost:8001/api/dev/seed
# → creates demo1@huni.app / demo1234 (and demo2, demo3) plus 8 sample posts
```

> `POST /api/dev/seed` is intentionally open for developer convenience. **Gate it behind an env flag before you publish.**

---

## Emergent platform setup

On the Emergent platform the app is already wired:
- Backend runs under supervisor on port `8001`, ingress routes `/api/*` → backend.
- Frontend runs under supervisor as `expo start` on port `3000`; `/*` → frontend.
- MongoDB is provisioned; `MONGO_URL` in `backend/.env` already points at it.
- `EXPO_PUBLIC_BACKEND_URL` is auto-populated for you.

If you rotate secrets, restart the process:

```bash
sudo supervisorctl restart backend
sudo supervisorctl restart expo
```

---

## Running the app

Common commands:

| Task | Command |
|------|---------|
| Restart backend | `sudo supervisorctl restart backend` |
| Restart Expo    | `sudo supervisorctl restart expo` |
| Backend logs    | `tail -f /var/log/supervisor/backend.*.log` |
| Frontend logs   | `tail -f /var/log/supervisor/expo.*.log` |
| Backend tests   | `cd /app && python -m pytest backend/tests -q` |
| Frontend lint   | `cd /app/frontend && yarn lint` |
| DB shell        | `mongosh huni_db` |
| Wipe DB         | `mongosh huni_db --eval 'db.dropDatabase()'` |
| Re-seed         | `curl -X POST http://localhost:8001/api/dev/seed` |

---

## Database

Single MongoDB database (`huni_db` by default). All collections use a custom string `id` (UUID) — `_id` is excluded from all API responses.

| Collection         | Purpose | Key fields |
|--------------------|---------|------------|
| `users`            | Accounts | `id`, `email`, `password` (bcrypt or empty for Google), `alias`, `first_name`, `last_name`, `birthdate`, `picture`, `auth_provider` (`password`/`google`), `google_id`, `helpful_score`, `post_count`, `comment_count`, `report_count`, `joined_at`, `bio`, `alias_regens`, `last_alias_regen` |
| `user_sessions`    | Google session tokens | `session_token` (unique), `user_id`, `created_at`, `expires_at` (TTL) |
| `posts`            | Feed posts | `id`, `author_id`, `title`, `content`, `mood`, `audience`, `created_at`, `reactions` (dict), `reactors` (dict), `comment_count`, `status`, `pulse_options`, `pulse_votes`, `pulse_voters` |
| `comments`         | Flat comments | `id`, `post_id`, `author_id`, `content`, `created_at`, `reactions` (up/down), `reactors`, `status` |
| `notifications`    | Alert feed | `id`, `user_id`, `type`, `actor_alias`, `post_id`, `conversation_id`, `content_preview`, `created_at`, `read` |
| `conversations`    | 1:1 chats | `id` (sorted user id join), `participants[]`, `last_message`, `last_message_at`, `created_at` |
| `messages`         | Chat messages | `id`, `conversation_id`, `sender_id`, `sender_alias`, `content`, `created_at`, `read_by[]` |
| `blocks`           | Block edges | `id`, `blocker_id`, `target_user_id`, `created_at` |
| `reports`          | Moderation queue | `id`, `reporter_id`, `target_type` (post/comment/message/user), `target_id`, `reason`, `created_at`, `status` |

Indexes are created on startup (`server.py` `on_startup`):

- `users.email`, `users.id`, `users.alias` — unique
- `posts.id` unique, `posts.created_at` desc, `posts.author_id`
- `comments.post_id`, `comments.created_at` asc
- `notifications.user_id`
- `conversations.participants`
- `messages.conversation_id`
- `blocks.(blocker_id, target_user_id)`
- `user_sessions.session_token` unique, `user_sessions.user_id`, `user_sessions.expires_at` **TTL (0s)**

### Migrations

There is no formal migration tool. Data model changes are additive (Motor + `find_one({}, {"_id": 0})` projections tolerate missing fields). For breaking changes, write a one-off script under `/app/backend/scripts/` and run it via `python scripts/<name>.py`.

Common maintenance tasks:

```bash
# drop everything and reseed (dev)
mongosh huni_db --eval 'db.dropDatabase()' && curl -X POST http://localhost:8001/api/dev/seed

# clear expired sessions (TTL does this automatically; force if needed)
mongosh huni_db --eval 'db.user_sessions.deleteMany({ expires_at: { $lt: new Date() } })'

# take a backup
mongodump --uri="$MONGO_URL" --db=huni_db --out=/tmp/huni-backup
```

---

## API reference

Base URL: `${EXPO_PUBLIC_BACKEND_URL}/api`
Auth: `Authorization: Bearer <token>` (JWT **or** Google session token — both are accepted transparently).

### Auth

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | `{ email, password, first_name, last_name, birthdate (YYYY-MM-DD) }` | Auto-generates alias. Returns `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | JWT flow |
| POST | `/auth/google/session` | `{ session_id }` | Exchanges Emergent session_id → our session_token; upserts user by email |
| POST | `/auth/logout` | — | Deletes session_token (if it is one) |
| GET  | `/auth/me` | — | Returns current public user |
| POST | `/auth/regenerate-alias` | — | 1 per 7 days |
| PATCH| `/auth/bio` | `{ bio }` | ≤200 chars |

### Posts

| Method | Path | Body / Query |
|--------|------|--------------|
| GET  | `/posts?tab=latest\|trending\|nearby\|pulse&limit=30` | — |
| POST | `/posts` | `{ title (≤100), content (≤2000), mood, audience, pulse_options[]? }` |
| GET  | `/posts/{id}` | — |
| DELETE | `/posts/{id}` | Owner only |
| POST | `/posts/{id}/react` | `{ kind: "heart"\|"helpful"\|"hug"\|"laugh" }` |
| POST | `/posts/{id}/pulse-vote` | `{ option_index }` |

### Comments

| Method | Path | Body |
|--------|------|------|
| GET | `/posts/{id}/comments` | returns `up`, `down`, `my_reaction` per comment |
| POST | `/posts/{id}/comments` | `{ content }` |
| POST | `/comments/{id}/react` | `{ kind: "up" \| "down" }` — thumbs up bumps commenter `helpful_score` |
| DELETE | `/comments/{id}` | Owner only |

### Users

| Method | Path |
|--------|------|
| GET | `/users/{id}` |
| GET | `/users/{id}/posts` |
| GET | `/users/{id}/commented-posts` — deduped, hydrated posts with `my_comment_preview` |

### Chat

| Method | Path | Body |
|--------|------|------|
| POST | `/chat/start` | `{ other_user_id }` |
| GET | `/chat/conversations` | list + unread |
| GET | `/chat/{id}/messages` | marks incoming as read |
| POST | `/chat/{id}/messages` | `{ content }` |

### Safety

| Method | Path | Body |
|--------|------|------|
| POST   | `/block` | `{ target_user_id }` |
| DELETE | `/block/{target_user_id}` | — |
| GET    | `/block` | list blocked users |
| POST   | `/report` | `{ target_type, target_id, reason }` |

### Notifications

| Method | Path |
|--------|------|
| GET | `/notifications` |
| GET | `/notifications/unread-count` |
| POST | `/notifications/read-all` |

### WebSocket

`GET wss://<host>/api/ws?token=<jwt-or-session-token>` — emits:
- `{ type: "message", conversation_id, message }`
- `{ type: "notification" }`

### Dev

| Method | Path | Notes |
|--------|------|-------|
| POST | `/dev/seed` | Creates 3 demo users + 8 posts (idempotent). **Gate before production.** |

---

## Third-party integrations

### Emergent-managed Google OAuth

- Frontend calls `signInWithGoogle()` from `src/context/auth.tsx`.
- On mobile: opens `https://auth.emergentagent.com/?redirect=<deep-link>` via `WebBrowser.openAuthSessionAsync`.
- On web: full-page redirect to the same URL; on return, the `session_id` is parsed from the URL hash and cleaned.
- Frontend POSTs `session_id` → `POST /api/auth/google/session`.
- Backend calls `EMERGENT_SESSION_URL` with `X-Session-ID`, gets `{ email, name, picture, session_token }`, upserts the user, stores the session with 7-day TTL, and returns `{ token, user }`.
- No Google Cloud Console / client-id / secret is required from you — the Emergent platform manages the OAuth app.

Config: set `EMERGENT_SESSION_URL` and `GOOGLE_SESSION_DAYS` in `backend/.env` (defaults are already correct).

### Optional / future integrations (NOT wired yet)

- **Push notifications** — Emergent-managed; needs `google-services.json` at build time.
- **Email service (Resend or SendGrid)** — for verification/reset if you add it later.
- **Image storage** — currently text-only; add later as base64 or via S3.

---

## Testing

Backend pytest suite lives in `/app/backend/tests`.

```bash
cd /app && python -m pytest backend/tests -q
```

CI-friendly. It:
- resets the DB before each test,
- calls `/api/dev/seed`,
- covers auth (email + Google session flow — the Emergent call is stubbed with `respx` where applicable),
- covers all endpoints above,
- covers WebSocket auth.

Frontend flows are exercised by the Emergent testing agent (Playwright at mobile viewport).

**Demo credentials** (created by `/api/dev/seed`): `demo1@huni.app` / `demo1234`, `demo2@huni.app`, `demo3@huni.app`.

---

## Deployment

1. **Set production `JWT_SECRET`** (long, random).
2. **Disable the seed endpoint** — wrap `/dev/seed` with `if os.environ.get("ENABLE_DEV_SEED") != "true": raise HTTPException(404)`.
3. **Rotate MongoDB credentials** and update `MONGO_URL`.
4. Click **Publish** in the Emergent dashboard (top-right) — the platform handles the deploy.
5. To generate iOS/Android builds, click Publish again and supply Apple/Google credentials when prompted. Push notifications require this native build (Expo Go can't receive them).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 Missing token` on every request | Old JWT in `expo-secure-store` after JWT_SECRET rotated | Log out; the app clears the token and re-auth works |
| Google button spins forever on web | Redirect URL does not resolve to an existing route | Ensure `/` route exists in `expo-router` (it does — this is `app/index.tsx`) |
| `Google session lookup failed` | Wrong `EMERGENT_SESSION_URL` or network egress blocked | Restore default: `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data` |
| Posts feed empty | DB was reset without seeding | `curl -X POST $EXPO_PUBLIC_BACKEND_URL/api/dev/seed` |
| WebSocket keeps reconnecting | Reverse proxy dropping idle sockets | We already ping/reconnect every 3s; verify ingress has WS enabled |
| iOS: `openAuthSessionAsync` never returns | Wrong scheme in `Linking.createURL('auth')` | Confirm `scheme` field in `app.json` matches the deep link registered with Google (Emergent handles this for you) |

---

Made with care for Buug, Zamboanga Sibugay.
