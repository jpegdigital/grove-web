# Research: Feed Scoring Algorithm

**Date**: 2026-03-22
**Feature**: 002-feed-scoring

## R1: Deterministic Hashing for Daily Jitter

**Decision**: Use a simple string-based hash (FNV-1a or similar) seeded with `YYYY-MM-DD + videoId` to produce a deterministic float [0, 1) per video per day.

**Rationale**: The jitter component must be:
- Deterministic: same date + same video = same value (no `Math.random()`)
- Uniform: evenly distributed across [0, 1) for fair shuffling
- Fast: <1ms per video even for 1000 videos
- Session-independent: no cookies, no user ID, no session token

FNV-1a is a non-cryptographic hash that's fast, well-distributed, and trivial to implement in ~10 lines of TypeScript. No external dependency needed.

**Alternatives considered**:
- `crypto.createHash('md5')` — heavier, requires Node crypto module, overkill for non-security use
- `Math.random()` with seeded PRNG — requires a PRNG library or manual implementation, more code
- Stable sort by `videoId` alone — no daily variety, feed would feel stale

## R2: Scoring Formula Design

**Decision**: Multiplicative combination of normalized components:

```
score = (recency * W_RECENCY) + (channelPriority * creatorPriority * fairness * W_PRIORITY) + (jitter * W_JITTER)
```

Where:
- `recency = exp(-hoursAgo / 168)` (168 hours = 7-day half-life)
- `channelPriority = rating / 100` (0–100 integer normalized to 0–1)
- `creatorPriority = rating / 100` (0–100 integer normalized to 0–1)
- `fairness = 1 / sqrt(channelCount)` (inverse square root of creator's channel count)
- `jitter = hash(date + videoId)` (deterministic daily [0, 1))
- `W_RECENCY = 0.5`, `W_PRIORITY = 0.4`, `W_JITTER = 0.1` (initial component weights)

**Rationale**:
- Channel and creator priorities multiply so both must be non-zero for full effect — a high-priority channel under a low-priority creator is appropriately dampened
- `1/sqrt(n)` for fairness is gentler than `1/n` — a 4-channel creator gets 50% per-video weight (not 25%), which still allows popular multi-channel creators to have reasonable presence
- Additive top-level combination with weights lets each component be independently tunable
- Component weights are named constants, easy to adjust

**Alternatives considered**:
- Purely additive (channel + creator + recency) — loses the interaction between channel and creator priority
- `1/n` fairness — too aggressive, a 10-channel creator's individual videos would score 10% of a single-channel creator
- Multiplicative everything — a single zero factor would zero the entire score

## R3: Diversity Post-Pass Algorithm

**Decision**: Greedy scan with lookback window of 2.

**Rationale**: After scoring and sorting, scan the feed linearly. If the current video's creator matches both of the two previous entries, find the next video in the sorted list from a different creator and swap it forward. This is O(n) in practice (worst case O(n²) if all videos are from one creator, but that's degenerate).

**Alternatives considered**:
- Pre-allocating slots per creator — complex, doesn't respect score ordering
- Random swap — breaks determinism
- Interleave after scoring — loses score-based ordering entirely

## R4: Vitest Configuration

**Decision**: Add Vitest as dev dependency. Configure in `vitest.config.ts` with path aliases matching `tsconfig.json`. Test command: `npm test` → `vitest run`, `npm run test:watch` → `vitest`.

**Rationale**: Vitest is the standard for modern TypeScript projects using Vite/Next.js. It supports:
- TypeScript out of the box (no ts-jest config)
- `it.each` for parameterized tests (give/want convention per constitution)
- Path aliases via `resolve.alias` (matching `@/` prefix)
- Fast execution (~100ms for pure function tests)

**Alternatives considered**:
- Jest — heavier config, slower, requires ts-jest or SWC transform
- Node test runner — no parameterized test support, no TypeScript

## R5: Star Rating UI Component

**Decision**: Custom star-rating component using half-star increments (0–5 stars = 0–100 in steps of 10). Clickable stars set preset values. Numeric input allows fine-grained values 0–100.

**Rationale**: Half-star display maps cleanly to decades (0, 10, 20, ... 100). Stars provide quick visual feedback for a parent-friendly interface. The underlying integer (0–100) leaves room for future fine-grained tuning beyond the star presets.

**Implementation**: Use Lucide `Star` icon with three states: filled (full), half-filled (half), empty. Click on star position sets the corresponding decade value. A small numeric input beside the stars shows and allows editing the raw 0–100 value.

**Alternatives considered**:
- Slider — less precise for discrete steps, harder to show current value at a glance
- Dropdown with labels — too few options, not visually intuitive
- Number-only input — functional but not parent-friendly
