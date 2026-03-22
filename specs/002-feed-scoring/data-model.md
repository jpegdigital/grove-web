# Data Model: Feed Scoring Algorithm

**Date**: 2026-03-22
**Feature**: 002-feed-scoring

## Schema Changes

### `creators` table — add `priority` column

```sql
ALTER TABLE creators
  ADD COLUMN priority integer NOT NULL DEFAULT 50
  CONSTRAINT creators_priority_range CHECK (priority >= 0 AND priority <= 100);
```

- **Type**: integer (0–100)
- **Default**: 50 (neutral midpoint)
- **Constraint**: CHECK 0–100 inclusive
- **Index**: Not needed — only read during feed scoring, not queried by priority

### `curated_channels` table — add `priority` column

```sql
ALTER TABLE curated_channels
  ADD COLUMN priority integer NOT NULL DEFAULT 50
  CONSTRAINT curated_channels_priority_range CHECK (priority >= 0 AND priority <= 100);
```

- **Type**: integer (0–100)
- **Default**: 50 (neutral midpoint)
- **Constraint**: CHECK 0–100 inclusive
- **Index**: Not needed — same reasoning as creators

## Entity Relationships (unchanged)

```
creators (1) ──< curated_channels (1) ──> channels (1) ──< videos (many)
   │                  │
   └── priority       └── priority
       (0-100)            (0-100)
```

- Each creator has 0+ curated_channels
- Each curated_channel maps to exactly 1 channel
- Each channel has 0+ videos
- Ungrouped channels have `creator_id = NULL`

## Computed Entities (not persisted)

### ScoringContext

Assembled at feed-load time from the DB query results:

```typescript
interface ScoringContext {
  date: string;                    // YYYY-MM-DD (today's date for jitter seed)
  creatorChannelCounts: Map<string, number>; // creatorId → number of channels
}

interface ScoredVideo {
  video: FeedVideo;                // existing video data
  channelPriority: number;         // 0-100 from curated_channels.priority
  creatorPriority: number;         // 0-100 from creators.priority
  creatorId: string;               // for fairness + diversity
  channelCount: number;            // creator's total channels (for fairness)
  score: number;                   // computed score (higher = shown first)
}
```

### Scoring Constants

```typescript
const SCORING_WEIGHTS = {
  recency: 0.5,
  priority: 0.4,
  jitter: 0.1,
} as const;

const RECENCY_HALF_LIFE_HOURS = 168; // 7 days
const DEFAULT_PRIORITY = 50;
const MAX_CONSECUTIVE_SAME_CREATOR = 2;
```

## Migration Plan

Single migration file adding both columns with defaults:

- **Migration name**: `add_priority_to_creators_and_channels`
- **Backward compatible**: Yes — default 50 means existing data works without changes
- **Rollback**: `ALTER TABLE ... DROP COLUMN priority`
- **Data migration**: None needed — defaults cover all existing rows
