# Contract: Feed API Changes

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23

## GET /api/videos/feed

### Query Change

**Before**: `WHERE is_downloaded = true`
**After**: `WHERE r2_synced_at IS NOT NULL`

### Response Shape (unchanged structure, different URL values)

```json
{
  "videos": [
    {
      "youtubeId": "0G7Zj6j9gQE",
      "title": "Video Title",
      "mediaPath": "@funquesters/2026-03/0G7Zj6j9gQE.mp4",
      "thumbnailPath": "@funquesters/2026-03/0G7Zj6j9gQE.jpg",
      "thumbnailUrl": "https://i.ytimg.com/vi/0G7Zj6j9gQE/maxresdefault.jpg",
      "channelId": "UCxxxxxxx",
      "publishedAt": "2026-03-15T00:00:00Z",
      "duration": "PT5M30S",
      "durationSeconds": 330,
      "creatorName": "Funquesters",
      "creatorSlug": "funquesters"
    }
  ]
}
```

### URL Construction Change (client-side)

**Before** (VideoCard):
```
thumbnail: /api/media/${thumbnailPath}
video:     /api/media/${mediaPath}
```

**After** (VideoCard):
```
thumbnail: ${NEXT_PUBLIC_R2_PUBLIC_URL}/${thumbnailPath}
video:     ${NEXT_PUBLIC_R2_PUBLIC_URL}/${mediaPath}
```

## GET /api/videos/[id]

### Query Change

Same filter: video must have `r2_synced_at IS NOT NULL` to be playable.

### Response Shape (unchanged, URL construction changes on client)

No changes to the API response payload. The `mediaPath`, `thumbnailPath`, and `subtitlePath` fields remain relative paths. The client constructs full URLs using `NEXT_PUBLIC_R2_PUBLIC_URL`.

## Removed: /api/media/[...path]

This route is deleted entirely. All references to `/api/media/` in frontend components must be replaced with R2 public URL construction.
