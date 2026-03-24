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
| `uv run python scripts/sync_downloads.py` | Scan ytdl-sub downloads into Supabase + upload to R2 |
| `uv run python scripts/sync_downloads.py --limit 50` | Upload up to 50 videos to R2 per run |
| `uv run python scripts/sync_downloads.py --skip-r2` | DB sync only (skip R2 upload) |
| `uv run python scripts/sync_downloads.py --purge` | Delete local files after R2 upload (opt-in) |
| `uv run python scripts/sync_subscriptions.py` | Sync YouTube channel metadata |
| `uv run python scripts/sync_producer.py` | Discover new videos + identify removals via YouTube API |
| `uv run python scripts/sync_producer.py --channel UC...` | Run for a single channel only |
| `uv run python scripts/sync_producer.py --dry-run` | Preview queue operations without writing |
| `uv run python scripts/sync_producer.py --verbose` | Show per-video decisions |

## Architecture

```
src/
  app/              # Next.js App Router pages + API routes
    api/            # REST endpoints (videos, channels, creators, youtube)
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
- Videos served only when `r2_synced_at IS NOT NULL` (uploaded to Cloudflare R2)
- Media URLs constructed as `${NEXT_PUBLIC_R2_PUBLIC_URL}/${media_path}` (direct R2 CDN)

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
- `R2_ACCOUNT_ID` — Cloudflare account ID (Python scripts)
- `R2_ACCESS_KEY_ID` — R2 API token access key (Python scripts)
- `R2_SECRET_ACCESS_KEY` — R2 API token secret (Python scripts)
- `R2_BUCKET_NAME` — R2 bucket name (Python scripts)
- `NEXT_PUBLIC_R2_PUBLIC_URL` — R2 public URL for media (frontend)

## Gotchas

- **Python = uv run.** No exceptions. No naked python/pip.
- RLS is permissive (single-user POC) — all tables allow full CRUD via publishable key
- Feed loads ALL videos at once (limit 1000), then pages client-side in batches of 18
- YouTube API responses need HTML entity decoding (handled in `lib/youtube.ts`)
- `next.config.ts` whitelists YouTube image domains + `*.r2.dev` for next/image
- `sync_downloads.py` uploads media/thumbnail/subtitle/info.json to R2 using boto3 S3-compatible API
