# Tasks: Video Sync Producer

**Input**: Design documents from `/specs/004-video-sync-producer/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: Included per constitution (Testing Discipline is NON-NEGOTIABLE). Parametrized tests for rule application, diff logic, date range parsing. Mocked API responses.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Scripts**: `scripts/` at repository root
- **Migrations**: `supabase/migrations/`
- **Tests**: `tests/`

---

## Phase 1: Setup

**Purpose**: Database table and project scaffolding

- [X] T001 Create sync_queue table migration in supabase/migrations/20260324000001_create_sync_queue.sql — columns: id (uuid PK), video_id (text), channel_id (text), action (text: download/remove), status (text: pending/processing/done/failed), priority (int default 0), metadata (jsonb), error (text), created_at (timestamptz), started_at (timestamptz), completed_at (timestamptz), attempts (int default 0). Add partial unique index on (video_id, action) WHERE status IN ('pending', 'processing'). Add index on (status, created_at) for worker polling. Enable RLS with permissive policy.
- [X] T002 Apply the sync_queue migration to Supabase via MCP apply_migration

---

## Phase 2: Foundational

**Purpose**: Shared helpers that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create scripts/sync_producer.py with env loading, Supabase client init, YouTube API key validation, argparse (--channel, --dry-run, --verbose), and main() entry point. Validate all required env vars at startup (YOUTUBE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY). Exit code 2 if missing.
- [X] T004 Implement `uploads_playlist_id(channel_id)` helper — converts UC... to UU... prefix
- [X] T005 Implement `fetch_playlist_items(api_key, playlist_id, max_pages=20)` — paginated playlistItems.list fetcher returning list of {video_id, title, published_at, description, thumbnail_url}. Track and return quota usage (page count).
- [X] T006 Implement `enrich_videos(api_key, video_ids)` — batch videos.list in chunks of 50, returning dict keyed by video_id with {duration_seconds, view_count, like_count, comment_count, duration_iso}. Track and return quota usage (call count).
- [X] T007 Implement `parse_date_range_override(override_str)` — converts "today-6months", "today-2years", "19700101" etc. to a datetime cutoff. Default: "today-6months". Return UTC datetime.
- [X] T008 Implement `parse_iso_duration(iso_str)` — converts PT3M45S to seconds integer. Handle hours, minutes, seconds.
- [X] T009 [P] Implement `fetch_curated_channels(client)` — query curated_channels with date_range_override + channels(youtube_id, title, custom_url) joined. Return list of channel dicts.
- [X] T010 [P] Implement `fetch_existing_video_ids(client, channel_id)` — query videos table for youtube_id WHERE channel_id = X. Return set of video IDs.
- [X] T011 [P] Implement `fetch_orphaned_channel_ids(client, curated_channel_ids)` — query videos for DISTINCT channel_id WHERE channel_id NOT IN curated set. Return set of orphaned channel IDs.

**Checkpoint**: Foundation ready — all helpers available for user story implementation

---

## Phase 3: User Story 1 — Discover New Videos to Download (Priority: P1) 🎯 MVP

**Goal**: For each curated channel, compute desired set of videos, diff against DB, enqueue download jobs for new videos.

**Independent Test**: Run producer for a single channel with --channel flag. Verify new videos appear in sync_queue with action=download.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Unit test for `apply_rules()` in tests/test_sync_producer.py — parametrized: video under 60s excluded, video under 300s excluded, video over 300s included, video before date cutoff excluded, video after date cutoff included. Use give/want/id convention.
- [X] T013 [P] [US1] Unit test for `compute_diff()` in tests/test_sync_producer.py — parametrized: new video → download, existing video → no action, video in DB but not desired → remove. Use give/want/id convention.
- [X] T014 [P] [US1] Unit test for `parse_date_range_override()` in tests/test_sync_producer.py — parametrized: "today-6months", "today-2years", "today-1years", "19700101", None (default).

### Implementation for User Story 1

- [X] T015 [US1] Implement `apply_rules(videos, min_duration_s, date_cutoff)` in scripts/sync_producer.py — filter list of enriched videos by duration >= min_duration_s, duration >= 60 (exclude shorts), published_at >= date_cutoff. Return filtered list.
- [X] T016 [US1] Implement `compute_diff(desired_ids, existing_ids)` in scripts/sync_producer.py — return (to_download: set, to_remove: set) from set difference.
- [X] T017 [US1] Implement `enqueue_jobs(client, jobs, dry_run)` in scripts/sync_producer.py — batch INSERT into sync_queue with ON CONFLICT DO NOTHING (matching the partial unique index). Each job: video_id, channel_id, action, status='pending', metadata (jsonb with full enriched data). Skip writes if dry_run=True, log what would be enqueued.
- [X] T018 [US1] Implement `process_channel(client, api_key, channel, dry_run, verbose)` — orchestrates: fetch playlist → enrich → apply rules → fetch existing IDs → compute diff → enqueue download jobs. Return summary dict {channel_id, desired, existing, downloads, removals, quota_used}.
- [X] T019 [US1] Wire up main() loop — iterate curated channels (or single --channel), call process_channel for each, accumulate quota totals, print per-channel and total summary. Handle API errors per channel (log + skip, don't abort).

**Checkpoint**: Producer discovers and enqueues download jobs. Test with `uv run python scripts/sync_producer.py --channel UC... --dry-run`

---

## Phase 4: User Story 2 — Identify Videos to Remove (Priority: P2)

**Goal**: Videos in DB but not in desired set get enqueued as remove jobs. Channels removed from curation get all their videos enqueued for removal.

**Independent Test**: Change a channel's date_range_override to a shorter window, run producer, verify remove jobs enqueued.

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Unit test for orphaned channel detection in tests/test_sync_producer.py — parametrized: channel in curated → not orphaned, channel not in curated but has videos → orphaned.
- [X] T021 [P] [US2] Unit test for compute_diff remove path in tests/test_sync_producer.py — video in DB but not in desired set → to_remove. Video aged out of date range → to_remove.

### Implementation for User Story 2

- [X] T022 [US2] Add remove job enqueuing to `process_channel()` in scripts/sync_producer.py — after computing to_remove set, enqueue jobs with action='remove' and metadata containing the video's existing DB info (media_path, thumbnail_path etc. for R2 cleanup).
- [X] T023 [US2] Implement orphaned channel cleanup in main() in scripts/sync_producer.py — after processing all curated channels, call fetch_orphaned_channel_ids(), for each orphaned channel fetch all its video IDs, enqueue remove jobs for all of them.
- [X] T024 [US2] For remove jobs, populate metadata with existing video row data (media_path, thumbnail_path, subtitle_path) so the consumer can delete R2 objects without re-querying.

**Checkpoint**: Producer enqueues both download AND remove jobs. Test with date range change + --dry-run.

---

## Phase 5: User Story 3 — Efficient API Usage (Priority: P1)

**Goal**: Quota tracking and logging to verify efficient API usage.

**Independent Test**: Run full producer, verify logged quota stays under 500 units.

### Implementation for User Story 3

- [X] T025 [US3] Add quota tracking to fetch_playlist_items() and enrich_videos() in scripts/sync_producer.py — each function returns (result, quota_used) tuple. Quota = number of API calls made.
- [X] T026 [US3] Add per-channel quota summary logging in process_channel() — log: channel name, playlist_pages, enrich_calls, total_quota for that channel.
- [X] T027 [US3] Add total run summary in main() — log: total channels processed, total quota used, total downloads enqueued, total removals enqueued, runtime in seconds.

**Checkpoint**: Full producer run shows quota usage per channel and total. Verify < 500 for all 52 channels.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and operational readiness

- [X] T028 Remove pilot script scripts/sync_channels.py and scripts/pilot_channel_metadata.json
- [X] T029 Update CLAUDE.md — add sync_producer.py to Commands table with flags (--channel, --dry-run, --verbose)
- [X] T030 Run full producer for all 52 channels with --dry-run and verify output summary

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (sync_queue table must exist)
- **US1 (Phase 3)**: Depends on Phase 2 — core download discovery
- **US2 (Phase 4)**: Depends on Phase 3 — adds remove logic to existing process_channel
- **US3 (Phase 5)**: Depends on Phase 3 — adds quota tracking to existing functions
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — MVP, no dependencies on other stories
- **User Story 2 (P2)**: Extends US1's process_channel — depends on US1 being complete
- **User Story 3 (P1)**: Adds tracking to US1's functions — depends on US1 being complete

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Helpers before orchestration
- Core logic before CLI wiring

### Parallel Opportunities

- T009, T010, T011 can run in parallel (different DB queries, independent functions)
- T012, T013, T014 can run in parallel (independent test files)
- T020, T021 can run in parallel (independent test cases)
- US3 (Phase 5) can run in parallel with US2 (Phase 4) since they modify different parts of the code

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration)
2. Complete Phase 2: Foundational (helpers)
3. Complete Phase 3: User Story 1 (download discovery)
4. **STOP and VALIDATE**: `uv run python scripts/sync_producer.py --channel UCxaS4JFV0AHPwVXw-2GM00w --dry-run`
5. Verify output shows correct download jobs for FunQuesters

### Incremental Delivery

1. Setup + Foundational → Helpers ready
2. Add US1 → Download discovery works → Test with --dry-run (MVP!)
3. Add US2 → Remove detection works → Test with date range change
4. Add US3 → Quota tracking → Verify < 500 units full run
5. Polish → Clean up pilot, update docs

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All scripts MUST use `uv run` — never naked python
- Constitution requires TDD: write test → confirm failure → implement → confirm pass
- Commit after each phase completion
