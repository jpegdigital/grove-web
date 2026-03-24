# Tasks: Queue Consumer for Video Sync Pipeline

**Input**: Design documents from `/specs/006-queue-consumer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per constitution (Testing Discipline is NON-NEGOTIABLE — TDD mandatory).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add yt-dlp dependency, create consumer config, scaffold the script

- [x] T001 Add `yt-dlp` to pyproject.toml dependencies and run `uv lock` to update lockfile
- [x] T002 [P] Create consumer configuration file at config/consumer.yaml with all tunables (batch_size, max_attempts, stale_lock_minutes, throttle_seconds, ytdlp format/height/sidecar settings, r2 key template)
- [x] T003 [P] Create scripts/sync_consumer.py scaffold with: module docstring, imports, `load_env()`, `load_config()` with defaults, `argparse` setup (--limit, --dry-run, --verbose, --downloads-only, --removals-only), and empty `main()`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database RPC functions and core utility functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Apply migration for `claim_consumer_jobs` RPC function in supabase/migrations/20260324000006_add_consumer_rpc_functions.sql — atomic batch pickup with FOR UPDATE SKIP LOCKED per data-model.md
- [x] T005 Add `reset_stale_consumer_locks` RPC function to the same migration file supabase/migrations/20260324000006_add_consumer_rpc_functions.sql
- [x] T006 [P] Implement `create_r2_client()` in scripts/sync_consumer.py — reuse boto3 S3-compatible pattern from sync_downloads.py (endpoint URL, credentials from env vars)
- [x] T007 [P] Implement `build_r2_key(channel_handle, published_at, video_id, ext)` in scripts/sync_consumer.py — returns `{handle}/{YYYY}-{MM}/{video_id}.{ext}` per research R6
- [x] T008 [P] Implement `parse_info_json(info_path)` in scripts/sync_consumer.py — extract video metadata fields from yt-dlp's .info.json (title, description, duration, view_count, like_count, comment_count, published_at, thumbnail_url, handle, tags, categories, chapters, width, height, fps, language, webpage_url) per data-model.md video record columns
- [x] T009 [P] Implement `upload_to_r2(r2_client, bucket, local_path, r2_key)` in scripts/sync_consumer.py — upload single file with MIME type guessing, return True/False, log size and key on success, log error details on failure
- [x] T010 [P] Implement `resolve_channel_handle(client, job)` in scripts/sync_consumer.py — extract handle from job metadata, fallback to DB lookup from channels table if missing

**Checkpoint**: Foundation ready — RPC functions deployed, all utility functions implemented

---

## Phase 3: User Story 1 — Process Download Jobs (Priority: P1) MVP

**Goal**: Consumer picks pending download jobs, downloads via yt-dlp, uploads to R2, upserts video record, deletes job on success, retries on failure.

**Independent Test**: Enqueue a single download job manually, run the consumer, verify the video appears in the feed with all sidecar files in R2.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [P] [US1] Test `download_video()` in tests/test_sync_consumer.py — mock subprocess.run, verify correct yt-dlp args (format, height, faststart, output template, sidecar flags), test success (exit 0) and failure (exit non-zero) paths
- [x] T012 [P] [US1] Test `build_r2_key()` in tests/test_sync_consumer.py — parameterized: various handles, dates, video_ids, extensions; edge cases (handle with @, missing date)
- [x] T013 [P] [US1] Test `parse_info_json()` in tests/test_sync_consumer.py — parameterized: full metadata, minimal metadata, missing optional fields, chapters parsing
- [x] T014 [P] [US1] Test `process_download_job()` in tests/test_sync_consumer.py — mock download + upload + DB calls, verify: successful flow deletes job, failed download increments attempts, R2 upload failure increments attempts, staging cleanup on both success and failure
- [x] T015 [P] [US1] Test `upsert_video_record()` in tests/test_sync_consumer.py — verify correct fields set from info.json + R2 paths, verify r2_synced_at only set when all uploads succeed

### Implementation for User Story 1

- [x] T016 [US1] Implement `download_video(video_id, staging_dir, config)` in scripts/sync_consumer.py — call yt-dlp via subprocess with format string, max height, faststart postprocessor, sidecar flags (--write-thumbnail, --write-subs, --write-auto-subs, --sub-langs en, --sub-format vtt, --write-info-json), output template `{staging_dir}/{video_id}.%(ext)s`, return (success: bool, stderr: str)
- [x] T017 [US1] Implement `collect_downloaded_files(staging_dir, video_id)` in scripts/sync_consumer.py — glob staging dir to find video (.mp4), thumbnail (.jpg/.webp/.png), subtitle (.vtt), info.json; return dict of {type: Path}
- [x] T018 [US1] Implement `upload_video_files(r2_client, bucket, files, channel_handle, published_at, video_id)` in scripts/sync_consumer.py — upload each file using build_r2_key + upload_to_r2, return dict of {type: r2_key} on success, raise on any failure
- [x] T019 [US1] Implement `upsert_video_record(client, video_id, channel_id, info_data, r2_keys, source_tags)` in scripts/sync_consumer.py — build row dict from info.json data + R2 paths, set is_downloaded=True, downloaded_at=NOW(), r2_synced_at=NOW(), upsert on youtube_id conflict
- [x] T020 [US1] Implement `cleanup_staging(staging_dir)` in scripts/sync_consumer.py — remove per-job staging subdirectory and all contents, tolerate already-missing dir
- [x] T021 [US1] Implement `process_download_job(client, r2_client, bucket, job, config, verbose, dry_run)` in scripts/sync_consumer.py — orchestrate: create staging dir → download → collect files → upload → parse info.json → upsert video → delete job; on failure: increment attempts + record error + cleanup staging; always cleanup staging in finally block
- [x] T022 [US1] Implement `claim_jobs(client, batch_size, max_attempts)` in scripts/sync_consumer.py — call claim_consumer_jobs RPC, return list of job dicts
- [x] T023 [US1] Implement `fail_job(client, job_id, error_message)` in scripts/sync_consumer.py — UPDATE sync_queue SET status='pending', attempts=attempts+1, error=message WHERE id=job_id
- [x] T024 [US1] Implement `complete_job(client, job_id)` in scripts/sync_consumer.py — DELETE FROM sync_queue WHERE id=job_id
- [x] T025 [US1] Wire download processing into `main()` in scripts/sync_consumer.py — claim batch → iterate jobs → process_download_job for action='download' → throttle between jobs → print summary (processed, succeeded, failed, skipped, duration)

**Checkpoint**: Download jobs work end-to-end. Run `uv run python scripts/sync_consumer.py --limit 1 --verbose` to verify a single video downloads, uploads to R2, and appears in feed.

---

## Phase 4: User Story 2 — Process Removal Jobs (Priority: P2)

**Goal**: Consumer processes removal jobs by deleting R2 files and clearing video record visibility.

**Independent Test**: Mark a synced video for removal, run consumer, verify files gone from R2 and video invisible in feed.

### Tests for User Story 2

- [x] T026 [P] [US2] Test `delete_from_r2()` in tests/test_sync_consumer.py — mock r2_client.delete_object, verify: all 4 files deleted (media, thumbnail, subtitle, info.json), tolerate missing files (NoSuchKey), handle service errors
- [x] T027 [P] [US2] Test `clear_video_record()` in tests/test_sync_consumer.py — verify correct columns nulled (media_path, thumbnail_path, subtitle_path, r2_synced_at) and is_downloaded set false
- [x] T028 [P] [US2] Test `process_remove_job()` in tests/test_sync_consumer.py — mock R2 delete + DB update, verify: successful flow deletes job, R2 error increments attempts, partial missing files still succeed

### Implementation for User Story 2

- [x] T029 [US2] Implement `delete_from_r2(r2_client, bucket, job_metadata)` in scripts/sync_consumer.py — delete media_path, thumbnail_path, subtitle_path, and derived info.json key; tolerate NoSuchKey errors; return (success: bool, error: str|None)
- [x] T030 [US2] Implement `clear_video_record(client, video_id)` in scripts/sync_consumer.py — UPDATE videos SET r2_synced_at=NULL, media_path=NULL, thumbnail_path=NULL, subtitle_path=NULL, is_downloaded=false WHERE youtube_id=video_id
- [x] T031 [US2] Implement `process_remove_job(client, r2_client, bucket, job, verbose, dry_run)` in scripts/sync_consumer.py — orchestrate: delete from R2 → clear video record → delete job; on failure: increment attempts + record error
- [x] T032 [US2] Wire removal processing into `main()` loop in scripts/sync_consumer.py — route action='remove' jobs to process_remove_job, include removals in summary counts

**Checkpoint**: Both download and removal jobs process correctly. Test with `--removals-only` flag.

---

## Phase 5: User Story 3 — Recover from Interrupted Runs (Priority: P2)

**Goal**: Consumer detects stale processing locks at startup and resets them to pending.

**Independent Test**: Manually set a job to processing with old started_at, run consumer, verify it gets reset and processed.

### Tests for User Story 3

- [x] T033 [P] [US3] Test `reset_stale_locks()` in tests/test_sync_consumer.py — mock RPC call, verify: stale_minutes parameter passed correctly, return value logged, zero stale locks returns 0

### Implementation for User Story 3

- [x] T034 [US3] Implement `reset_stale_locks(client, stale_lock_minutes)` in scripts/sync_consumer.py — call reset_stale_consumer_locks RPC, return count of reset jobs, log result
- [x] T035 [US3] Wire stale lock reset into `main()` in scripts/sync_consumer.py — call reset_stale_locks BEFORE claim_jobs, log "Reset N stale locks" (or "Reset 0 stale locks" if none)

**Checkpoint**: Interrupted runs leave no permanently stuck jobs. Verify by manually setting a job to processing with old started_at.

---

## Phase 6: User Story 4 — Preview and Control Execution (Priority: P3)

**Goal**: Operator can dry-run, filter by action type, override batch size, and get verbose output.

**Independent Test**: Run with --dry-run and verify zero side effects; run with --downloads-only and verify removals untouched.

### Tests for User Story 4

- [x] T036 [P] [US4] Test dry-run mode in tests/test_sync_consumer.py — verify: no subprocess calls, no R2 uploads, no DB mutations, summary still printed
- [x] T037 [P] [US4] Test action filtering in tests/test_sync_consumer.py — verify: --downloads-only skips remove jobs, --removals-only skips download jobs

### Implementation for User Story 4

- [x] T038 [US4] Add dry-run guards to process_download_job and process_remove_job in scripts/sync_consumer.py — when dry_run=True, print what would happen but skip download/upload/DB write
- [x] T039 [US4] Add action filtering to main() loop in scripts/sync_consumer.py — respect --downloads-only and --removals-only flags, skip non-matching jobs with log message
- [x] T040 [US4] Add verbose output to process_download_job and process_remove_job in scripts/sync_consumer.py — when verbose=True, print yt-dlp stdout/stderr, per-file upload progress, R2 keys, DB update details
- [x] T041 [US4] Implement run summary in main() in scripts/sync_consumer.py — print table: processed, succeeded, failed, skipped (max attempts), downloads vs removals breakdown, total duration

**Checkpoint**: All CLI flags work. Verify with `--dry-run --verbose`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, env var validation, and final verification

- [x] T042 [P] Add startup env var validation to scripts/sync_consumer.py — check NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME; fail fast with clear error messages per constitution Principle III
- [x] T043 [P] Update CLAUDE.md commands table with sync_consumer.py entries (standard run, --limit, --dry-run, --verbose, --downloads-only, --removals-only)
- [x] T044 [P] Verify ffmpeg is on PATH at startup in scripts/sync_consumer.py — check with `ffmpeg -version` subprocess call, warn if missing (yt-dlp needs it for muxing + faststart)
- [x] T045 Run full test suite: `uv run pytest tests/test_sync_consumer.py -v` — all tests pass
- [x] T046 Run quickstart.md validation: `uv run python scripts/sync_consumer.py --dry-run --verbose` with pending jobs — verify output matches expected format

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (yt-dlp dependency + config + scaffold)
- **User Stories (Phase 3-6)**: All depend on Phase 2 completion
  - US1 (Phase 3) can start immediately after Phase 2
  - US2 (Phase 4) can start after Phase 2 (independent of US1 in theory, but shares main() wiring)
  - US3 (Phase 5) can start after Phase 2 (independent)
  - US4 (Phase 6) depends on US1+US2 implementation existing (adds guards to their functions)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no dependencies on other stories. **This is the MVP.**
- **US2 (P2)**: After Phase 2 — shares utility functions with US1 (R2 client, job completion) but implements distinct processing
- **US3 (P2)**: After Phase 2 — fully independent, adds startup behavior only
- **US4 (P3)**: After US1 + US2 — adds dry-run/verbose/filter to existing functions

### Within Each User Story

- Tests MUST be written and FAIL before implementation (constitution Principle II)
- Utility functions before orchestration functions
- Orchestration before main() wiring
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1**: T002 and T003 can run in parallel (different files)
**Phase 2**: T006, T007, T008, T009, T010 can all run in parallel (independent functions in same file, but different function bodies)
**Phase 3 Tests**: T011-T015 can all run in parallel (independent test classes)
**Phase 4 Tests**: T026-T028 can all run in parallel
**Phase 7**: T042, T043, T044 can all run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (write tests first, verify they fail):
Task: "Test download_video() in tests/test_sync_consumer.py"
Task: "Test build_r2_key() in tests/test_sync_consumer.py"
Task: "Test parse_info_json() in tests/test_sync_consumer.py"
Task: "Test process_download_job() in tests/test_sync_consumer.py"
Task: "Test upsert_video_record() in tests/test_sync_consumer.py"

# Then implement sequentially (functions depend on each other):
Task: "download_video() → collect_downloaded_files() → upload_video_files() → upsert_video_record() → cleanup_staging() → process_download_job() → claim/fail/complete helpers → main() wiring"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T010)
3. Complete Phase 3: User Story 1 (T011-T025)
4. **STOP and VALIDATE**: `uv run python scripts/sync_consumer.py --limit 1 --verbose`
5. Verify video appears in feed, plays with instant start

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test with single video → **MVP! Downloads work**
3. Add US2 → Test removal → **Catalog cleanup works**
4. Add US3 → Test stale lock → **Unattended operation safe**
5. Add US4 → Test dry-run → **Full operational control**
6. Polish → Docs + validation → **Production ready**

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Constitution Principle II mandates TDD: write tests first, verify they fail, then implement
- All yt-dlp calls via subprocess (research R1) — never import yt_dlp directly
- R2 keys follow `{handle}/{YYYY}-{MM}/{video_id}.{ext}` pattern (research R6)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
