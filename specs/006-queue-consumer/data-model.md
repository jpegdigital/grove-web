# Data Model: Queue Consumer

**Feature**: 006-queue-consumer
**Date**: 2026-03-24

## Entities

### sync_queue (existing — no schema changes needed)

The queue table is already designed for consumer use. All required columns exist.

| Column | Type | Consumer Usage |
|--------|------|---------------|
| `id` | uuid PK | Job identifier for updates |
| `video_id` | text NOT NULL | YouTube video ID to download/remove |
| `channel_id` | text NOT NULL | Channel owning the video |
| `action` | text NOT NULL | `'download'` or `'remove'` |
| `status` | text NOT NULL | Consumer transitions: `pending` → `processing` → (deleted on success) |
| `priority` | integer | Pickup ordering (DESC) |
| `metadata` | jsonb | Rich context — different per action type (see below) |
| `error` | text | Last failure message (set by consumer) |
| `created_at` | timestamptz | Pickup ordering (ASC within same priority) |
| `started_at` | timestamptz | Set when consumer claims job; used for stale lock detection |
| `completed_at` | timestamptz | Not used — consumer deletes on success |
| `attempts` | integer | Incremented on failure; jobs skipped when >= max_attempts |

**Indexes** (existing):
- `idx_sync_queue_active_job` — partial unique on `(video_id, action) WHERE status IN ('pending', 'processing')`
- `idx_sync_queue_status_created` — composite on `(status, created_at)` for pickup queries

### metadata jsonb Structure

**Download jobs** (populated by producer):
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Video Title",
  "published_at": "2024-03-15T10:00:00Z",
  "description": "...",
  "thumbnail_url": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "duration_seconds": 245,
  "duration_iso": "PT4M5S",
  "view_count": 150000,
  "like_count": 8500,
  "comment_count": 320,
  "_score": 4.72,
  "source_tags": ["popular", "recent"]
}
```

**Remove jobs** (populated by producer):
```json
{
  "youtube_id": "dQw4w9WgXcQ",
  "media_path": "@handle/2024-03/dQw4w9WgXcQ.mp4",
  "thumbnail_path": "@handle/2024-03/dQw4w9WgXcQ.jpg",
  "subtitle_path": "@handle/2024-03/dQw4w9WgXcQ.en.vtt",
  "title": "Video Title"
}
```

### videos (existing — no schema changes needed)

Consumer updates these columns after successful download + R2 upload:

| Column | Set By Consumer | Value |
|--------|----------------|-------|
| `title` | Yes | From yt-dlp info.json |
| `description` | Yes | From info.json |
| `thumbnail_url` | Yes | From info.json |
| `published_at` | Yes | From info.json |
| `duration_seconds` | Yes | From info.json |
| `view_count` | Yes | From info.json |
| `like_count` | Yes | From info.json |
| `comment_count` | Yes | From info.json |
| `tags` | Yes | From info.json |
| `categories` | Yes | From info.json |
| `chapters` | Yes | From info.json (as jsonb) |
| `width` | Yes | From info.json |
| `height` | Yes | From info.json |
| `fps` | Yes | From info.json |
| `language` | Yes | From info.json |
| `webpage_url` | Yes | From info.json |
| `handle` | Yes | `uploader_id` from info.json |
| `media_path` | Yes | R2 key for video file |
| `thumbnail_path` | Yes | R2 key for thumbnail |
| `subtitle_path` | Yes | R2 key for subtitle (nullable) |
| `is_downloaded` | Yes | `true` |
| `downloaded_at` | Yes | `NOW()` |
| `r2_synced_at` | Yes | `NOW()` (makes video visible in feed) |
| `info_json_synced_at` | Yes | `NOW()` |

Consumer clears these columns on removal:

| Column | Set By Consumer | Value |
|--------|----------------|-------|
| `media_path` | Yes | `NULL` |
| `thumbnail_path` | Yes | `NULL` |
| `subtitle_path` | Yes | `NULL` |
| `r2_synced_at` | Yes | `NULL` (makes video invisible in feed) |
| `is_downloaded` | Yes | `false` |

## State Transitions

### Queue Job Lifecycle

```
Producer inserts ──→ [pending]
                        │
Consumer picks batch ──→ [processing]  (started_at = NOW())
                        │
              ┌─────────┴──────────┐
              │                    │
           Success              Failure
              │                    │
        DELETE row          [pending] (attempts += 1, error = msg)
                                   │
                           attempts >= max?
                              │         │
                             Yes        No
                              │         │
                        Skipped     Re-eligible for pickup
                     (stays in queue)

Stale lock recovery (at startup):
  [processing] where started_at < NOW() - timeout ──→ [pending]
  (attempts NOT incremented)
```

### Video Visibility Lifecycle

```
Producer discovers video ──→ Queue job created (video may or may not exist in DB)
                                    │
Consumer downloads + uploads ──→ Video row upserted with all metadata + r2_synced_at
                                    │
                            Feed query: WHERE r2_synced_at IS NOT NULL
                                    │
                            Video visible in feed ✓
                                    │
Producer removes video ──────→ Remove job created
                                    │
Consumer deletes R2 files ───→ r2_synced_at = NULL, paths = NULL
                                    │
                            Video invisible in feed ✗ (row preserved)
```

## New Database Objects

### RPC: claim_consumer_jobs

Atomic batch pickup function to prevent race conditions between concurrent consumers.

```sql
CREATE OR REPLACE FUNCTION claim_consumer_jobs(
    batch_size integer,
    max_attempts integer
)
RETURNS SETOF sync_queue AS $$
    UPDATE sync_queue
    SET status = 'processing', started_at = NOW()
    WHERE id IN (
        SELECT id FROM sync_queue
        WHERE status = 'pending'
          AND attempts < max_attempts
        ORDER BY priority DESC, created_at ASC
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$$ LANGUAGE sql;
```

### RPC: reset_stale_consumer_locks

Reset jobs stuck in processing beyond timeout.

```sql
CREATE OR REPLACE FUNCTION reset_stale_consumer_locks(
    stale_minutes integer
)
RETURNS integer AS $$
DECLARE
    reset_count integer;
BEGIN
    UPDATE sync_queue
    SET status = 'pending', started_at = NULL
    WHERE status = 'processing'
      AND started_at < NOW() - (stale_minutes || ' minutes')::interval;
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;
```

## No Schema Migrations Required

The existing `sync_queue` and `videos` tables have all needed columns. The only new database objects are two RPC functions for atomic operations.
