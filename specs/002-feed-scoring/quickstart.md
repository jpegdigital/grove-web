# Quickstart: Feed Scoring Algorithm

**Date**: 2026-03-22
**Feature**: 002-feed-scoring

## Prerequisites

- Node.js 18+ with npm
- Supabase project with existing PradoTube schema
- Environment variables configured (see CLAUDE.md)

## Setup

1. **Install new dev dependency**:
   ```bash
   npm install -D vitest
   ```

2. **Apply database migration**:
   ```bash
   # Via Supabase MCP or dashboard — adds priority columns
   # to creators and curated_channels tables
   ```

3. **Run tests** (should pass — TDD cycle):
   ```bash
   npm test          # single run
   npm run test:watch  # watch mode during development
   ```

4. **Start dev server**:
   ```bash
   npm run dev
   ```

## Verification Steps

### 1. Scoring works

Load the feed at `/feed`. Videos should appear in score-based order (not the old round-robin). The order should be stable across page reloads on the same day.

### 2. Priority tuning works

1. Open admin panel at `/admin`
2. Find a channel card — it should show a star rating (default: 2.5 stars / 50)
3. Click a star to change the priority
4. Reload the feed — the channel's videos should move up or down

### 3. Determinism works

1. Load the feed, note the first 5 videos
2. Reload — same 5 videos in the same order
3. Wait until the next calendar day — order should differ

### 4. Fairness works

1. Find a creator with multiple channels and one with a single channel
2. Set both to equal priority (50)
3. Load the feed — both creators should have roughly equal representation

### 5. Tests pass

```bash
npm test
```

Expected: all parameterized test cases pass for `scoreVideo`, `diversify`, and `hashToFloat`.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/feed-scoring.ts` | Scoring algorithm (pure functions) |
| `tests/unit/feed-scoring.test.ts` | Parameterized Vitest tests |
| `src/app/api/videos/feed/route.ts` | Feed endpoint (uses scoring) |
| `src/app/admin/page.tsx` | Admin panel (priority controls) |
| `src/components/ui/star-rating.tsx` | Star rating UI component |
| `vitest.config.ts` | Vitest configuration |
