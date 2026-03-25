# Feature Specification: Client-Side Supabase Queries

**Feature Branch**: `008-client-side-queries`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Yes let's go client side for this page and the watch feed plz. React Query as the library too"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Home Page Loads Creators Directly from Supabase (Priority: P1)

A child opens PradoTube and sees the creator selection screen. The creator list loads directly from Supabase via the browser — no intermediate server API route is involved. The experience feels faster because there is one fewer network hop (browser → Supabase instead of browser → Next.js server → Supabase).

**Why this priority**: The home page is the first thing every user sees. Eliminating the server proxy removes the cold-start latency that caused 8-second initial loads. This is the simplest migration since the creators query is a straightforward database read.

**Independent Test**: Can be fully tested by loading the home page and verifying creator avatars and names appear, with network tab confirming requests go directly to Supabase (not `/api/creators`).

**Acceptance Scenarios**:

1. **Given** the home page is loaded, **When** creators exist in the database, **Then** all creators appear with correct names and avatar images, fetched directly from Supabase
2. **Given** the home page is loaded, **When** no creators exist, **Then** the empty state message is displayed
3. **Given** the home page was previously loaded, **When** the user navigates away and returns within 5 minutes, **Then** cached creator data is shown instantly without a new network request

---

### User Story 2 - Watch Feed Loads Videos Directly from Supabase (Priority: P1)

A child navigates to the watch feed and sees their video grid. The video list, creator metadata, and scoring/diversification all happen client-side using data fetched directly from Supabase. React Query manages caching and background refreshes.

**Why this priority**: The feed is the core viewing experience. Moving it client-side eliminates the server proxy bottleneck and enables React Query's caching to make subsequent visits instant.

**Independent Test**: Can be fully tested by loading the feed page and verifying videos appear in a scored/diversified order, with network tab confirming Supabase requests (not `/api/videos/feed`).

**Acceptance Scenarios**:

1. **Given** the feed page is loaded, **When** downloaded videos exist, **Then** videos appear in scored/diversified order with creator names, avatars, and thumbnails
2. **Given** the feed page is loaded with a creator filter (e.g., `/c/blippi`), **When** that creator has downloaded videos, **Then** only that creator's videos appear
3. **Given** feed data was previously loaded, **When** the user switches between creator filters, **Then** previously loaded feeds are shown from cache while fresh data loads in the background
4. **Given** the feed page is loaded, **When** no downloaded videos exist, **Then** the empty state is displayed

---

### User Story 3 - Admin Panel Continues Working with Full Channel Data (Priority: P2)

An admin opens the admin panel and sees full creator and channel management UI. The admin panel fetches detailed channel data (subscriber counts, video counts, channel titles) which is not needed by the kid-facing pages.

**Why this priority**: The admin panel is used infrequently and by a single user. It can continue using its existing data fetching pattern. The key requirement is that it is not broken by changes to the kid-facing pages.

**Independent Test**: Can be fully tested by opening the admin panel and verifying all creator groups, channel rows, and channel statistics display correctly.

**Acceptance Scenarios**:

1. **Given** the admin panel is loaded, **When** creators and channels exist, **Then** all creator groups with their channels, statistics, and management controls are displayed
2. **Given** the admin panel is loaded, **When** ungrouped channels exist, **Then** they appear in the ungrouped section with full channel metadata

---

### Edge Cases

- What happens when the Supabase connection fails on the client? React Query shows cached data if available, or a loading/error state.
- What happens when a user has a very slow connection? React Query's stale-while-revalidate pattern shows cached data instantly on repeat visits.
- What happens when the database schema changes? The client queries would need to be updated alongside any migration — same as the current server routes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The home page MUST fetch creator data directly from Supabase using the publishable key, without routing through a Next.js API endpoint
- **FR-002**: The watch feed MUST fetch video and creator metadata directly from Supabase, then perform scoring and diversification client-side
- **FR-003**: React Query (TanStack Query) MUST be used as the data-fetching and caching layer for all client-side Supabase queries
- **FR-004**: Creator avatar and cover image URLs MUST be resolved client-side from the joined channel data
- **FR-005**: Feed scoring and diversification logic MUST produce identical results to the current server-side implementation
- **FR-006**: The admin panel MUST continue functioning with full channel metadata, either via direct Supabase queries or its existing API route
- **FR-007**: The `/api/creators` route MUST be removable after migration (no kid-facing pages depend on it)
- **FR-008**: The `/api/videos/feed` route MUST be removable after migration (no kid-facing pages depend on it)
- **FR-009**: React Query cache settings MUST use a 5-minute stale time consistent with the existing caching strategy

### Key Entities

- **Creator**: A curated content creator shown to kids (name, slug, avatar URL, cover URL)
- **Curated Channel**: The link between a creator and their YouTube channels, with priority and display settings
- **Channel**: YouTube channel metadata (thumbnail, banner, title, subscriber count)
- **Video**: A downloaded video with R2 sync status, belonging to a channel
- **Feed**: A scored and diversified list of videos, grouped by creator, with round-robin interleaving

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Home page creator data loads in under 2 seconds on initial visit (eliminating the 8-second cold-start)
- **SC-002**: Repeat visits to the home page show creator data instantly from cache (under 100ms perceived)
- **SC-003**: The watch feed displays videos with the same scoring and ordering as the current server-side implementation
- **SC-004**: No Next.js API routes are called by the home page or feed pages — creator and feed data comes directly from Supabase (note: the video player's individual video fetch via `/api/videos/[id]` is out of scope for this feature)
- **SC-005**: The admin panel continues to display full channel metadata without regression
