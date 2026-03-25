# Tasks: HLS Adaptive Streaming Pipeline

**Input**: Design documents from `/specs/007-hls-streaming/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included per constitution (Testing Discipline is NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story. US2 (consumer pipeline) comes before US1 (player) because the player needs HLS content in R2 to test against. US3 (bandwidth savings) has no separate tasks — it's a natural consequence of US1+US2 working correctly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies, configure R2 CORS, add HLS config section

- [X] T001 Install hls.js frontend dependency in package.json (`npm install hls.js`)
- [X] T002 [P] Add HLS config section (tiers, segment_duration, segment_type, min_tiers) to config/consumer.yaml
- [X] T003 [P] Create R2 CORS configuration script in scripts/configure_r2_cors.py — set AllowedOrigins, AllowedMethods (GET, HEAD), AllowedHeaders (Range), ExposeHeaders (Content-Length, Content-Range, Accept-Ranges) using boto3 put_bucket_cors
- [ ] T004 Run scripts/configure_r2_cors.py to apply CORS rules to the R2 bucket (one-time)

**Checkpoint**: hls.js available in node_modules, consumer config has HLS section, R2 bucket accepts cross-origin range requests

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Verify ffmpeg is available and can perform fMP4 remux; this blocks all consumer work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add ffmpeg availability check at consumer startup in scripts/sync_consumer.py — fail fast with actionable error if ffmpeg is not on PATH
- [X] T006 [P] Write test for ffmpeg availability check in tests/test_sync_consumer.py

**Checkpoint**: Consumer fails loudly at startup if ffmpeg missing. Foundation ready for user story implementation.

---

## Phase 3: User Story 2 - Consumer Produces HLS Packages (Priority: P1) 🎯 MVP

**Goal**: The sync consumer downloads 4 quality tiers from YouTube, remuxes each into HLS fMP4 segments via ffmpeg -c copy, generates master.m3u8, and uploads the complete package to R2 under a folder-per-video structure.

**Independent Test**: `uv run python scripts/sync_consumer.py --limit 1 --verbose` — verify it downloads 4 tiers, produces HLS segments, uploads to R2, and master.m3u8 is accessible.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US2] Write test for multi-tier yt-dlp format selector building (given tier config, assert correct format strings per height) in tests/test_sync_consumer.py
- [X] T008 [P] [US2] Write test for ffmpeg HLS remux command building (given an MP4 path and tier label, assert correct ffmpeg args including -c copy, -hls_time, -hls_segment_type fmp4, -hls_playlist_type vod) in tests/test_sync_consumer.py
- [X] T009 [P] [US2] Write test for master.m3u8 generation (given a list of completed tiers with bandwidth/resolution/codecs, assert valid HLS master playlist content with correct #EXT-X-STREAM-INF entries) in tests/test_sync_consumer.py
- [X] T010 [P] [US2] Write test for R2 key building under new folder structure (given handle, published_at, video_id, assert keys like @handle/YYYY-MM/video_id/master.m3u8) in tests/test_sync_consumer.py
- [X] T011 [P] [US2] Write test for graceful handling of missing tiers (given only 2 of 4 tiers downloaded, assert master playlist has 2 entries and job succeeds) in tests/test_sync_consumer.py
- [X] T012 [P] [US2] Write test for minimum tier enforcement (given 0 tiers downloaded, assert job fails with clear error) in tests/test_sync_consumer.py

### Implementation for User Story 2

- [X] T013 [US2] Implement `download_video_tiers()` function in scripts/sync_consumer.py — loop through configured tiers, call yt-dlp with height-specific format selector (`bv[height<=N][ext=mp4]+ba[ext=m4a]`), apply throttle between tier downloads, collect results. Download sidecars (thumbnail, subtitle, info.json) only with the highest tier. Return list of successfully downloaded tiers with their paths.
- [X] T014 [US2] Implement `remux_to_hls()` function in scripts/sync_consumer.py — for each downloaded tier MP4, run ffmpeg subprocess with `-c copy -f hls -hls_time 6 -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename "seg_%03d.m4s" -hls_playlist_type vod -hls_flags independent_segments -hls_list_size 0`. Output to per-tier subdirectory (e.g., staging/video_id/720p/). Return list of tier directories with their metadata.
- [X] T015 [US2] Implement `generate_master_playlist()` function in scripts/sync_consumer.py — given list of completed tiers (label, bandwidth, resolution, codecs), write master.m3u8 with #EXTM3U, #EXT-X-VERSION:7, #EXT-X-INDEPENDENT-SEGMENTS, and one #EXT-X-STREAM-INF per tier. Extract bandwidth from ffprobe or info.json, resolution from info.json, codecs string from the tier's video/audio codec info.
- [X] T016 [US2] Implement `upload_hls_package()` function in scripts/sync_consumer.py — walk the staging directory tree, upload each file to R2 under the folder-per-video key structure (@handle/YYYY-MM/video_id/...). Set correct Content-Type per file extension (.m3u8 → application/vnd.apple.mpegurl, .m4s/.mp4 → video/mp4). Set Cache-Control headers (immutable for segments, shorter for playlists).
- [X] T017 [US2] Update `build_r2_key()` in scripts/sync_consumer.py to support folder-per-video structure — change from `{handle}/{year}-{month}/{video_id}.{ext}` to `{handle}/{year}-{month}/{video_id}/{relative_path}` for HLS files. Keep backward-compatible signature.
- [X] T018 [US2] Update `upsert_video_record()` in scripts/sync_consumer.py — set media_path to the master.m3u8 R2 key (e.g., @handle/YYYY-MM/video_id/master.m3u8), thumbnail_path and subtitle_path to their new locations within the video folder.
- [X] T019 [US2] Wire the new functions into the main download job handler in scripts/sync_consumer.py — replace the current single-tier download_video() call with download_video_tiers() → remux_to_hls() → generate_master_playlist() → upload_hls_package() → upsert_video_record(). Preserve existing error handling, retry logic, and staging cleanup.
- [ ] T020 [US2] Run consumer with `--limit 1 --verbose` against a real video and verify end-to-end: 4 tier downloads, HLS remux, R2 upload, DB record updated with .m3u8 path, master.m3u8 accessible via curl.

**Checkpoint**: Consumer produces valid HLS packages in R2. master.m3u8 is accessible and references all available quality tiers. Database records updated with .m3u8 paths. Existing MP4-only videos unaffected.

---

## Phase 4: User Story 1 - Instant Video Playback on Any Device (Priority: P1)

**Goal**: The video player loads HLS master.m3u8 from R2 and plays adaptively — using native HLS on Safari/iOS and hls.js on Chrome/Firefox. Quality switches automatically based on bandwidth.

**Independent Test**: Navigate to `/v/[video_id]` for an HLS-processed video. Verify playback starts quickly, observe segment requests in Network tab, throttle network and confirm quality drops.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T021 [P] [US1] Write test for HLS vs MP4 detection logic (given mediaPath ending in .m3u8 vs .mp4, assert correct playback mode selected) in tests/ (Vitest or equivalent)

### Implementation for User Story 1

- [X] T022 [US1] Add HLS player initialization logic to the VideoPlayer component in src/app/v/[id]/page.tsx — detect mediaPath extension (.m3u8 vs .mp4), check native HLS support via `canPlayType('application/vnd.apple.mpegurl')` first (prefer native on Safari for AirPlay/PiP), fall back to hls.js via `Hls.isSupported()` on Chrome/Firefox, else fall back to progressive MP4. Initialize hls.js with `{ startLevel: -1, capLevelToPlayerSize: true, enableWorker: true }`.
- [X] T023 [US1] Add hls.js lifecycle management to VideoPlayer in src/app/v/[id]/page.tsx — create Hls instance on mount, destroy on unmount/src change to prevent memory leaks. Store instance in useRef. Handle MANIFEST_PARSED event. Add error recovery (recoverMediaError for media errors, startLoad for network errors).
- [X] T024 [US1] Verify existing custom controls (play/pause, seek, progress bar, fullscreen, chapters) work correctly with hls.js-managed video element in src/app/v/[id]/page.tsx — hls.js attaches to the same HTMLVideoElement, so standard events (timeupdate, ended, etc.) should fire normally. Test seek behavior with HLS (segment-based seeking).
- [ ] T025 [US1] Test HLS playback end-to-end in browser — navigate to an HLS-processed video, verify adaptive quality switching in DevTools Network tab, test seek, test on Safari (native) and Chrome (hls.js).

**Checkpoint**: HLS videos play with adaptive bitrate switching. Quality auto-adjusts based on bandwidth. Seeking works. Custom controls functional. Safari uses native HLS, Chrome uses hls.js.

---

## Phase 5: User Story 4 - Backward-Compatible Migration (Priority: P2)

**Goal**: Legacy MP4-only videos continue playing. The player seamlessly handles both HLS and MP4 formats based on mediaPath extension. Consumer cleans up old MP4s when re-processing.

**Independent Test**: Load the feed page with a mix of HLS and MP4 videos. Verify both play correctly. Re-process an MP4 video via consumer and verify old MP4 is deleted from R2.

### Tests for User Story 4 ⚠️

- [X] T026 [P] [US4] Write test for legacy MP4 cleanup logic (given a video with existing .mp4 in R2, after HLS upload assert old MP4 key is deleted) in tests/test_sync_consumer.py

### Implementation for User Story 4

- [X] T027 [US4] Add legacy MP4 cleanup to the consumer's HLS upload flow in scripts/sync_consumer.py — after successful HLS package upload, check if the video previously had a .mp4 media_path (query DB or check R2), and if so delete the old MP4 + sidecar files from R2 to reclaim storage.
- [ ] T028 [US4] Verify the feed page (src/app/feed/) correctly renders and plays both HLS and legacy MP4 videos — ensure video-card thumbnails work for both, and clicking through to the player works for both formats.
- [ ] T029 [US4] Test the migration scenario end-to-end — play a legacy MP4 video, re-process it via consumer (`--limit 1`), verify the video now plays via HLS, and the old MP4 is removed from R2.

**Checkpoint**: Mixed HLS/MP4 feed works correctly. Legacy videos play via progressive MP4. Re-processed videos switch to HLS and old MP4s are cleaned up.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, config updates, and operational readiness

- [X] T030 [P] Update CLAUDE.md with HLS consumer commands and new config options
- [X] T031 [P] Update docs/architecture/sync-consumer.md with HLS pipeline documentation
- [X] T032 Run `npm run lint` and `npm run build` to verify no frontend regressions
- [X] T033 Run `uv run python -m pytest tests/test_sync_consumer.py` to verify all consumer tests pass
- [ ] T034 Run quickstart.md validation — follow the quickstart steps and verify everything works as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US2 Consumer (Phase 3)**: Depends on Foundational — MUST complete before US1 (player needs HLS content in R2)
- **US1 Player (Phase 4)**: Depends on US2 (needs at least 1 HLS video in R2 to test against)
- **US4 Migration (Phase 5)**: Depends on US2 (consumer changes) and US1 (player changes). Can overlap with late US1 tasks.
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US2 (P1 — Consumer)**: Depends on Foundational only. No dependency on other stories. This is the backend prerequisite.
- **US1 (P1 — Player)**: Depends on US2 having produced at least 1 HLS video in R2. Frontend-only changes.
- **US3 (P2 — Bandwidth)**: No tasks — validated by US1+US2 working correctly.
- **US4 (P2 — Migration)**: Depends on both US1 and US2. Adds cleanup logic to consumer and verifies mixed-format feed.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Command/function builders before orchestration
- Individual functions before wiring into main handler
- Unit verification before end-to-end test

### Parallel Opportunities

- T001, T002, T003 can run in parallel (Setup phase)
- T007–T012 can all run in parallel (US2 tests)
- T013–T015 can partially overlap (independent functions, different concerns)
- T021 can run in parallel with US2 implementation
- T030, T031 can run in parallel (documentation)

---

## Parallel Example: User Story 2

```bash
# Launch all US2 tests in parallel (different test functions, same file):
Task T007: "Write test for multi-tier format selector building"
Task T008: "Write test for ffmpeg HLS remux command building"
Task T009: "Write test for master.m3u8 generation"
Task T010: "Write test for R2 key building under new folder structure"
Task T011: "Write test for graceful missing tier handling"
Task T012: "Write test for minimum tier enforcement"

