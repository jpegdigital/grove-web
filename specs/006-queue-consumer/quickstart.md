# Quickstart: Queue Consumer

**Feature**: 006-queue-consumer
**Date**: 2026-03-24

## Prerequisites

- Python 3.10+ with uv
- yt-dlp (managed via uv — added to pyproject.toml)
- ffmpeg on PATH (required by yt-dlp for muxing + faststart)
- Environment variables set in `.env` (Supabase + R2 credentials)
- Pending jobs in `sync_queue` (produced by `sync_producer.py`)

## Commands

```bash
# Standard run: process up to 50 pending jobs (downloads + removals)
uv run python scripts/sync_consumer.py

# Override batch size
uv run python scripts/sync_consumer.py --limit 100

# Preview mode: show what would be processed without doing anything
uv run python scripts/sync_consumer.py --dry-run

# Verbose output: show yt-dlp progress and per-job details
uv run python scripts/sync_consumer.py --verbose

# Process only download jobs (skip removals)
uv run python scripts/sync_consumer.py --downloads-only

# Process only removal jobs (skip downloads)
uv run python scripts/sync_consumer.py --removals-only

# Combine flags
uv run python scripts/sync_consumer.py --limit 10 --dry-run --verbose
```

## Configuration

All tunables in `config/consumer.yaml`. The consumer works with zero configuration — defaults are sensible for both backfill and steady-state.

Key settings:
- `consumer.batch_size`: 50 (jobs per run)
- `consumer.max_attempts`: 3 (retries before skipping)
- `consumer.stale_lock_minutes`: 60 (stuck job timeout)
- `consumer.throttle_seconds`: 2 (delay between downloads)
- `ytdlp.max_height`: 1080

## Scheduling

| Phase | Cron | Command |
|-------|------|---------|
| **Backfill** (~2,300 jobs) | Every 2 hours | `uv run python scripts/sync_consumer.py` |
| **Steady state** (<100 jobs/day) | Nightly at 2 AM | `uv run python scripts/sync_consumer.py` |

## Typical Output

```
=== Sync Consumer ===
Reset 0 stale locks
Claimed 50 jobs (47 downloads, 3 removals)

  [1/50] DOWNLOAD dQw4w9WgXcQ "Video Title" ... downloaded (245MB) → uploaded → done (42s)
  [2/50] DOWNLOAD abc123xyz "Another Video" ... downloaded (180MB) → uploaded → done (35s)
  ...
  [48/50] REMOVE old_video_id "Old Video" ... R2 files deleted → DB cleared → done (2s)
  ...

=== Summary ===
  Processed: 50
  Succeeded: 48
  Failed:     2
  Skipped:    0 (max attempts)
  Duration:  38m 12s
```

## Verification

After running the consumer:

1. **Videos visible in feed**: Check `SELECT count(*) FROM videos WHERE r2_synced_at IS NOT NULL`
2. **Queue drained**: Check `SELECT count(*), status FROM sync_queue GROUP BY status`
3. **R2 files exist**: Browse R2 bucket in Cloudflare dashboard
4. **Faststart works**: Open a video URL in browser — should start playing instantly without initial buffer delay
