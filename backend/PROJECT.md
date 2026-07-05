# Huni

> An anonymous social platform built with a focus on authentic conversations, privacy, and community engagement.

---

# Project Overview

**Project Name:** Huni

**Owner:** Joseph Joe

**Project Status:** Active Development

**Current Phase:** Sprint 3 – Stabilization

**Version:** 0.3.0 (Development)

---

# Vision

> *(Write this in your own words.)*

Example:

Create a social platform where people can freely express themselves anonymously while maintaining a safe and engaging community.

---

# Mission

> *(Your personal mission for Huni.)*

Questions to answer:

- Why should someone use Huni?
- What makes it different?
- What problem are you solving?

---

# Core Features

- User Registration
- JWT Authentication
- Anonymous Profiles
- Public Feed
- Comments
- Reactions
- Realtime Chat
- Notifications
- User Profiles
- Blocking System
- WebSockets
- Image Uploads

Planned:

- Bookmarks
- Saved Posts
- Report System
- Moderator Tools
- Admin Dashboard
- Push Notifications
- Advertiser Portal (if retained)

---

# Technology Stack

## Frontend

- React Native
- Expo
- TypeScript

## Backend

- FastAPI
- Python
- Uvicorn

## Database

- MongoDB Atlas
- Motor (Async MongoDB Driver)

## Authentication

- JWT
- Google OAuth Session Support

## Realtime

- FastAPI WebSockets

## Version Control

- Git
- GitHub

---

# Folder Structure

```
backend/
frontend/
assets/
docs/
```

(Add more as the project grows.)

---

# Coding Standards

## Backend

- RESTful API
- Async functions where appropriate
- Type hints
- Pydantic models
- No duplicate logic

## Frontend

- Functional Components
- Hooks
- Context API
- TypeScript

## Database

- UUID IDs
- ISO 8601 timestamps
- Soft delete where appropriate

---

# Git Workflow

Branch Naming

```
feature/...
fix/...
refactor/...
release/...
```

Commit Format

```
feat:
fix:
refactor:
docs:
style:
test:
chore:
```

Example

```
feat: implement realtime notifications

fix: resolve websocket connection issue
```

---

# Development Workflow

1. Create issue
2. Create branch
3. Implement feature
4. Test
5. Clean debug code
6. Update requirements if needed
7. Commit
8. Push
9. Merge

---

# Sprint Progress

## Sprint 1 ✅

- Backend setup
- MongoDB Atlas
- Authentication
- User Registration
- Login

---

## Sprint 2 ✅

- Feed
- Messaging
- Notifications
- WebSocket integration
- Git workflow
- Dependency fixes

---

## Sprint 3 🚧

Current Goals

- Navigation fixes
- Keyboard issues
- Profile improvements
- UX improvements
- Loading states
- Bug fixes

---

# Known Issues

(To be maintained as an active backlog.)

Example:

- [ ] Android keyboard overlaps input
- [ ] Improve profile refresh
- [ ] Better empty states
- [ ] Loading indicators
- [ ] Notification polishing

---

# Database Collections

- users
- posts
- comments
- conversations
- messages
- notifications
- blocks
- user_sessions

(Add more when introduced.)

---

# API Modules

Authentication

```
/auth/register
/auth/login
```

Posts

```
/posts
/comments
/reactions
```

Messaging

```
/chat
/ws
```

Notifications

```
/notifications
```

---

# Security Checklist

- JWT Authentication
- Password Hashing (bcrypt)
- Environment Variables
- Protected Routes
- Input Validation

Future

- Rate Limiting
- Audit Logging
- Admin Roles
- CSRF Review
- Security Headers

---

# Future Features

- Admin Dashboard
- Moderator Dashboard
- Advertiser Dashboard
- Community Groups
- Voice Posts
- Trending Algorithm
- AI Content Moderation
- Push Notifications
- Analytics
- Email Verification

---

# Deployment

Development

Backend

```
localhost:8000
```

Frontend

```
Expo
```

Production

> *(To be decided.)*

---

# Notes

Use this section for engineering decisions and reminders.

Examples:

- Why a certain database structure was chosen
- API conventions
- Performance decisions
- Future refactors

---

# Credits

Developer

Joseph Joe

Technical Lead

ChatGPT (OpenAI)
