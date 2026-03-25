# Implementation Plan: HLS Adaptive Streaming Pipeline

**Branch**: `007-hls-streaming` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-hls-streaming/spec.md`

## Summary

Replace progressive MP4 video delivery with HLS adaptive bitrate streaming. The sync consumer downloads 4 pre-encoded quality tiers (360p, 480p, 720p, 1080p) from YouTube via yt-dlp, remuxes each into HLS fMP4 segments using `ffmpeg -c copy` (no re-encoding), generates a master playlist, and uploads the complete package to Cloudflare R2. The video player uses hls.js on Chrome/Firefox with native HLS fallback on Safari/iOS. Legacy MP4 videos continue to play during the migration.

## Technical Context

**Language/Version**: Python 3.11 (consumer scripts), TypeScript/React (Next.js 16 frontend)
**Primary Dependencies**: yt-dlp, ffmpeg (CLI subprocess), boto3 (R2 upload), hls.js (browser HLS), React Query
**Storage**: Supabase (PostgreSQL) for metadata, Cloudflare R2 for media files
**Testing**: pytest (Python scripts), Vitest (frontend components)
**Target Platform**: Windows (consumer scripts), Web browsers (desktop + mobile Safari/Chrome/Firefox)
**Project Type**: Web application with offline Python sync pipeline
**Performance Goals**: Video playback start < 2 seconds, seamless quality switching
**Constraints**: No re-encoding (codec copy only), H.264 for device compatibility, R2 free egress
**Scale/Scope**: ~2000 videos, ~4 quality tiers each, ~40-200 R2 objects per video

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | Modifying existing consumer script — no new abstractions. HLS packaging is a single new function added to the existing pipeline. |
| II. Testing Discipline | PASS | Unit tests for HLS remux command building, master playlist generation. Integration test for end-to-end consumer run. |
| III. Fail Fast & Loud | PASS | Missing ffmpeg raises on first use. Failed tier downloads logged with context. Partial HLS packages fail the job. |
| IV. Configuration as Data | PASS | New HLS config section in `config/consumer.yaml`. Quality tiers, segment duration, min tiers all configurable. |
| V. Code Style | PASS | Follows existing consumer patterns. New functions colocated in sync_consumer.py. Type annotations on all public functions. |
| VI. Anti-Patterns | PASS | No magic numbers (tiers/bandwidths in config). No catch-all handlers. No speculative abstractions. |

**Post-design re-check**: PASS — Design adds one new config section and extends existing functions. No new files, no new abstractions, no deep inheritance.

## Project Structure

### Documentation (this feature)

```text
specs/007-hls-streaming/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technical research and decisions
├── data-model.md        # Phase 1: Data model changes
├── quickstart.md        # Phase 1: Setup and usage guide
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files modified/created)

```text
# Python consumer pipeline (modified)
scripts/sync_consumer.py          # Add multi-tier download + HLS remux + folder upload
config/consumer.yaml              # Add hls config section (tiers, segment_duration, etc.)
tests/test_sync_consumer.py       # Add HLS-related test cases

# Frontend player (modified)
src/app/v/[id]/page.tsx           # HLS playback with hls.js + native fallback
src/components/video-card.tsx     # No change (thumbnails stay the same)
src/app/api/videos/[id]/route.ts  # No change (mediaPath column stays text)
package.json                      # Add hls.js dependency

# One-time setup
scripts/configure_r2_cors.py      # Standalone script to set R2 bucket CORS (run once)
```

**Structure Decision**: This feature modifies existing files in the established project structure. No new directories or architectural changes needed. The consumer script grows by ~150-200 lines (new functions for multi-tier download, HLS remux, master playlist generation, folder upload). The player component gains ~30 lines for HLS detection and initialization.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
