import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface FeedVideo {
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

interface FeedResponse {
  videos: FeedVideo[];
  total: number;
  hasMore: boolean;
  creators: Array<{ id: string; slug: string; name: string; avatar: string }>;
}

/**
 * GET /api/videos/feed
 *
 * Returns a paginated, interleaved feed of downloaded videos.
 * Query params: limit (default 20, max 50), offset (default 0), creator (UUID).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      2000
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0
    );
    const creatorFilter = searchParams.get("creator") || null;

    // Step 1: Build channel → creator mapping from curated_channels
    const { data: curatedRows, error: curatedErr } = await supabase
      .from("curated_channels")
      .select(
        `channel_id, creator_id,
         creators(id, name, slug, display_order, avatar_channel_id),
         channels(youtube_id, title, thumbnail_url)`
      )
      .order("display_order", { ascending: true });

    if (curatedErr) {
      console.error("Failed to load curated channels:", curatedErr);
      return NextResponse.json(
        { error: "Failed to load feed" },
        { status: 500 }
      );
    }

    if (!curatedRows || curatedRows.length === 0) {
      return NextResponse.json({
        videos: [],
        total: 0,
        hasMore: false,
        creators: [],
      } satisfies FeedResponse);
    }

    // Build lookup maps
    type CreatorInfo = {
      id: string;
      name: string;
      slug: string;
      displayOrder: number;
      avatarChannelId: string | null;
    };
    type ChannelInfo = {
      title: string;
      thumbnailUrl: string;
      creatorId: string | null;
      creator: CreatorInfo | null;
    };

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
        display_order: number;
        avatar_channel_id: string | null;
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
              displayOrder: cr.display_order,
              avatarChannelId: cr.avatar_channel_id,
            }
          : null,
      });
    }

    // If filtering by creator (by slug), narrow the channel set
    const channelIds = creatorFilter
      ? [...channelMap.entries()]
          .filter(([, info]) => info.creator?.slug === creatorFilter)
          .map(([chId]) => chId)
      : [...channelMap.keys()];

    if (channelIds.length === 0) {
      return NextResponse.json({
        videos: [],
        total: 0,
        hasMore: false,
        creators: [],
      } satisfies FeedResponse);
    }

    // Step 2: Get all downloaded videos for these channels
    const { data: videoRows, error: videoErr } = await supabase
      .from("videos")
      .select(
        "youtube_id, title, thumbnail_url, channel_id, published_at, duration, duration_seconds, is_downloaded, media_path, thumbnail_path"
      )
      .eq("is_downloaded", true)
      .in("channel_id", channelIds)
      .order("published_at", { ascending: false });

    if (videoErr) {
      console.error("Failed to load videos:", videoErr);
      return NextResponse.json(
        { error: "Failed to load feed" },
        { status: 500 }
      );
    }

    // Step 3: Map to FeedVideo with creator metadata
    const feedVideos: FeedVideo[] = (videoRows ?? []).map((v) => {
      const ch = channelMap.get(v.channel_id);
      const creator = ch?.creator ?? null;

      // For creator avatar, use the creator's avatar channel thumbnail if set
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

    // Step 4: Interleave by creator
    const interleaved = interleaveByCreator(feedVideos, channelMap);
    const total = interleaved.length;
    const page = interleaved.slice(offset, offset + limit);

    // Step 5: Build creators list for chips (only those with downloaded videos)
    const creatorsWithVideos = buildCreatorList(feedVideos, channelMap);

    return NextResponse.json({
      videos: page,
      total,
      hasMore: offset + limit < total,
      creators: creatorsWithVideos,
    } satisfies FeedResponse);
  } catch (e) {
    console.error("Feed error:", e);
    return NextResponse.json(
      { error: "Failed to load feed" },
      { status: 500 }
    );
  }
}

/**
 * Round-robin interleave videos by creator.
 * Creators ordered by display_order, ungrouped channels last.
 * Within each creator, videos sorted by published_at DESC.
 */
function interleaveByCreator(
  videos: FeedVideo[],
  channelMap: Map<
    string,
    {
      title: string;
      thumbnailUrl: string;
      creatorId: string | null;
      creator: {
        id: string;
        name: string;
        slug: string;
        displayOrder: number;
        avatarChannelId: string | null;
      } | null;
    }
  >
): FeedVideo[] {
  // Group by channel — each channel gets its own round-robin slot
  const groups = new Map<
    string,
    { displayOrder: number; videos: FeedVideo[] }
  >();

  for (const v of videos) {
    if (!groups.has(v.channelId)) {
      const ch = channelMap.get(v.channelId);
      const order = ch?.creator?.displayOrder ?? 9999;
      groups.set(v.channelId, { displayOrder: order, videos: [] });
    }
    groups.get(v.channelId)!.videos.push(v);
  }

  // Sort groups by creator display_order, then alphabetically by channel
  const sorted = [...groups.entries()].sort((a, b) => {
    const orderDiff = a[1].displayOrder - b[1].displayOrder;
    if (orderDiff !== 0) return orderDiff;
    return a[0].localeCompare(b[0]);
  });

  // Each group already has videos sorted by published_at DESC (from the query)
  // but let's ensure it
  for (const [, group] of sorted) {
    group.videos.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  // Round-robin deal
  const result: FeedVideo[] = [];
  const iterators = sorted.map(([, g]) => ({
    videos: g.videos,
    index: 0,
  }));

  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const it of iterators) {
      if (it.index < it.videos.length) {
        result.push(it.videos[it.index]);
        it.index++;
        if (it.index < it.videos.length) hasMore = true;
      }
    }
    // Check if any iterator still has videos
    if (!hasMore) {
      hasMore = iterators.some((it) => it.index < it.videos.length);
    }
  }

  return result;
}

/**
 * Build creator list for chips: only creators that have at least one downloaded video.
 * Sorted by display_order.
 */
function buildCreatorList(
  videos: FeedVideo[],
  channelMap: Map<
    string,
    {
      title: string;
      thumbnailUrl: string;
      creatorId: string | null;
      creator: {
        id: string;
        name: string;
        slug: string;
        displayOrder: number;
        avatarChannelId: string | null;
      } | null;
    }
  >
): Array<{ id: string; slug: string; name: string; avatar: string }> {
  const seen = new Map<
    string,
    { slug: string; name: string; avatar: string; order: number }
  >();

  for (const v of videos) {
    if (!v.creatorId) continue;
    if (seen.has(v.creatorId)) continue;

    const ch = channelMap.get(v.channelId);
    const creator = ch?.creator;
    if (!creator) continue;

    // Resolve avatar
    let avatar = ch?.thumbnailUrl ?? "";
    if (creator.avatarChannelId) {
      const avatarCh = channelMap.get(creator.avatarChannelId);
      if (avatarCh) avatar = avatarCh.thumbnailUrl;
    }

    seen.set(v.creatorId, {
      slug: creator.slug,
      name: creator.name,
      avatar,
      order: creator.displayOrder,
    });
  }

  return [...seen.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, info]) => ({ id, slug: info.slug, name: info.name, avatar: info.avatar }));
}
