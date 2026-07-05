## v0.2.1

### Fixed
- Realtime messaging now updates instantly using WebSockets.
- Added required WebSocket dependencies for Uvicorn.

### Changed
- Improved backend setup documentation.

CHANGE #021

File

frontend/src/components/CommentsSection.tsx

Status

🟡 MODIFY

Purpose

Separate profile navigation from thread collapsing.
Avatar/name open the user's profile.
Timestamp and reply indicator handle collapsing.
Keeps the interaction consistent with the rest of Huni.

### Changed
- Improved backend setup documentation.

CHANGE #022

File

backend/server.py
frontend/app/chat/[id].tsx

Status

DONE

Purpose

indicators in chat when blocked or when you block someone
indicators that you cannot chat someone if status is blocked