# Feature Specification: HLS Adaptive Streaming Pipeline

**Feature Branch**: `007-hls-streaming`
**Created**: 2026-03-24
**Status**: Draft
**Input**: User description: "HLS streaming pipeline: Modify the sync consumer to download 4 quality tiers (360p, 480p, 720p, 1080p) from YouTube via yt-dlp instead of just 1080p, remux each into HLS fMP4 segments using ffmpeg -c copy (no re-encoding), generate master.m3u8 with adaptive bitrate variants, upload the HLS package to Cloudflare R2 under a new folder-per-video structure, update the database to store the m3u8 path, and update the video player frontend to use hls.js for Chrome/Firefox with native HLS fallback for Safari/iOS. R2 CORS also needs to be configured to allow cross-origin range requests for HLS segment fetching."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Video Playback on Any Device (Priority: P1)

A child opens the PradoTube feed on their tablet and taps a video. The video begins playing within 2 seconds regardless of their connection speed. On a slow cellular connection the video plays at lower quality rather than buffering endlessly. On fast WiFi it plays in full HD.

**Why this priority**: This is the core user-facing problem. Currently videos take 15+ seconds to start on an 850 MB progressive MP4 download. Kids lose interest and leave. Adaptive streaming is the entire reason for this feature.

**Independent Test**: Play a video on a mobile device over throttled network (3G simulation). Verify playback starts within 2 seconds and quality adapts to available bandwidth.

**Acceptance Scenarios**:

1. **Given** a video has been processed into HLS segments, **When** a user taps play on a phone over cellular data, **Then** the video starts playing within 2 seconds at an appropriate quality tier (360p or 480p)
2. **Given** a video is playing at 480p on a slow connection, **When** the connection improves to fast WiFi, **Then** the player automatically upgrades to 720p or 1080p without interrupting playback
3. **Given** a video is playing at 1080p, **When** the network degrades, **Then** the player drops to a lower tier smoothly without buffering stalls
4. **Given** a user opens a video on Safari/iOS, **When** they tap play, **Then** the video plays using native HLS support without any additional libraries loading

---

### User Story 2 - Consumer Produces HLS Packages from YouTube (Priority: P1)

