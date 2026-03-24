# Feature Specification: Queue Consumer for Video Sync Pipeline

**Feature Branch**: `006-queue-consumer`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "Queue consumer that processes sync_queue jobs by downloading videos via yt-dlp directly, uploading to R2 with web-optimized faststart MP4, handling removals, with batch processing, retry logic, and configurable scheduling for backfill and steady-state operation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Process Download Jobs (Priority: P1)

An operator runs the consumer to process pending download jobs from the sync queue. The consumer picks a batch of pending jobs, downloads each video directly from YouTube in a web-optimized format (progressive MP4 with fast-start), uploads the video and its sidecar files (thumbnail, subtitles, metadata) to cloud storage, updates the video record so it becomes visible in the feed, and removes the completed job from the queue. If a download fails, the job is retried on subsequent runs up to a configurable limit.

**Why this priority**: Without download processing, the entire pipeline is broken — the producer enqueues work but nothing acts on it. This is the core value of the consumer.

**Independent Test**: Can be tested by enqueuing a single download job manually, running the consumer, and verifying the video appears in the feed with all sidecar files in cloud storage.

**Acceptance Scenarios**:

1. **Given** a pending download job in the queue, **When** the consumer runs, **Then** the video is downloaded in web-optimized MP4 format, all sidecar files (thumbnail, subtitles, metadata file) are uploaded to cloud storage, the video record is updated with storage paths and a sync timestamp, and the job is deleted from the queue.
2. **Given** a download job that fails (network error, unavailable video), **When** the consumer processes it, **Then** the job's attempt count is incremented, the error is recorded on the job, and the job returns to pending status for retry on the next run.
3. **Given** a download job that has reached the maximum retry attempts, **When** the consumer runs, **Then** the job is skipped and remains in the queue for manual inspection.
4. **Given** no pending jobs in the queue, **When** the consumer runs, **Then** it exits cleanly with a summary showing zero jobs processed.

---

### User Story 2 - Process Removal Jobs (Priority: P2)

An operator runs the consumer to process pending removal jobs. When the producer determines a video should no longer be in the catalog (e.g., dropped below score threshold, channel uncurated), it enqueues a remove job. The consumer deletes the video's files from cloud storage, clears the sync timestamp so the video no longer appears in the feed, and removes the completed job from the queue.

**Why this priority**: Removals keep the catalog clean and storage costs manageable. Without this, stale content accumulates indefinitely.

**Independent Test**: Can be tested by marking a synced video for removal, running the consumer, and verifying the files are gone from storage and the video no longer appears in the feed.

**Acceptance Scenarios**:

1. **Given** a pending removal job with storage paths in its metadata, **When** the consumer processes it, **Then** all associated files (video, thumbnail, subtitles, metadata file) are deleted from cloud storage, the video record's sync timestamp is cleared, and the job is deleted from the queue.
2. **Given** a removal job where some files are already missing from storage (partial previous cleanup), **When** the consumer processes it, **Then** it deletes whatever files exist, ignores missing files without error, and completes successfully.
3. **Given** a removal job that fails (storage service unavailable), **When** the consumer processes it, **Then** the job's attempt count is incremented with the error recorded, and it returns to pending for retry.

---

### User Story 3 - Recover from Interrupted Runs (Priority: P2)

If the consumer crashes or is killed mid-run, jobs that were marked as "processing" become stuck. On the next run, the consumer detects these stale locks (jobs stuck in processing beyond a configurable timeout) and resets them to pending so they can be reprocessed.

**Why this priority**: Without stale lock recovery, interrupted runs permanently block jobs. This is essential for unattended scheduled operation.

**Independent Test**: Can be tested by manually setting a job to "processing" with an old timestamp, running the consumer, and verifying it gets reset and processed.

**Acceptance Scenarios**:

1. **Given** a job stuck in "processing" status for longer than the configured timeout, **When** the consumer starts a new run, **Then** the job is reset to "pending" status before batch pickup begins.
2. **Given** a job in "processing" status that is within the timeout window, **When** the consumer starts, **Then** the job is left alone (assumed to be actively processed by another run).

---

### User Story 4 - Preview and Control Execution (Priority: P3)

An operator can preview what the consumer would do without making changes (dry run), control batch sizes via command-line overrides, filter to only downloads or only removals, and see detailed per-job output in verbose mode. This supports safe testing during initial setup and targeted operations during maintenance.

**Why this priority**: Operational control and observability are important for trust, but the consumer functions correctly without them.

**Independent Test**: Can be tested by running with dry-run flag and verifying no jobs are processed, no files are downloaded, and no database changes occur, while still showing what would happen.

**Acceptance Scenarios**:

1. **Given** pending jobs in the queue, **When** the consumer runs in dry-run mode, **Then** it reports what it would process without downloading, uploading, or modifying any data.
2. **Given** a mix of download and removal jobs, **When** the consumer runs with a downloads-only filter, **Then** only download jobs are processed and removal jobs are left untouched.
3. **Given** a batch size override via command line, **When** the consumer runs, **Then** it processes at most the specified number of jobs regardless of the configured default.

