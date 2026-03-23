# Tasks: R2 Video Storage Migration

**Input**: Design documents from `/specs/003-migrate-video-hosting/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not requested — manual verification per single-user POC pattern.

**Organization**: Tasks grouped by user story. US4 (DB migration) is foundational and must complete before other stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Add R2 dependency, configure environment, clean up Bunny artifacts

- [x] T001 Add boto3 dependency via `uv add boto3` and verify in pyproject.toml
- [x] T002 [P] Add R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, NEXT_PUBLIC_R2_PUBLIC_URL) to .env.local
- [x] T003 [P] Remove Bunny environment variables (BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY) from .env.local
- [x] T004 [P] Delete scripts/sync_bunny.py and remove `sync-bunny` entry from pyproject.toml scripts section
- [x] T005 [P] Delete uncommitted Bunny migration file supabase/migrations/20260323000001_add_bunny_stream_columns.sql

---

## Phase 2: Foundational — Database Migration (US4, Priority: P1)

**Purpose**: Replace Bunny Stream columns with R2 tracking. MUST complete before any other story.

**Goal**: Schema has r2_synced_at column, Bunny columns are gone, correct indexes exist.

**Independent Test**: Run migration via Supabase MCP, then query `SELECT column_name FROM information_schema.columns WHERE table_name = 'videos'` to confirm r2_synced_at exists and bunny_* columns are gone.

- [x] T006 [US4] Create migration supabase/migrations/20260323000002_replace_bunny_with_r2.sql that: (1) drops bunny_video_id, bunny_collection_id, bunny_status, bunny_uploaded_at columns, (2) drops idx_videos_bunny_pending and idx_videos_bunny_video_id indexes, (3) adds r2_synced_at timestamptz column (nullable, default NULL), (4) creates idx_videos_r2_pending partial index on (is_downloaded) WHERE r2_synced_at IS NULL AND is_downloaded = true, (5) creates idx_videos_r2_synced partial index on (r2_synced_at) WHERE r2_synced_at IS NOT NULL
- [x] T007 [US4] Apply migration to Supabase project via MCP apply_migration tool

**Checkpoint**: Database schema ready. All subsequent phases can proceed.

---

## Phase 3: User Story 2 — Automated Upload During Sync (Priority: P1) 🎯 MVP

**Goal**: sync_downloads.py uploads all sidecar files to R2 after scanning, with --limit and --skip-r2 flags.

**Independent Test**: Run `uv run python scripts/sync_downloads.py --limit 5`, then verify 5 videos have r2_synced_at set in Supabase and their files are accessible at the R2 public URL.

### Implementation

- [x] T008 [US2] Add R2 client initialization to scripts/sync_downloads.py: import boto3, read R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME from env vars, create S3 client with endpoint_url `https://{account_id}.r2.cloudflarestorage.com` and region_name="auto". Fail fast with clear error if any R2 env var is missing (unless --skip-r2 is set).
- [x] T009 [US2] Add CLI flags to scripts/sync_downloads.py: --limit (int, default unlimited — caps R2 uploads per run, not DB syncs), --purge (bool, default false — reserved for US3), --skip-r2 (bool, default false — skips R2 upload step entirely for DB-only sync)
- [x] T010 [US2] Implement R2 upload function in scripts/sync_downloads.py: takes local file path and R2 object key, uses boto3 upload_file() with ExtraArgs={"ContentType": mime_type} where mime_type comes from mimetypes.guess_type(). Log each upload (key, file size). Catch botocore.exceptions.ClientError specifically, log error with key/status/message, return success/failure bool.
- [x] T011 [US2] Implement per-video R2 sync logic in scripts/sync_downloads.py: after existing DB upsert loop, query Supabase for videos where is_downloaded=true AND r2_synced_at IS NULL (respecting --limit). For each video: upload media_path file, thumbnail_path file (if exists), subtitle_path file (if exists), and info.json (derived from media_path stem + .info.json). If ALL uploads succeed, update Supabase row setting r2_synced_at=now(). If any upload fails, skip that video (r2_synced_at stays NULL), log warning, continue to next video.
- [x] T012 [US2] Add summary output at end of scripts/sync_downloads.py: print counts for DB synced, R2 uploaded, R2 skipped (already synced), R2 failed. Exit code 0 if no failures, 1 if partial failures, 2 if fatal (cannot connect to R2/Supabase).

**Checkpoint**: Running `uv run python scripts/sync_downloads.py --limit 5` should scan downloads, upsert to DB, upload 5 videos to R2, and set their r2_synced_at timestamps. Videos are now accessible at R2 public URLs.

---

## Phase 4: User Story 1 — Videos Serve from Cloud CDN (Priority: P1)

**Goal**: Frontend constructs R2 public URLs instead of /api/media/ paths. Feed only shows R2-synced videos.

**Independent Test**: Load feed at localhost:3000/feed — videos with r2_synced_at should appear with thumbnails loading from R2 domain. Click a video — it should play from R2 URL. Non-R2 videos should not appear.

### Implementation

