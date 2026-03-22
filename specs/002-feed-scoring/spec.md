# Feature Specification: Feed Scoring Algorithm

**Feature Branch**: `002-feed-scoring`
**Created**: 2026-03-22
**Status**: Draft
**Input**: User description: "Scoring scoreVideo function with admin-tunable channel/creator priority, deterministic daily feed, multi-channel creator fairness"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tune Channel Priority in Admin (Priority: P1)

As the parent/admin, I want to assign a priority weight to each curated channel so that more educational channels appear more frequently in my kid's feed.

**Why this priority**: This is the core value proposition — the ability to favor educational content over entertainment. Without tunable weights, the feed treats all channels equally regardless of content quality.

**Independent Test**: Can be fully tested by setting different priority values on two channels in the admin panel, then loading the feed and verifying that the higher-priority channel's videos appear more prominently (earlier and more frequently) in the feed.

**Acceptance Scenarios**:

1. **Given** two channels with different priority weights (e.g., Channel A = 0.9, Channel B = 0.3), **When** the feed loads, **Then** Channel A's videos appear earlier and more frequently than Channel B's videos.
2. **Given** a channel with its priority weight changed from low to high, **When** the feed reloads, **Then** the channel's videos shift to more prominent positions.
3. **Given** a channel with priority weight set to 0, **When** the feed loads, **Then** the channel's videos still appear but are deprioritized to the bottom of the feed.

---

### User Story 2 - Deterministic Daily Feed Order (Priority: P1)

As a viewer, I want the feed to remain stable throughout the day so that if I scroll partway through and come back later, the videos are in the same order. The feed should change the next day to feel fresh.

**Why this priority**: Tied with P1 because without determinism the scoring system is unusable — videos would reshuffle on every page load, making the experience disorienting for a child.

**Independent Test**: Can be tested by loading the feed multiple times on the same day and verifying identical ordering, then advancing the date and confirming the order changes.

**Acceptance Scenarios**:

1. **Given** the feed is loaded at 9am, **When** the same feed is loaded at 3pm on the same day, **Then** the video order is identical.
2. **Given** the feed is loaded on Monday, **When** the feed is loaded on Tuesday, **Then** the video order differs due to the date-based seed changing.
3. **Given** two different browsers load the feed on the same day, **When** comparing the video order, **Then** both browsers show identical ordering (no session-dependent randomness).

---

### User Story 3 - Multi-Channel Creator Fairness (Priority: P2)

As the parent/admin, I want creators with many channels (e.g., 10 channels) to not dominate the feed over creators with a single channel. The system should balance representation so that a single-channel creator gets fair visibility.

**Why this priority**: Without fairness balancing, a creator with 10 channels would naturally get 10x the feed presence of a single-channel creator, regardless of how the parent has prioritized them.

**Independent Test**: Can be tested by setting up one creator with 5 channels and another creator with 1 channel (both at equal priority), loading the feed, and verifying that both creators get roughly equal representation in the first 18 videos.

**Acceptance Scenarios**:

1. **Given** Creator A has 5 channels and Creator B has 1 channel, both with equal priority, **When** the feed loads, **Then** both creators have approximately equal representation in any batch of 18 videos.
2. **Given** Creator A has 10 channels with default priority and Creator B has 1 channel with high priority, **When** the feed loads, **Then** Creator B's videos appear with frequency proportional to their priority, not diminished by having fewer channels.
3. **Given** a creator's channel count changes (channel added/removed), **When** the feed recalculates, **Then** the fairness balancing adjusts automatically without admin intervention.

---

### User Story 4 - Creator-Level Priority (Priority: P2)

As the parent/admin, I want to set a priority weight at the creator level (in addition to channel level) so that I can broadly boost or suppress all of a creator's content without adjusting each channel individually.

**Why this priority**: Complementary to channel-level tuning but less granular. Useful for quickly promoting a whole creator's catalog (e.g., "this creator is always educational") without touching individual channels.

**Independent Test**: Can be tested by setting a creator-level priority high, verifying all their channels are boosted in the feed, then lowering it and confirming the effect reverses.

**Acceptance Scenarios**:

1. **Given** Creator A has priority weight 0.9 and Creator B has priority weight 0.3, **When** the feed loads, **Then** Creator A's videos from all channels appear more prominently than Creator B's.
2. **Given** a creator has high priority but one of their channels has low channel-level priority, **When** the feed loads, **Then** that specific channel is deprioritized relative to the creator's other channels but still benefits from the creator-level boost relative to other creators.
3. **Given** a creator's priority is updated in the admin panel, **When** the feed is loaded the next day, **Then** the updated priority is reflected in the new feed ordering.

---

### Edge Cases

