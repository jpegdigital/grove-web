# Feature Specification: Video Sync Producer

**Feature Branch**: `004-video-sync-producer`
**Created**: 2026-03-23
**Status**: Draft
**Input**: Build a producer job that fetches all channel videos via YouTube Data API, applies rules (duration, date range), diffs against DB to compute add/remove sets, and enqueues download and delete jobs into a Postgres-based sync queue.

## Clarifications

### Session 2026-03-23

- Q: What does a "remove" job actually do? → A: Delete from R2 storage + hard delete from DB. Local disk is transient (download → upload → gone), no local file cleanup needed.
- Q: Should the producer handle channels removed from curation? → A: Yes. Producer diffs curated channels against channels with videos in DB. Un-curated channels' videos all become remove jobs.
- Q: Should download job metadata include enough info to skip re-enrichment? → A: Yes. Store full enriched metadata (title, description, duration, thumbnail, stats) in the job's metadata jsonb column so the consumer needs zero additional API calls.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover New Videos to Download (Priority: P1)

The admin runs the producer job. For each curated channel, it fetches the full video catalog via YouTube Data API (playlistItems.list + videos.list for enrichment), applies per-channel rules (minimum duration, date range), and compares the resulting "desired set" against videos already in the database. New videos that match the rules but aren't in the DB get enqueued as **download** jobs.

**Why this priority**: This is the core loop — without discovering new videos, nothing else works.

**Independent Test**: Run the producer for a single channel. Verify that new videos appear in the sync queue with action=download, and already-known videos are not re-queued.

**Acceptance Scenarios**:

1. **Given** a curated channel has 100 videos on YouTube and 60 are already in the DB, **When** the producer runs, **Then** only the ~40 new videos (that pass rules) are enqueued as download jobs
2. **Given** a channel has per-channel date_range_override set to "today-2years", **When** the producer runs, **Then** it applies that date range instead of the default 6 months
3. **Given** a video is shorter than the minimum duration (300s), **When** the producer runs, **Then** that video is not enqueued for download
4. **Given** a video is a YouTube Short (< 60s), **When** the producer runs, **Then** that video is excluded entirely

---

### User Story 2 - Identify Videos to Remove (Priority: P2)

Videos that were previously downloaded but no longer match the current ruleset (e.g., they've aged out of the date range window) get enqueued as **remove** jobs. A remove job deletes the video's files from R2 storage and hard-deletes the row from the videos table. No local file cleanup is needed — local disk is a transient staging area only.

**Why this priority**: Without removal, storage grows unbounded. The rolling window model is fundamental to the architecture.

**Independent Test**: Manually insert a video with a published_at older than the channel's date range. Run the producer. Verify a remove job is enqueued for that video.

**Acceptance Scenarios**:

1. **Given** a video in the DB was published 8 months ago and the channel's date range is 6 months, **When** the producer runs, **Then** that video is enqueued as a remove job
2. **Given** a channel's date_range_override is changed from "today-2years" to "today-6months", **When** the producer runs, **Then** videos between 6mo-2y old are enqueued for removal
3. **Given** a video is in the desired set AND in the DB, **When** the producer runs, **Then** no job is created (it's already in sync)
4. **Given** a remove job is processed by the consumer, **When** the consumer runs, **Then** it deletes R2 objects (media, thumbnail, subtitles, info.json) and hard-deletes the videos row
5. **Given** a channel is removed from curated_channels but has videos in the DB, **When** the producer runs, **Then** all that channel's videos are enqueued as remove jobs

---

### User Story 3 - Efficient API Usage (Priority: P1)

The producer uses playlistItems.list (1 quota unit per 50 videos) instead of the search endpoint (100 units per call). Enrichment via videos.list batches 50 IDs per call. A full sync of 52 channels with ~2500 total videos costs approximately 200 quota units, compared to 250,000+ with the search endpoint.

**Why this priority**: YouTube Data API has a daily quota of 10,000 units. Efficient usage is critical to running the sync multiple times per day.

**Independent Test**: Run the producer and verify logged quota usage stays under 300 units for all channels.

**Acceptance Scenarios**:

1. **Given** 52 curated channels, **When** the producer runs for all channels, **Then** total API quota usage is under 500 units
2. **Given** a channel has 500 videos, **When** the producer fetches its catalog, **Then** it uses ~10 playlistItems calls + ~10 videos.list calls = ~20 quota units

---

### Edge Cases

- What happens when a channel has zero videos? Producer logs a warning and moves to the next channel.
- What happens when the YouTube API returns an error for one channel? Producer logs the error, skips that channel, continues with the rest.
- What happens when a video is "Private" or "Deleted" on YouTube but exists in our DB? It won't appear in the playlist response, so it gets enqueued for removal.
- What happens when a channel is removed from curated_channels? Producer diffs curated channels against channels with videos in DB. All videos for un-curated channels become remove jobs.
- What happens when the producer is run concurrently? The sync_queue uses unique constraints to prevent duplicate jobs for the same video.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Producer MUST fetch video catalogs using playlistItems.list (uploads playlist), not the search endpoint
- **FR-002**: Producer MUST enrich videos with duration/stats via videos.list in batches of 50 and store the full enriched metadata (title, description, duration, thumbnail URL, view/like/comment counts) in the sync_queue job's metadata column
- **FR-003**: Producer MUST apply per-channel rules: minimum duration (from config), date range (from curated_channels.date_range_override or default)
- **FR-004**: Producer MUST compute a "desired set" of videos per channel, then diff against the DB to produce download and remove job sets
- **FR-005**: Producer MUST enqueue download jobs for videos in desired set but not in DB
- **FR-006**: Producer MUST enqueue remove jobs for videos in DB but not in desired set (within the channel's date range window), AND for all videos belonging to channels no longer in curated_channels. Remove = delete from R2 + hard delete from DB.
- **FR-007**: Producer MUST be idempotent — running it twice produces no duplicate queue entries
- **FR-008**: Producer MUST log quota usage per channel and total
- **FR-009**: Producer MUST support --channel flag to run for a single channel (for testing)
- **FR-010**: Producer MUST support --dry-run flag to preview queue operations without writing

### Key Entities

- **sync_queue**: Job queue table — video_id, channel_id, action (download/remove), status (pending/processing/done/failed), metadata, timestamps
- **videos**: Existing table — the "current state" to diff against. Remove jobs hard-delete rows.
- **curated_channels**: Existing table — source of channel list + per-channel rules (date_range_override)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Full producer run for 52 channels completes in under 2 minutes
- **SC-002**: API quota usage is under 500 units per full run
- **SC-003**: Zero duplicate jobs in sync_queue after multiple consecutive producer runs
- **SC-004**: Videos outside the date range window are correctly identified for removal
