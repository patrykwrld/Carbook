# 🚗 Carbook

A community feedback board for car registration plates. Look up any plate and read — or leave — feedback from other drivers: praise for nice driving, warnings about careless driving, parking issues, or funny road moments.

## Features

- **Plate lookup** — search any registration plate (normalized automatically: `abc-1234` → `ABC1234`), with live search suggestions
- **Comments with categories** — 👏 nice driving, ⚠️ careless driving, 🅿️ parking issue, 😄 funny moment, 💬 general
- **Voting** — agree/disagree on comments; best-rated feedback rises to the top
- **Community moderation** — comments can be reported; 3 reports auto-hides a comment
- **Recent activity feed** — see the latest comments across all plates
- **Rate limiting** — per-IP limits on commenting, voting, and reporting to curb spam
- **Zero-config storage** — SQLite database created automatically on first run

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

| Method | Endpoint                     | Description                                  |
|--------|------------------------------|----------------------------------------------|
| GET    | `/api/activity`              | Latest comments across all plates            |
| GET    | `/api/search?q=ABC`          | Search plates by prefix                      |
| GET    | `/api/plates/:plate`         | Plate details, stats, and comments           |
| POST   | `/api/plates/:plate/comments`| Post a comment `{author?, text, tag?}`       |
| POST   | `/api/comments/:id/vote`     | Vote `{dir: "up" | "down"}`                  |
| POST   | `/api/comments/:id/report`   | Report a comment (3 reports = auto-hidden)   |

## Tech stack

- **Backend:** Node.js + Express + better-sqlite3 (single file DB, WAL mode)
- **Frontend:** vanilla HTML/CSS/JS single-page app — no build step
- **Cost:** runs comfortably on any free tier (a single small VM or container)

## Responsible use

Carbook is a community board for road feedback, not a harassment tool. Comments are user opinions, can be reported by anyone, and are hidden automatically after repeated reports. Keep it factual and civil.
