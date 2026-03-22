# sync_downloads.py — Media Library Scanner

Scans the ytdl-sub media directory for `.info.json` sidecar files and upserts video metadata into the Supabase `videos` table with `is_downloaded = true`.

## Usage

```bash
uv run python scripts/sync_downloads.py          # incremental (default)
uv run python scripts/sync_downloads.py --full    # full rescan
```

## How It Works

### Pipeline

```
1. Fetch existing IDs   ──→  Supabase query for all synced youtube_ids
2. Walk filesystem       ──→  os.scandir stack-walk for *.info.json
3. Skip known IDs        ──→  Compare filename to skip set (no file I/O)
4. Parse new files       ──→  JSON parse only for unsynced videos
5. Resolve siblings      ──→  Find .mp4/.jpg/.srt via cached dir listing
6. Ensure channels       ──→  Batch-insert missing channel rows (FK safety)
7. Upsert videos         ──→  Batch upsert in groups of 100
```

### Incremental Sync (default)

Before touching the filesystem, the script fetches all `youtube_id` values already in the `videos` table with `is_downloaded = true`. During the scan, it extracts the video ID directly from the filename (`VIDEO_ID.info.json`) and checks it against this set. Already-synced files are skipped entirely — no file open, no JSON parse, no sibling lookups.

Use `--full` to bypass this and re-process everything (useful after schema changes or to refresh metadata).

### Performance Optimizations

| Technique | Problem it solves |
|-----------|-------------------|
| **Filename-based ID extraction** | Avoids parsing 50-100KB JSON files just to read the `id` field and skip them |
| **`os.scandir` stack-walk** | Replaces `Path.rglob()` — significantly faster on Windows because `scandir` returns file metadata from the directory entry without extra stat calls |
| **Directory listing cache** | Each folder is listed once via `os.scandir`, then all 3 sibling lookups (video/thumb/subtitle) hit an in-memory dict instead of re-scanning the filesystem |
| **Incremental skip set** | Subsequent runs after initial sync do near-zero file I/O — just a directory walk comparing filenames against a set |

### Expected Directory Layout

ytdl-sub organizes downloads as:

```
MEDIA_DIRECTORY/
  @ChannelHandle/
    YYYY-MM/
      VIDEO_ID.info.json      ← metadata sidecar (source of truth)
      VIDEO_ID.mp4             ← video file
      VIDEO_ID.jpg             ← thumbnail
      VIDEO_ID.en.srt          ← subtitles (optional)
```

The script discovers `.info.json` files recursively and locates sibling media files by matching the `VIDEO_ID` prefix within the same folder.

### Sibling File Resolution

For each video, the script looks for three types of sibling files:

| Type | Extensions | Match strategy |
|------|-----------|----------------|
| Video | `.mp4`, `.webm`, `.mkv` | Exact match (`VIDEO_ID.ext`), then prefix match |
| Thumbnail | `.jpg`, `.jpeg`, `.webp`, `.png` | Exact match, then prefix match |
| Subtitle | `.srt`, `.vtt` | Exact match, then prefix match (catches `VIDEO_ID.en.srt`) |

Paths are stored as relative paths from `MEDIA_DIRECTORY` (e.g. `@handle/2024-01/VIDEO_ID.mp4`) and served by the `/api/media/[...path]` endpoint.

### Channel FK Safety

Videos reference `channels.youtube_id` via foreign key. Before upserting videos, the script checks which `channel_id` values are missing from the `channels` table and batch-inserts minimal placeholder rows. These are later enriched by `sync_subscriptions.py`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Server-side Supabase key |
| `MEDIA_DIRECTORY` | No | Path to ytdl-sub library (default: `E:/Entertainment/PradoTube`) |

Loaded from `.env` in the project root.

## Data Flow

```
ytdl-sub downloads video
  → writes VIDEO_ID.info.json + .mp4 + .jpg to @handle/YYYY-MM/
    → sync_downloads.py scans and upserts to Supabase
      → Next.js feed queries videos where is_downloaded = true
        → /api/media/[...path] streams local files to the player
```
