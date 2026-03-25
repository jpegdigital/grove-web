# sync_consumer.py — Queue Consumer & Media Pipeline

Processes download and removal jobs from `sync_queue`. Downloads videos via yt-dlp, uploads media + sidecars to Cloudflare R2, upserts video records into Supabase, and handles removal of obsolete content.

## Usage

```bash
uv run python scripts/sync_consumer.py                    # process up to 50 jobs
uv run python scripts/sync_consumer.py --limit 100         # override batch size
uv run python scripts/sync_consumer.py --dry-run --verbose  # preview without side effects
uv run python scripts/sync_consumer.py --downloads-only     # skip removal jobs
uv run python scripts/sync_consumer.py --removals-only      # skip download jobs
```

## Pipeline Overview

```
              sync_queue
                  │
    ┌─────────────┼─────────────┐
    │                           │
  action=download          action=remove
    │                           │
    ▼                           ▼
  yt-dlp subprocess         R2 delete_object
    │                           │
    ▼                           ▼
  Upload to R2              Clear video record
    │                       (r2_synced_at=NULL)
    ▼                           │
  Upsert video record           ▼
  (r2_synced_at=NOW)        Delete queue job
    │
    ▼
  Delete queue job
```

## Download Pipeline (HLS)

Each download job goes through these steps:

```
1. Create staging dir         ──→  downloads/staging/{video_id}/
2. Download 4 quality tiers   ──→  yt-dlp × 4 (360p, 480p, 720p, 1080p) + sidecars with highest tier
3. Resolve channel handle     ──→  from job metadata, fallback to DB lookup
4. Parse info.json            ──→  extract rich metadata (chapters, resolution, etc.)
5. Remux each tier → HLS      ──→  ffmpeg -c copy → fMP4 segments per tier
6. Generate master playlist   ──→  master.m3u8 with all available variants
7. Clean up legacy MP4        ──→  delete old .mp4 from R2 if re-processing
8. Upload HLS package to R2   ──→  {handle}/{YYYY}-{MM}/{video_id}/master.m3u8 + tiers
9. Upsert video record        ──→  metadata + .m3u8 path + r2_synced_at (makes video visible)
10. Delete queue job          ──→  job removed on success
11. Cleanup staging           ──→  always runs (finally block)
```

**Tier download**: Each tier is a separate yt-dlp invocation with a height-specific format selector (`bv[height<=N][ext=mp4]+ba[ext=m4a]`). Randomized throttle (2-5s) between downloads.

**Remux**: `ffmpeg -c copy` repackages MP4 into HLS fMP4 segments (6s target). Near-instant (seconds per file), no re-encoding, no quality loss.

**Missing tiers**: If YouTube doesn't offer all 4 tiers in H.264, the consumer skips unavailable tiers and produces an HLS package with what's available (minimum 1 tier required).

**On failure**: The job's `attempts` counter increments, `error` is recorded, and the job returns to `pending` status. Jobs exceeding `max_attempts` (default 3) are permanently skipped.

### yt-dlp Configuration

The consumer calls yt-dlp as a subprocess (never imported as a library — the CLI is the stable interface). Key settings from `config/consumer.yaml`:

| Setting | Value | Purpose |
|---------|-------|---------|
| Format | `bv[height<=1080][ext=mp4]+ba[ext=m4a]` | Best mp4 video + AAC audio, merge to mp4 |
| Faststart | `ffmpeg:-movflags +faststart` | Moves moov atom to front for instant browser playback |
| Sidecars | `--write-thumbnail --write-subs --write-auto-subs --write-info-json` | Thumbnail, English subtitles, metadata |
| Height cap | 1080p | Keeps file sizes manageable for kid content |

### R2 Key Structure (HLS)

HLS-processed videos use a folder-per-video structure:

```
@3blue1brown/
  2024-03/
    dQw4w9WgXcQ/
      master.m3u8          # Entry point — lists all quality variants
      360p/
        init.mp4           # fMP4 initialization segment
        playlist.m3u8      # Variant playlist
        seg_000.m4s        # Media segments (6s each)
        seg_001.m4s
        ...
      480p/
        ...
      720p/
        ...
      1080p/
        ...
      thumb.jpg            # Thumbnail
      subs.en.vtt          # Subtitles
```

Legacy MP4-only videos (not yet re-processed) still use the flat structure: `@handle/YYYY-MM/video_id.ext`

Content-Types: `.m3u8` → `application/vnd.apple.mpegurl`, `.m4s`/`.mp4` → `video/mp4`
Cache-Control: Segments get `immutable` (VOD content), playlists get 1hr TTL

