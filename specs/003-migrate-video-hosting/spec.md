# Feature Specification: R2 Video Storage Migration

**Feature Branch**: `003-migrate-video-hosting`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Migrate video hosting from Bunny Stream to Cloudflare R2 with direct MP4 serving, upload all files (video, thumbnails, subtitles, metadata) to R2 mirroring local path structure, combine sync_downloads with R2 upload, replace Bunny database columns with R2 metadata, and update frontend to serve directly from R2 CDN"

## Clarifications

### Session 2026-03-23

- Q: Should local file purge run by default during sync? → A: No. Purge is strictly opt-in via an explicit flag. It will not be used initially.
- Q: Should the first sync run bulk-upload the entire existing library to R2? → A: Upload in batches with a configurable limit per run (e.g., `--limit 50`) to throttle the initial backfill.
- Q: During transition, how should videos not yet in R2 be handled? → A: Only serve videos that have been uploaded to R2. Non-uploaded videos are hidden from the feed until migrated.
- Q: Should the local media API route (`/api/media/[...path]`) be removed after migration? → A: Yes, remove it as part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Videos Serve from Cloud CDN (Priority: P1)

A parent opens PradoTube and plays a video. The video loads quickly from Cloudflare's global CDN rather than from a local media server. Seeking, pausing, and resuming work seamlessly. The viewing experience is indistinguishable from before, but the content is now served from R2.

**Why this priority**: This is the core value — moving from local file serving to cloud CDN delivery. Without this, nothing else matters.

**Independent Test**: Can be fully tested by playing any video in the feed and confirming it loads from an R2 URL. Delivers reliable, CDN-backed video playback.

**Acceptance Scenarios**:

1. **Given** a video has been uploaded to R2, **When** a viewer plays the video, **Then** the video streams directly from the R2 public URL with full seeking support
2. **Given** a video has been uploaded to R2, **When** a viewer loads a video page, **Then** the thumbnail loads from R2 as well
3. **Given** a video has subtitles uploaded to R2, **When** a viewer enables subtitles, **Then** subtitles load from R2

---

### User Story 2 - Automated Upload During Sync (Priority: P1)

After ytdl-sub downloads new videos, the admin runs the sync process. The sync script discovers new downloads, uploads all associated files (video, thumbnail, subtitles, metadata) to R2, records the sync status in the database, and makes the content available on the CDN — all in one step.

**Why this priority**: This is the operational backbone. Content must flow from download to CDN without manual intervention or multiple script invocations.

**Independent Test**: Can be fully tested by downloading a new video via ytdl-sub, running the sync script, and confirming all files appear in R2 with correct paths.

**Acceptance Scenarios**:

1. **Given** ytdl-sub has downloaded a new video with sidecar files, **When** the sync script runs, **Then** the video, thumbnail, subtitles, and info.json are all uploaded to R2
2. **Given** a video was previously synced to R2, **When** the sync script runs again, **Then** the already-synced video is skipped (no re-upload)
3. **Given** a video upload to R2 fails mid-transfer, **When** the sync script runs again, **Then** the failed video is retried

---

### User Story 3 - Local Storage Cleanup (Priority: P2)

After confirming videos are safely stored in R2, the admin can reclaim local disk space by purging local copies of files that have been successfully uploaded. This is strictly opt-in via an explicit flag — purge never runs by default and will not be used in the initial rollout.

**Why this priority**: Disk reclamation is valuable but secondary to getting content into R2 and serving it. Must only happen after uploads are confirmed.

**Independent Test**: Can be fully tested by running the sync script with the purge option on a video confirmed to be in R2, then verifying the local files are removed and the video still plays.

**Acceptance Scenarios**:

1. **Given** a video's files have been uploaded to R2 (r2_synced_at is set), **When** the admin runs sync with the purge option, **Then** local video, thumbnail, subtitle, and metadata files are deleted
2. **Given** a video has NOT been uploaded to R2, **When** the admin runs sync with the purge option, **Then** the local files are preserved
3. **Given** local files have been purged, **When** a viewer plays the video, **Then** playback works because it serves from R2

---

### User Story 4 - Database Migration from Bunny to R2 (Priority: P1)

The database schema is updated to replace Bunny Stream-specific columns with R2 storage metadata. The Bunny columns (which were never deployed to production) are removed, and a lightweight R2 tracking column is added.

**Why this priority**: The schema change is a prerequisite for all other stories — the sync script and frontend both depend on knowing R2 sync status.

**Independent Test**: Can be fully tested by running the migration and confirming the schema has the new column and the Bunny columns are gone.

**Acceptance Scenarios**:

