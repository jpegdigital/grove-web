/**
 * Feed scoring algorithm.
 *
 * Pure functions that compute a deterministic daily score per video
 * based on per-channel relative recency, channel priority, creator
 * priority, fairness, freshness bonus, and date-seeded jitter.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringWeights {
  recency: number;
  priority: number;
  jitter: number;
  freshness: number;
}

export interface ScoringContext {
  /** YYYY-MM-DD string used as jitter seed */
  date: string;
  /** creatorId → number of curated channels */
  creatorChannelCounts: Map<string, number>;
}

export interface VideoInput {
  id: string;
  publishedAt: string;
  channelId: string;
  creatorId: string;
}

export interface ScoredVideo {
  video: VideoInput;
  channelPriority: number;
  creatorPriority: number;
  creatorId: string;
  channelCount: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCORING_WEIGHTS: ScoringWeights = {
  recency: 0.3,
  priority: 0.5,
  jitter: 0.1,
  freshness: 0.1,
} as const;

/** Videos published within this many hours get a freshness bonus */
export const FRESHNESS_WINDOW_HOURS = 168; // 7 days

export const DEFAULT_PRIORITY = 50;

export const MAX_CONSECUTIVE_SAME_CREATOR = 1;

// ---------------------------------------------------------------------------
// Hash — FNV-1a producing a float in [0, 1)
// ---------------------------------------------------------------------------

/**
 * Deterministic hash of a string to a float in [0, 1).
 * Uses FNV-1a (32-bit). Same input always produces the same output.
 */
export function hashToFloat(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  // Convert to unsigned 32-bit then normalize to [0, 1)
  return ((hash >>> 0) % 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Per-channel relative recency
// ---------------------------------------------------------------------------

/**
 * Compute relative recency ranks for videos within each channel.
 * Newest video in a channel gets 1.0, oldest gets 0.0.
 * Returns a Map<videoId, relativeRecency>.
 */
export function computeChannelRanks(
  videos: VideoInput[]
): Map<string, number> {
  // Group by channel
  const byChannel = new Map<string, VideoInput[]>();
  for (const v of videos) {
    const group = byChannel.get(v.channelId);
    if (group) {
      group.push(v);
    } else {
      byChannel.set(v.channelId, [v]);
    }
  }

  const ranks = new Map<string, number>();

  for (const [, channelVideos] of byChannel) {
    // Sort by publishedAt descending (newest first)
    const sorted = [...channelVideos].sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    const total = sorted.length;
    for (let i = 0; i < total; i++) {
      // Newest (i=0) → 1.0, oldest (i=total-1) → 0.0
      ranks.set(sorted[i].id, total === 1 ? 1.0 : 1 - i / (total - 1));
    }
  }

  return ranks;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score a single video. Pure function — deterministic for same inputs.
 *
 * Formula:
 *   score = (relativeRecency * W_RECENCY)
 *         + (channelPri * creatorPri * fairness * W_PRIORITY)
 *         + (jitter * W_JITTER)
 *         + (freshness * W_FRESHNESS)
 *
 * relativeRecency: 0–1 rank within the video's own channel (newest=1)
 * freshness: 1.0 if published within 7 days, 0.0 otherwise
 */
export function scoreVideo(
  video: VideoInput,
  channelPriority: number,
  creatorPriority: number,
  channelCount: number,
  date: string,
  relativeRecency: number = 1.0,
  weights: ScoringWeights = SCORING_WEIGHTS
): number {
  // Priority: channel * creator normalized to [0, 1], with fairness
  const chPri = channelPriority / 100;
  const crPri = creatorPriority / 100;
  const fairness = 1 / Math.sqrt(Math.max(1, channelCount));
  const priority = chPri * crPri * fairness;

  // Jitter: deterministic daily hash
  const jitter = hashToFloat(`${date}:${video.id}`);

  // Freshness: flat bonus for videos published within the window
  const hoursAgo =
    (new Date(date).getTime() - new Date(video.publishedAt).getTime()) /
    3_600_000;
  const freshness = hoursAgo >= 0 && hoursAgo <= FRESHNESS_WINDOW_HOURS
    ? 1.0
    : 0.0;

  return (
    relativeRecency * weights.recency +
    priority * weights.priority +
    jitter * weights.jitter +
    freshness * weights.freshness
  );
}

/**
 * Score and sort a list of videos. Returns ScoredVideo[] sorted descending.
 * Computes per-channel relative recency ranks internally.
 * Does NOT apply diversity — call `diversify()` on the result if needed.
 */
export function scoreFeed(
  videos: VideoInput[],
  channelPriorities: Map<string, number>,
  creatorPriorities: Map<string, number>,
  ctx: ScoringContext
): ScoredVideo[] {
  // Pre-compute per-channel recency ranks
  const ranks = computeChannelRanks(videos);

  const scored = videos.map((video) => {
    const channelPriority =
      channelPriorities.get(video.channelId) ?? DEFAULT_PRIORITY;
    const creatorPriority =
      creatorPriorities.get(video.creatorId) ?? DEFAULT_PRIORITY;
    const channelCount =
      ctx.creatorChannelCounts.get(video.creatorId) ?? 1;
    const relativeRecency = ranks.get(video.id) ?? 0.5;

    return {
      video,
      channelPriority,
      creatorPriority,
      creatorId: video.creatorId,
      channelCount,
      score: scoreVideo(
        video,
        channelPriority,
        creatorPriority,
        channelCount,
        ctx.date,
        relativeRecency
      ),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---------------------------------------------------------------------------
// Diversity post-pass
// ---------------------------------------------------------------------------

/**
 * Enforce a maximum of `maxConsecutive` videos from the same creator.
 * Greedy: scans linearly and swaps forward the next different-creator video.
 */
export function diversify(
  videos: ScoredVideo[],
  maxConsecutive: number = MAX_CONSECUTIVE_SAME_CREATOR
): ScoredVideo[] {
  const result = [...videos];

  for (let i = maxConsecutive; i < result.length; i++) {
    // Check if the last `maxConsecutive` items + current are all same creator
    let allSame = true;
    for (let j = 1; j <= maxConsecutive; j++) {
      if (result[i].creatorId !== result[i - j].creatorId) {
        allSame = false;
        break;
      }
    }

    if (allSame) {
      // Find next video from a different creator
      let swapIdx = -1;
      for (let k = i + 1; k < result.length; k++) {
        if (result[k].creatorId !== result[i].creatorId) {
          swapIdx = k;
          break;
        }
      }
      if (swapIdx !== -1) {
        // Move the swap candidate to position i
        const [moved] = result.splice(swapIdx, 1);
        result.splice(i, 0, moved);
      }
    }
  }

  return result;
}
