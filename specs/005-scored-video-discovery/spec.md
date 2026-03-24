# Feature Specification: Scored Multi-Source Video Discovery

**Feature Branch**: `005-scored-video-discovery`
**Created**: 2026-03-24
**Status**: Draft
**Input**: Multi-source video discovery with scoring algorithm. Three data sources (popular, rated, recent), deduplication, freshness+engagement+popularity scoring, guaranteed minimum slots per source as percentage of max, daily/weekly run modes for quota management, and source-aware queue reconciliation for partial runs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Daily Recent Video Discovery (Priority: P1)

The system operator runs the producer in "recent" mode as a daily cron job. The producer fetches the newest videos from each curated channel's uploads playlist, enriches them with view/like/comment stats, applies duration filtering, scores them, and enqueues download/remove jobs. Only the "recent" portion of the desired set is reconciled — popular/rated videos from the last full run are preserved.

**Why this priority**: This is the bread-and-butter operation — keeping the feed current with new uploads without burning expensive search quota daily.

**Independent Test**: Run the producer with `--mode recent`. Verify it only uses the cheap playlist endpoint, applies duration rules, scores videos, and does not remove videos previously sourced from popular/rated feeds.

**Acceptance Scenarios**:

1. **Given** curated channels exist in the database, **When** the producer runs in recent mode, **Then** it fetches uploads via the playlist endpoint, enriches with stats, applies the channel's duration filter, scores all passing videos, and enqueues the correct diff.
2. **Given** a channel has a per-channel `min_duration_override` of 60 seconds, **When** the producer processes that channel in recent mode, **Then** only videos under 60 seconds are excluded.
3. **Given** a previous full run established 50 popular + 50 rated videos for a channel, **When** a daily recent run executes, **Then** those 100 reserved videos are NOT flagged for removal — only the recent portion is reconciled.
4. **Given** a recent run finds a new video that scores higher than an existing recent video, **When** the desired set exceeds the channel's max minus reserved slots, **Then** the lowest-scoring recent video is displaced and flagged for removal.

---

### User Story 2 - Weekly Full Discovery with Popular and Rated Sources (Priority: P1)

The system operator runs the producer in "full" mode as a weekly cron job. The producer fetches videos from three sources per channel: most viewed (search by viewCount), highest rated (search by rating), and newest (playlist). It deduplicates, applies source-appropriate duration filtering, scores everything, guarantees minimum representation from each source, and slices to the configured maximum.

**Why this priority**: This captures evergreen popular content and community favorites that the daily recent-only run misses. The feed needs both fresh and proven content.

**Independent Test**: Run the producer with `--mode full`. Verify it makes search API calls for viewCount and rating, merges with playlist results, deduplicates, and the final desired set contains at least the configured minimum from each source.

**Acceptance Scenarios**:

1. **Given** a channel with 300+ videos spanning multiple years, **When** the producer runs in full mode, **Then** the desired set includes a mix of all-time popular, highly-rated, and recent videos.
2. **Given** the minimum per source is 20% of max (50 out of 250), **When** the popular source returns 50 qualifying videos, **Then** at least 50 from that source appear in the final desired set.
3. **Given** a video appears in both the viewCount search and the playlist results, **When** building the candidate pool, **Then** it is counted only once and tagged with all matching sources.
4. **Given** a full run completes, **When** the next daily recent run occurs, **Then** the popular/rated videos from the full run are preserved in the desired set.

---

### User Story 3 - Scoring Algorithm Produces a Balanced Feed (Priority: P2)

The scoring algorithm weights popularity (view count), engagement (like and comment ratios), and freshness (time decay) to rank the combined candidate pool. After source minimums are guaranteed, remaining slots are filled by highest score.

**Why this priority**: Good scoring is what distinguishes a curated feed from a raw dump. It ensures the feed surfaces quality content, not just new or just viral.

**Independent Test**: Given test videos with known stats, verify the scoring produces expected relative rankings — a recent video with moderate views and high engagement ranks competitively against an old viral video with low engagement.

**Acceptance Scenarios**:

1. **Given** two videos — one published yesterday with 500 views and high engagement, one published 2 years ago with 5M views and low engagement, **When** scored, **Then** neither completely dominates; the ranking reflects a balance of all three signals.
2. **Given** two videos with similar view counts, **When** one has a 5% like-to-view ratio and the other has 0.5%, **Then** the higher-engagement video scores meaningfully higher.
3. **Given** source minimums are satisfied, **When** remaining slots are filled, **Then** they contain the highest-scoring videos regardless of which source they came from.

---

### User Story 4 - Graceful Degradation on API Failure (Priority: P3)

When a search API call fails (quota exceeded, 429, 5xx) during a full run, the producer continues processing with whatever sources succeeded rather than aborting the channel entirely.

**Why this priority**: API failures are inevitable. The system should degrade gracefully rather than producing no results.

**Independent Test**: Simulate a search API failure for one source. Verify the channel still gets processed using the remaining sources.

**Acceptance Scenarios**:

1. **Given** the viewCount search returns a 429 error, **When** the producer processes that channel, **Then** it proceeds with rating search + playlist results and logs a warning.
2. **Given** both search calls fail, **When** the producer processes that channel, **Then** it falls back to playlist-only (equivalent to a recent run for that channel) and logs warnings.

---

### Edge Cases

