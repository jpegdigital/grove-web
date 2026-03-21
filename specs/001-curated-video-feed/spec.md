# Feature Specification: Curated Video Feed

**Feature Branch**: `001-curated-video-feed`
**Created**: 2026-03-21
**Status**: Draft
**Input**: User description: "Cross-creator video feed with interleaved sorting, finite batches, creator filter chips, and player navigation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse All Videos (Priority: P1)

A child opens PradoTube and navigates to the video feed to browse available content across all their approved creators. They see a grid of video thumbnails from different creators, interleaved so that no single creator dominates the view. Each video shows its title, a thumbnail, a small creator avatar, and the video duration. The child scrolls through and picks something to watch.

**Why this priority**: The feed is the core feature — without it, there is no way to discover and select videos. This is the MVP.

**Independent Test**: Can be fully tested by navigating to the feed page, verifying videos appear from multiple creators in interleaved order, and confirming each video card displays the correct information.

**Acceptance Scenarios**:

1. **Given** the user is on the home page, **When** they tap the "Watch" navigation link, **Then** they see a feed page showing video cards from all creators with downloaded content.
2. **Given** the feed is displayed, **When** the user views the video grid, **Then** videos are interleaved round-robin across creators so that consecutive videos are from different creators.
3. **Given** the feed is displayed, **When** the user views any video card, **Then** they see the video thumbnail, title, creator avatar, creator name, and duration badge — but no view counts, like counts, or relative timestamps.
4. **Given** the feed is displayed, **When** the initial batch loads, **Then** approximately 20 videos are shown with a visible "Show more" button at the bottom rather than infinite scroll.
5. **Given** the feed shows 20 videos, **When** the user taps "Show more," **Then** the next batch of ~20 videos is appended below the existing ones.
6. **Given** there are no downloaded videos for any curated creator, **When** the user opens the feed, **Then** an empty state is shown with a message indicating no videos are available yet.

---

### User Story 2 - Filter Feed by Creator (Priority: P1)

A child wants to watch videos from a specific creator. From the feed page, they tap the creator's avatar in the filter chip row at the top. The feed updates to show only that creator's downloaded videos. They can tap the chip again (or an "All" chip) to return to the full cross-creator feed.

**Why this priority**: Filtering by creator is essential for intentional viewing — the child says "I want to watch Blippi" and gets exactly that. This is tied with P1 because the filter chips and the feed are part of the same view.

**Independent Test**: Can be tested by loading the feed, tapping a creator chip, verifying only that creator's videos appear, and tapping again to restore the full feed.

**Acceptance Scenarios**:

1. **Given** the feed page is loaded, **When** the user views the top of the page, **Then** they see a horizontal row of creator avatar chips, one for each creator that has downloaded videos.
2. **Given** no filter is active, **When** the user taps a creator chip, **Then** the feed filters to show only that creator's videos, and the selected chip is visually highlighted.
3. **Given** a creator filter is active, **When** the user taps the same creator chip again, **Then** the filter is removed and the full interleaved feed is restored.
4. **Given** a creator filter is active, **When** the user taps a different creator chip, **Then** the filter switches to show the newly selected creator's videos.
5. **Given** the user navigates from the home page by clicking a creator card, **When** the feed page loads, **Then** the feed is pre-filtered to that creator and their chip is highlighted.

---

### User Story 3 - Navigate from Home to Feed (Priority: P1)

The home page shows creator cards. A child taps a creator card and is taken to the feed page filtered to that creator's videos. Alternatively, they can tap a "Watch" link in the header navigation to go to the unfiltered feed.

**Why this priority**: This connects the existing home page to the new feed. Without this navigation, the two pages are disconnected.

**Independent Test**: Can be tested by clicking a creator card on the home page and verifying the feed loads filtered to that creator, and by clicking the "Watch" nav link and verifying the full feed loads.

**Acceptance Scenarios**:

1. **Given** the user is on the home page, **When** they tap a creator card, **Then** they are navigated to the feed page with that creator pre-selected as a filter.
2. **Given** the user is on the home page, **When** they tap the "Watch" link in the header, **Then** they are navigated to the feed page showing all creators.
3. **Given** the user is on the feed page, **When** they tap the PradoTube logo or a "Home" link, **Then** they return to the home page.

---

### User Story 4 - Watch a Video from the Feed (Priority: P2)

A child taps a video card in the feed and is taken to the video player. After the video ends (or they choose to leave), they can navigate back to the feed. Their scroll position in the feed is preserved so they can pick another video without starting from the top.

**Why this priority**: Playing videos is the ultimate goal, but the player page already exists. This story is about the connection between feed and player.

**Independent Test**: Can be tested by tapping a video in the feed, verifying the player loads, pressing back, and confirming the feed scroll position is where they left off.

**Acceptance Scenarios**:

