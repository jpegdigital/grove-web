# Research: Queue Consumer

**Feature**: 006-queue-consumer
**Date**: 2026-03-24

## R1: yt-dlp Integration Approach

**Decision**: Call yt-dlp as a subprocess via `subprocess.run()`, not as a Python library import.

**Rationale**:
- yt-dlp's Python API is undocumented and considered internal — CLI is the stable interface
- Subprocess approach isolates crashes (yt-dlp segfaults, OOM) from the consumer process
- Exit codes provide clean success/failure signaling (0 = success, non-zero = failure)
- stderr captures error messages for logging without parsing internal exceptions
- Matches how ytdl-sub called yt-dlp (subprocess wrapper)

**Alternatives considered**:
- Direct Python import (`import yt_dlp`) — rejected: unstable API, couples consumer to yt-dlp internals, crashes propagate
- Shell script wrapper — rejected: loses Python ecosystem (config loading, DB access, R2 upload)

## R2: yt-dlp Format Selection & Faststart

**Decision**: Use format string `bv[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b[ext=mp4]` with `--merge-output-format mp4` and `--postprocessor-args "ffmpeg:-movflags +faststart"`.

**Rationale**:
- First choice: best mp4/h264 video + best m4a/AAC audio, merge to mp4
- Fallback: single mp4 stream if separate isn't available
- `--merge-output-format mp4` ensures consistent container regardless of source
- `--postprocessor-args "ffmpeg:-movflags +faststart"` moves moov atom to front — enables progressive download (instant playback in browsers)
- No re-encoding required — yt-dlp muxes/remuxes only (seconds, not minutes)
- Height cap at 1080p keeps file sizes manageable for kid content

**Alternatives considered**:
- webm/vp9 — rejected: less universal browser support, larger files at same quality
- 720p cap — rejected: 1080p is standard expectation, storage cost difference is minimal
- Post-download ffmpeg pass — rejected: yt-dlp's postprocessor handles faststart in the same pipeline

## R3: yt-dlp Output Template & Sidecar Files

**Decision**: Use output template `{staging_dir}/{video_id}.%(ext)s` with sidecar flags.

**Rationale**:
- Flat output in per-job staging directory: `downloads/staging/{video_id}/`
- Video: `{video_id}.mp4`
- Thumbnail: `--write-thumbnail` → `{video_id}.webp` or `.jpg` (yt-dlp chooses best available)
- Subtitles: `--write-subs --write-auto-subs --sub-langs en --sub-format vtt` → `{video_id}.en.vtt`
- Info JSON: `--write-info-json` → `{video_id}.info.json`
- Simple glob after download to find all produced files
- R2 key constructed from channel handle + published_at date, not from yt-dlp output path

**Alternatives considered**:
- Complex output template with channel/date hierarchy — rejected: unnecessary since R2 key is constructed separately
- Skip info.json — rejected: useful for debugging and metadata enrichment

## R4: yt-dlp as Dependency

**Decision**: Add `yt-dlp` to pyproject.toml dependencies. Call via `uv run yt-dlp` or `sys.executable -m yt_dlp`.

**Rationale**:
- `uv run yt-dlp` ensures the managed version is used (not a random system install)
- Adding to pyproject.toml pins version via uv.lock for reproducibility
- Using `sys.executable -m yt_dlp` is more reliable for subprocess calls from within uv-managed scripts (avoids PATH issues on Windows)
- yt-dlp updates frequently — uv makes updating easy (`uv lock --upgrade-package yt-dlp`)

**Alternatives considered**:
- System yt-dlp install — rejected: version drift, PATH issues on Windows, not reproducible
- pip install in venv — rejected: project uses uv exclusively (CLAUDE.md mandate)

## R5: R2 Upload Strategy

**Decision**: Reuse the boto3 upload pattern from sync_downloads.py. Upload files sequentially per video (media first, then sidecars).

**Rationale**:
- boto3 S3-compatible client already configured and proven in sync_downloads.py
- Sequential upload per video is simple and reliable — media file is the bottleneck anyway
- R2 key structure: `{channel_handle}/{YYYY}-{MM}/{video_id}.{ext}` (clean, flat, predictable)
- MIME type guessed from extension (same as sync_downloads.py)
- `upload_file()` handles multipart for large files automatically
- Atomic DB update (set r2_synced_at + paths) only after ALL files succeed

**Alternatives considered**:
- Parallel upload of sidecar files — rejected: marginal gain (sidecars are tiny), adds complexity
- R2 multipart upload API directly — rejected: boto3 handles this transparently via `upload_file()`

## R6: R2 Key Structure

