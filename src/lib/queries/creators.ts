import { createClient } from "@/lib/supabase/client";

/* ─── Types ─── */

export interface CreatorLightweight {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  avatar_url: string | null;
  cover_url: string | null;
}

interface CuratedChannelRow {
  id: string;
  channel_id: string;
  display_order: number;
  priority: number;
  creator_id: string | null;
  date_range_override: string | null;
  min_duration_override: number | null;
  channels: {
    youtube_id: string;
    title: string;
    description: string | null;
    custom_url: string | null;
    thumbnail_url: string | null;
    banner_url: string | null;
    subscriber_count: number;
    video_count: number;
    view_count: number;
  };
}

interface Creator {
  id: string;
  name: string;
  slug: string;
  avatar_channel_id: string | null;
  cover_channel_id: string | null;
  display_order: number;
  priority: number;
  curated_channels: CuratedChannelRow[];
}

export interface CreatorsWithChannelsResponse {
  creators: Creator[];
  ungrouped: CuratedChannelRow[];
}

/* ─── Lightweight query (kid-facing pages) ─── */

export async function fetchCreatorsLightweight(): Promise<
  CreatorLightweight[]
> {
  const supabase = createClient();
  const { data: creators, error } = await supabase
    .from("creators")
    .select(
      `id, name, slug, display_order,
       avatar_channel:channels!avatar_channel_id(thumbnail_url),
       cover_channel:channels!cover_channel_id(thumbnail_url, banner_url)`
    )
    .order("sort_name", { ascending: true });

  if (error) throw new Error("Failed to load creators");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (creators || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    display_order: c.display_order,
    avatar_url: c.avatar_channel?.thumbnail_url ?? null,
    cover_url: c.cover_channel?.banner_url ?? null,
  }));
}

/* ─── Full nested query (admin panel) ─── */

export async function fetchCreatorsWithChannels(): Promise<CreatorsWithChannelsResponse> {
  const supabase = createClient();
  const [creatorsResult, ungroupedResult] = await Promise.all([
    supabase
      .from("creators")
      .select(
        `id, name, slug, avatar_channel_id, cover_channel_id, display_order, priority, created_at,
         curated_channels(
           id, channel_id, display_order, priority, creator_id, date_range_override, min_duration_override,
           channels(youtube_id, title, description, custom_url, thumbnail_url, banner_url, subscriber_count, video_count, view_count)
         )`
      )
      .order("sort_name", { ascending: true }),
    supabase
      .from("curated_channels")
      .select(
        `id, channel_id, display_order, priority, creator_id, date_range_override, min_duration_override,
         channels(youtube_id, title, description, custom_url, thumbnail_url, banner_url, subscriber_count, video_count, view_count)`
      )
      .is("creator_id", null)
      .order("display_order", { ascending: true }),
  ]);

  if (creatorsResult.error) throw new Error("Failed to load creators");

  return {
    creators: (creatorsResult.data || []) as unknown as Creator[],
    ungrouped: (ungroupedResult.data || []) as unknown as CuratedChannelRow[],
  };
}
