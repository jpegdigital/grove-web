# Data Model: Curated Video Feed

## Existing Entities (no schema changes needed)

### creators
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| name | text | Display name |
| slug | text | URL-safe identifier, unique |
| avatar_channel_id | text (FK) | Optional, points to channels.youtube_id |
| cover_channel_id | text (FK) | Optional, points to channels.youtube_id |
| display_order | integer | Determines round-robin sequence in feed |
| created_at | timestamptz | |

### curated_channels
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| channel_id | text (FK) | Points to channels.youtube_id |
| creator_id | UUID (FK) | Nullable — ungrouped channels have NULL |
| display_order | integer | |
| notes | text | Parent-only notes, not shown in feed |
| created_at | timestamptz | |

### channels
| Field | Type | Notes |
|-------|------|-------|
| youtube_id | text | PK (UC... format) |
| title | text | Channel display name |
| custom_url | text | @handle |
| thumbnail_url | text | Avatar image URL |
| banner_url | text | Cover image URL |
| (other metadata) | various | subscriber_count, video_count, etc. |

### videos
| Field | Type | Notes |
|-------|------|-------|
| youtube_id | text | PK |
| channel_id | text (FK) | Points to channels.youtube_id |
| title | text | Video title |
| description | text | |
| thumbnail_url | text | YouTube CDN thumbnail |
| published_at | timestamptz | Upload date |
| duration | text | ISO 8601 (e.g., "PT3M45S") |
| duration_seconds | integer | Precise seconds from yt-dlp |
| is_downloaded | boolean | True when locally available |
| media_path | text | Relative path for streaming |
| thumbnail_path | text | Relative path for local thumbnail |
| handle | text | @handle of uploader |
| (other enriched fields) | various | like_count, chapters, width, height, etc. |

## Query Patterns

### Feed Query (interleaved, paginated)

```
videos
  WHERE is_downloaded = true
  JOIN channels ON videos.channel_id = channels.youtube_id
  JOIN curated_channels ON curated_channels.channel_id = channels.youtube_id
  LEFT JOIN creators ON curated_channels.creator_id = creators.id
  OPTIONAL WHERE creators.id = :creator_filter
  ORDER BY published_at DESC (within each creator group)
```

Post-processing: Round-robin interleave by creator, then slice by offset/limit.

### Creator Chips Query

```
creators
  WHERE EXISTS (
    curated_channels with creator_id = creators.id
    AND channels with downloaded videos
  )
  ORDER BY display_order
```

Plus ungrouped channels that have downloaded videos.

### Same-Creator Suggestions (for end-of-video)

```
videos
  WHERE is_downloaded = true
  AND channel_id IN (channels belonging to same creator)
  AND youtube_id != :current_video_id
  ORDER BY published_at DESC
  LIMIT 6
```

## Relationships Diagram

```
creators (display_order determines feed interleave sequence)
    │
    ├── 1:many curated_channels (via creator_id)
    │       │
    │       └── 1:1 channels (via channel_id)
    │               │
    │               └── 1:many videos (via channel_id, filtered by is_downloaded)
    │
    └── avatar/cover resolved from curated_channels → channels thumbnails

ungrouped curated_channels (creator_id IS NULL)
    │
    └── treated as individual pseudo-creators in the feed
```

## No Migration Needed

All required columns already exist from:
- Original schema migrations (creators, curated_channels, channels, videos)
- The `add_download_tracking` migration (is_downloaded, media_path, thumbnail_path, duration_seconds, etc.)