### Video Record Upsert

After all R2 uploads succeed, the consumer upserts a single row into the `videos` table. Fields set from yt-dlp's info.json are richer than what the YouTube API provides — including chapters, resolution, FPS, and language.

The key visibility field is `r2_synced_at`: the feed query filters `WHERE r2_synced_at IS NOT NULL`, so setting this field is what makes a video appear in the feed.

## Removal Pipeline

```
1. Delete R2 files            ──→  media + thumbnail + subtitle + info.json
2. Clear video record         ──→  r2_synced_at=NULL, paths=NULL, is_downloaded=false
3. Delete queue job           ──→  job removed on success
```

R2 deletion is idempotent — `NoSuchKey` errors are tolerated (the file may already be gone). The video row is preserved (metadata is still useful), but `r2_synced_at = NULL` makes it invisible in the feed.

## Queue Mechanics

### Job Claiming

The consumer uses the `claim_consumer_jobs` RPC function for atomic batch pickup:

```sql
UPDATE sync_queue SET status='processing', started_at=NOW()
WHERE id IN (
    SELECT id FROM sync_queue
    WHERE status='pending' AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` prevents two concurrent consumers from grabbing the same jobs.

### Stale Lock Recovery

At startup, before claiming jobs, the consumer calls `reset_stale_consumer_locks` to recover jobs stuck in `processing` beyond the timeout (default 60 minutes). These are reset to `pending` without incrementing the attempt counter — the crash wasn't the job's fault.

### Job Lifecycle

```
Producer inserts ──→ [pending]
                        │
Consumer claims  ──→ [processing]  (started_at = NOW())
                        │
              ┌─────────┴──────────┐
           Success              Failure
              │                    │
        DELETE row           [pending] (attempts += 1)
                                   │
                           attempts >= max?
                              │         │
                             Yes        No
                              │         │
                        Permanently   Re-eligible
                         skipped     for pickup
```

## Configuration

All tunables in `config/consumer.yaml`:

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `consumer` | `batch_size` | 50 | Jobs claimed per run |
| `consumer` | `max_attempts` | 3 | Retries before permanent skip |
| `consumer` | `stale_lock_minutes` | 60 | Timeout for stuck jobs |
| `consumer` | `throttle_min_seconds` | 2 | Min delay between jobs |
| `consumer` | `throttle_max_seconds` | 5 | Max delay between jobs |
| `hls` | `tiers` | 360p/480p/720p/1080p | Quality tiers to download |
| `hls` | `segment_duration` | 6 | Target HLS segment length (seconds) |
| `hls` | `segment_type` | fmp4 | Segment format (fmp4 or mpegts) |
| `hls` | `min_tiers` | 1 | Minimum tiers for valid HLS package |
| `ytdlp` | `max_height` | 1080 | Video height cap |
| `ytdlp` | `faststart` | true | Enable moov atom reordering |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Server-side Supabase key |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API token secret |
| `R2_BUCKET_NAME` | Yes | R2 bucket name |

Missing variables cause an immediate exit with a clear error message.

## Scheduling

| Phase | Frequency | Command | Rationale |
|-------|-----------|---------|-----------|
| **Backfill** (~2,300 jobs) | Every 2 hours | `uv run python scripts/sync_consumer.py` | Work through initial queue |
| **Steady state** (<100 jobs/day) | Nightly at 2 AM | `uv run python scripts/sync_consumer.py` | Process daily producer output |

## Relationship to Producer

The producer and consumer form a decoupled pipeline:

```
Producer (decides WHAT)          Queue              Consumer (does the WORK)
┌─────────────────────┐    ┌──────────────┐    ┌─────────────────────────┐
│ YouTube API          │    │              │    │                         │
│ → discover videos    │───▶│  sync_queue  │───▶│ yt-dlp → R2 → Supabase │
│ → score & rank       │    │              │    │                         │
│ → diff desired/exist │    │ download     │    │ Download: fetch + upload│
│ → enqueue jobs       │    │ remove       │    │ Remove: delete + clear  │
└─────────────────────┘    └──────────────┘    └─────────────────────────┘
```

**Producer** runs against the YouTube API (lightweight, fast, quota-limited). It never downloads video files or touches R2.

**Consumer** runs against YouTube servers (yt-dlp) and R2 (boto3). It never calls the YouTube Data API or makes content decisions.

The queue decouples them: the producer can run frequently (daily) with low quota cost, while the consumer processes the backlog at its own pace. If the consumer crashes mid-run, stale lock recovery ensures no jobs are permanently lost.
