# Implementation Plan: Scored Multi-Source Video Discovery

**Branch**: `005-scored-video-discovery` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-scored-video-discovery/spec.md`

## Summary

Replace the current single-source (playlist-only) video discovery with a multi-source system that fetches popular (viewCount), highly-rated (rating), and recent (playlist) videos per channel. Videos are deduplicated, scored with a configurable popularity+engagement+freshness algorithm, and sliced with guaranteed minimum slots per source. Two run modes (`--mode recent` for daily, `--mode full` for weekly) manage API quota. Source-aware reconciliation ensures daily runs don't wipe popular/rated videos that weren't re-fetched.

## Technical Context

**Language/Version**: Python 3.10+
**Primary Dependencies**: requests, pyyaml, python-dateutil, supabase-py, boto3
**Storage**: Supabase (PostgreSQL) — `videos`, `curated_channels`, `sync_queue` tables
**Testing**: pytest with parametrized tests (`tests/test_sync_producer.py`)
**Target Platform**: Windows/Linux CLI (run via `uv run`)
**Project Type**: CLI script (`scripts/sync_producer.py`)
**Performance Goals**: Full run <60s for 52 channels, <10,000 API quota units
**Constraints**: YouTube API 10,000 units/day; search.list costs 100 units/page
**Scale/Scope**: 52 curated channels, ~250 videos each, ~13,000 total videos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | ✅ PASS | Extends existing single-file script. No premature abstractions — scoring is a pure function, search fetch is one new function. |
| II. Testing Discipline | ✅ PASS | Scoring function is pure math → unit test first. Search fetch → mock-based test. Selection algorithm → parametrized tests. |
| III. Fail Fast & Loud | ✅ PASS | FR-011 requires graceful degradation with logging on search failures. Existing `api_get` retry + error logging pattern carries forward. |
| IV. Configuration as Data | ✅ PASS | All scoring weights, source percentages, and half-life in `config/producer.yaml`. No magic numbers. |
| V. Code Style | ✅ PASS | Single file with clear function separation. Type hints on all public signatures. |
| VI. Anti-Patterns | ✅ PASS | No catch-all handlers, no magic numbers, no speculative abstractions. |

## Project Structure

### Documentation (this feature)

```text
specs/005-scored-video-discovery/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Schema changes
├── quickstart.md        # Usage guide
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (modified files)

```text
scripts/
└── sync_producer.py         # Main changes: search fetch, scoring, selection, mode arg

config/
└── producer.yaml            # New: scoring + sources config sections

supabase/migrations/
└── 20260324000004_add_source_tags_to_videos.sql  # New column + GIN index

tests/
└── test_sync_producer.py    # New: scoring, selection, search fetch tests
```

**Structure Decision**: All changes stay within the existing single-script architecture. No new files beyond the migration. The `sync_producer.py` script gains ~4 new functions (search fetch, scoring, selection, source-aware reconciliation) but remains a single-file CLI tool per Constitution Principle I.

## Design

### New Functions

#### 1. `fetch_search_videos(api_key, channel_id, order, duration_floor)` → `(list[dict], int)`
Calls `search.list` with `channelId`, `type=video`, `order` (viewCount or rating), `maxResults=50`. Returns up to 50 video IDs. Then enriches via existing `enrich_videos()`. Filters by duration_floor (60s). Returns (enriched videos, quota_used).

#### 2. `score_video(video, weights, half_life_days)` → `float`
Pure function. Takes a video dict with view_count, like_count, comment_count, published_at. Returns weighted score. Configurable weights and half-life from CFG.

#### 3. `select_desired_set(popular, rated, recent, max_count, min_pct)` → `list[dict]`
Takes three lists of scored candidates. Guarantees min_pct from popular, min_pct from rated. Fills remaining slots by highest score from full pool. Deduplication by video_id (tag with all sources). Returns final desired set with source_tags attached.

#### 4. `fetch_reserved_video_ids(client, channel_id)` → `set[str]`
Queries videos table for youtube_ids WHERE source_tags && ARRAY['popular','rated']. Used by recent mode to identify frozen slots.

### Modified Functions

#### `process_channel()` — new `mode` parameter
- If `mode == "full"`: call `fetch_search_videos` (viewCount + rating) + `fetch_desired_videos` (playlist). Dedupe, score, select, diff entire set.
- If `mode == "recent"`: call `fetch_desired_videos` (playlist only). Fetch reserved IDs from DB. Score recent candidates. Fill only non-reserved slots. Diff only recent portion.

#### `main()` — new `--mode` argument
Add `--mode {recent,full}` argument, default `recent`. Pass to `process_channel()`.

#### `clear_pending_jobs()` — mode-aware
- In `full` mode: clear ALL pending jobs for channel (current behavior)
- In `recent` mode: clear only pending jobs for videos NOT in the reserved set

### Config Changes

```yaml
# New sections added to config/producer.yaml
scoring:
  weights:
    popularity: 0.35
    engagement: 0.35
    freshness: 0.30
  freshness_half_life_days: 90

sources:
  popular:
    min_percentage: 0.20
    duration_floor: 60
  rated:
    min_percentage: 0.20
    duration_floor: 60
```

### Migration

```sql
ALTER TABLE videos ADD COLUMN source_tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_videos_source_tags ON videos USING GIN (source_tags);
```

### Process Flow: Full Mode

```
1. fetch_search_videos(viewCount)  → popular_candidates (≤50)
2. fetch_search_videos(rating)     → rated_candidates (≤50)
3. fetch_desired_videos(playlist)  → recent_candidates (≤250, date-bounded)
4. Deduplicate by video_id, merge source tags
5. Score all candidates
6. select_desired_set(popular, rated, recent, 250, 0.20)
   → Guarantee ≥50 popular, ≥50 rated by score within source
   → Fill remaining 150 by top score from full pool
7. fetch_existing_videos from DB
8. compute_diff (desired_ids vs existing_ids)
9. clear_pending_jobs (all pending for channel)
10. Update source_tags on videos in desired set
11. enqueue download/remove jobs
```

### Process Flow: Recent Mode

```
1. fetch_reserved_video_ids from DB  → reserved_ids (frozen)
2. available_slots = max - len(reserved_ids)
3. fetch_desired_videos(playlist)    → recent_candidates
4. Score recent candidates
5. Slice top `available_slots` by score
6. desired_ids = reserved_ids ∪ recent_ids
7. fetch_existing_videos from DB
8. compute_diff:
   - to_download = recent_ids - existing_ids  (only new recent)
   - to_remove = (existing_ids - desired_ids) - reserved_ids  (never remove reserved)
9. clear_pending_jobs (only for non-reserved videos)
10. enqueue download/remove jobs
```

## Complexity Tracking

No constitution violations to justify.