**Decision**: `{channel_handle}/{YYYY}-{MM}/{video_id}.{ext}` where channel_handle comes from job metadata (fallback: DB lookup), YYYY-MM from published_at.

**Rationale**:
- Flat per-month directories avoid deep nesting
- Channel handle (e.g., `@3blue1brown`) is human-readable in R2 browser
- Video ID is globally unique — no collision risk
- Published date groups content chronologically for browsing
- Extension varies: `.mp4`, `.jpg`/`.webp`, `.en.vtt`, `.info.json`
- Producer stashes `channel_handle` and `published_at` in download job metadata — no extra DB query needed in happy path

**Alternatives considered**:
- Reuse ytdl-sub's nested path structure — rejected: we're dropping ytdl-sub, and the old paths were unnecessarily deep
- UUID-based keys — rejected: not human-debuggable in R2 dashboard

## R7: Queue Pickup & Locking Pattern

**Decision**: Single UPDATE...RETURNING query to atomically claim a batch of pending jobs.

**Rationale**:
- `UPDATE sync_queue SET status='processing', started_at=NOW() WHERE id IN (SELECT id FROM sync_queue WHERE status='pending' AND attempts < max_attempts ORDER BY priority DESC, created_at ASC LIMIT batch_size FOR UPDATE SKIP LOCKED) RETURNING *`
- Atomic: no race condition between SELECT and UPDATE
- `FOR UPDATE SKIP LOCKED` prevents two concurrent consumers from grabbing the same jobs
- Returns the claimed jobs in one round-trip
- Supabase doesn't support raw SQL with RETURNING easily, so this will be an RPC function

**Alternatives considered**:
- SELECT then UPDATE in two steps — rejected: race condition if two consumers run simultaneously
- Advisory locks — rejected: overkill for cron-triggered batch (unlikely concurrent runs)

## R8: Stale Lock Recovery

**Decision**: At consumer startup, reset all jobs where `status='processing' AND started_at < NOW() - stale_lock_minutes`.

**Rationale**:
- Simple UPDATE query at the start of each run
- 60-minute default timeout is generous (most downloads complete in 5-10 minutes)
- Resets to `pending` so the job re-enters the normal pickup flow
- Does NOT increment attempt count (crash wasn't the job's fault)
- Logged for visibility: "Reset N stale locks"

**Alternatives considered**:
- Increment attempt count on stale reset — rejected: penalizes jobs for infrastructure failures, not content issues
- Heartbeat mechanism — rejected: overkill for sequential processing in a batch script

## R9: Video Record Update After Download

**Decision**: Upsert the video row with metadata from yt-dlp's info.json + R2 paths, then set r2_synced_at.

**Rationale**:
- The producer may have created the queue job for a video that doesn't exist in the videos table yet (new discovery)
- Consumer must upsert: insert if new, update if existing
- Fields to set from info.json: title, description, duration_seconds, view_count, like_count, comment_count, published_at, thumbnail_url, handle, tags, categories, chapters, width, height, fps, language, webpage_url
- Fields to set from upload: media_path, thumbnail_path, subtitle_path, r2_synced_at, is_downloaded=true, downloaded_at=NOW()
- Info.json from yt-dlp is richer than YouTube API data — it includes uploader_id (handle), chapters, resolution, etc.
- Single upsert after all R2 uploads succeed — atomic from feed's perspective

**Alternatives considered**:
- Two-step: insert video row, then update with R2 paths — rejected: extra round-trip, no benefit
- Skip info.json parsing, use only metadata from queue job — rejected: loses rich metadata (chapters, resolution, etc.)

## R10: Removal Flow

**Decision**: For remove jobs, delete files from R2 using paths in job metadata, then clear r2_synced_at and media paths on the video row.

**Rationale**:
- Remove job metadata contains: `media_path`, `thumbnail_path`, `subtitle_path`, `title` (populated by producer's `fetch_existing_videos()`)
- R2 deletion: `delete_object()` per file — idempotent (succeeds even if file already gone)
- Also delete the info.json sidecar (derive key from media_path: swap extension)
- After R2 cleanup: `UPDATE videos SET r2_synced_at=NULL, media_path=NULL, thumbnail_path=NULL, subtitle_path=NULL, is_downloaded=false WHERE youtube_id=video_id`
- This makes the video invisible in the feed but preserves the row (metadata still useful)
- Delete the queue job row on success

**Alternatives considered**:
- Delete the video row entirely — rejected: loses metadata, breaks FK references, and the producer may re-discover the video
- Only clear r2_synced_at, keep paths — rejected: stale paths would confuse future operations
