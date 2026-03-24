# Implementation Plan: Video Sync Producer

**Branch**: `004-video-sync-producer` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-video-sync-producer/spec.md`

## Summary

Replace ytdl-sub's slow per-video metadata scraping with a YouTube Data API-driven producer that discovers videos efficiently (~200 quota units vs ytdl-sub's thousands of HTTP requests), computes a desired state per channel, and enqueues download/remove jobs into a Postgres queue. The producer uses playlistItems.list (1 unit/50 videos) + videos.list (1 unit/50 videos) for batch enrichment.

## Technical Context

**Language/Version**: Python 3.11+ (uv-managed, consistent with existing scripts)
**Primary Dependencies**: requests (HTTP), supabase-py (DB), existing .env loader
**Storage**: Supabase PostgreSQL — new `sync_queue` table + existing `videos`, `curated_channels` tables
**Testing**: pytest with parametrized tests, mocked API responses
**Target Platform**: Windows 11 (local machine, run manually or via Task Scheduler)
**Project Type**: CLI script
**Performance Goals**: Full 52-channel scan in < 2 minutes, < 500 API quota units
**Constraints**: YouTube Data API daily quota of 10,000 units
**Scale/Scope**: 52 channels, ~2500 total videos, growing ~10-20 new videos/day

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | Single-file script. No premature abstractions. |
| II. Testing Discipline | PASS | Parametrized tests for rule application, diff logic. Mocked API responses. |
| III. Fail Fast & Loud | PASS | Env vars validated at startup. API errors logged with context, channel skipped. |
| IV. Configuration as Data | PASS | Rules from DB (date_range_override) and env vars. Min duration as constant. |
| V. Code Style | PASS | Type hints on all functions. Explicit error handling. |
| VI. Anti-Patterns | PASS | No catch-all handlers. No magic strings. Specific error types. |

## Project Structure

### Source Code

```text
scripts/
├── sync_producer.py      # NEW — the producer job (this feature)
├── sync_downloads.py     # EXISTING — downloads videos + uploads to R2
├── sync_subscriptions.py # EXISTING — generates ytdl-sub subscriptions.yaml
└── sync_channels.py      # EXISTING pilot — will be superseded by sync_producer.py

supabase/migrations/
└── 20260324000001_create_sync_queue.sql  # NEW — sync_queue table

tests/
└── test_sync_producer.py  # NEW — unit tests for rule application + diff logic
```

## Research

### YouTube Data API — Uploads Playlist

**Decision**: Use `playlistItems.list` with the uploads playlist (channel ID `UC...` → playlist `UU...`) to enumerate all videos.

**Rationale**: 1 quota unit per page of 50 results. A 500-video channel costs 10 units. The `search` endpoint costs 100 units per call of 50 results — 100x more expensive.

**Limitation**: playlistItems.list returns videos in reverse-chronological order but doesn't support date filtering. We fetch all and filter client-side. This is fine because the API cost is trivial.

### Desired State Reconciliation

**Decision**: Compute `desired_set = apply_rules(all_youtube_videos)`, then diff against `db_set = videos WHERE channel_id = X`:
- `to_download = desired_set - db_set` (video IDs in desired but not in DB)
- `to_remove = db_set - desired_set` (video IDs in DB but not in desired)

**Rationale**: This is a standard reconciliation loop (like Kubernetes desired vs actual state). It naturally handles: new videos, aged-out videos, date range changes, deleted/privated videos.

### Postgres Job Queue

**Decision**: Simple `sync_queue` table with `SELECT ... FOR UPDATE SKIP LOCKED` for worker claiming.

**Rationale**: At 52 channels and ~50 new jobs per run, a Postgres table is more than sufficient. No need for Redis, RabbitMQ, or external MQ services. The queue is visible via SQL for debugging and admin dashboard integration.

## Data Model

### sync_queue (new table)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| video_id | text | YouTube video ID |
| channel_id | text | YouTube channel ID |
| action | text | `download` or `remove` |
| status | text | `pending`, `processing`, `done`, `failed` |
| priority | integer | Job priority (lower = higher priority), default 0 |
| metadata | jsonb | Video metadata from API (title, duration, thumbnail, etc.) |
| error | text | Error message if failed |
| created_at | timestamptz | When job was enqueued |
| started_at | timestamptz | When worker picked it up |
| completed_at | timestamptz | When job finished |
| attempts | integer | Retry counter, default 0 |

**Constraints**:
- UNIQUE(video_id, action) WHERE status IN ('pending', 'processing') — prevents duplicate active jobs
- Index on (status, created_at) for worker polling

### Rule Application

Per channel, the desired set is computed as:

```
all_videos = playlistItems.list(uploads_playlist)
enriched = videos.list(all_video_ids)  # duration, stats

desired_set = [
    v for v in enriched
    if v.duration_seconds >= MIN_DURATION_SECONDS (300)
    and v.duration_seconds >= 60  # exclude shorts
    and v.published_at >= channel.date_range_cutoff
]
```

Where `date_range_cutoff` is computed from `curated_channels.date_range_override` (e.g., "today-2years") or the default "today-6months".

## CLI Interface

```
uv run python scripts/sync_producer.py [OPTIONS]

Options:
  --channel CHANNEL_ID   Run for a single channel only
  --dry-run              Preview what would be enqueued, don't write
  --verbose              Show per-video decisions
```

## Producer Algorithm

```
for each curated_channel:
    1. Fetch uploads playlist (all pages)
    2. Enrich with videos.list (batches of 50)
    3. Apply rules → desired_set (set of video IDs)
    4. Query DB: existing_set = SELECT youtube_id FROM videos WHERE channel_id = X
    5. to_download = desired_set - existing_set
    6. to_remove = existing_set - desired_set
    7. INSERT INTO sync_queue (download jobs) ON CONFLICT DO NOTHING
    8. INSERT INTO sync_queue (remove jobs) ON CONFLICT DO NOTHING
    9. Log summary: {channel, desired, existing, new_downloads, removals, quota_used}
```

## Quickstart / Test Scenarios

1. **Happy path**: Run for FunQuesters (75 videos, 62 after filtering). Expect ~0 download jobs (all already in DB) and 0 remove jobs.
2. **New channel**: Add a brand-new channel to curated_channels, run producer. Expect all qualifying videos enqueued as downloads.
3. **Date range shrink**: Change a channel's date_range_override to a shorter window. Run producer. Expect remove jobs for videos now outside the window.
4. **Idempotency**: Run producer twice. Second run should enqueue zero new jobs.
5. **Dry run**: Run with --dry-run. Verify no rows written to sync_queue.
