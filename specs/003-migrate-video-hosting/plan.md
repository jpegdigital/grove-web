# Implementation Plan: R2 Video Storage Migration

**Branch**: `003-migrate-video-hosting` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-migrate-video-hosting/spec.md`

## Summary

Migrate PradoTube's video hosting from local file serving (via `/api/media/` proxy) to Cloudflare R2 object storage with direct public CDN URLs. Enhance `sync_downloads.py` to upload all sidecar files to R2 using boto3's S3-compatible API, replace Bunny Stream database columns with a single `r2_synced_at` timestamp, update the frontend to construct R2 URLs from existing `media_path` fields, and remove the local media API route. Includes throttled backfill via `--limit` and opt-in local file purge via `--purge`.

## Technical Context

**Language/Version**: Python 3.11+ (sync scripts), TypeScript/Next.js 16 (frontend)
**Primary Dependencies**: boto3 (new), supabase-py, React Query, shadcn/ui, Tailwind CSS v4
**Storage**: Supabase (PostgreSQL), Cloudflare R2 (S3-compatible object storage)
**Testing**: Manual verification (single-user POC)
**Target Platform**: Windows local dev, Supabase cloud, Cloudflare R2
**Project Type**: Web application (Next.js) + CLI sync scripts (Python)
**Performance Goals**: Video playback equivalent to local serving; sync script handles 500MB+ files
**Constraints**: Single-user POC; r2.dev rate limits acceptable; no HLS
**Scale/Scope**: ~500 videos, ~500GB storage, 1 user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | No new abstractions — extending existing sync script. Single r2_synced_at column vs Bunny's 4 columns. boto3 is a direct dependency, not a wrapper. |
| II. Testing Discipline | PASS | Single-user POC — manual verification per existing pattern. Parameterized tests can be added for R2 upload helper if extracted. |
| III. Fail Fast & Loud | PASS | Missing R2 env vars raise on startup. Upload failures logged with context (key, error, status). Partial failures don't abort batch. |
| IV. Configuration as Data | PASS | All R2 config via env vars. No magic constants — bucket name, URL prefix, account ID all configurable. |
| V. Code Style | PASS | Follows existing sync script patterns. Type hints on public functions. boto3 is idiomatic Python. |
| VI. Anti-Patterns | PASS | No catch-all handlers (specific boto3 ClientError catches). No god modules. No magic strings (content types via mimetypes stdlib). |

**Post-Phase 1 re-check**: PASS — data model is minimal (1 column added), contracts are narrow, no over-engineering detected.

## Project Structure

### Documentation (this feature)

```text
specs/003-migrate-video-hosting/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: R2 SDK, upload strategy, URL patterns
├── data-model.md        # Phase 1: Schema changes, state transitions
├── quickstart.md        # Phase 1: Setup and migration steps
├── contracts/
│   ├── feed-api.md      # Feed/video API query + URL changes
│   └── sync-cli.md      # sync_downloads CLI contract (flags, flow, exit codes)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: Task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Files MODIFIED
scripts/sync_downloads.py          # Add R2 upload, --limit, --purge flags
src/app/api/videos/feed/route.ts   # Change filter: r2_synced_at IS NOT NULL
src/app/api/videos/[id]/route.ts   # Change filter for single video lookup
src/components/video-card.tsx       # URL: R2_PUBLIC_URL instead of /api/media/
src/components/feed-view.tsx        # Pass R2 URL context if needed
next.config.ts                      # Add R2 domain to remotePatterns
pyproject.toml                      # Add boto3, remove sync-bunny entry
.env.local                          # Add R2 env vars, remove Bunny vars
.gitignore                          # No changes expected

# Files CREATED
supabase/migrations/20260323000002_replace_bunny_with_r2.sql  # Schema migration

# Files DELETED
scripts/sync_bunny.py                           # Bunny upload script
src/app/api/media/[...path]/route.ts            # Local media proxy
supabase/migrations/20260323000001_add_bunny_stream_columns.sql  # Bunny migration
```

**Structure Decision**: No new directories or modules. Changes are scoped to existing files plus one new migration. The R2 upload logic lives inside `sync_downloads.py` (not extracted to a separate module) following Progressive Complexity — it's a single consumer with no reuse case.
