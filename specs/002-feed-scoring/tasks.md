# Tasks: Feed Scoring Algorithm

**Input**: Design documents from `/specs/002-feed-scoring/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED (FR-012, FR-013). TDD approach: write tests first, confirm they fail, then implement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configure Vitest and project test infrastructure (FR-013 — must be done before any implementation per constitution Principle II)

- [x] T001 Install Vitest as dev dependency via `npm install -D vitest`
- [x] T002 Create Vitest config with path aliases in `vitest.config.ts`
- [x] T003 Add `test` and `test:watch` scripts to `package.json` (`vitest run` and `vitest`)
- [x] T004 Create `tests/unit/` directory and a smoke test in `tests/unit/smoke.test.ts` to verify Vitest runs
- [x] T005 Run `npm test` and verify the smoke test passes

**Checkpoint**: Vitest is configured and runnable. TDD workflow is ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database migration and scoring types that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Apply Supabase migration `add_priority_to_creators_and_channels` adding `priority integer NOT NULL DEFAULT 50` with CHECK (0–100) to both `creators` and `curated_channels` tables
- [x] T007 Define TypeScript interfaces (`ScoringContext`, `ScoredVideo`, `ScoringWeights`) and named constants (`SCORING_WEIGHTS`, `RECENCY_HALF_LIFE_HOURS`, `DEFAULT_PRIORITY`, `MAX_CONSECUTIVE_SAME_CREATOR`) in `src/lib/feed-scoring.ts`
- [x] T008 Implement `hashToFloat(input: string): number` — FNV-1a hash returning deterministic [0, 1) — in `src/lib/feed-scoring.ts`

**Checkpoint**: Foundation ready — database has priority columns, types and hash function exist. User story implementation can now begin.

---

## Phase 3: User Story 1 — Tune Channel Priority in Admin (Priority: P1) + User Story 2 — Deterministic Daily Feed Order (Priority: P1) MVP

**Goal**: Replace round-robin with scored feed. Admin can set channel priority. Feed order is deterministic per day.

**Independent Test**: Set different priorities on two channels in admin, reload feed, verify higher-priority channel's videos rank higher. Reload again same day — same order. Next day — different order.

**Note**: US1 and US2 are combined because the `scoreVideo` function inherently implements both (priority weighting + deterministic jitter). They cannot be meaningfully separated.

### Tests for User Stories 1 & 2 (TDD — write first, confirm failing)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Write parameterized test for `scoreVideo` in `tests/unit/feed-scoring.test.ts`: given two videos with different channel priorities (same everything else), want higher-priority video to score higher
- [x] T010 [P] [US2] Write parameterized test for `scoreVideo` determinism in `tests/unit/feed-scoring.test.ts`: given same inputs + same date, want identical scores; given same inputs + different date, want different scores
- [x] T011 [P] [US1] Write parameterized test for `hashToFloat` in `tests/unit/feed-scoring.test.ts`: given same string, want same float [0, 1); given different strings, want different floats; given date + videoId, want stable output
- [x] T012 [P] [US2] Write parameterized test for `scoreFeed` (full pipeline) in `tests/unit/feed-scoring.test.ts`: given a list of videos, want output sorted by score descending and deterministic for same date
- [x] T013 [P] [US1] Write edge case tests in `tests/unit/feed-scoring.test.ts`: empty video list returns empty, single video returns that video, all-zero priorities still produces output (recency + jitter dominate)

### Implementation for User Stories 1 & 2

- [x] T014 [US1] Implement `scoreVideo(video, channelPriority, creatorPriority, channelCount, date): number` pure function in `src/lib/feed-scoring.ts` — combines recency (7-day half-life), channel priority, creator priority (both normalized 0–1), fairness (1/sqrt(channelCount)), and date-seeded jitter
- [x] T015 [US2] Implement `scoreFeed(videos, context): ScoredVideo[]` in `src/lib/feed-scoring.ts` — scores all videos, sorts by score descending
- [x] T016 [US1] Run `npm test` and verify all T009–T013 tests pass
- [x] T017 [US1] Update feed API route `src/app/api/videos/feed/route.ts` — fetch `priority` from `curated_channels` and `creators` queries, build `ScoringContext` with today's date, call `scoreFeed` instead of `interleaveByCreator`, remove `interleaveByCreator` function
- [x] T018 [US1] Update PATCH `/api/curated-channels/[id]` in `src/app/api/curated-channels/[id]/route.ts` — accept `priority` field (integer 0–100), validate range, update in Supabase
- [x] T019 [P] [US1] Create `StarRating` component in `src/components/ui/star-rating.tsx` — displays 0–5 stars (half-star increments) from 0–100 value, click on star sets decade value (0/10/20/.../100), small numeric input for fine-grained editing, calls `onChange(value: number)`
- [x] T020 [US1] Add channel priority star-rating control to admin panel in `src/app/admin/page.tsx` — display `StarRating` on each channel card, PATCH priority on change, update local state optimistically

**Checkpoint**: Feed is scored by channel priority + recency + deterministic daily jitter. Admin can tune channel priorities via star ratings. Feed order is stable within a day, changes between days. US1 + US2 are fully functional.

---

## Phase 4: User Story 3 — Multi-Channel Creator Fairness (Priority: P2)

**Goal**: Creators with many channels don't dominate the feed over single-channel creators

**Independent Test**: Set up two creators with equal priority — one with 5 channels, one with 1 — and verify neither occupies >60% of the first 18 feed positions.

### Tests for User Story 3 (TDD)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [P] [US3] Write parameterized test for fairness in `tests/unit/feed-scoring.test.ts`: given Creator A with 5 channels and Creator B with 1 channel (equal priority, equal recency), want neither creator to have >60% of first 18 positions
- [x] T022 [P] [US3] Write test for `diversify` function in `tests/unit/feed-scoring.test.ts`: given a scored list with 3+ consecutive videos from same creator, want no more than 2 consecutive after diversify

### Implementation for User Story 3

- [x] T023 [US3] Implement `diversify(videos: ScoredVideo[], maxConsecutive: number): ScoredVideo[]` in `src/lib/feed-scoring.ts` — greedy scan with lookback window, swaps forward next different-creator video when consecutive limit hit
- [x] T024 [US3] Update `scoreFeed` in `src/lib/feed-scoring.ts` to call `diversify` after sorting by score
- [x] T025 [US3] Update feed API route `src/app/api/videos/feed/route.ts` to compute `creatorChannelCounts` map and pass to `scoreFeed`; skip fairness when `creator` query param is set (single-creator view)
- [x] T026 [US3] Run `npm test` and verify all tests pass including T021–T022

**Checkpoint**: Multi-channel creators are balanced. Diversity constraint prevents consecutive clustering. SC-004 and SC-005 are met.

---

## Phase 5: User Story 4 — Creator-Level Priority (Priority: P2)

**Goal**: Admin can set a priority at the creator level to broadly boost or suppress all of a creator's content

**Independent Test**: Set Creator A priority to 90 and Creator B to 10 (both with default channel priorities), verify Creator A's videos rank higher across the feed.

### Tests for User Story 4 (TDD)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T027 [P] [US4] Write parameterized test for creator priority in `tests/unit/feed-scoring.test.ts`: given two videos from different creators with different creator priorities (same channel priority), want higher creator priority video to score higher
- [x] T028 [P] [US4] Write test for creator + channel priority interaction in `tests/unit/feed-scoring.test.ts`: given high creator priority + low channel priority vs low creator priority + high channel priority, want the combined effect to reflect both factors

### Implementation for User Story 4

- [x] T029 [US4] Update PATCH `/api/creators/[id]` in `src/app/api/creators/[id]/route.ts` — accept `priority` field (integer 0–100), validate range, update in Supabase
- [x] T030 [US4] Update GET `/api/creators` in `src/app/api/creators/route.ts` — include `priority` in response
- [x] T031 [US4] Add creator priority star-rating control to admin panel in `src/app/admin/page.tsx` — display `StarRating` on each creator group header, PATCH priority on change
- [x] T032 [US4] Run `npm test` and verify all tests pass including T027–T028

**Checkpoint**: Creator-level priority works alongside channel priority. Admin can broadly boost/suppress creators. All 4 user stories are functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cleanup, and final verification

- [x] T033 Run full test suite `npm test` and verify all tests pass
- [x] T034 Run `npm run lint` and fix any linting errors
- [x] T035 Run `npm run build` and verify production build succeeds
- [x] T036 Run quickstart.md validation — walk through all 5 verification steps in `specs/002-feed-scoring/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (Vitest must be configured before writing tests)
- **User Stories 1+2 (Phase 3)**: Depends on Phase 2 (types, constants, hash function, DB migration)
- **User Story 3 (Phase 4)**: Depends on Phase 3 (scoring function must exist to add fairness + diversity)
- **User Story 4 (Phase 5)**: Depends on Phase 3 (scoring function must exist); can run in parallel with Phase 4
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 + US2 (P1)**: Can start after Foundational — no dependencies on other stories
- **US3 (P2)**: Depends on US1+US2 — adds fairness factor and diversity to existing scoring pipeline
- **US4 (P2)**: Depends on US1+US2 — adds creator priority to existing scoring; can run in parallel with US3

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/interfaces before scoring logic
- Scoring logic before API integration
- API integration before admin UI
- Story complete before moving to next priority

