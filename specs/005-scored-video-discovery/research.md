# Research: Scored Multi-Source Video Discovery

## R1: YouTube search.list behavior without query parameter

**Decision**: Use `search.list` with `channelId` + `order=viewCount` and `order=rating`, no `q` parameter.

**Rationale**: `search.list` works with just `channelId` and `type=video` — no search query needed. `order=viewCount` returns all-time most viewed. `order=rating` returns highest-rated (by like ratio). Both return `snippet` data including video IDs, which we then enrich via `videos.list` for duration/stats.

**Alternatives considered**:
- `order=relevance` — requires a `q` parameter to be meaningful; without one it returns YouTube's opaque recommendation which is inconsistent
- Multiple pages per source — diminishing returns at 100 quota units/page; one page of 50 captures the top tier

## R2: Source tag persistence strategy

**Decision**: Add a `source_tags text[]` column to the `videos` table. Store an array like `{'popular','recent'}` for videos found in multiple sources.

**Rationale**: The `videos` table is the system of record for what's in the feed. Source tags need to survive between runs so daily reconciliation knows which videos are in reserved slots. A column on `videos` is simpler than a separate tracking table and queryable with Postgres array operators (`@>`, `&&`).

**Alternatives considered**:
- Separate `video_sources` join table — over-engineered for 3 possible values
- Store in sync_queue metadata — queue is ephemeral (purged), not suitable for persistence
- Store in curated_channels as JSON — wrong entity, this is per-video not per-channel

## R3: Scoring algorithm design

**Decision**: Three-signal weighted score with configurable weights and 90-day freshness half-life.

```
popularity  = log10(max(views, 1))                    # range ~0-8
engagement  = (like_rate * 0.7 + comment_rate * 0.3) * 100  # range ~0-5
freshness   = exp(-age_days * ln(2) / 90)             # range 0-1

score = (w_pop * popularity) + (w_eng * engagement) + (w_fresh * freshness)
```

Default weights: popularity=0.35, engagement=0.35, freshness=0.30

**Rationale**:
- Log-scaled views prevent mega-viral videos from completely dominating (10M views = 7.0, 100K views = 5.0 — a 100x difference compresses to 2 points)
- Engagement rate normalizes for channel size — a 50K-view video with 5% like rate scores higher on engagement than a 5M-view video with 0.1%
- 90-day half-life means a 3-month-old video retains 50% freshness; a 6-month-old ~25%; a 1-year-old ~6%
- Equal weight to popularity and engagement ensures quality content (high engagement) competes with raw virality

**Alternatives considered**:
- Hacker News gravity formula — designed for single-feed ranking, not multi-source selection
- Wilson score — great for binary ratings but YouTube's like/dislike ratio isn't public anymore
- Pure view count — heavily biases toward old evergreen content, drowns out fresh uploads

## R4: Source-aware reconciliation design

**Decision**: Daily runs query the DB for videos with `'popular'` or `'rated'` in their `source_tags` array to build the frozen reserved set. Only the remaining slots (max - reserved count) are filled from the fresh playlist fetch. Removals only target videos NOT in the reserved set.

**Rationale**: This is the simplest approach that respects frozen slots. The DB already has the source tags from the last full run. The daily run just needs to:
1. Count reserved videos per channel (WHERE source_tags && ARRAY['popular','rated'])
2. Subtract from max to get available recent slots
3. Fetch/score/slice recent candidates to fill those slots
4. Diff recent candidates against non-reserved existing videos
5. Enqueue download/remove only for the recent portion

**Alternatives considered**:
- Separate reservation table — adds complexity with no benefit
- Re-run search.list daily but cache — wastes quota even if cached results are identical
- Store reservation in sync_queue — queue is purged between runs

## R5: Quota budget analysis for full mode

**Decision**: Full mode budget is ~5,500 units for 52 channels. Acceptable for weekly runs.

**Breakdown per channel**:
- search.list viewCount: 100 units (1 page)
- search.list rating: 100 units (1 page)
- Enrichment of ~100 new unique IDs from search: ~2 units (2 batches of 50)
- playlistItems.list: ~6 units (average, same as current)
- Enrichment of playlist videos: ~6 units (average, same as current)
- **Per-channel total**: ~214 units (search-heavy channels) to ~108 units (small channels)

**52-channel estimate**: ~5,500 units for full run, ~326 for recent-only run.

**Alternatives considered**:
- Fetch 2 pages per search source (100 results) — doubles to ~10,400 units, too close to daily limit
- Skip rating source — saves ~5,200 units but loses the engagement signal
