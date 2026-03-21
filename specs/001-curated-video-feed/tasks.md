# Tasks: Curated Video Feed

**Input**: Design documents from `/specs/001-curated-video-feed/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/feed-api.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new infrastructure needed. Project is already initialized with Next.js, Supabase, React Query, shadcn/ui. Database migrations for download tracking are already applied.

*(No tasks — setup is already complete)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Refactor the feed API to support pagination, creator metadata, interleaving, and downloaded-only filtering. This API backs all user stories.

- [x] T001 Refactor feed API to query only downloaded videos with creator metadata via Supabase joins in `src/app/api/videos/feed/route.ts`. Replace the current YouTube-API-fetching logic with a direct DB query: `videos WHERE is_downloaded = true`, joined through `channels → curated_channels → creators` to get `creatorId`, `creatorName`, `creatorAvatar`. Support `?limit=20&offset=0&creator=UUID` query params. Return `{ videos, total, hasMore }` wrapper instead of bare array.
- [x] T002 Implement round-robin interleaving function in `src/app/api/videos/feed/route.ts`. After querying all matching downloaded videos, group by creator (using `creators.display_order` for sequence), sort each group by `published_at` DESC, then deal one from each creator in round-robin order. Ungrouped channels (creator_id IS NULL) are each treated as individual creators. Apply offset/limit slicing after interleaving.
- [x] T003 [P] Create VideoCard component in `src/components/video-card.tsx`. Displays: video thumbnail (via thumbnailUrl or local thumbnailPath), title, creator avatar, creator name, and duration badge (formatted from durationSeconds). Must NOT show view counts, like counts, comment counts, or timestamps. Links to `/v/[id]` via Next.js `<Link>`. Follow existing design patterns from creator cards in `src/app/page.tsx` (rounded corners, hover effects, shadcn/ui styling, accent colors).
- [x] T004 [P] Create CreatorChips component in `src/components/creator-chips.tsx`. Horizontal scrollable row of creator avatar chips. Each chip shows a small circular avatar + creator name. Accepts props: `creators` array, `selectedCreatorId` (string | null), `onSelect` callback. Tapping a chip calls `onSelect(creatorId)`, tapping the active chip calls `onSelect(null)` to clear filter. Only renders creators that have at least one downloaded video. Follow existing design patterns (rounded-full avatars, ring highlights, accent gradients).

**Checkpoint**: Feed API returns paginated, interleaved, creator-enriched data. VideoCard and CreatorChips components are ready. All user stories can now be built.

---

## Phase 3: User Story 1 - Browse All Videos (Priority: P1) 🎯 MVP

**Goal**: A child navigates to `/feed` and sees a grid of interleaved video cards from all creators, 20 at a time, with "Show more" to load the next batch.

**Independent Test**: Navigate to `/feed`, verify videos from multiple creators appear interleaved, verify 20 videos shown initially, click "Show more" to load more, verify empty state when no downloaded videos exist.

### Implementation for User Story 1

- [x] T005 [US1] Create feed page in `src/app/feed/page.tsx`. Client component using `useQuery` to fetch from `/api/videos/feed?limit=20&offset=0`. Renders: page header (PradoTube logo, theme toggle, nav links), CreatorChips component (no filter active initially), grid of VideoCard components (responsive: 1 col mobile, 2 col tablet, 3 col desktop), "Show more" button at bottom that increments offset and appends results. When `hasMore` is false, replace button with "That's everything!" message. Include loading state (spinner) and empty state ("No videos available yet" with link to admin). Use `@tanstack/react-query` with `keepPreviousData` for smooth pagination.
- [x] T006 [US1] Add "Watch" navigation link to the header in `src/app/page.tsx`. Add a link labeled "Watch" (or a Play icon) next to the theme toggle and settings link in the existing header. Links to `/feed`. Style consistently with existing header buttons.
- [x] T007 [US1] Verify feed page renders correctly: navigate to `/feed`, confirm interleaved grid of ~20 videos from multiple creators, confirm "Show more" button works, confirm no engagement metrics visible on any card.

**Checkpoint**: Feed page is live at `/feed` with interleaved videos and "Show more" pagination. MVP is functional.

---

## Phase 4: User Story 2 - Filter Feed by Creator (Priority: P1)

**Goal**: Creator avatar chips at the top of the feed let the child filter to a single creator's videos.

**Independent Test**: Load `/feed`, tap a creator chip, verify only that creator's videos appear, tap again to restore full feed, tap a different chip to switch filter.

### Implementation for User Story 2

- [x] T008 [US2] Wire creator chip filtering into feed page in `src/app/feed/page.tsx`. Add state for `selectedCreatorId`. When a chip is tapped, pass the creator UUID as `?creator=UUID` param to the feed API query. Reset offset to 0 when filter changes. Update the `useQuery` key to include the creator filter so React Query refetches. Pass `selectedCreatorId` to CreatorChips for visual highlighting.
- [x] T009 [US2] Fetch creator list with download counts for chips. Add a separate query (or extend the feed API response) to get the list of creators that have downloaded videos, with their avatar URLs. This data populates the CreatorChips component. Can be derived from the `/api/creators` endpoint filtered to those with at least one downloaded video, or returned alongside the feed response.
- [x] T010 [US2] Verify creator filtering: tap a creator chip, confirm only their videos appear, tap again to clear, tap a different chip to switch. Confirm chip highlighting matches the active filter.

**Checkpoint**: Creator chips filter the feed. Users can browse all or focus on one creator.

---

## Phase 5: User Story 3 - Navigate from Home to Feed (Priority: P1)

**Goal**: Creator cards on the home page link to `/feed?creator=ID`. Tapping a creator takes you directly to their filtered feed.

**Independent Test**: From home page, click a creator card, verify feed opens pre-filtered to that creator with their chip highlighted. Click "Watch" nav link, verify full unfiltered feed opens.

### Implementation for User Story 3

- [x] T011 [US3] Make creator cards clickable in `src/app/page.tsx`. Wrap each `CreatorCard` and `UngroupedChannelCard` in a `<Link href={"/feed?creator=" + creator.id}>` (for creators) or `<Link href="/feed">` (for ungrouped channels, linking to full feed or filtering by their channel). Preserve existing hover effects and styling.
- [x] T012 [US3] Read `?creator=` query param in `src/app/feed/page.tsx`. On initial load, read `searchParams` or `useSearchParams()` to check for a `creator` query parameter. If present, initialize `selectedCreatorId` state with that value so the feed starts pre-filtered and the corresponding chip is highlighted.
- [x] T013 [US3] Verify navigation: from home, click a creator card, confirm feed opens filtered. Click "Watch" nav, confirm full feed opens. From feed, click logo to return home.

**Checkpoint**: Home and feed are connected. Full navigation flow works.

---

## Phase 6: User Story 4 - Watch a Video from the Feed (Priority: P2)

**Goal**: Tapping a video card opens the player. After the video ends, show "Back to feed" and same-creator suggestions. Back navigation preserves scroll position.

**Independent Test**: Tap a video in the feed, verify player loads, use browser back, verify feed scroll position is preserved. Watch a video to the end, verify no autoplay, verify suggestions appear.

### Implementation for User Story 4

- [x] T014 [US4] Add end-of-video overlay to player in `src/app/v/[id]/page.tsx`. Detect video end via `onEnded` event on the `<video>` element. When video ends, show an overlay with: a "Back to feed" button (links to `/feed`), and a grid of up to 6 thumbnail suggestions from the same creator. Fetch suggestions from `/api/videos/feed?creator=CREATOR_ID&limit=6` (need to determine the creator from the current video's `channelId`). Do NOT autoplay any video.
- [x] T015 [US4] Resolve creator ID from video metadata in `src/app/v/[id]/page.tsx`. The current `VideoMeta` has `channelId` but not `creatorId`. Either: (a) add `creatorId` to the `/api/videos/[id]` response by joining through curated_channels, or (b) query the creators API client-side to find which creator owns this channel. Option (a) is cleaner — update `src/app/api/videos/[id]/route.ts` to include `creatorId` in the DB query.
- [x] T016 [US4] Verify scroll preservation: navigate from feed to player and back. Confirm feed scroll position and filter state are intact. Verify end-of-video suggestions appear with same-creator thumbnails. Confirm no autoplay.

**Checkpoint**: Full feed → player → feed loop works with scroll preservation and end-of-video suggestions.

---

## Phase 7: User Story 5 - Only Downloaded Videos Are Playable (Priority: P2)

**Goal**: The feed exclusively shows downloaded videos. No YouTube-only cached videos leak into the feed.

**Independent Test**: Verify feed API returns only `is_downloaded = true` videos. Confirm every video in the feed plays successfully from local media.

### Implementation for User Story 5

- [x] T017 [US5] Verify downloaded-only filtering in feed API in `src/app/api/videos/feed/route.ts`. Confirm the Supabase query includes `.eq("is_downloaded", true)`. Ensure the old YouTube-API-fetching/staleness-check logic does not inject non-downloaded videos into the feed response. The feed API should be a pure read from the DB for downloaded content — no YouTube API calls.
- [x] T018 [US5] Verify every feed video plays: click several video cards from the feed, confirm each one loads and plays from local media without errors.

**Checkpoint**: Feed is a pure "bookshelf" of locally available content. No broken or unplayable videos.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, empty states, and visual refinements that affect multiple stories.

- [x] T019 Handle empty creator state: when a creator has zero downloaded videos, exclude them from creator chips in `src/components/creator-chips.tsx`
- [x] T020 Handle "all loaded" state: when `hasMore` is false, show "That's everything!" message instead of "Show more" button in `src/app/feed/page.tsx`
- [x] T021 Ensure consistent header across pages: feed page, home page, and player page should all share the same header structure (logo, "Watch" link, theme toggle, admin link) — extract to a shared component if not already shared, or ensure consistency in `src/app/feed/page.tsx`
- [x] T022 Run quickstart.md validation: walk through all verification steps in `specs/001-curated-video-feed/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Already complete — no tasks needed
- **Foundational (Phase 2)**: No dependencies — can start immediately. BLOCKS all user stories.
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (Browse) can start after Phase 2
  - US2 (Filter) can start after Phase 2, but practically depends on US1 feed page existing
  - US3 (Navigation) depends on US1 feed page + US2 filter state
  - US4 (Player) depends on US1 feed page for the navigation loop
  - US5 (Downloaded-only) depends on Phase 2 API refactor