### Parallel Opportunities

- T009–T013 (all US1/US2 tests) can run in parallel — different test cases in same file
- T019 (StarRating component) can run in parallel with T014–T015 (scoring logic) — different files
- T021–T022 (US3 tests) can run in parallel
- T027–T028 (US4 tests) can run in parallel
- Phase 4 (US3) and Phase 5 (US4) can run in parallel if needed — different concerns

---

## Parallel Example: User Stories 1 & 2

```bash
# Launch all tests together (TDD — write first):
Task T009: "Parameterized test for scoreVideo priority sensitivity"
Task T010: "Parameterized test for scoreVideo determinism"
Task T011: "Parameterized test for hashToFloat"
Task T012: "Parameterized test for scoreFeed pipeline"
Task T013: "Edge case tests (empty, single, all-zero)"

# Launch in parallel (different files):
Task T014: "Implement scoreVideo in src/lib/feed-scoring.ts"
Task T019: "Create StarRating component in src/components/ui/star-rating.tsx"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (Vitest)
2. Complete Phase 2: Foundational (migration + types + hash)
3. Complete Phase 3: User Stories 1 + 2 (scoring + admin + determinism)
4. **STOP and VALIDATE**: Feed is scored, deterministic, and admin can tune channel priorities
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Testing infrastructure ready
2. Add US1 + US2 → Scored feed with channel priorities → Deploy/Demo (MVP!)
3. Add US3 → Multi-channel fairness + diversity → Deploy/Demo
4. Add US4 → Creator-level priority → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are combined in Phase 3 because `scoreVideo` inherently implements both (channel priority weighting + deterministic daily jitter are inseparable)
- Verify tests fail before implementing (Red-Green-Refactor per constitution Principle II)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