1. **Given** the current schema has Bunny Stream columns, **When** the migration runs, **Then** bunny_video_id, bunny_collection_id, bunny_status, and bunny_uploaded_at columns are removed
2. **Given** the migration runs, **When** the videos table is inspected, **Then** an r2_synced_at timestamp column exists

---

### Edge Cases

- What happens when the R2 upload succeeds but the database update fails? The sync script should be idempotent — re-running picks up where it left off without duplicating uploads.
- What happens when a video file is corrupted or zero-length on disk? The sync script should skip files that don't meet minimum size thresholds and log a warning.
- What happens when R2 is temporarily unavailable? The sync script should report the error and continue with other videos rather than aborting entirely.
- What happens when a video exists in R2 but is_downloaded is set to false in the database? The frontend serves from R2 based on r2_synced_at, regardless of local download status. The feed eligibility check is r2_synced_at IS NOT NULL, replacing the previous is_downloaded check.
- What happens when the admin purges local files for a video that was never uploaded to R2? The purge operation must check r2_synced_at before deleting and refuse to purge un-synced files.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST upload all sidecar files (video, thumbnail, subtitles, info.json) to R2 for each synced video, not just the video file
- **FR-002**: System MUST use the existing relative media path (e.g., `@handle/YYYY-MM/videoID.ext`) as the R2 object key, mirroring the local directory structure
- **FR-003**: System MUST record a timestamp (r2_synced_at) in the database when all files for a video are successfully uploaded to R2
- **FR-004**: System MUST skip videos that have already been synced to R2 during subsequent sync runs (idempotent operation)
- **FR-005**: System MUST serve video, thumbnail, and subtitle URLs exclusively from the R2 public endpoint. Videos without r2_synced_at MUST be excluded from the feed and not playable until uploaded to R2
- **FR-006**: System MUST support an opt-in purge mode (disabled by default, activated only via explicit flag) that deletes local files only after confirming they exist in R2. Purge MUST NOT run unless the admin explicitly requests it.
- **FR-007**: System MUST remove the Bunny Stream database columns (bunny_video_id, bunny_collection_id, bunny_status, bunny_uploaded_at) and related indexes via a migration
- **FR-008**: System MUST add an r2_synced_at column to the videos table via a migration
- **FR-009**: System MUST handle R2 upload failures gracefully — log the error, skip the failed video, and continue processing remaining videos
- **FR-010**: System MUST combine R2 upload into the existing download sync workflow rather than requiring a separate script invocation
- **FR-011**: System MUST support a configurable limit on the number of videos uploaded to R2 per sync run (e.g., `--limit 50`) to allow throttled backfill of the existing library
- **FR-012**: System MUST remove the local media serving API route (`/api/media/[...path]`) as part of this migration, since all content will be served directly from R2

### Key Entities

- **Video**: Extended with r2_synced_at timestamp to track cloud storage status. The existing media_path, thumbnail_path, and subtitle_path fields double as R2 object keys.
- **R2 Bucket**: Cloud object store holding all media files. Organized by handle and date, mirroring the local ytdl-sub output structure. Publicly accessible via a configured URL prefix.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All downloaded videos and their sidecar files are uploaded to cloud storage and accessible via public URLs
- **SC-002**: Video playback experience (load time, seeking, quality) is equivalent to or better than local serving
- **SC-003**: The sync workflow requires a single command to scan downloads, update the database, and upload to cloud storage
- **SC-004**: Monthly hosting costs are predictable and proportional only to storage volume, with no per-view or bandwidth charges
- **SC-005**: Local disk space can be reclaimed after confirming cloud upload, with no risk of data loss
- **SC-006**: Re-running the sync process does not re-upload already-synced content

## Assumptions

- R2 bucket is pre-created and configured with public access before the first sync run. Bucket creation is a one-time manual setup, not part of the automated workflow.
- The R2 public URL prefix is provided via environment variable configuration.
- The Bunny Stream columns were never deployed to production data — they exist only as an uncommitted migration, so removing them has no data loss implications.
- Videos are served as direct MP4 files (progressive download), not HLS. No transcoding or segmenting is performed.
- The existing media_path values in the database are valid R2 object keys without transformation.
- A single R2 bucket is sufficient for all media files. No need for per-channel or per-creator bucket separation.

## Scope Boundaries

### In Scope

- Database migration: remove Bunny columns, add R2 tracking
- Sync script enhancement: upload files to R2 during sync_downloads
- Frontend URL generation: construct R2 public URLs from media_path
- Local file purge option
- Environment variable configuration for R2 credentials and public URL

### Out of Scope

- HLS transcoding or adaptive bitrate streaming
- R2 bucket creation or IAM configuration (manual one-time setup)
- Migration of existing Bunny Stream content (none exists in production)
- CDN custom domain setup (can use default R2 public URL)
- Video analytics or access logging
- Multi-bucket or multi-region storage strategies
