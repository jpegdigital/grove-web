# PradoTube

Kid-friendly curated YouTube feed. Next.js 16 + Supabase + yt-dlp.

## CRITICAL

- **ALWAYS use `uv run` for Python scripts. NEVER use naked `python` or `pip`.** Example: `uv run python scripts/sync_producer.py`, NOT `python scripts/sync_producer.py`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

## Sync Pipeline

The video pipeline has two scripts that run in order: **producer** → **consumer**.

### Producer — discovers videos, enqueues jobs

Queries the YouTube API, scores videos, diffs desired vs existing catalog, writes download/remove jobs to `sync_queue`.

```bash
uv run python scripts/sync_producer.py                  # daily: recent playlist only (~326 quota)
uv run python scripts/sync_producer.py --mode full       # weekly: popular + rated + recent (~5,500 quota)
uv run python scripts/sync_producer.py --channel UC...   # single channel
uv run python scripts/sync_producer.py --dry-run         # preview, no writes
uv run python scripts/sync_producer.py --verbose         # per-video scoring detail
```

### Consumer — processes jobs from the queue

Picks pending jobs from `sync_queue`, downloads 2 quality tiers (480p/720p) via yt-dlp, remuxes each into HLS fMP4 segments via `ffmpeg -c copy`, generates master.m3u8, uploads the HLS package to R2, and upserts video records. Also handles removals (delete R2 files, clear video record).

**Requires**: ffmpeg on PATH (for HLS remux)

```bash
uv run python scripts/sync_consumer.py                   # process up to 50 jobs (HLS pipeline)
uv run python scripts/sync_consumer.py --limit 100        # override batch size
uv run python scripts/sync_consumer.py --dry-run          # preview, no side effects
uv run python scripts/sync_consumer.py --verbose           # per-tier download + remux progress
uv run python scripts/sync_consumer.py --downloads-only    # skip removal jobs
uv run python scripts/sync_consumer.py --removals-only     # skip download jobs
```

#### One-time R2 CORS setup (required for HLS playback)

```bash
uv run python scripts/configure_r2_cors.py               # apply CORS rules to R2 bucket
uv run python scripts/configure_r2_cors.py --dry-run      # preview CORS configuration
```

### Other

```bash
uv run python scripts/sync_subscriptions.py               # sync YouTube channel metadata
```

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
- Videos only appear in the feed when `r2_synced_at IS NOT NULL` — the consumer sets this after R2 upload
- Producer never downloads files or touches R2; consumer never calls YouTube API — they communicate via `sync_queue`
- Consumer calls yt-dlp via subprocess (never `import yt_dlp`) — CLI is the stable interface
- HLS R2 keys follow `@handle/YYYY-MM/video_id/master.m3u8` with per-tier subdirectories (480p/, 720p/)
- Legacy MP4 files in R2 are orphaned — no DB rows reference them
- Config lives in `config/producer.yaml` and `config/consumer.yaml` — no magic numbers in scripts
- HLS config (tiers, segment_duration, min_tiers) is in `config/consumer.yaml` under the `hls:` section
- See `docs/architecture/` for detailed pipeline docs
