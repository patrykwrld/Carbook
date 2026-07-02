# Carbook

**Comment on cars, not people.** Carbook is a community app where anyone can look up a car's registration plate and leave a comment — a compliment on a clean build, a heads-up about headlights left on, a "nice parking job" (sincere or otherwise).

Think of it as a guestbook for every car on the road.

## Status

🏗️ **Pre-build.** The repository was intentionally reset to a clean slate. The full build plan lives in [`BLUEPRINT.md`](./BLUEPRINT.md) — read that first before writing any code.

## Stack (decided, do not re-litigate)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS + Framer Motion |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) |
| Hosting | Vercel |
| Provisioning | Supabase & Vercel MCP connectors (already authenticated in this workspace) |

## Design direction

Cinematic and smooth: dark, automotive, motion-first. Full spec in `BLUEPRINT.md` §7.
