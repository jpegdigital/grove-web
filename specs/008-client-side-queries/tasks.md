# Tasks: Client-Side Supabase Queries

**Input**: Design documents from `/specs/008-client-side-queries/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not requested — this is a refactor with identical behavior. Feed-scoring already has no tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared query modules that multiple pages will use

- [x] T001 [P] Create creator query functions in `src/lib/queries/creators.ts` — export `fetchCreatorsLightweight()` (returns `{id, name, slug, display_order, avatar_url, cover_url}[]` by joining `creators` → `channels` via `avatar_channel_id`/`cover_channel_id` with curated_channels fallback) and `fetchCreatorsWithChannels()` (returns full nested `creators` + `ungrouped` curated_channels with all channel metadata). Both use the Supabase client from `src/lib/supabase.ts` directly.
- [x] T002 [P] Create feed data hook in `src/hooks/use-feed.ts` — export `useFeed(creatorSlug: string | null)` custom hook that: (1) queries `curated_channels` with nested `creators` and `channels` to build channel→creator mapping, (2) queries `videos` where `r2_synced_at IS NOT NULL` and `channel_id IN (curated channel IDs)`, (3) runs `scoreFeed()` and `diversify()` from `src/lib/feed-scoring.ts` client-side, (4) maps results to `FeedVideo[]` with creator metadata. Returns `{ videos, total, creators, isLoading }` via React Query with 5-minute stale time. If `creatorSlug` is provided, filter channels to that creator's channels only.

**Checkpoint**: Shared modules ready — page migrations can begin

---

## Phase 2: User Story 1 — Home Page Loads Creators Directly from Supabase (Priority: P1) 🎯 MVP

**Goal**: Home page fetches creators from Supabase via React Query, no API route involved

**Independent Test**: Load home page, verify creator avatars appear. Check browser network tab — requests should go to the Supabase URL, not `/api/creators`.

### Implementation for User Story 1

- [x] T003 [US1] Update home page in `src/app/page.tsx` — replace `fetchCreators()` (which calls `fetch("/api/creators")`) with a React Query `queryFn` that calls `fetchCreatorsLightweight()` from `src/lib/queries/creators.ts`. Keep 5-minute stale time. Update the `CreatorsResponse` type to match the direct query return shape. Remove the old `fetchCreators` function.

**Checkpoint**: Home page loads creators directly from Supabase. Verify with browser network tab.

---

## Phase 3: User Story 2 — Watch Feed Loads Videos Directly from Supabase (Priority: P1)

**Goal**: Feed page fetches videos from Supabase and runs scoring/diversification client-side

**Independent Test**: Load feed page (`/feed`), verify videos appear in scored order. Navigate to `/c/blippi` and verify only that creator's videos appear. Check network tab — no requests to `/api/videos/feed`.

### Implementation for User Story 2

- [x] T004 [US2] Update feed view in `src/components/feed-view.tsx` — replace the `useQuery` that calls `fetch("/api/videos/feed")` with the `useFeed(creatorSlug)` hook from `src/hooks/use-feed.ts`. Update the component to use the hook's return values. Remove the inline `FeedResponse` type and `FeedVideo` type (they now live in the hook). Keep the existing `creatorName` display logic (uses `video.creatorName`, not `channelTitle`).
- [x] T005 [US2] Update video player suggestions in `src/app/v/[id]/page.tsx` — the sidebar feed and end-of-video suggestions currently fetch from `/api/videos/feed`. Update these to use the `useFeed()` hook from `src/hooks/use-feed.ts` and filter its output for suggestions (sidebar: first 20 videos; end-of-video: filter by creator slug, take 6). The individual video metadata fetch (`/api/videos/[id]`) is out of scope.

**Checkpoint**: Feed page and video player load videos directly from Supabase with correct scoring.

---

## Phase 4: User Story 3 — Admin Panel Continues Working (Priority: P2)

**Goal**: Admin panel uses direct Supabase queries instead of `/api/creators?include=channels`

**Independent Test**: Open admin panel, verify all creator groups with channels display correctly. Verify channel stats (subscriber count, video count), channel management (move, delete), and creator management (add, delete, reorder) all work.

### Implementation for User Story 3

- [x] T006 [US3] Update admin page in `src/app/admin/page.tsx` — replace `fetchCreatorsData()` (which calls `fetch("/api/creators?include=channels")`) with a React Query `queryFn` that calls `fetchCreatorsWithChannels()` from `src/lib/queries/creators.ts`. Keep the existing `CreatorsResponse` type and all admin UI unchanged. Verify the return shape matches what the admin components expect.

**Checkpoint**: Admin panel displays all creator/channel data correctly with direct Supabase queries.

---

## Phase 5: Polish & Cleanup

**Purpose**: Remove deprecated API routes now that no pages depend on them

- [x] T007 [P] Remove GET handler from `src/app/api/creators/route.ts` — POST kept for admin creator creation
- [x] T008 [P] Delete `src/app/api/videos/feed/route.ts` — no longer used by any page (feed and video player use direct Supabase)
- [x] T009 Run `npm run build` to verify no import errors or broken references after API route deletion
- [x] T010 Run quickstart.md validation — start dev server, load home page, feed page, video player, and admin panel. Verify no requests to deleted API routes in browser network tab.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 can run in parallel
- **User Story 1 (Phase 2)**: Depends on T001 (creator query module)
- **User Story 2 (Phase 3)**: Depends on T002 (feed hook)
- **User Story 3 (Phase 4)**: Depends on T001 (creator query module)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **US1** (home page): Only needs T001 — can start as soon as creator query module exists
- **US2** (feed): Only needs T002 — can start as soon as feed hook exists
- **US3** (admin): Only needs T001 — can run in parallel with US1 (different file)

### Parallel Opportunities

- T001 and T002 can run in parallel (different files, no shared dependencies)
- T003 and T004 can run in parallel after their respective setup tasks (different files)
- T006 can run in parallel with T003 (different files, both depend on T001)
- T007 and T008 can run in parallel (independent file deletions)

---

## Parallel Example: Setup Phase

```bash
# Launch both setup tasks together:
Task: "Create creator query functions in src/lib/queries/creators.ts"
Task: "Create feed data hook in src/hooks/use-feed.ts"
```

## Parallel Example: User Story Implementation

```bash
# After setup, launch US1 and US2 together (different files):
Task: "Update home page in src/app/page.tsx"
Task: "Update feed view in src/components/feed-view.tsx"

# US3 can also run in parallel with the above:
Task: "Update admin page in src/app/admin/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 (creator query module)
2. Complete T003 (home page migration)
3. **STOP and VALIDATE**: Home page loads creators from Supabase directly
4. Everything else still works via API routes (unchanged)

### Full Delivery

1. T001 + T002 in parallel → Setup complete
2. T003 + T004 + T006 in parallel → All pages migrated
3. T005 → Video player migrated
4. T007 + T008 in parallel → API routes deleted
5. T009 + T010 → Final validation

---

## Notes

- The Supabase client (`src/lib/supabase.ts`) needs no changes — it's already client-compatible
- `src/lib/feed-scoring.ts` needs no changes — pure functions work client-side as-is
- The `@supabase/supabase-js` PostgREST join syntax `channels!avatar_channel_id(thumbnail_url)` has already been validated in the current API route
- React Query is already configured project-wide with a QueryClientProvider — no setup needed