---

### Edge Cases

- What happens when a video is deleted or made private on YouTube between enqueue and consumer pickup? The download fails gracefully, attempt count increments, and after max attempts the job remains for manual review.
- What happens when cloud storage is temporarily unavailable during upload? The job fails and retries on the next run. Partially uploaded files from the failed attempt are cleaned up before retry.
- What happens when local disk fills up during downloads? The consumer detects download failures (non-zero exit from the download tool), cleans up partial files, and fails the job gracefully.
- What happens when a video's channel handle is missing from job metadata? The consumer looks up the channel handle from the database as a fallback rather than failing the job.
- What happens when the staging directory already contains files from a previous interrupted run? The consumer cleans the per-job staging subdirectory before starting each download, preventing conflicts with leftover files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST pick pending jobs in priority-descending, age-ascending order (highest priority first, oldest first within same priority), limited to a configurable batch size.
- **FR-002**: System MUST mark picked jobs as "processing" with a timestamp before beginning work, providing distributed-safe locking.
- **FR-003**: System MUST download videos in a web-optimized format: MP4 container, h264 video, AAC audio, with the fast-start optimization (progressive download) applied during the download/merge step.
- **FR-004**: System MUST cap video resolution to a configurable maximum height (default 1080p) to balance quality and storage cost.
- **FR-005**: System MUST download sidecar files alongside each video: thumbnail image, English subtitles (including auto-generated), and a metadata JSON file.
- **FR-006**: System MUST upload all files (video, thumbnail, subtitles, metadata) to cloud storage using a predictable, flat key structure: `{channel_handle}/{YYYY}-{MM}/{video_id}.{ext}`.
- **FR-007**: System MUST update the video database record with storage paths and a sync timestamp only after all files for that video are successfully uploaded, ensuring the feed never references incomplete uploads.
- **FR-008**: System MUST delete the queue job row upon successful completion (both downloads and removals).
- **FR-009**: System MUST increment the attempt count and record the error message on job failure, returning the job to pending status for retry.
- **FR-010**: System MUST skip jobs that have reached the configurable maximum attempt count (default 3), leaving them in the queue for manual inspection.
- **FR-011**: System MUST reset stale processing locks (jobs stuck in "processing" beyond a configurable timeout, default 60 minutes) to "pending" at the start of each run.
- **FR-012**: System MUST clean up local temporary files (partial downloads, staging directory) after each job regardless of success or failure.
- **FR-013**: For removal jobs, system MUST delete all associated files from cloud storage, tolerate already-missing files, and clear the sync timestamp on the video record.
- **FR-014**: System MUST support a dry-run mode that reports planned actions without executing any downloads, uploads, or database modifications.
- **FR-015**: System MUST support command-line overrides for batch size and job type filtering (downloads-only, removals-only).
- **FR-016**: System MUST throttle downloads with a configurable delay between jobs (default 2 seconds) to avoid aggressive request patterns.
- **FR-017**: System MUST load all tunables from a configuration file with sensible defaults, requiring no configuration for basic operation.
- **FR-018**: System MUST print a run summary upon completion showing: jobs processed, succeeded, failed, skipped (max attempts), and time elapsed.

### Key Entities

- **Sync Queue Job**: A unit of work representing either a video to download or a video to remove. Contains the video identifier, channel identifier, action type, processing status, attempt count, error details, priority, and arbitrary metadata (titles, paths, scores).
- **Video Record**: The database entry for a video, including storage paths (video, thumbnail, subtitle, metadata) and a sync timestamp that controls feed visibility. A video is visible in the feed only when the sync timestamp is set.
- **Staging Area**: A local temporary directory where downloads land before cloud upload. Cleaned after each job to prevent disk accumulation.
- **Consumer Configuration**: A centralized file defining all operational tunables: batch size, retry limits, timeouts, download format preferences, throttle delays, and cloud storage key templates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A batch of 50 download jobs completes within 90 minutes under normal network conditions, with each processed video immediately visible in the feed upon completion.
- **SC-002**: The initial backfill of ~2,300 jobs is fully processed within 5 days of scheduled consumer runs without manual intervention.
- **SC-003**: Failed jobs are automatically retried up to the configured limit, with at least 90% of transient failures (network timeouts, temporary unavailability) succeeding on retry.
- **SC-004**: No orphaned temporary files remain on disk after any consumer run (successful, failed, or interrupted).
- **SC-005**: An interrupted consumer run (crash, kill) leaves zero permanently stuck jobs — all are recoverable on the next run via stale lock detection.
- **SC-006**: Videos downloaded by the consumer play instantly in web browsers without buffering delays at the start (progressive download / fast-start verified).
- **SC-007**: The consumer operates correctly with zero configuration beyond environment variables for service credentials, using sensible defaults for all tunables.
- **SC-008**: Steady-state nightly runs (fewer than 100 jobs) complete in under 30 minutes.
