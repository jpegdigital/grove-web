# Implementation Plan: Curated Video Feed

**Branch**: `001-curated-video-feed` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-curated-video-feed/spec.md`

## Summary

Build a cross-creator video feed page with interleaved round-robin sorting, finite batches with "Show more," creator avatar filter chips, and full navigation between home → feed → player. The feed only surfaces downloaded videos, hides engagement metrics, and preserves scroll position on back-navigation. Extends the existing player with end-of-video suggestions and a "Back to feed" action.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js App Router), Python 3.10+ (scripts)
**Primary Dependencies**: Next.js, React 19, @tanstack/react-query, @supabase/supabase-js, next-themes, lucide-react, shadcn/ui
**Storage**: Supabase (PostgreSQL 17) + local filesystem for media files
**Testing**: Manual verification via preview tools (no test framework configured)
**Target Platform**: Web browser (desktop + tablet, single-user household)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Feed first batch loads in <2s, smooth scrolling with 20+ video cards
**Constraints**: Single-user POC, no auth, downloaded videos only (~415 videos across ~20 channels, 8 creators)
**Scale/Scope**: ~415 downloaded videos, 8 creators, single concurrent user

## Constitution Check

*No constitution file found. Skipping gate checks.*

## Project Structure

### Documentation (this feature)

```text
specs/001-curated-video-feed/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── feed-api.md      # Feed API contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── page.tsx                    # Home — add creator card links + "Watch" nav
│   ├── feed/
│   │   └── page.tsx                # NEW — Feed page with grid, chips, batching
│   ├── v/[id]/
│   │   └── page.tsx                # Player — add end-of-video suggestions
│   └── api/
│       └── videos/
│           └── feed/
│               └── route.ts        # Feed API — add interleaving, pagination, creator filter
├── components/
│   ├── video-card.tsx              # NEW — Video card component
│   ├── creator-chips.tsx           # NEW — Creator filter chip row
│   └── ui/                         # Existing shadcn components
└── lib/
    └── supabase.ts                 # Existing Supabase client
```

**Structure Decision**: Next.js App Router convention. New feed page at `src/app/feed/page.tsx`. Shared components extracted to `src/components/`. API route extended in-place. No new API routes needed — the existing feed endpoint is extended with query parameters for pagination and creator filtering.

## Complexity Tracking

No constitution violations to track.
