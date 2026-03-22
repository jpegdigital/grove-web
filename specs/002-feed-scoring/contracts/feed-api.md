# API Contract: Feed Scoring

**Date**: 2026-03-22
**Feature**: 002-feed-scoring

## Modified Endpoints

### GET `/api/videos/feed`

**Change**: Response videos are now sorted by computed score (descending) instead of round-robin interleaving. Response shape unchanged.

**Query params** (unchanged):
- `creator` (optional) — filter by creator slug
- `limit` (optional, default 1000) — max videos
- `offset` (optional, default 0) — pagination offset

**Response shape** (unchanged):
```json
{
  "videos": [FeedVideo],
  "total": number,
  "limit": number,
  "offset": number
}
```

**Behavioral changes**:
- Videos sorted by score (recency + priority + fairness + jitter) instead of round-robin
- Score is deterministic per calendar day — same request on same day returns same order
- Diversity constraint applied: no more than 2 consecutive videos from same creator
- When `creator` filter is active, fairness factor is not applied (single-creator view)

---

### PATCH `/api/creators/[id]`

**Change**: Accepts new `priority` field.

**New field**:
```json
{
  "priority": 75  // integer 0-100, optional
}
```

**Validation**: Must be integer, 0 <= priority <= 100. Returns 400 if out of range.

**Existing fields unchanged**: `name`, `slug`, `avatar_channel_id`, `cover_channel_id`, `display_order`

---

### PATCH `/api/curated-channels/[id]`

**Change**: Accepts new `priority` field.

**New field**:
```json
{
  "priority": 80  // integer 0-100, optional
}
```

**Validation**: Must be integer, 0 <= priority <= 100. Returns 400 if out of range.

**Existing fields unchanged**: `creator_id`, `display_order`

---

### GET `/api/creators`

**Change**: Response now includes `priority` field on each creator.

**New field in response**:
```json
{
  "id": "uuid",
  "name": "Creator Name",
  "slug": "creator-name",
  "priority": 50,
  // ... existing fields
}
```

## No New Endpoints

All changes are additions to existing endpoints. No new routes needed.
