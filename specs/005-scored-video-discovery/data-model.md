# Data Model: Scored Multi-Source Video Discovery

## Entity Changes

### videos table — new column

| Column | Type | Default | Nullable | Purpose |
|--------|------|---------|----------|---------|
| `source_tags` | `text[]` | `'{}'` | NO | Array of source labels: `popular`, `rated`, `recent`. A video may have multiple tags. Used by daily runs to identify reserved (popular/rated) slots. |

**Migration**: `ALTER TABLE videos ADD COLUMN source_tags text[] NOT NULL DEFAULT '{}';`

**Index**: `CREATE INDEX idx_videos_source_tags ON videos USING GIN (source_tags);` — enables efficient `@>` and `&&` array queries for reserved slot lookups.

### config/producer.yaml — new sections

```yaml
scoring:
  weights:
    popularity: 0.35
    engagement: 0.35
    freshness: 0.30
  freshness_half_life_days: 90

sources:
  popular:
    min_percentage: 0.20       # 20% of max_videos_per_channel
    duration_floor: 60         # Only exclude Shorts
  rated:
    min_percentage: 0.20       # 20% of max_videos_per_channel
    duration_floor: 60         # Only exclude Shorts
  recent:
    # Uses channel's min_duration_override or producer.min_duration_seconds
```

## Entity Relationships (unchanged)

```
creators → curated_channels → channels → videos
                                           ↓
                                      sync_queue (ephemeral jobs)
```

## State Transitions

### Video source_tags lifecycle

```
[not in DB] → full run discovers video → INSERT with source_tags = {'popular','recent'}
                                          (if found in both sources)

[in DB, source_tags = {'popular'}] → daily run → tags FROZEN, not modified
[in DB, source_tags = {'recent'}]  → daily run → may be displaced by higher-scoring recent video
[in DB, source_tags = {'popular'}] → full run  → tags REFRESHED (may lose 'popular' if no longer top-50)
```

### sync_queue job lifecycle (unchanged)

```
pending → processing → done (deleted by next purge)
pending → processing → failed (deleted by next purge)
pending → deleted (by clear_pending_jobs before fresh enqueue)
```

## Query Patterns

### Daily run: get reserved video count per channel
```sql
SELECT COUNT(*) FROM videos
WHERE channel_id = $1
  AND source_tags && ARRAY['popular','rated'];
```

### Daily run: get reserved video IDs (to exclude from reconciliation)
```sql
SELECT youtube_id FROM videos
WHERE channel_id = $1
  AND source_tags && ARRAY['popular','rated'];
```

### Full run: update source_tags for all videos in desired set
```sql
UPDATE videos SET source_tags = $2
WHERE youtube_id = $1;
```

### Reporting: source distribution per channel
```sql
SELECT channel_id,
  COUNT(*) FILTER (WHERE source_tags @> ARRAY['popular']) as popular,
  COUNT(*) FILTER (WHERE source_tags @> ARRAY['rated']) as rated,
  COUNT(*) FILTER (WHERE source_tags @> ARRAY['recent']) as recent
FROM videos
GROUP BY channel_id;
```
