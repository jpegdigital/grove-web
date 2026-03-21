# Research: Curated Video Feed

## R1: Interleaved Round-Robin Sorting

**Decision**: Implement interleaving at the API level, not client-side. The feed API returns videos pre-sorted in round-robin order.

**Rationale**: The API already fetches videos per-channel. Interleaving server-side means the client receives a flat array it can paginate trivially. Client-side interleaving would require fetching ALL videos upfront, defeating pagination.

**Algorithm**:
1. Group videos by creator (via curated_channels → creator mapping)
2. Within each creator, sort videos by `published_at` DESC (newest first)
3. Round-robin: pick one video from each creator in sequence (by creator `display_order`), then repeat
4. When a creator's videos are exhausted, skip and continue with remaining creators
5. Return the interleaved array, sliced by offset/limit for pagination

**Alternatives considered**:
- Pure chronological: Rejected — prolific creators dominate the top
- Random shuffle: Rejected — non-deterministic pagination breaks "Show more"
- Client-side interleaving: Rejected — requires fetching all 415 videos for first page load

## R2: Pagination Strategy

**Decision**: Cursor-based pagination using offset + limit query parameters.

**Rationale**: The interleaved order is deterministic (based on creator display_order and video published_at), so offset pagination is stable. With ~415 total videos and batches of 20, this means ~21 pages max — offset performance is a non-issue at this scale.

**Parameters**:
- `limit` (default: 20) — batch size
- `offset` (default: 0) — skip count
- `creator` (optional) — creator ID to filter by

**Response shape change**: Wrap in `{ videos: FeedItem[], total: number, hasMore: boolean }` instead of returning a bare array, so the client knows when to hide "Show more."

**Alternatives considered**:
- Cursor-based with opaque tokens: Rejected — over-engineered for 415 videos
- Client-side pagination of full dataset: Rejected — unnecessary data transfer

## R3: Creator-to-Video Mapping for Feed

**Decision**: Use the existing `creators → curated_channels → channels → videos` join path. Videos with `is_downloaded = true` only.

**Rationale**: The data model already supports this. A creator has curated_channels, each curated_channel has a channel_id, and videos have a channel_id FK. The join is straightforward.

**Ungrouped channels**: Channels not assigned to a creator (`curated_channels.creator_id IS NULL`) will be grouped as individual pseudo-creators in the feed, one per channel. This matches how the home page already handles them.

## R4: Scroll Position Preservation

**Decision**: Rely on Next.js client-side navigation + React Query cache.

**Rationale**: The feed page will be a client component using `useQuery` with `keepPreviousData`. When navigating to `/v/[id]` via `<Link>`, Next.js preserves the previous page in memory. Browser back restores the component with its React state intact (loaded batches, scroll position, filter state).

**No additional work needed** beyond using `<Link>` for navigation and keeping the feed page as a client component with React Query.

## R5: End-of-Video Suggestions

**Decision**: Query the feed API filtered by the current video's creator, excluding the current video. Show up to 6 thumbnail suggestions.

**Rationale**: The player already knows the `channelId` from `VideoMeta`. We can fetch same-creator videos from the feed API (with creator filter) and render a simple grid. This reuses the existing API without a new endpoint.

## R6: Feed API Refactoring Scope

**Decision**: Refactor the existing `/api/videos/feed` endpoint rather than creating a new one.

**Rationale**: The current feed API fetches from YouTube API on staleness, enriches, and returns. For the new feed, we only need downloaded videos — which are already in the DB. The refactored endpoint can:
1. Query `videos` where `is_downloaded = true`
2. Join through `channels → curated_channels → creators` for creator info
3. Apply interleaving in the query or post-processing
4. Support `?creator=UUID&limit=20&offset=0` params

The YouTube API fetching/enrichment logic can remain as a separate concern (already runs on the existing staleness check). The feed just reads what's in the DB.
