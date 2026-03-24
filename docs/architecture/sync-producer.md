# sync_producer.py — Video Discovery & Queue Producer

Discovers which videos should exist per curated channel using the YouTube Data API, scores them, diffs against the current catalog, and enqueues download/remove jobs into `sync_queue` for the consumer to process.

## Usage

```bash
uv run python scripts/sync_producer.py                       # daily: recent only
uv run python scripts/sync_producer.py --mode full            # weekly: popular + rated + recent
uv run python scripts/sync_producer.py --channel UC...        # single channel
uv run python scripts/sync_producer.py --dry-run --verbose    # preview without writing
```

## Run Modes

### Recent (daily, default)

Fetches only the uploads playlist. Preserves "reserved" slots (videos tagged `popular` or `rated` from a prior full run) and fills remaining slots with scored recent uploads.

- **Quota cost**: ~326 units for 52 channels (1 playlistItems + 1 videos.list enrichment per page)
- **Behavior**: Never removes reserved videos. Only reconciles the recent portion.

### Full (weekly)

Fetches three sources per channel — popular (search by viewCount), rated (search by rating), and recent (uploads playlist). Deduplicates, scores all candidates, guarantees minimum slots per source, and does full reconciliation.

- **Quota cost**: ~5,500 units for 52 channels (100 per search.list call × 2 sources + playlist pages)
- **Rolling refresh**: Only a configurable fraction of channels (`full_refresh_percentage`, default 10%) get full treatment per run. The rest get recent-only. Channels are rotated by `last_full_refresh_at` (least-recently-refreshed first), so all channels cycle through full mode over ~9 runs.

## Pipeline

```
1. Fetch curated channels      ──→  curated_channels JOIN channels
2. Select run mode per channel  ──→  rolling refresh for --mode full
3. Fetch video candidates       ──→  YouTube API (playlist + search)
4. Enrich with stats            ──→  videos.list (duration, views, likes)
5. Filter by duration           ──→  skip Shorts (< 60s) and short content
6. Score all candidates         ──→  popularity + engagement + freshness
7. Select desired set           ──→  source guarantees + top-N by score
8. Diff desired vs existing     ──→  to_download = desired - existing
                                     to_remove   = existing - desired
9. Clear stale jobs             ──→  replace queue for this channel
10. Enqueue download/remove     ──→  sync_queue via enqueue_sync_jobs RPC
11. Update source_tags          ──→  tag videos with popular/rated/recent
12. Orphan cleanup              ──→  remove videos from un-curated channels
```

## Scoring Algorithm

Each video gets a weighted score from three signals:

| Signal | Formula | Range | Weight |
|--------|---------|-------|--------|
| **Popularity** | `log10(max(views, 1))` | ~0–8 | 0.35 |
| **Engagement** | `(like_rate × 0.7 + comment_rate × 0.3) × 100` | ~0–5 | 0.35 |
| **Freshness** | `exp(-age_days × ln(2) / half_life)` | 0–1 | 0.30 |

Freshness uses a 90-day half-life: a 3-month-old video retains 50% freshness, 6-month ~25%, 1-year ~6%. All weights and the half-life are configurable in `config/producer.yaml`.

## Source Guarantees

In full mode, `select_desired_set()` ensures minimum representation from each source:

1. Reserve 20% of slots for popular videos (sorted by score within source)
2. Reserve 20% of slots for rated videos
3. Fill remaining 60% from the full deduplicated pool by top score

Videos appearing in multiple sources get merged `source_tags` (e.g. `["popular", "recent"]`).

## Per-Channel Overrides

The `curated_channels` table supports two overrides:

| Column | Effect |
|--------|--------|
| `date_range_override` | Widen or narrow the date window (e.g. `today-2years` for deep back-catalogs) |
| `min_duration_override` | Custom duration floor in seconds (overrides the default 300s) |

## Queue Interaction

The producer writes to `sync_queue` using the `enqueue_sync_jobs` RPC, which handles deduplication via `ON CONFLICT DO NOTHING` against the partial unique index `(video_id, action) WHERE status IN ('pending', 'processing')`.

**Download job metadata** (consumed by sync_consumer.py):
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Video Title",
  "published_at": "2024-03-15T10:00:00Z",
  "description": "...",
  "thumbnail_url": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
  "duration_seconds": 245,
  "view_count": 150000,
  "like_count": 8500,
  "comment_count": 320,
  "_score": 4.72,
  "source_tags": ["popular", "recent"]
}
```

**Remove job metadata**:
```json
{
  "media_path": "@handle/2024-03/dQw4w9WgXcQ.mp4",
  "thumbnail_path": "@handle/2024-03/dQw4w9WgXcQ.jpg",
  "subtitle_path": "@handle/2024-03/dQw4w9WgXcQ.en.vtt",
  "title": "Video Title"
}
```

## Configuration

All tunables live in `config/producer.yaml`:

| Section | Key Settings |
|---------|-------------|
| `producer` | `max_videos_per_channel` (250), `min_duration_seconds` (300), `default_date_range`, `full_refresh_percentage` (0.10) |
| `api` | `page_size` (50), `max_workers` (8), `max_retries` (3), `retry_backoff_base` (2) |
| `quota` | `daily_limit` (10,000), `warn_threshold` (8,000) |
| `scoring` | `weights` (popularity/engagement/freshness), `freshness_half_life_days` (90) |
| `sources` | `popular.min_percentage` (0.20), `rated.min_percentage` (0.20) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Yes | Server-side Supabase key |

## Scheduling

| Phase | Frequency | Command | Quota |
|-------|-----------|---------|-------|
| **Daily** | Every day | `uv run python scripts/sync_producer.py` | ~326 |
| **Weekly** | Once per week | `uv run python scripts/sync_producer.py --mode full` | ~5,500 |