1. **Given** the feed is displayed, **When** the user taps a video card, **Then** they are navigated to the video player page for that video.
2. **Given** the user is watching a video, **When** the video ends, **Then** no next video autoplays. The player shows a "Back to feed" action and a set of thumbnail suggestions from the same creator.
3. **Given** the user navigated to the player from the feed, **When** they tap "Back" or use browser back, **Then** the feed loads with the same scroll position and filter state they had before.
4. **Given** the user is on the video player, **When** they view the end-of-video suggestions, **Then** the suggestions show only downloaded videos from the same creator (no cross-creator recommendations).

---

### User Story 5 - Only Downloaded Videos Are Playable (Priority: P2)

The feed only shows videos that have been downloaded locally. Videos that exist only as remote metadata do not appear in the feed.

**Why this priority**: This enforces the "finite library" principle — the feed is a bookshelf, not the internet. Important for the experience but secondary to the core browsing flow.

**Independent Test**: Can be tested by verifying that the feed only returns videos that are available for local playback, and that every video in the feed plays successfully.

**Acceptance Scenarios**:

1. **Given** the system has both downloaded and non-downloaded videos, **When** the feed loads, **Then** only downloaded videos are displayed.
2. **Given** a video card is displayed in the feed, **When** the user taps it, **Then** the video always plays successfully because it is locally available.

---

### Edge Cases

- What happens when a creator has no downloaded videos? They should not appear in the creator filter chips.
- What happens when all videos have been loaded (no more batches)? The "Show more" button should disappear and a "That's everything!" message should be shown.
- What happens when the user navigates back to the feed after the app has been idle? The feed should reload fresh data but maintain the creator filter if one was active.
- What happens when a creator has only 1-2 videos? They still get their slot in the round-robin interleaving; the interleaving simply skips them once their videos are exhausted and continues with remaining creators.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a feed page showing video cards in a grid layout.
- **FR-002**: System MUST sort videos using round-robin interleaving across creators, ordered by recency within each creator's slot (newest first per creator, then deal one from each creator before repeating).
- **FR-003**: System MUST load videos in finite batches of approximately 20, with a "Show more" button to load subsequent batches.
- **FR-004**: System MUST NOT use infinite scroll or automatically load additional batches.
- **FR-005**: System MUST display creator avatar chips at the top of the feed for filtering.
- **FR-006**: System MUST support filtering the feed to a single creator by tapping their chip, and clearing the filter by tapping again.
- **FR-007**: System MUST support pre-filtering the feed to a specific creator when navigated from the home page creator card.
- **FR-008**: System MUST add a "Watch" navigation link in the header that navigates to the unfiltered feed.
- **FR-009**: Each video card MUST display: video thumbnail, video title, creator avatar, creator name, and duration badge.
- **FR-010**: Video cards MUST NOT display view counts, like counts, comment counts, or relative/absolute timestamps.
- **FR-011**: System MUST only show videos that have been downloaded locally.
- **FR-012**: System MUST preserve feed scroll position and filter state when the user navigates to a video and returns via back navigation.
- **FR-013**: When a video ends, the player MUST NOT autoplay another video.
- **FR-014**: When a video ends, the player MUST show a "Back to feed" action and thumbnail suggestions of other downloaded videos from the same creator.
- **FR-015**: Creator filter chips MUST only include creators that have at least one downloaded video.
- **FR-016**: When all available videos have been loaded, the "Show more" button MUST be replaced with a "That's everything!" message.
- **FR-017**: The home page creator cards MUST be clickable and navigate to the feed pre-filtered to that creator.

### Key Entities

- **Video Card**: A visual representation of a downloaded video showing thumbnail, title, creator info, and duration. The primary interactive element in the feed.
- **Creator Chip**: A small avatar + name control used for filtering the feed to a single creator. Lives in a horizontal row above the feed grid.
- **Feed Batch**: A group of ~20 videos loaded at once. The feed starts with one batch and appends more on user action.
- **Interleaved Order**: The sorting mechanism that deals videos round-robin across creators to ensure variety. Within each creator's "slot," videos are ordered by upload date (newest first).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can navigate from the home page to a creator's videos in a single tap.
- **SC-002**: The feed displays videos from at least 3 different creators within the first 6 visible video cards (when 3+ creators have downloaded content).
- **SC-003**: Users can filter the feed to a specific creator and return to the full feed in under 2 taps.
- **SC-004**: Feed page loads and displays the first batch of videos within 2 seconds on a typical connection.
- **SC-005**: Users can browse to a video, watch it, and return to the feed at their previous scroll position without re-scrolling.
- **SC-006**: Zero engagement metrics (view counts, like counts, timestamps) are visible anywhere in the feed browsing experience.
- **SC-007**: The feed never displays a video that is not available for local playback.

## Assumptions

- The existing video player page (`/v/[id]`) will be extended for end-of-video suggestions, not replaced.
- The existing creators and curated channels data model is used to determine which videos belong to which creator.
- A "creator" in the feed context maps to the existing `creators` table, with their associated `curated_channels` and downstream `videos`.
- The feed is a single-user experience (no authentication or per-user personalization needed).
- The "Watch" navigation link will be added to the shared header that already contains the theme toggle and admin link.
- Scroll position preservation relies on standard browser back/forward cache behavior.
