import { describe, it, expect } from "vitest";
import {
  hashToFloat,
  scoreVideo,
  scoreFeed,
  diversify,
  computeChannelRanks,
  MAX_CONSECUTIVE_SAME_CREATOR,
  type VideoInput,
  type ScoringContext,
  type ScoredVideo,
} from "@/lib/feed-scoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVideo(overrides: Partial<VideoInput> & { id: string }): VideoInput {
  return {
    publishedAt: new Date().toISOString(),
    channelId: "ch-1",
    creatorId: "cr-1",
    ...overrides,
  };
}

function makeContext(overrides?: Partial<ScoringContext>): ScoringContext {
  return {
    date: "2026-03-22",
    creatorChannelCounts: new Map([["cr-1", 1]]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hashToFloat
// ---------------------------------------------------------------------------

describe("hashToFloat", () => {
  it.each([
    { give: "abc", id: "basic-string" },
    { give: "2026-03-22:video-123", id: "date-video-combo" },
    { give: "", id: "empty-string" },
  ])("$id: returns same float for same input", ({ give }) => {
    const a = hashToFloat(give);
    const b = hashToFloat(give);
    expect(a).toBe(b);
  });

  it.each([
    { give: ["abc", "def"], id: "different-strings" },
    { give: ["2026-03-22:v1", "2026-03-23:v1"], id: "different-dates" },
    { give: ["2026-03-22:v1", "2026-03-22:v2"], id: "different-videos" },
  ])("$id: returns different floats for different inputs", ({ give }) => {
    expect(hashToFloat(give[0])).not.toBe(hashToFloat(give[1]));
  });

  it("returns value in [0, 1)", () => {
    const inputs = ["a", "b", "test", "2026-01-01:xyz", "long-string-here-12345"];
    for (const input of inputs) {
      const val = hashToFloat(input);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// computeChannelRanks
// ---------------------------------------------------------------------------

describe("computeChannelRanks", () => {
  it("assigns 1.0 to newest, 0.0 to oldest within same channel", () => {
    const videos = [
      makeVideo({ id: "old", channelId: "ch-1", publishedAt: "2025-01-01T00:00:00Z" }),
      makeVideo({ id: "mid", channelId: "ch-1", publishedAt: "2025-06-01T00:00:00Z" }),
      makeVideo({ id: "new", channelId: "ch-1", publishedAt: "2026-01-01T00:00:00Z" }),
    ];
    const ranks = computeChannelRanks(videos);
    expect(ranks.get("new")).toBe(1.0);
    expect(ranks.get("mid")).toBe(0.5);
    expect(ranks.get("old")).toBe(0.0);
  });

  it("ranks independently per channel", () => {
    const videos = [
      makeVideo({ id: "a-old", channelId: "ch-a", publishedAt: "2020-01-01T00:00:00Z" }),
      makeVideo({ id: "a-new", channelId: "ch-a", publishedAt: "2026-01-01T00:00:00Z" }),
      makeVideo({ id: "b-old", channelId: "ch-b", publishedAt: "2024-01-01T00:00:00Z" }),
      makeVideo({ id: "b-new", channelId: "ch-b", publishedAt: "2024-06-01T00:00:00Z" }),
    ];
    const ranks = computeChannelRanks(videos);
    // Both newest videos get 1.0 regardless of absolute date
    expect(ranks.get("a-new")).toBe(1.0);
    expect(ranks.get("b-new")).toBe(1.0);
    expect(ranks.get("a-old")).toBe(0.0);
    expect(ranks.get("b-old")).toBe(0.0);
  });

  it("single video in channel gets 1.0", () => {
    const videos = [makeVideo({ id: "solo", channelId: "ch-1" })];
    const ranks = computeChannelRanks(videos);
    expect(ranks.get("solo")).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreVideo — priority sensitivity
// ---------------------------------------------------------------------------

describe("scoreVideo", () => {
  it.each([
    {
      give: { channelPriority: 90, otherChannelPriority: 10 },
      want: "higher channel priority scores higher",
      id: "channel-priority-sensitivity",
    },
    {
      give: { channelPriority: 50, otherChannelPriority: 50 },
      want: "equal priorities produce similar base scores",
      id: "equal-channel-priorities",
    },
  ])(
    "$id",
    ({ give }) => {
      const date = "2026-03-22";
      const video = makeVideo({ id: "v1" });
      const scoreHigh = scoreVideo(video, give.channelPriority, 50, 1, date);
      const scoreLow = scoreVideo(video, give.otherChannelPriority, 50, 1, date);

      if (give.channelPriority > give.otherChannelPriority) {
        expect(scoreHigh).toBeGreaterThan(scoreLow);
      } else {
        expect(scoreHigh).toBe(scoreLow);
      }
    }
  );

  it("zero priority still produces a non-zero score (recency + jitter)", () => {
    const video = makeVideo({ id: "v1" });
    const score = scoreVideo(video, 0, 0, 1, "2026-03-22");
    expect(score).toBeGreaterThan(0);
  });

  it("old video from infrequent creator scores well with high relative recency", () => {
    // This is the key test: a video from 6 months ago should score well
    // if it's the newest in its channel (relativeRecency = 1.0)
    const oldVideo = makeVideo({
      id: "v1",
      publishedAt: "2025-09-01T00:00:00Z", // 6 months ago
    });
    const relativeRecency = 1.0; // newest in its channel
    const score = scoreVideo(oldVideo, 50, 50, 1, "2026-03-22", relativeRecency);
    // Should still be a decent score despite being old
    expect(score).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// scoreVideo — determinism
// ---------------------------------------------------------------------------

describe("scoreVideo determinism", () => {
  it.each([
    {
      give: { dateA: "2026-03-22", dateB: "2026-03-22" },
      want: "same",
      id: "same-date-same-score",
    },
    {
      give: { dateA: "2026-03-22", dateB: "2026-03-23" },
      want: "different",
      id: "different-date-different-score",
    },
  ])("$id", ({ give, want }) => {
    const video = makeVideo({ id: "v1" });
    const scoreA = scoreVideo(video, 50, 50, 1, give.dateA);
    const scoreB = scoreVideo(video, 50, 50, 1, give.dateB);

    if (want === "same") {
      expect(scoreA).toBe(scoreB);
    } else {
      expect(scoreA).not.toBe(scoreB);
    }
  });
});

// ---------------------------------------------------------------------------
// scoreFeed — full pipeline
// ---------------------------------------------------------------------------

describe("scoreFeed", () => {
  it("returns videos sorted by score descending", () => {
    const videos: VideoInput[] = [
      makeVideo({ id: "v1", channelId: "ch-1", creatorId: "cr-1" }),
      makeVideo({ id: "v2", channelId: "ch-2", creatorId: "cr-2" }),
      makeVideo({ id: "v3", channelId: "ch-3", creatorId: "cr-3" }),
    ];

    const priorities = new Map([
      ["ch-1", 50],
      ["ch-2", 50],
      ["ch-3", 50],
    ]);
    const creatorPriorities = new Map([
      ["cr-1", 50],
      ["cr-2", 50],
      ["cr-3", 50],
    ]);
    const ctx = makeContext({
      creatorChannelCounts: new Map([
        ["cr-1", 1],
        ["cr-2", 1],
        ["cr-3", 1],
      ]),
    });

    const result = scoreFeed(videos, priorities, creatorPriorities, ctx);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("is deterministic for the same date", () => {
    const videos: VideoInput[] = [
      makeVideo({ id: "v1", channelId: "ch-1", creatorId: "cr-1" }),
      makeVideo({ id: "v2", channelId: "ch-2", creatorId: "cr-2" }),
    ];
    const priorities = new Map([["ch-1", 70], ["ch-2", 30]]);
    const creatorPriorities = new Map([["cr-1", 50], ["cr-2", 50]]);
    const ctx = makeContext({
      creatorChannelCounts: new Map([["cr-1", 1], ["cr-2", 1]]),
    });

    const result1 = scoreFeed(videos, priorities, creatorPriorities, ctx);
    const result2 = scoreFeed(videos, priorities, creatorPriorities, ctx);

    expect(result1.map((r) => r.video.id)).toEqual(
      result2.map((r) => r.video.id)
    );
  });

  it("infrequent creator's newest video competes fairly with daily creator", () => {
    // Creator A posts daily, Creator B posted once 6 months ago
    const videos: VideoInput[] = [
      makeVideo({
        id: "daily-1",
        channelId: "ch-daily",
        creatorId: "cr-daily",
        publishedAt: "2026-03-22T00:00:00Z",
      }),
      makeVideo({
        id: "daily-2",
        channelId: "ch-daily",
        creatorId: "cr-daily",
        publishedAt: "2026-03-21T00:00:00Z",
      }),
      makeVideo({
        id: "rare-1",
        channelId: "ch-rare",
        creatorId: "cr-rare",
        publishedAt: "2025-09-01T00:00:00Z", // 6 months ago
      }),
    ];

    const priorities = new Map([["ch-daily", 50], ["ch-rare", 50]]);
    const creatorPriorities = new Map([["cr-daily", 50], ["cr-rare", 50]]);
    const ctx: ScoringContext = {
      date: "2026-03-22",
      creatorChannelCounts: new Map([["cr-daily", 1], ["cr-rare", 1]]),
    };

    const result = scoreFeed(videos, priorities, creatorPriorities, ctx);

    // The rare creator's video should not be dead last
    // It gets relativeRecency=1.0 (newest in its channel) + same priority
    const rareVideo = result.find((r) => r.video.id === "rare-1")!;
    const lastDaily = result.find((r) => r.video.id === "daily-2")!;
    // Rare video should score competitively (not buried)
    // It loses the freshness bonus but gains equal relative recency
    expect(rareVideo.score).toBeGreaterThan(lastDaily.score * 0.5);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("scoreFeed edge cases", () => {
  it("returns empty array for empty input", () => {
    const ctx = makeContext();
    const result = scoreFeed([], new Map(), new Map(), ctx);
    expect(result).toEqual([]);
  });

  it("returns single video for single input", () => {
    const videos = [makeVideo({ id: "v1" })];
    const ctx = makeContext();
    const result = scoreFeed(
      videos,
      new Map([["ch-1", 50]]),
      new Map([["cr-1", 50]]),
      ctx
    );
    expect(result).toHaveLength(1);
    expect(result[0].video.id).toBe("v1");
  });

  it("handles all-zero priorities (recency + jitter still produce scores)", () => {
    const videos = [
      makeVideo({ id: "v1" }),
      makeVideo({ id: "v2" }),
    ];
    const ctx = makeContext();
    const result = scoreFeed(
      videos,
      new Map([["ch-1", 0]]),
      new Map([["cr-1", 0]]),
      ctx
    );
    expect(result).toHaveLength(2);
    result.forEach((r) => expect(r.score).toBeGreaterThan(0));
  });
});

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

describe("fairness", () => {
  it("neither creator exceeds 67% of first 18 positions with equal priority", () => {
    const videos: VideoInput[] = [];
    // Creator A: 5 channels, 4 videos each
    for (let ch = 1; ch <= 5; ch++) {
      for (let v = 1; v <= 4; v++) {
        videos.push(
          makeVideo({
            id: `a-ch${ch}-v${v}`,
            channelId: `ch-a${ch}`,
            creatorId: "cr-a",
            publishedAt: new Date(
              Date.now() - (ch * 4 + v) * 3600_000
            ).toISOString(),
          })
        );
      }
    }
    // Creator B: 1 channel, 20 videos
    for (let v = 1; v <= 20; v++) {
      videos.push(
        makeVideo({
          id: `b-v${v}`,
          channelId: "ch-b1",
          creatorId: "cr-b",
          publishedAt: new Date(Date.now() - v * 3600_000).toISOString(),
        })
      );
    }

    const channelPriorities = new Map<string, number>();
    for (let ch = 1; ch <= 5; ch++) channelPriorities.set(`ch-a${ch}`, 50);
    channelPriorities.set("ch-b1", 50);

    const creatorPriorities = new Map([
      ["cr-a", 50],
      ["cr-b", 50],
    ]);

    const ctx: ScoringContext = {
      date: "2026-03-22",
      creatorChannelCounts: new Map([
        ["cr-a", 5],
        ["cr-b", 1],
      ]),
    };

    const scored = scoreFeed(videos, channelPriorities, creatorPriorities, ctx);
    const result = diversify(scored, MAX_CONSECUTIVE_SAME_CREATOR);
    const first18 = result.slice(0, 18);
    const crACnt = first18.filter((r) => r.creatorId === "cr-a").length;
    const crBCnt = first18.filter((r) => r.creatorId === "cr-b").length;

    // With max-1-consecutive and 2 creators, each gets ~50%
    expect(crACnt / 18).toBeLessThanOrEqual(0.56);
    expect(crBCnt / 18).toBeLessThanOrEqual(0.56);
  });
});

// ---------------------------------------------------------------------------
// Diversity constraint
// ---------------------------------------------------------------------------

describe("diversify", () => {
  it("no more than 1 consecutive video from same creator", () => {
    // 5 from A, 5 from B — enough to fully alternate
    const scored: ScoredVideo[] = [];
    for (let i = 0; i < 5; i++) {
      scored.push({
        video: makeVideo({ id: `a${i}`, creatorId: "cr-a" }),
        channelPriority: 90,
        creatorPriority: 90,
        creatorId: "cr-a",
        channelCount: 1,
        score: 100 - i,
      });
    }
    for (let i = 0; i < 5; i++) {
      scored.push({
        video: makeVideo({ id: `b${i}`, creatorId: "cr-b" }),
        channelPriority: 50,
        creatorPriority: 50,
        creatorId: "cr-b",
        channelCount: 1,
        score: 50 - i,
      });
    }

    const result = diversify(scored, MAX_CONSECUTIVE_SAME_CREATOR);

    for (let i = 1; i < result.length; i++) {
      const sameAsPrev =
        result[i].creatorId === result[i - 1].creatorId;
      expect(sameAsPrev).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Creator priority
// ---------------------------------------------------------------------------

describe("creator priority", () => {
  it.each([
    {
      give: { creatorPriorityA: 90, creatorPriorityB: 10 },
      want: "higher creator priority scores higher",
      id: "creator-priority-sensitivity",
    },
  ])("$id", ({ give }) => {
    const video = makeVideo({ id: "v1" });
    const scoreHigh = scoreVideo(video, 50, give.creatorPriorityA, 1, "2026-03-22");
    const scoreLow = scoreVideo(video, 50, give.creatorPriorityB, 1, "2026-03-22");
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});

// ---------------------------------------------------------------------------
// Creator + channel priority interaction
// ---------------------------------------------------------------------------

describe("creator + channel priority interaction", () => {
  it("high creator + low channel vs low creator + high channel reflects both", () => {
    const video = makeVideo({ id: "v1" });
    const scoreHighCreatorLowChannel = scoreVideo(video, 20, 90, 1, "2026-03-22");
    const scoreLowCreatorHighChannel = scoreVideo(video, 90, 20, 1, "2026-03-22");

    // channel * creator is symmetric: (20/100 * 90/100) === (90/100 * 20/100)
    expect(scoreHighCreatorLowChannel).toBe(scoreLowCreatorHighChannel);
  });
});