- What happens when all channels have the same priority weight? The feed produces a deterministic daily order using the date-based jitter, behaving similarly to today's round-robin but with date-seeded variety.
- What happens when a new video is downloaded mid-day? The video enters the feed and is scored; the overall ordering remains deterministic for that day (the new video slots into its scored position, which may shift other positions).
- What happens when a creator has no downloaded videos? The creator is simply absent from the feed — no empty slots or placeholders.
- What happens when priority weights are all set to 0? The feed falls back to recency-only ordering with date-based jitter for variety.
- What happens to ungrouped channels (no creator)? They are treated as individual single-channel "creators" for fairness purposes and receive the default priority weight.

## Clarifications

### Session 2026-03-22

- Q: Should the spec require automated test coverage for the scoring function, and if so what scope? → A: Require Vitest unit tests for the scoring function with parameterized test cases (give/want style).
- Q: What admin UI control should be used for setting priority weights? → A: 0–100 numeric rating with a star display (0–5 stars in 0.5 increments) providing preset shortcuts at 0, 10, 20, ... 100. Leaves room for fine-grained tuning later.
- Q: How aggressively should recency decay deprioritize older videos? → A: Aggressive decay with a 7-day half-life — new videos dominate, older content fades quickly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST compute a numeric score for each video based on configurable weights (recency with 7-day half-life decay, channel priority, creator priority, fairness adjustment).
- **FR-002**: System MUST allow the admin to set a priority rating (integer 0–100) on each curated channel via the admin panel, displayed alongside a star indicator (0–5 stars in 0.5 increments) with preset tap targets at 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.
- **FR-003**: System MUST allow the admin to set a priority rating (integer 0–100) on each creator via the admin panel, using the same star + numeric control as channel priority.
- **FR-004**: System MUST produce a deterministic feed order for a given day — the same date MUST always produce the same feed order given the same videos and weights.
- **FR-005**: System MUST produce a different feed order on different days to maintain freshness.
- **FR-006**: System MUST apply a fairness adjustment that normalizes a creator's total feed presence by their channel count, preventing multi-channel creators from dominating.
- **FR-007**: System MUST sort the feed by computed score (descending) after scoring all videos.
- **FR-008**: System MUST apply a diversity constraint post-scoring to prevent more than 2 consecutive videos from the same creator.
- **FR-009**: The scoring function MUST be a pure function — given the same inputs (video data, weights, date), it MUST return the same score.
- **FR-010**: Default priority rating for channels and creators MUST be 50 (neutral midpoint) so existing data works without requiring the admin to set ratings on day one.
- **FR-011**: System MUST persist priority weights so they survive page reloads and server restarts.
- **FR-012**: Scoring function MUST have Vitest unit tests using parameterized test cases (give/want convention) covering: determinism (same inputs = same output), weight sensitivity (higher priority = higher score), fairness adjustment (multi-channel normalization), diversity constraint (no >2 consecutive same-creator), and edge cases (all-zero weights, single video, no videos).
- **FR-013**: Project MUST have Vitest configured and runnable via a standard test command before scoring implementation begins (TDD per constitution Principle II).

### Key Entities

- **Video Score**: A computed value combining recency, channel priority, creator priority, fairness factor, and date-seeded jitter. Not persisted — calculated at feed-load time.
- **Channel Priority**: An integer rating (0–100) assigned per curated channel, representing how much to favor that channel's videos. Displayed as 0–5 stars (0.5 increments). Stored on the curated channel record.
- **Creator Priority**: An integer rating (0–100) assigned per creator, representing how much to favor all of that creator's content. Same star display. Stored on the creator record.
- **Fairness Factor**: A derived value that inversely scales a creator's per-video weight by their channel count, ensuring single-channel creators are not overwhelmed by multi-channel creators.

## Assumptions

- The feed continues to load all videos at once (current limit 1000) and score them server-side before pagination. No change to the load-all-then-paginate pattern.
- The date-based seed for deterministic jitter uses the calendar date (YYYY-MM-DD) combined with each video's unique ID to produce a stable per-video jitter value.
- Recency decay uses a 7-day half-life: a video published 7 days ago scores ~50% of a video published today (all else equal). Videos older than ~30 days contribute negligible recency score, making priority weights and jitter the dominant factors for older content.
- Priority weight of 0.0 means "deprioritized" (not hidden) — videos still appear but rank lowest. Hiding channels is a separate concern handled by existing curated channel removal.
- The maximum number of consecutive videos from the same creator in the feed is 2 (diversity constraint).
- Ungrouped channels (no creator assigned) are each treated as their own single-channel creator for scoring and fairness purposes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admin can adjust a channel's priority weight and observe the effect in the feed within one page reload.
- **SC-002**: Feed order is identical across all loads on the same calendar day (100% deterministic when videos and weights are unchanged).
- **SC-003**: Feed order changes on a different calendar day (non-identical ordering day-over-day).
- **SC-004**: Given two creators with equal priority — one with 5 channels and one with 1 channel — neither creator occupies more than 60% of the first 18 feed positions.
- **SC-005**: No more than 2 consecutive videos from the same creator appear in the feed at any point.
- **SC-006**: Feed loads and scores 1000 videos in under 500 milliseconds.
