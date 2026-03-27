# Grove

Kid-friendly curated YouTube feed. Next.js 16 + Supabase.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |

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
supabase/migrations/ # Postgres schema migrations
specs/              # Feature specs and plans
```

## Data Model

`creators` → `curated_channels` → `channels` → `videos`
- Feed uses round-robin interleaving per channel, grouped by creator
- Videos served only when `r2_synced_at IS NOT NULL` (uploaded to Cloudflare R2)
- Media URLs constructed as `${NEXT_PUBLIC_R2_PUBLIC_URL}/${media_path}` (direct R2 CDN)
- Sync pipeline lives in separate repo (`grove-sync`)

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
- `NEXT_PUBLIC_R2_PUBLIC_URL` — R2 public URL for media (frontend)

## Gotchas

- RLS is permissive (single-user POC) — all tables allow full CRUD via publishable key
- Feed loads ALL videos at once (limit 1000), then pages client-side in batches of 18
- YouTube API responses need HTML entity decoding (handled in `lib/youtube.ts`)
- `next.config.ts` whitelists YouTube image domains + `grove-media.pof4.com` for next/image
- Videos only appear in the feed when `r2_synced_at IS NOT NULL` — set by the sync consumer after R2 upload
- HLS R2 keys follow `handle/YYYY-MM/video_id/master.m3u8` with per-tier subdirectories (480p/, 720p/)
