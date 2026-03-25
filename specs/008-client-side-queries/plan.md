# Implementation Plan: Client-Side Supabase Queries

**Branch**: `008-client-side-queries` | **Date**: 2026-03-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-client-side-queries/spec.md`

## Summary

Move the home page creator query and watch feed video query from Next.js API routes to direct client-side Supabase calls using React Query. This eliminates the unnecessary server proxy layer that adds cold-start latency (8s on first load). The feed-scoring module is already pure functions and works client-side without changes. The admin panel continues using direct Supabase queries (moved inline). After migration, the `/api/creators` and `/api/videos/feed` routes can be deleted.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 16, React 19)
**Primary Dependencies**: @supabase/supabase-js, @tanstack/react-query, next
**Storage**: Supabase (PostgreSQL via PostgREST)
**Testing**: Vitest (not yet configured — constitution requires TDD but this is a refactor with identical behavior)
**Target Platform**: Web browser (client-side rendering)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: < 2s initial creator load, instant on repeat visits via React Query cache
**Constraints**: Publishable key already exposed via NEXT_PUBLIC env vars; RLS is permissive (single-user POC)
**Scale/Scope**: ~26 creators, ~1000 videos, single user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Progressive Complexity | PASS | Removing abstraction (API routes), not adding. Moving to simpler direct queries. |
| II. Testing Discipline | PASS (with caveat) | Feed-scoring module already has no tests — this refactor doesn't change scoring logic, just moves where it runs. No new logic introduced. |
| III. Fail Fast & Loud | PASS | React Query surfaces errors. Supabase client throws on connection failures. |
| IV. Configuration as Data | PASS | Supabase URL and key are already NEXT_PUBLIC env vars. No new config needed. |
| V. Code Style | PASS | Keeping types explicit, functions pure, files focused. |
| VI. Anti-Patterns | PASS | No violations. Removing unnecessary indirection. |

## Project Structure

### Documentation (this feature)

```text
specs/008-client-side-queries/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── page.tsx                    # MODIFY: replace fetch("/api/creators") with direct Supabase query
│   ├── api/
│   │   ├── creators/route.ts       # DELETE after migration
│   │   └── videos/feed/route.ts    # DELETE after migration
│   └── admin/page.tsx              # MODIFY: replace fetch("/api/creators?include=channels") with direct Supabase query
├── components/
│   └── feed-view.tsx               # MODIFY: replace fetch("/api/videos/feed") with direct Supabase query + client-side scoring
├── hooks/
│   └── use-feed.ts                 # CREATE: custom hook encapsulating feed query + scoring logic
├── lib/
│   ├── supabase.ts                 # NO CHANGE: already client-compatible
│   ├── feed-scoring.ts             # NO CHANGE: pure functions, works client-side as-is
│   └── queries/
│       └── creators.ts             # CREATE: shared Supabase query function for creators (used by home + admin)
```

**Structure Decision**: Minimal new files. The feed query logic moves into a custom hook (`use-feed.ts`) since it involves multiple Supabase calls + scoring. Creator queries go in a shared module since both home page and admin page need them (with different select clauses).

## Complexity Tracking

No constitution violations to justify.