The sync consumer processes download jobs from the queue. For each video, it downloads 4 pre-encoded quality tiers directly from YouTube (leveraging YouTube's existing encodes rather than re-encoding locally), remuxes each into HLS segments, generates a master playlist, and uploads the complete package to R2.

**Why this priority**: Without HLS packages in R2, the player has nothing to stream. This is the backend prerequisite for Story 1.

**Independent Test**: Run the consumer with `--limit 1 --verbose`. Verify it downloads 4 quality tiers, produces HLS segments and playlists, uploads to R2, and the master.m3u8 is accessible via the R2 public URL.

**Acceptance Scenarios**:

1. **Given** a pending download job in the queue, **When** the consumer processes it, **Then** it downloads 4 separate quality tiers (360p, 480p, 720p, 1080p) from YouTube as H.264
2. **Given** 4 downloaded MP4 files, **When** the consumer runs the remux step, **Then** it produces HLS fMP4 segments (6-second chunks) and per-quality playlists for each tier without re-encoding (copy only)
3. **Given** 4 sets of HLS segments and playlists, **When** the consumer generates the master playlist, **Then** the master.m3u8 correctly references all 4 quality variants with accurate bandwidth and resolution metadata
4. **Given** a complete HLS package, **When** the consumer uploads to R2, **Then** all files are stored under a folder-per-video structure and the video record is updated with the new path
5. **Given** a quality tier is unavailable on YouTube (e.g., video is only 720p native), **When** the consumer processes it, **Then** it gracefully skips the missing tier and produces an HLS package with only the available tiers

---

### User Story 3 - Reduced Bandwidth for Mobile Viewers (Priority: P2)

A parent's child watches PradoTube videos on a phone using mobile data. Instead of downloading an 850 MB file for every video, the child's device streams only the quality tier matching their screen and connection — consuming roughly 40-70 MB for a 30-minute video at 360p instead of 850 MB at 1080p.

**Why this priority**: Bandwidth savings directly impact user cost and experience, but this is a natural consequence of Story 1 working correctly. It doesn't require separate implementation.

**Independent Test**: Monitor network traffic while playing a video on a mobile viewport with throttled bandwidth. Verify total data consumed is proportional to the selected quality tier, not the full 1080p file.

**Acceptance Scenarios**:

1. **Given** a user watches a 30-minute video on a phone over cellular, **When** the player selects 360p, **Then** total data transferred is approximately 40 MB (not 850 MB)
2. **Given** a user seeks to a point 20 minutes into a video, **When** the player loads that position, **Then** only the segments around the seek point are downloaded (not everything from the start)

---

### User Story 4 - Backward-Compatible Migration (Priority: P2)

Videos already synced to R2 as progressive MP4 continue to play normally in the feed. The migration to HLS is incremental — new consumer runs produce HLS packages, while existing MP4-only videos still work until they are re-processed.

**Why this priority**: There are ~157 videos already synced to R2 as MP4. Breaking those would disrupt the existing feed during migration.

**Independent Test**: Load the feed with a mix of HLS-processed and legacy MP4-only videos. Verify both types play correctly.

**Acceptance Scenarios**:

1. **Given** a video with only a progressive MP4 in R2 (no HLS package), **When** a user plays it, **Then** the player falls back to progressive MP4 playback
2. **Given** a video that has been re-processed with HLS, **When** a user plays it, **Then** the player uses the HLS manifest for adaptive streaming
3. **Given** the consumer processes a video that already has a legacy MP4 in R2, **When** the HLS package is uploaded, **Then** the legacy MP4 is cleaned up to avoid duplicate storage costs

---

### Edge Cases

- What happens when YouTube doesn't offer a quality tier in H.264? (e.g., only AV1 available at 360p) — Consumer should fall back to the best available codec or skip that tier
- What happens when a video is extremely short (under 6 seconds)? — HLS should produce a single segment per quality tier
- What happens when ffmpeg remux fails for one tier but succeeds for others? — The HLS package should be produced with the successful tiers only (minimum 1 tier required)
- What happens when R2 upload partially fails mid-package? — The job should be marked failed and retried; partial uploads should be cleaned up
- What happens when a video is portrait orientation (e.g., 1080x1920 shorts)? — Quality tiers should be based on the shorter dimension; the master playlist should report correct resolution
- What happens during the transition period when some videos have HLS and some have MP4? — Player must handle both formats seamlessly

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST download up to 4 quality tiers (360p, 480p, 720p, 1080p) per video from YouTube using H.264 codec for maximum device compatibility
- **FR-002**: System MUST gracefully handle missing quality tiers — if YouTube doesn't offer a requested resolution, skip it and produce an HLS package from available tiers (minimum 1 tier required)
- **FR-003**: System MUST remux each downloaded quality tier into HLS fMP4 segments without re-encoding (copy codec only) to preserve original YouTube quality
- **FR-004**: System MUST produce 6-second segments per quality tier, aligned on keyframes
- **FR-005**: System MUST generate a master playlist (master.m3u8) that declares each available quality variant with accurate bandwidth, resolution, and codec metadata
- **FR-006**: System MUST upload the complete HLS package (master playlist, per-quality playlists, all segments, thumbnail, subtitle) to R2 under a folder-per-video key structure
- **FR-007**: System MUST update the video database record with the path to the master playlist after successful upload
- **FR-008**: System MUST apply randomized throttle between YouTube downloads (same as current pipeline) to mitigate bot detection across the 4 downloads per video
- **FR-009**: Video player MUST support adaptive bitrate streaming — automatically selecting and switching quality tiers based on available bandwidth
- **FR-010**: Video player MUST work on Safari/iOS using native HLS support and on Chrome/Firefox using a client-side HLS library
- **FR-011**: Video player MUST fall back to progressive MP4 playback for videos that have not yet been converted to HLS
- **FR-012**: System MUST configure R2 bucket CORS to allow cross-origin requests (including range requests) from the application domain
- **FR-013**: System MUST clean up staging files (downloaded MP4s, intermediate segments) after successful R2 upload
- **FR-014**: System MUST support re-processing existing videos — converting legacy MP4-only videos to HLS when re-queued

### Key Entities

- **HLS Package**: A complete set of streaming assets for one video — consists of a master playlist, one or more quality-variant playlists, and their associated media segments
- **Quality Variant**: A single resolution tier of a video (e.g., 720p) with its own playlist and segments, referenced by the master playlist
- **Media Segment**: A short (6-second) chunk of video+audio in fragmented MP4 format, the atomic unit of streaming delivery
- **Master Playlist**: The entry point file that lists all available quality variants with their bandwidth and resolution, enabling the player to choose adaptively

## Assumptions

- YouTube will continue to provide H.264-encoded streams at standard resolutions (360p, 480p, 720p, 1080p) for the foreseeable future
- The existing yt-dlp bot detection countermeasures (cookies, deno challenge solver, TLS impersonation, throttle) are sufficient for 4x the download volume per video
- ffmpeg is available on the system and supports fMP4 HLS segmentation with codec copy (standard in modern ffmpeg builds)
- R2 free egress makes self-hosted HLS cost-effective compared to managed video services
- The current ~157 MP4-synced videos can coexist with HLS videos in the feed during an incremental migration
- 6-second segment duration is appropriate for this content type (kids' YouTube videos, typically 5-30 minutes)
- H.264 is preferred over AV1/VP9 for broadest device compatibility (older iPads, budget Android tablets)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Video playback starts within 2 seconds of the user pressing play on any supported device and connection speed
- **SC-002**: Users on mobile connections consume less than 100 MB of data for a 30-minute video (versus the current ~850 MB)
- **SC-003**: The player seamlessly switches quality tiers during playback without visible buffering stalls when network conditions change
- **SC-004**: All 4 quality tiers are available for 95%+ of processed videos (accounting for the rare video that YouTube only provides in fewer resolutions)
- **SC-005**: HLS remux processing adds less than 30 seconds of overhead per video to the consumer pipeline (since it's copy-only, not re-encoding)
- **SC-006**: Both legacy MP4 videos and new HLS videos play correctly in the feed during the migration period, with zero playback failures for either format
- **SC-007**: Video seeking is near-instant — jumping to any point in a video loads and plays within 2 seconds
