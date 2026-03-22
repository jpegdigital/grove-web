# Implementation Plan: Feed Scoring Algorithm

**Branch**: `002-feed-scoring` | **Date**: 2026-03-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-feed-scoring/spec.md`

## Summary

Replace the current round-robin channel interleaving with a weighted scoring algorithm (`scoreVideo`) that computes a deterministic daily score per video based on recency (7-day half-life), channel priority (0–100), creator priority (0–100), and a fairness factor that normalizes multi-channel creators. Admin panel gets star-rating controls for tuning priorities. Feed order is deterministic per calendar day via date-seeded jitter. A diversity post-pass prevents >2 consecutive videos from the same creator.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16.2.0, React 19)
**Primary Dependencies**: Next.js 16, @supabase/supabase-js, @tanstack/react-query, Tailwind CSS v4, shadcn/ui, Vitest (new)
**Storage**: Supabase (PostgreSQL) — `creators`, `curated_channels`, `videos` tables
**Testing**: Vitest (to be configured — no test infrastructure exists today)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (Next.js App Router, server + client components)
**Performance Goals**: Score 1000 videos in <500ms server-side
**Constraints**: Single-user POC, permissive RLS, all videos loaded at once (limit 1000)
**Scale/Scope**: ~100–500 videos, ~10–30 channels, ~5–15 creators

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | Scoring starts as a single pure function in one file (`src/lib/feed-scoring.ts`). No abstractions until patterns emerge. Constants extracted to module-level, not a config framework. |
| II. Testing Discipline | PASS | Vitest configured before implementation (FR-013). Parameterized tests with give/want convention (FR-012). TDD: tests written first, confirmed failing, then implemented. |
| III. Fail Fast & Loud | PASS | Invalid priority values (outside 0–100) rejected at API boundary. No silent fallbacks for missing data — score function requires all inputs. |
| IV. Configuration as Data | PASS | Scoring weights (recency half-life, component weights) extracted as named constants. Priority ratings stored in DB, not hardcoded. Default rating (50) is a named constant. |
| V. Code Style | PASS | Pure function with typed interfaces. Composition over inheritance. Single-responsibility files: scoring logic separate from feed route, separate from admin UI. |
| VI. Anti-Patterns | PASS | No magic numbers (all constants named). No catch-all error handlers. No god modules. Explicit imports throughout. |

## Project Structure

### Documentation (this feature)

```text
specs/002-feed-scoring/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── feed-api.md      # Updated feed endpoint contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── feed-scoring.ts          # NEW: scoreVideo(), diversify(), hash functions
├── app/
│   ├── api/
│   │   ├── videos/feed/route.ts # MODIFY: replace interleaveByCreator with scored feed
│   │   ├── creators/[id]/route.ts       # MODIFY: accept priority field
│   │   └── curated-channels/[id]/route.ts # MODIFY: accept priority field
│   └── admin/page.tsx           # MODIFY: add star-rating priority controls
├── components/
│   └── ui/
│       └── star-rating.tsx      # NEW: reusable star rating component
tests/
└── unit/
    └── feed-scoring.test.ts     # NEW: parameterized Vitest tests
```

**Structure Decision**: Single Next.js project. New code is 2 files (`feed-scoring.ts`, `star-rating.tsx`) plus a test file. Existing files modified in-place. No new directories except `tests/unit/`.

## Complexity Tracking

> No violations to justify. Design follows WET phase — single file for scoring logic, no abstractions beyond what's immediately needed.
