import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  scoreFeed,
  diversify,
  DEFAULT_PRIORITY,
  MAX_CONSECUTIVE_SAME_CREATOR,
  type VideoInput,
  type ScoringContext,
} from "@/lib/feed-scoring";

/* ─── Types ─── */

export interface FeedVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string;
  duration: string | null;
  durationSeconds: number;
  publishedAt: string;
  isDownloaded: boolean;
  mediaPath: string | null;
  thumbnailPath: string | null;
  creatorId: string | null;
  creatorSlug: string | null;
  creatorName: string;
  creatorAvatar: string;
}

export interface FeedCreator {
  id: string;
  slug: string;
  name: string;
  avatar: string;
}

/* ─── Internal types ─── */

type CreatorInfo = {
  id: string;
  name: string;
  slug: string;
  sortName: string;
  displayOrder: number;
  avatarChannelId: string | null;
};

type ChannelInfo = {
  title: string;
  thumbnailUrl: string;
  creatorId: string | null;
  creator: CreatorInfo | null;
  channelPriority: number;
  creatorPriority: number;
};

/* ─── Feed data fetcher ─── */

async function fetchFeedData(creatorSlug: string | null): Promise<{
  videos: FeedVideo[];
  total: number;
  creators: FeedCreator[];
}> {
  const supabase = createClient();

  // Step 1: Build channel → creator mapping from curated_channels
  const { data: curatedRows, error: curatedErr } = await supabase
    .from("curated_channels")
    .select(
      `channel_id, creator_id, priority,
       creators(id, name, slug, sort_name, display_order, avatar_channel_id, priority),
       channels(youtube_id, title, thumbnail_url)`
    )
    .order("display_order", { ascending: true });

  if (curatedErr) throw new Error("Failed to load feed");

  if (!curatedRows || curatedRows.length === 0) {
    return { videos: [], total: 0, creators: [] };
  }

  // Build lookup maps
  const channelMap = new Map<string, ChannelInfo>();

  for (const cc of curatedRows) {
    const ch = cc.channels as unknown as {
      youtube_id: string;
      title: string;
      thumbnail_url: string | null;
    } | null;
    const cr = cc.creators as unknown as {
      id: string;
      name: string;
      slug: string;
      sort_name: string;
      display_order: number;
      avatar_channel_id: string | null;
      priority: number;
    } | null;

    if (!ch) continue;

    channelMap.set(cc.channel_id, {
      title: ch.title ?? "",
      thumbnailUrl: ch.thumbnail_url ?? "",
      creatorId: cc.creator_id,
      creator: cr
        ? {
            id: cr.id,
            name: cr.name,
            slug: cr.slug,
            sortName: cr.sort_name,
            displayOrder: cr.display_order,
            avatarChannelId: cr.avatar_channel_id,
          }
        : null,
      channelPriority:
        (cc as unknown as { priority: number }).priority ?? DEFAULT_PRIORITY,
      creatorPriority: cr?.priority ?? DEFAULT_PRIORITY,
    });
  }

  // If filtering by creator slug, narrow the channel set
  const channelIds = creatorSlug
    ? [...channelMap.entries()]
        .filter(([, info]) => info.creator?.slug === creatorSlug)
        .map(([chId]) => chId)
    : [...channelMap.keys()];

  if (channelIds.length === 0) {
    return { videos: [], total: 0, creators: [] };
  }

  // Step 2: Get all R2-synced videos for these channels
  const { data: videoRows, error: videoErr } = await supabase
    .from("videos")
    .select(
      "youtube_id, title, thumbnail_url, channel_id, published_at, duration, duration_seconds, is_downloaded, media_path, thumbnail_path, r2_synced_at"
    )
    .not("r2_synced_at", "is", null)
    .in("channel_id", channelIds)
    .order("published_at", { ascending: false });

  if (videoErr) throw new Error("Failed to load feed");

  // Step 3: Map to FeedVideo with creator metadata
  const feedVideos: FeedVideo[] = (videoRows ?? []).map((v) => {
    const ch = channelMap.get(v.channel_id);
    const creator = ch?.creator ?? null;

    let creatorAvatar = ch?.thumbnailUrl ?? "";
    if (creator?.avatarChannelId) {
      const avatarCh = channelMap.get(creator.avatarChannelId);
      if (avatarCh) creatorAvatar = avatarCh.thumbnailUrl;
    }

    return {
      id: v.youtube_id,
      title: v.title ?? "Untitled",
      thumbnailUrl: v.thumbnail_url ?? "",
      channelId: v.channel_id,
      channelTitle: ch?.title ?? "",
      channelThumbnail: ch?.thumbnailUrl ?? "",
      duration: v.duration ?? null,
      durationSeconds: v.duration_seconds ?? 0,
      publishedAt: v.published_at ?? "",
      isDownloaded: true,
      mediaPath: v.media_path ?? null,
      thumbnailPath: v.thumbnail_path ?? null,
      creatorId: creator?.id ?? null,
      creatorSlug: creator?.slug ?? null,
      creatorName: creator?.name ?? ch?.title ?? "",
      creatorAvatar,
    };
  });

  // Step 4: Score and sort feed
  const channelPriorities = new Map<string, number>();
  const creatorPriorities = new Map<string, number>();
  const creatorChannelCounts = new Map<string, number>();

  for (const [chId, info] of channelMap) {
    channelPriorities.set(chId, info.channelPriority);
    if (info.creatorId) {
      creatorPriorities.set(info.creatorId, info.creatorPriority);
      creatorChannelCounts.set(
        info.creatorId,
        (creatorChannelCounts.get(info.creatorId) ?? 0) + 1
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const scoringCtx: ScoringContext = {
    date: today,
    creatorChannelCounts: creatorSlug
      ? new Map() // skip fairness for single-creator view
      : creatorChannelCounts,
  };

  const videoInputs: VideoInput[] = feedVideos.map((v) => ({
    id: v.id,
    publishedAt: v.publishedAt,
    channelId: v.channelId,
    creatorId: v.creatorId ?? v.channelId,
  }));

  const scored = scoreFeed(
    videoInputs,
    channelPriorities,
    creatorPriorities,
    scoringCtx
  );
  const diversified = creatorSlug
    ? scored
    : diversify(scored, MAX_CONSECUTIVE_SAME_CREATOR);

  // Map scored results back to FeedVideo order
  const videoById = new Map(feedVideos.map((v) => [v.id, v]));
  const sortedFeed = diversified.map((s) => videoById.get(s.video.id)!);

  // Step 5: Build creators list (only those with downloaded videos)
  const creatorsWithVideos = buildCreatorList(feedVideos, channelMap);

  return {
    videos: sortedFeed,
    total: sortedFeed.length,
    creators: creatorsWithVideos,
  };
}

function buildCreatorList(
  videos: FeedVideo[],
  channelMap: Map<string, ChannelInfo>
): FeedCreator[] {
  const seen = new Map<
    string,
    { slug: string; name: string; sortName: string; avatar: string }
  >();

  for (const v of videos) {
    if (!v.creatorId) continue;
    if (seen.has(v.creatorId)) continue;

    const ch = channelMap.get(v.channelId);
    const creator = ch?.creator;
    if (!creator) continue;

    let avatar = ch?.thumbnailUrl ?? "";
    if (creator.avatarChannelId) {
      const avatarCh = channelMap.get(creator.avatarChannelId);
      if (avatarCh) avatar = avatarCh.thumbnailUrl;
    }

    seen.set(v.creatorId, {
      slug: creator.slug,
      name: creator.name,
      sortName: creator.sortName,
      avatar,
    });
  }

  return [...seen.entries()]
    .sort((a, b) => a[1].sortName.localeCompare(b[1].sortName))
    .map(([id, info]) => ({
      id,
      slug: info.slug,
      name: info.name,
      avatar: info.avatar,
    }));
}

/* ─── Hook ─── */

export function useFeed(creatorSlug: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["feed", creatorSlug],
    queryFn: () => fetchFeedData(creatorSlug),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    videos: data?.videos ?? [],
    total: data?.total ?? 0,
    creators: data?.creators ?? [],
    isLoading,
  };
}