# Then implement functions (T013-T015 can partially overlap):
Task T013: "Implement download_video_tiers()"
Task T014: "Implement remux_to_hls()"
Task T015: "Implement generate_master_playlist()"
```

---

## Implementation Strategy

### MVP First (US2 → US1)

1. Complete Phase 1: Setup (install hls.js, add config, configure CORS)
2. Complete Phase 2: Foundational (ffmpeg check)
3. Complete Phase 3: US2 — Consumer produces HLS packages
4. **STOP and VALIDATE**: Run consumer on 1 video, verify HLS package in R2
5. Complete Phase 4: US1 — Player with HLS support
6. **STOP and VALIDATE**: Play HLS video in browser, test on multiple browsers
7. Deploy/demo with HLS working end-to-end

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US2 (Consumer) → HLS packages in R2 (backend MVP!)
3. US1 (Player) → Adaptive streaming in browser (full MVP!)
4. US4 (Migration) → Clean migration path for existing videos
5. Polish → Documentation, cleanup, validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 (Bandwidth Savings) has no separate tasks — it's validated by US1+US2 working
- The consumer is the bottleneck — US2 must complete before US1 can be meaningfully tested
- ffmpeg -c copy means remux is near-instant (seconds, not minutes per video)
- Each consumer run now downloads 4x the files from YouTube — monitor bot detection
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
