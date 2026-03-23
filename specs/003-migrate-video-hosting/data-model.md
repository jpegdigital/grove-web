# Data Model: R2 Video Storage Migration

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23

## Entity Changes

### videos (modified)

**Columns added**:

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `r2_synced_at` | `timestamptz` | YES | `NULL` | Timestamp when all files for this video were uploaded to R2. NULL = not yet uploaded. |

**Columns removed** (Bunny Stream — never deployed to production):

| Column | Type | Notes |
|--------|------|-------|
| `bunny_video_id` | `text` | Bunny Stream video GUID |
| `bunny_collection_id` | `text` | Bunny Stream collection GUID |
| `bunny_status` | `integer` | Bunny processing status (0-6) |
| `bunny_uploaded_at` | `timestamptz` | Bunny upload timestamp |

**Indexes removed**:

| Index | Definition |
|-------|-----------|
| `idx_videos_bunny_pending` | `(is_downloaded) WHERE bunny_video_id IS NULL` |
| `idx_videos_bunny_video_id` | `(bunny_video_id) WHERE bunny_video_id IS NOT NULL` |

**Indexes added**:

| Index | Definition | Purpose |
|-------|-----------|---------|
| `idx_videos_r2_pending` | `(is_downloaded) WHERE r2_synced_at IS NULL AND is_downloaded = true` | Efficiently find videos that need R2 upload |
| `idx_videos_r2_synced` | `(r2_synced_at) WHERE r2_synced_at IS NOT NULL` | Feed query: only show R2-synced videos |

**Existing columns reused as R2 keys** (no changes needed):

| Column | R2 Role | Example Value |
|--------|---------|---------------|
| `media_path` | Video object key | `@funquesters/2026-03/0G7Zj6j9gQE.mp4` |
| `thumbnail_path` | Thumbnail object key | `@funquesters/2026-03/0G7Zj6j9gQE.jpg` |
| `subtitle_path` | Subtitle object key | `@funquesters/2026-03/0G7Zj6j9gQE.en.srt` |

**Derived R2 key** (not stored, computed at upload time):

| File | Key pattern | Example |
|------|------------|---------|
| info.json | `{media_path_stem}.info.json` | `@funquesters/2026-03/0G7Zj6j9gQE.info.json` |

## Feed Eligibility Rule Change

**Before**: `WHERE is_downloaded = true`
**After**: `WHERE r2_synced_at IS NOT NULL`

This affects:
- `/api/videos/feed` — main feed query
- `/api/videos/[id]` — single video lookup (should still return data but mark as unavailable if not in R2)

## State Transitions

```
Video lifecycle (R2 perspective):

  [Discovered by ytdl-sub]
         │
         ▼
  is_downloaded = false, r2_synced_at = NULL
  (known to exist on YouTube, not yet downloaded)
         │
         ▼  sync_downloads scans .info.json
  is_downloaded = true, r2_synced_at = NULL
  (on local disk, not yet in R2, NOT visible in feed)
         │
         ▼  sync_downloads uploads to R2
  is_downloaded = true, r2_synced_at = <timestamp>
  (in R2 + on local disk, VISIBLE in feed)
         │
         ▼  optional: --purge removes local files
  is_downloaded = true, r2_synced_at = <timestamp>
  (in R2 only, still VISIBLE in feed, local files gone)
```

## Environment Variables

**Added**:
- `R2_ACCOUNT_ID` — Cloudflare account ID (Python scripts)
- `R2_ACCESS_KEY_ID` — R2 API token access key (Python scripts)
- `R2_SECRET_ACCESS_KEY` — R2 API token secret (Python scripts)
- `R2_BUCKET_NAME` — R2 bucket name (Python scripts)
- `NEXT_PUBLIC_R2_PUBLIC_URL` — Public URL prefix (frontend, client-side)

**Removed**:
- `BUNNY_STREAM_LIBRARY_ID`
- `BUNNY_STREAM_API_KEY`
