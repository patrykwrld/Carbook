# 🚗 Carbook

A community feedback board for car registration plates, with a light-premium design. Look up any plate and read — or leave — feedback from other drivers: praise for nice driving, warnings about careless driving, parking issues, or funny road moments.

## Features

- **Plate lookup** — search any registration plate (normalized automatically: `abc-1234` → `ABC1234`), with live search suggestions
- **Reputation score** — every plate gets a 0–100 score computed from comment sentiment and votes, shown as an animated score ring with a tier label (Excellent / Good / Neutral / Poor)
- **Leaderboards** — 🏆 Most praised, ⚠️ Most reported, and 📈 Trending this week, right on the home page
- **Comments with categories** — 👏 nice driving, ⚠️ careless driving, 🅿️ parking issue, 😄 funny moment, 💬 general
- **Photo attachments** — attach a photo to a comment; compressed client-side, capped at 500 KB, viewed in a lightbox
- **Voting & reactions** — agree/disagree votes plus quick 🔥 👍 😂 😡 reactions on every comment
- **Insights dashboard** — per-plate sentiment breakdown, 30-day activity, and category distribution as accessible inline-SVG charts
- **Sharing** — native share sheet where available, copy-link fallback
- **Community moderation** — comments can be reported; 3 reports auto-hides a comment (text, author, and photo are all redacted)
- **Rate limiting** — per-IP limits on commenting, voting, reacting, and reporting to curb spam
- **Zero-config storage** — SQLite database created automatically on first run; v1 databases migrate in place

## Quick start

```bash
npm install
npm start
```

Open http://localhost:3000. That's it — no database setup required.

For development with auto-reload:

```bash
npm run dev
```

## Configuration

| Env var   | Default        | Description               |
|-----------|----------------|---------------------------|
| `PORT`    | `3000`         | HTTP port                 |
| `DB_PATH` | `./carbook.db` | SQLite database file path |

## API

| Method | Endpoint                      | Description                                                    |
|--------|-------------------------------|----------------------------------------------------------------|
| GET    | `/api/activity`               | Latest comments across all plates                              |
| GET    | `/api/leaderboards`           | Most praised / most reported / trending plates                 |
| GET    | `/api/search?q=ABC`           | Search plates by prefix                                        |
| GET    | `/api/plates/:plate`          | Plate details, reputation, stats, and comments                 |
| GET    | `/api/plates/:plate/stats`    | Insights data: 30-day timeline, tag distribution, sentiment    |
| GET    | `/api/photos/:id`             | Photo attached to a comment                                    |
| POST   | `/api/plates/:plate/comments` | Post a comment `{author?, text, tag?, photo?}` (photo = JPEG/WebP data URL ≤ 500 KB) |
| POST   | `/api/comments/:id/vote`      | Vote `{dir: "up" | "down"}`                                    |
| POST   | `/api/comments/:id/react`     | React `{emoji}` from 🔥 👍 😂 😡                                 |
| POST   | `/api/comments/:id/report`    | Report a comment (3 reports = auto-hidden)                     |

## Tech stack

- **Backend:** Node.js + Express + better-sqlite3 (single file DB, WAL mode)
- **Frontend:** vanilla HTML/CSS/JS single-page app — no build step, self-hosted variable fonts (Fraunces + Inter), hand-rolled accessible SVG charts
- **Cost:** runs comfortably on any free tier (a single small VM or container)

## Responsible use

Carbook is a community board for road feedback, not a harassment tool. Comments are user opinions, can be reported by anyone, and are hidden automatically after repeated reports. Keep it factual and civil.
