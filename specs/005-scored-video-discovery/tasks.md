# Tasks: Scored Multi-Source Video Discovery

**Input**: Design documents from `/specs/005-scored-video-discovery/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per Constitution Principle II (Testing Discipline — TDD mandatory for non-trivial logic).

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 but US1 (daily recent) is the foundation that US2 (full mode) extends.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Migration, config changes, and foundational scoring function

- [x] T001 Apply migration: add `source_tags text[] NOT NULL DEFAULT '{}'` column and GIN index to `videos` table in `supabase/migrations/20260324000004_add_source_tags_to_videos.sql`
- [x] T002 Add `scoring` and `sources` config sections to `config/producer.yaml` with default weights (popularity=0.35, engagement=0.35, freshness=0.30), half-life (90 days), and source min_percentages (popular=0.20, rated=0.20, duration_floor=60)
- [x] T003 Update `load_config()` defaults dict in `scripts/sync_producer.py` to include new `scoring` and `sources` sections matching the YAML structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Scoring function and selection algorithm — needed by ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Write parametrized tests for `score_video()` in `tests/test_sync_producer.py`: verify log-scaled popularity, engagement ratio weighting, 90-day freshness decay, and configurable weights. Test cases: brand-new viral video, old mega-popular video, moderate video with high engagement, zero-view video
- [x] T005 Implement `score_video(video: dict, weights: dict, half_life_days: float) -> float` pure function in `scripts/sync_producer.py`. Computes: `popularity = log10(max(views,1))`, `engagement = (like_rate*0.7 + comment_rate*0.3)*100`, `freshness = exp(-age_days * ln(2) / half_life)`, returns weighted sum
- [x] T006 Write parametrized tests for `select_desired_set()` in `tests/test_sync_producer.py`: verify source minimums guaranteed, deduplication across sources, remaining slots filled by score, correct source_tags assignment, edge cases (fewer candidates than minimum, all candidates from one source)
- [x] T007 Implement `select_desired_set(popular: list, rated: list, recent: list, max_count: int, source_cfg: dict) -> list[dict]` in `scripts/sync_producer.py`. Deduplicates by video_id, guarantees min_percentage from each source sorted by score within source, fills remainder by top score from full pool, attaches `source_tags` list to each video

**Checkpoint**: Scoring and selection are tested and working as pure functions

---

## Phase 3: User Story 1 — Daily Recent Video Discovery (Priority: P1) 🎯 MVP

**Goal**: Refactor current `process_channel()` to use scoring for recent-only mode, with source-aware reconciliation that preserves reserved (popular/rated) slots from previous full runs.

**Independent Test**: Run `--mode recent --dry-run` and verify: recent videos are scored and ranked, reserved slots from DB are preserved, removals only target non-reserved recent videos.

### Tests for User Story 1

- [x] T008 [P] [US1] Write test for `fetch_reserved_video_ids()` in `tests/test_sync_producer.py`: mock Supabase query, verify returns set of youtube_ids where source_tags overlap with popular/rated
- [x] T009 [P] [US1] Write test for recent-mode reconciliation logic in `tests/test_sync_producer.py`: given reserved IDs + recent candidates + existing DB videos, verify correct download/remove sets (reserved never removed)

### Implementation for User Story 1

- [x] T010 [US1] Implement `fetch_reserved_video_ids(client, channel_id: str) -> set[str]` in `scripts/sync_producer.py` — queries `videos` table for youtube_ids WHERE `source_tags && ARRAY['popular','rated']`
- [x] T011 [US1] Add `--mode {recent,full}` argument to `main()` argument parser in `scripts/sync_producer.py`, default `recent`. Pass mode to `process_channel()`
- [x] T012 [US1] Refactor `process_channel()` in `scripts/sync_producer.py` to accept `mode` parameter. In `recent` mode: fetch reserved IDs → compute available_slots (max - reserved count) → fetch playlist videos via existing `fetch_desired_videos()` → score all recent candidates → slice top `available_slots` by score → build desired_ids as reserved ∪ recent → compute diff excluding reserved from removals → clear only non-reserved pending jobs → enqueue
- [x] T013 [US1] Update `source_tags` on videos after enqueue in `scripts/sync_producer.py`: for recent-mode, SET source_tags = ARRAY['recent'] on newly downloaded videos via Supabase update
- [x] T014 [US1] Update summary print line in `process_channel()` to show score range and reserved/recent slot counts

**Checkpoint**: `--mode recent` works end-to-end. Existing daily workflow is preserved with scoring. Reserved slots from any prior full run are frozen.

---

## Phase 4: User Story 2 — Weekly Full Discovery with Popular and Rated Sources (Priority: P1)

**Goal**: Add search.list fetching for viewCount and rating sources, integrate into full-mode pipeline with dedup, scoring, source guarantees, and full reconciliation.

**Independent Test**: Run `--mode full --dry-run --channel UC...` and verify: search API calls made for viewCount and rating, results merged with playlist, deduplication works, source minimums guaranteed in output, source_tags persisted.

### Tests for User Story 2

- [x] T015 [P] [US2] Write test for `fetch_search_videos()` in `tests/test_sync_producer.py`: mock `api_get` and `enrich_videos`, verify correct search.list params (channelId, type=video, order, maxResults=50), verify duration floor filtering, verify quota counting (100 + enrichment)
- [x] T016 [P] [US2] Write integration test for full-mode `process_channel()` in `tests/test_sync_producer.py`: mock all API calls, verify 3-source fetch → dedup → score → select → diff produces correct desired set with source minimums

### Implementation for User Story 2

- [x] T017 [US2] Implement `fetch_search_videos(api_key: str, channel_id: str, order: str, duration_floor: int) -> tuple[list[dict], int]` in `scripts/sync_producer.py` — calls `search.list` with channelId + order + type=video + maxResults=50, extracts video IDs from results, enriches via `enrich_videos()`, filters by duration_floor, returns (videos, quota_used)
- [x] T018 [US2] Extend `process_channel()` full-mode path in `scripts/sync_producer.py`: fetch popular via `fetch_search_videos(order="viewCount")` → fetch rated via `fetch_search_videos(order="rating")` → fetch recent via `fetch_desired_videos()` → deduplicate across all three by video_id → score all → `select_desired_set()` → diff against full DB set → clear ALL pending jobs → update source_tags on all desired videos → enqueue
- [x] T019 [US2] Add error handling in `process_channel()` for search API failures: wrap each `fetch_search_videos()` in try/except, on failure log warning and continue with empty list for that source. Adjust source minimums to zero for failed sources
- [x] T020 [US2] Update summary output to show per-source counts: `X popular + Y rated + Z recent = N desired`

**Checkpoint**: `--mode full` works end-to-end. Three sources fetched, deduped, scored, source minimums guaranteed, source_tags persisted. Daily runs after a full run preserve reserved slots.

---

## Phase 5: User Story 3 — Scoring Algorithm Produces a Balanced Feed (Priority: P2)

**Goal**: Validate and tune the scoring algorithm to produce visibly balanced rankings.

**Independent Test**: Run `--mode full --verbose --channel UC...` on a channel with both old viral videos and new uploads. Verify the output shows a mix — not all old or all new.

### Implementation for User Story 3

- [x] T021 [US3] Add `--verbose` scoring output to `process_channel()` in `scripts/sync_producer.py`: when verbose, print each video's score breakdown (popularity=X, engagement=Y, freshness=Z, total=T, source=S) sorted by score descending
- [x] T022 [US3] Write parametrized scoring calibration tests in `tests/test_sync_producer.py`: use realistic video stats (1-day-old 500 views vs 2-year-old 5M views vs 1-month-old 100K high-engagement) and assert relative ordering matches expected behavior from spec acceptance scenarios

**Checkpoint**: Scoring is validated with realistic data. Verbose output allows manual inspection of rankings.

---

## Phase 6: User Story 4 — Graceful Degradation on API Failure (Priority: P3)

**Goal**: Search API failures don't abort channel processing.

**Independent Test**: Simulate a 429 error on search.list, verify channel still produces results from remaining sources.

### Implementation for User Story 4

- [x] T023 [US4] Write test for graceful degradation in `tests/test_sync_producer.py`: mock `api_get` to raise HTTPError for search calls but succeed for playlist, verify `process_channel()` completes with playlist-only results and logs warnings
- [x] T024 [US4] Verify error handling from T019 covers all failure modes: single source failure, both search sources fail (fallback to recent-only), network timeout. Ensure error summaries include which sources failed per channel

**Checkpoint**: API failures are handled gracefully. No channel is skipped due to a single source failing.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, config documentation, and end-to-end validation

- [x] T025 [P] Update `CLAUDE.md` with new `--mode` CLI options and descriptions
- [x] T026 [P] Update `config/producer.yaml` comments to document all new scoring/sources sections
- [x] T027 Run full end-to-end validation: `uv run python scripts/sync_producer.py --mode full --dry-run` for all 52 channels, verify quota ≤10,000 units, verify source distribution in output
- [x] T028 Run recent-mode validation after full-mode: verify reserved slots preserved, recent slots reconciled correctly
- [x] T029 Run `uv run pytest tests/test_sync_producer.py -v` — all tests pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (config loaded for scoring)
- **US1 (Phase 3)**: Depends on Phase 2 (scoring + selection functions)
- **US2 (Phase 4)**: Depends on Phase 3 (recent-mode must work before full-mode extends it)
- **US3 (Phase 5)**: Depends on Phase 4 (needs full-mode data for calibration)
- **US4 (Phase 6)**: Depends on Phase 4 (error handling for search calls)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **US1 (Daily Recent)**: Foundation only — can be MVP
- **US2 (Weekly Full)**: Extends US1 — adds search sources to existing pipeline
- **US3 (Scoring Calibration)**: Needs US2 data — validation/tuning phase
- **US4 (Graceful Degradation)**: Needs US2 — hardens error paths

### Parallel Opportunities

**Within Phase 2**: T004 and T006 (tests) can run in parallel
**Within Phase 3**: T008 and T009 (tests) can run in parallel
**Within Phase 4**: T015 and T016 (tests) can run in parallel
**Within Phase 7**: T025 and T026 can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration + config)
2. Complete Phase 2: Scoring + selection functions with tests
3. Complete Phase 3: US1 — daily recent mode with scoring
4. **STOP and VALIDATE**: `--mode recent --dry-run` works, scoring applied, reserved slots concept ready (empty until first full run)

### Full Feature

5. Complete Phase 4: US2 — full mode with 3 sources
6. Complete Phase 5: US3 — scoring calibration
7. Complete Phase 6: US4 — error hardening
8. Complete Phase 7: Polish and end-to-end validation

---

## Notes

- All tasks modify `scripts/sync_producer.py` — sequential within each phase to avoid merge conflicts
- Tests use mocks for API calls — never hit live YouTube API in tests
- The migration (T001) should be applied to Supabase before running any code that writes source_tags
- Existing `--dry-run` and `--channel` flags continue to work with the new `--mode` argument