- **Polish (Phase 8)**: Depends on US1 + US2 being complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2 foundational tasks
- **US2 (P1)**: Depends on US1 (feed page must exist to add filtering)
- **US3 (P1)**: Depends on US1 + US2 (feed page with filtering must exist for navigation targets)
- **US4 (P2)**: Depends on US1 (feed page must exist for the back-navigation loop)
- **US5 (P2)**: Depends on Phase 2 (API filtering), can be verified in parallel with US1

### Within Each User Story

- API/data changes before UI components
- Components before page integration
- Integration before verification

### Parallel Opportunities

- T003 (VideoCard) and T004 (CreatorChips) can be built in parallel during Phase 2
- T003/T004 can be built in parallel with T001/T002 (API refactor)
- US4 (Player updates) and US5 (Download verification) can proceed in parallel after US1

---

## Parallel Example: Phase 2

```bash
# These can all run in parallel (different files):
Task T001: "Refactor feed API in src/app/api/videos/feed/route.ts"
Task T003: "Create VideoCard in src/components/video-card.tsx"
Task T004: "Create CreatorChips in src/components/creator-chips.tsx"

# T002 depends on T001 (same file):
Task T002: "Implement interleaving in src/app/api/videos/feed/route.ts" (after T001)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T004)
2. Complete Phase 3: User Story 1 (T005-T007)
3. **STOP and VALIDATE**: Feed page works at `/feed` with interleaved grid and "Show more"
4. Deploy/demo if ready — basic browsing is functional

### Incremental Delivery

1. Phase 2 → Foundation ready (API + components)
2. Add US1 → Browse feed works → Deploy (MVP!)
3. Add US2 → Creator filtering works → Deploy
4. Add US3 → Home ↔ Feed navigation works → Deploy
5. Add US4 → Feed ↔ Player loop with suggestions → Deploy
6. Add US5 → Downloaded-only guarantee verified → Deploy
7. Phase 8 → Polish edge cases → Final deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The feed API refactor (T001-T002) is the most critical task — everything depends on it
