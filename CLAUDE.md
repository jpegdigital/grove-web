# PradoTube

Kid-friendly curated YouTube feed. Next.js 16 + Supabase + ytdl-sub.

## CRITICAL

- **ALWAYS use `uv run` for Python scripts. NEVER use naked `python` or `pip`.** This project uses uv for Python dependency management. Example: `uv run python scripts/sync_downloads.py`, NOT `python scripts/sync_downloads.py`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `uv run python scripts/sync_downloads.py` | Scan ytdl-sub downloads into Supabase |
| `uv run python scripts/sync_subscriptions.py` | Sync YouTube channel metadata |

## Architecture

```
src/
  app/              # Next.js App Router pages + API routes
    api/            # REST endpoints (videos, channels, creators, youtube, media)
    admin/          # Admin panel for managing creators/channels
    c/[slug]/       # Creator-filtered feed
    v/[id]/         # Video player
    feed/           # Main feed (all videos)
  components/       # React components (feed-view, video-card, creator-chips, ui/)
  hooks/            # Custom React hooks
  lib/              # Supabase client, YouTube API wrapper, utils
scripts/            # Python sync scripts (ytdl-sub → Supabase)
supabase/migrations/ # Postgres schema migrations
specs/              # Feature specs and plans
```

## Data Model

`creators` → `curated_channels` → `channels` → `videos`
- Feed uses round-robin interleaving per channel, grouped by creator
- Videos served only when `is_downloaded = true` (synced from ytdl-sub library)
- `/api/media/[...path]` streams local files with range request support

## Code Style

- Files: kebab-case (`feed-view.tsx`). Components: PascalCase
- Path aliases: `@/components`, `@/lib`, `@/hooks`
- shadcn/ui (base-nova style) + Tailwind CSS v4
- Client components use `"use client"` directive
- React Query for server state (5min stale time), useState for local state
- Fredoka (headings) + Nunito (body) fonts; bright Duolingo-ABC-inspired palette

## Environment

- `YOUTUBE_API_KEY` — YouTube Data API v3
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Client-side key
- `SUPABASE_SECRET_KEY` — Server-side secret
- `DATABASE_URL` — Postgres connection string

## Gotchas

- **Python = uv run.** No exceptions. No naked python/pip.
- RLS is permissive (single-user POC) — all tables allow full CRUD via publishable key
- Feed loads ALL videos at once (limit 1000), then pages client-side in batches of 18
- `/api/media/[...path]` has path traversal protection + extension whitelist (.mp4, .webm, .mkv, .jpg, .jpeg, .png, .json)
- YouTube API responses need HTML entity decoding (handled in `lib/youtube.ts`)
- `next.config.ts` whitelists YouTube image domains for next/image
