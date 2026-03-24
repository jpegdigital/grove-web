# Implementation Plan: Queue Consumer for Video Sync Pipeline

**Branch**: `006-queue-consumer` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-queue-consumer/spec.md`

## Summary

Build `sync_consumer.py` — a batch queue consumer that processes `sync_queue` jobs by downloading videos via yt-dlp (web-optimized faststart MP4) and uploading to Cloudflare R2, or removing files from R2 for removal jobs. Follows the same patterns as `sync_producer.py`: YAML config with defaults, CLI flags (--dry-run, --verbose, --limit), batch processing, and structured summary output. Runs as a cron-triggered script, not a daemon.

## Technical Context

**Language/Version**: Python 3.10+ (matches pyproject.toml `requires-python = ">=3.10"`)
**Primary Dependencies**: supabase, boto3, pyyaml, yt-dlp (new dependency)
**Storage**: PostgreSQL (Supabase) + Cloudflare R2 (S3-compatible via boto3)
**Testing**: pytest (via `uv run pytest`)
**Target Platform**: Windows (primary dev), cross-platform compatible
**Project Type**: CLI script (cron-triggered batch processor)
**Performance Goals**: 50 downloads in under 90 minutes; steady-state <100 jobs in under 30 minutes
**Constraints**: Sequential downloads (one at a time to avoid YouTube throttling); yt-dlp as subprocess (not library import)
**Scale/Scope**: ~2,300 backfill jobs initially, then ~50-100 per producer run steady-state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Progressive Complexity** | PASS | Single-file script (`sync_consumer.py`) + config file. No abstractions beyond functions. WET phase — first consumer, no shared library extraction yet. |
| **II. Testing Discipline** | PASS | Tests planned via pytest with parameterized cases for scoring, retry logic, path generation. Mocks for yt-dlp subprocess and R2 client. |
| **III. Fail Fast & Loud** | PASS | Missing env vars checked at startup. yt-dlp failures captured via non-zero exit code + stderr. R2 errors caught and logged with context. |
| **IV. Configuration as Data** | PASS | All tunables in `config/consumer.yaml` with defaults in code. Env vars for secrets. No magic numbers. |
| **V. Code Style** | PASS | Functions with type annotations, explicit imports, composition over classes. Follows sync_producer.py conventions. |
| **VI. Anti-Patterns** | PASS | No catch-all handlers (specific exceptions for subprocess, boto3, DB). No TODOs without issues. No god modules. |
| **Idempotency & Retries** | PASS | Downloads are idempotent (re-download overwrites). R2 uploads are idempotent (PUT overwrites). Retry with attempt counter, not exponential backoff (retries happen across runs, not within). |
| **Audit Trail** | PASS | All yt-dlp calls logged with video_id + exit code. All R2 uploads logged with key + size. State changes logged. |

**Gate result: PASS** — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-queue-consumer/
├── plan.md              # This file
├── research.md          # Phase 0: yt-dlp integration research
├── data-model.md        # Phase 1: queue + video data model
├── quickstart.md        # Phase 1: how to run the consumer
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
scripts/
└── sync_consumer.py     # The consumer script (new)

config/
└── consumer.yaml        # Consumer configuration (new)

tests/
└── test_sync_consumer.py  # Consumer tests (new)
```

**Structure Decision**: Single new script file following the established pattern of `sync_producer.py` and `sync_downloads.py`. No new directories needed — slots into existing `scripts/`, `config/`, `tests/` structure. The consumer is a standalone script, not a module extraction — consistent with Principle I (Progressive Complexity).

## Complexity Tracking

> No violations to justify. Design stays within constitution bounds.
