# API Contract: Video Feed

## GET /api/videos/feed

Returns a paginated, interleaved feed of downloaded videos from curated creators.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | integer | 20 | Number of videos per batch (max 50) |
| offset | integer | 0 | Number of videos to skip |
| creator | UUID | (none) | Filter to a specific creator's videos |

### Response (200 OK)

```json
{
  "videos": [
    {
      "id": "dQw4w9WgXcQ",
      "title": "Video Title",
      "thumbnailUrl": "https://i.ytimg.com/vi/.../hqdefault.jpg",
      "channelId": "UC...",
      "channelTitle": "Channel Name",
      "channelThumbnail": "https://yt3.ggpht.com/...",
      "duration": "PT3M45S",
      "durationSeconds": 225,
      "publishedAt": "2024-03-15T00:00:00Z",
      "isDownloaded": true,
      "mediaPath": "@handle/2024-03/dQw4w9WgXcQ.mp4",
      "thumbnailPath": "@handle/2024-03/dQw4w9WgXcQ.jpg",
      "creatorId": "uuid-here",
      "creatorName": "Creator Name",
      "creatorAvatar": "https://yt3.ggpht.com/..."
    }
  ],
  "total": 415,
  "hasMore": true
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| videos | array | Interleaved video list for current page |
| total | integer | Total number of downloaded videos matching filter |
| hasMore | boolean | True if more videos exist beyond current offset + limit |

### Video Object Fields

| Field | Type | Description |
|-------|------|-------------|
| id | string | YouTube video ID |
| title | string | Video title |
| thumbnailUrl | string | YouTube CDN thumbnail URL |
| channelId | string | YouTube channel ID |
| channelTitle | string | Channel display name |
| channelThumbnail | string | Channel avatar URL |
| duration | string | ISO 8601 duration |
| durationSeconds | integer | Duration in seconds |
| publishedAt | string | ISO 8601 upload date |
| isDownloaded | boolean | Always true (feed only returns downloaded) |
| mediaPath | string | Relative path for /api/media streaming |
| thumbnailPath | string or null | Relative path for local thumbnail |
| creatorId | string or null | Creator UUID (null for ungrouped channels) |
| creatorName | string | Creator name (or channel name for ungrouped) |
| creatorAvatar | string | Creator avatar URL |

### Sorting Behavior

Videos are interleaved round-robin across creators:
1. Group videos by creator (ordered by `creators.display_order`)
2. Within each creator, sort by `published_at` DESC (newest first)
3. Deal one video from each creator in sequence, then repeat
4. Ungrouped channels are each treated as individual creators

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 500 | `{ "error": "Failed to load feed" }` | Database or server error |

### Examples

**Full feed, first page:**
```
GET /api/videos/feed?limit=20&offset=0
```

**Second page:**
```
GET /api/videos/feed?limit=20&offset=20
```

**Filtered to one creator:**
```
GET /api/videos/feed?creator=abc-123-uuid&limit=20&offset=0
```