- What happens when a channel has fewer qualifying videos than the guaranteed minimum for a source? The guarantee is a floor, not a mandate — if popular search only returns 20 qualifying videos, those 20 are guaranteed and remaining slots shift to other sources.
- What happens when the same video is #1 in all three sources? It counts once toward whichever source has highest guarantee priority (popular > rated > recent), freeing slots in other sources.
- What happens when `max_videos_per_channel` is reduced from 250 to 200? The percentage-based minimums scale automatically (20% of 200 = 40 per source). The next full run produces a smaller desired set, and excess videos are flagged for removal.
- What happens when a video is deleted or made private on YouTube? It won't appear in any source's results on the next full run and will be flagged for removal.
- What happens on the very first run (no prior data)? A full run is recommended. If a recent run executes first, it populates only the recent portion and leaves popular/rated slots empty until the first full run.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The producer MUST support two run modes selectable via command-line argument: `recent` (playlist only) and `full` (playlist + search by viewCount + search by rating). Default: `recent`.
- **FR-002**: In `full` mode, the producer MUST fetch one page (up to 50 results) from the search endpoint with `order=viewCount` per channel, and one page with `order=rating` per channel.
- **FR-003**: In both modes, the producer MUST fetch recent videos from the playlist endpoint with date range bounding and duration filtering as currently implemented.
- **FR-004**: The producer MUST deduplicate videos across all sources before scoring, tagging each video with all source(s) it was found in (popular, rated, recent).
- **FR-005**: The producer MUST score each video using a configurable algorithm that combines popularity (log-scaled view count), engagement (like-to-view and comment-to-view ratios), and freshness (exponential time decay with a 90-day half-life).
- **FR-006**: The producer MUST guarantee a configurable minimum percentage of the max-per-channel for each search source. Default: 20% each for popular and rated. The remaining slots are filled by highest-scoring videos from the full candidate pool.
- **FR-007**: In `recent` mode, the producer MUST only reconcile the non-reserved portion of the desired set. Videos occupying popular/rated reserved slots from a previous full run MUST NOT be removed or re-scored — reserved slots are frozen until the next full run.
- **FR-008**: In `full` mode, the producer MUST reconcile the entire desired set — all three sources are refreshed.
- **FR-009**: The producer MUST persist source tag information for each video in the desired set, so daily runs can distinguish reserved slots from scored slots.
- **FR-010**: Duration filtering MUST differ by source: recent videos use the channel's `min_duration_override` (default 300s from config), while popular/rated videos use a 60-second floor only.
- **FR-011**: If a search API call fails during a full run, the producer MUST continue with remaining sources, log a warning, and adjust source minimums for the failed source to zero.
- **FR-012**: The minimum percentage per source and scoring weights MUST be configurable in the producer config file.
- **FR-013**: Scoring weights and source percentages MUST scale proportionally when `max_videos_per_channel` is changed — no hardcoded slot counts.
- **FR-014**: The `--dry-run` flag MUST work with both modes, showing what would be enqueued without writing to the database.

### Key Entities

- **Video Candidate**: A video discovered from any source, carrying stats (views, likes, comments), publish date, duration, computed score, and source tag(s).
- **Source Tag**: A label indicating discovery source: `popular`, `rated`, or `recent`. A video may carry multiple tags.
- **Desired Set**: The final ranked list of videos per channel after scoring, source guarantees, and slicing to max. This is diffed against the database to produce download/remove jobs.
- **Reserved Slots**: The portion of the desired set guaranteed to popular and rated sources. Persisted between runs so daily reconciliation can skip them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full run produces a desired set per channel containing at least the configured minimum percentage from each search source, verifiable by counting source tags in the output.
- **SC-002**: A daily recent run does NOT reduce the total desired set size for any channel that previously had a full run — reserved slots are preserved.
- **SC-003**: The scoring algorithm produces differentiated rankings: given test data, popular old videos and fresh new videos both appear in the final set rather than one category dominating.
- **SC-004**: A full run for 52 channels completes within the daily API quota limit (10,000 units).
- **SC-005**: A daily recent run uses comparable quota to the current implementation (~326 units for 52 channels).
- **SC-006**: When `max_videos_per_channel` is changed, the next run automatically adjusts source minimums and desired set size proportionally.
- **SC-007**: The feed visibly contains a richer mix of content — not just the newest videos but also proven popular and community-favorite content.

## Clarifications

### Session 2026-03-24

- Q: Should daily runs re-score reserved (popular/rated) slots or freeze them until the next full run? → A: Frozen — reserved slots are untouched on daily runs; only refreshed on weekly full runs.
- Q: What freshness decay half-life for the scoring algorithm? → A: 90-day half-life — 3-month-old videos score ~50% freshness, balancing new and established content.

## Assumptions

- One page (50 results) per search source is sufficient to capture the top popular/rated videos per channel. Additional pages have diminishing returns at 100 quota units each.
- Popular and rated video sets are stable week-over-week, making weekly refresh sufficient for these sources.
- 20% minimum per source is a sensible starting default. With 250 max, this yields 50 popular + 50 rated + 150 by score.
- Source reservation can be tracked via a tag/metadata field on existing tables without requiring a new tracking table.
- The `search.list` endpoint with `order=rating` sorts by engagement quality (like ratio). This is YouTube's built-in rating sort.
- The 60-second floor for popular/rated videos (vs 300s for recent) is appropriate because popular short-form content (2-4 minutes) has proven audience appeal.