- [x] T013 [P] [US1] Update feed query in src/app/api/videos/feed/route.ts: change filter from `is_downloaded = true` (or `.eq("is_downloaded", true)`) to `.not("r2_synced_at", "is", null)`. Add r2_synced_at to the select columns if not already included.
- [x] T014 [P] [US1] Update video detail query in src/app/api/videos/[id]/route.ts: add filter `.not("r2_synced_at", "is", null)` for the primary DB lookup. Remove the filesystem fallback path that scans MEDIA_DIR for .info.json files (no longer needed since all serveable videos are in DB with r2_synced_at).
- [x] T015 [P] [US1] Update src/components/video-card.tsx: replace thumbnail URL construction from `/api/media/${thumbnailPath}` to `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${thumbnailPath}`. Keep YouTube CDN fallback (`thumbnailUrl`) for videos without a local thumbnail path.
- [x] T016 [US1] Update video player URL construction on the video page (src/app/v/[id]/ or wherever the <video> src is set): replace `/api/media/${mediaPath}` with `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${mediaPath}`. Also update subtitle track src if applicable.
- [x] T017 [P] [US1] Delete src/app/api/media/[...path]/route.ts (entire file and directory)
- [x] T018 [P] [US1] Add R2 public domain to remotePatterns in next.config.ts: add entry for the r2.dev hostname (extract hostname from NEXT_PUBLIC_R2_PUBLIC_URL or hardcode the r2.dev pattern) so next/image can optimize R2-hosted thumbnails
- [x] T019 [US1] Update CLAUDE.md: remove /api/media reference from Architecture and Gotchas sections, add R2 public URL info, update the data flow description

**Checkpoint**: Feed shows only R2-synced videos. Thumbnails and videos load from R2 domain. Playing a video works with seeking. The /api/media route is gone.

---

## Phase 5: User Story 3 — Local Storage Cleanup (Priority: P2)

**Goal**: --purge flag deletes local files after confirmed R2 upload. Disabled by default, opt-in only.

**Independent Test**: Run `uv run python scripts/sync_downloads.py --purge` on a video known to be in R2. Verify local files are deleted. Verify the video still plays from R2 in the browser.

### Implementation

- [x] T020 [US3] Implement purge logic in scripts/sync_downloads.py: after R2 upload succeeds and r2_synced_at is set, if --purge flag is set, delete local files (media file, thumbnail, subtitle, info.json) for that video. Only purge files for videos where r2_synced_at IS NOT NULL (double-check before delete). Log each file deletion. If a local file doesn't exist (already deleted), skip silently.
- [x] T021 [US3] Add purge safety check in scripts/sync_downloads.py: before deleting any file, verify that r2_synced_at is set for that video in the DB (not just in-memory). This guards against the edge case where the DB update succeeded but hasn't been committed/replicated.
- [x] T022 [US3] Add purge counts to summary output in scripts/sync_downloads.py: "purged N local file sets" alongside existing DB/R2 counts.

**Checkpoint**: Running with --purge removes local files only for R2-confirmed videos. Running without --purge never deletes anything locally.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, validation

- [x] T023 [P] Search entire codebase for remaining references to `/api/media` and update or remove any stragglers (grep for "/api/media", "api/media", "MEDIA_DIRECTORY" in TypeScript/TSX files)
- [x] T024 [P] Remove MEDIA_DIRECTORY references from next.config.ts or any server-side env usage if no longer needed by any route (it's still needed by sync_downloads.py but not by Next.js)
- [x] T025 Verify end-to-end: run sync_downloads with --limit 5, load feed, play video, check network tab confirms R2 domain, check seeking works, check thumbnail loads from R2
- [x] T026 Run quickstart.md validation: follow the steps in specs/003-migrate-video-hosting/quickstart.md to confirm the documented workflow matches reality

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational/US4)**: Depends on T001 (boto3) and T005 (Bunny migration removed)
- **Phase 3 (US2 - Sync Upload)**: Depends on Phase 2 completion (r2_synced_at column must exist)
- **Phase 4 (US1 - Frontend CDN)**: Depends on Phase 2 (DB filter change). Can be implemented in parallel with Phase 3 but can only be *tested* after Phase 3 uploads some videos.
- **Phase 5 (US3 - Purge)**: Depends on Phase 3 (purge logic is part of sync_downloads, needs R2 upload working)
- **Phase 6 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US4 (DB Migration)**: Foundational — no story dependencies, blocks all others
- **US2 (Sync Upload)**: Depends on US4 only. Core backend work.
- **US1 (CDN Serving)**: Depends on US4 for DB filter. Implementable in parallel with US2 (different files). Testable only after US2 uploads some videos.
- **US3 (Purge)**: Depends on US2. Additive feature on top of upload logic.

### Parallel Opportunities

Within Phase 1: T002, T003, T004, T005 are all independent files — run in parallel.
Within Phase 4: T013, T014, T015, T017, T018 touch different files — run in parallel.
Phase 3 and Phase 4 implementation can overlap (different files: Python vs TypeScript).

---

## Implementation Strategy

### MVP First (US4 + US2 + US1)

1. Complete Phase 1: Setup (5 min)
2. Complete Phase 2: DB migration (5 min)
3. Complete Phase 3: Sync upload with --limit 5 (core work)
4. **VALIDATE**: Confirm 5 videos are in R2 and accessible
5. Complete Phase 4: Frontend switches to R2 URLs
6. **VALIDATE**: Feed loads, videos play from R2
7. Run remaining backfill: `uv run python scripts/sync_downloads.py --limit 50` repeatedly

### Incremental Delivery

1. Setup + DB migration → foundation ready
2. Sync upload → videos flowing to R2 (backend complete)
3. Frontend CDN → users see R2-served content (visible change)
4. Purge → disk reclamation available (operational improvement)
5. Each phase adds value without breaking previous work

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No test tasks generated (manual verification per POC pattern)
- Commit after each phase completion
- The --limit flag is critical for initial backfill — run multiple times with --limit 50 rather than one unlimited run
