# Data Model: Client-Side Supabase Queries

**Date**: 2026-03-24

No schema changes. This feature moves query execution from server to client — the underlying data model is unchanged.

## Entities Involved (read-only)

### creators
- `id` (uuid, PK)
- `name` (text)
- `slug` (text, unique)
- `avatar_channel_id` (text, FK → channels.youtube_id) — which channel's thumbnail to use as creator avatar
- `cover_channel_id` (text, FK → channels.youtube_id) — which channel's banner to use as creator cover
- `display_order` (integer)
- `priority` (integer, 0-100)

### curated_channels
- `id` (uuid, PK)
- `channel_id` (text, FK → channels.youtube_id)
- `creator_id` (uuid, FK → creators.id, nullable)
- `display_order` (integer)
- `priority` (integer, 0-100)
- `date_range_override` (text, nullable)
- `min_duration_override` (integer, nullable)

### channels
- `youtube_id` (text, PK)
- `title` (text)
- `custom_url` (text)
- `thumbnail_url` (text)
- `banner_url` (text, nullable)
- `subscriber_count` (bigint)
- `video_count` (integer)
- `view_count` (bigint)

### videos
- `youtube_id` (text, PK)
- `title` (text)
- `channel_id` (text, FK → channels.youtube_id)
- `thumbnail_url` (text)
- `thumbnail_path` (text, nullable)
- `published_at` (date)
- `duration` (text, nullable)
- `duration_seconds` (integer)
- `media_path` (text, nullable)
- `r2_synced_at` (timestamptz, nullable) — only videos with this set appear in the feed

## Query Patterns

### Home Page (lightweight)
```
creators → join channels via avatar_channel_id, cover_channel_id
         → join curated_channels → channels (fallback avatar/cover)
```
Select: `id, name, slug, display_order, avatar_channel:channels!avatar_channel_id(thumbnail_url), cover_channel:channels!cover_channel_id(thumbnail_url, banner_url), curated_channels(channels(thumbnail_url, banner_url))`

### Feed Page (two queries)
1. `curated_channels` with nested `creators` and `channels` — builds channel→creator mapping
2. `videos` filtered by `r2_synced_at IS NOT NULL` and `channel_id IN (curated channels)` — the video rows

### Admin Page (full nested)
```
creators → curated_channels → channels (full metadata)
curated_channels where creator_id IS NULL → channels (ungrouped)
```
