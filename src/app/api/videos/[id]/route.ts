import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

/**
 * Metadata returned for a single video.
 * Derived from the yt-dlp .info.json sidecar files or Supabase DB.
 */
export interface VideoMeta {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  handle: string;
  channelFollowers: number | null;
  uploadDate: string; // ISO 8601
  duration: number; // seconds
  durationFormatted: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  categories: string[];
  chapters: { title: string; startTime: number; endTime: number }[] | null;
  thumbnail: string; // YouTube CDN URL
  resolution: string;
  width: number;
  height: number;
  fps: number;
  language: string | null;
  webpageUrl: string;
  // Relative paths used as R2 object keys (client prepends NEXT_PUBLIC_R2_PUBLIC_URL)
  mediaPath: string; // e.g. @funquesters/2021-09/0G7Zj6j9gQE.mp4
  thumbnailPath: string | null;
  // Creator info (resolved from curated_channels → creators)
  creatorId: string | null;
  creatorName: string | null;
  creatorSlug: string | null;
}

/**
 * GET /api/videos/[id]
 *
 * Looks up video metadata from Supabase first (populated by sync_downloads.py),
 * falls back to filesystem scan if not found in DB.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate video ID format (YouTube IDs are 11 chars, alphanumeric + - _)
  if (!/^[\w-]{10,12}$/.test(id)) {
    return Response.json({ error: "Invalid video ID" }, { status: 400 });
  }

  try {
    const result = await findVideoFromDb(id);
    if (result) {
      return Response.json(result, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    return Response.json({ error: "Video not found" }, { status: 404 });
  } catch (err) {
    console.error(`[videos/${id}] Error:`, err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * Look up a downloaded video from the Supabase videos table.
 * Returns VideoMeta built from DB columns, or null if not found/not downloaded.
 */
async function findVideoFromDb(videoId: string): Promise<VideoMeta | null> {
  const { data: row, error } = await supabase
    .from("videos")
    .select(
      `youtube_id, channel_id, title, description, thumbnail_url,
       published_at, is_downloaded, media_path, thumbnail_path,
       duration_seconds, like_count, comment_count, tags, categories,
       chapters, width, height, fps, language, webpage_url, handle,
       r2_synced_at, channels(title)`
    )
    .eq("youtube_id", videoId)
    .not("r2_synced_at", "is", null)
    .single();

  if (error || !row || !row.media_path) return null;

  const channelData = row.channels as unknown as { title: string } | null;
  const duration = row.duration_seconds ?? 0;
  const w = row.width ?? 0;
  const h = row.height ?? 0;

  // Resolve creator from curated_channels → creators
  let creatorId: string | null = null;
  let creatorName: string | null = null;
  let creatorSlug: string | null = null;
  if (row.channel_id) {
    const { data: ccRow } = await supabase
      .from("curated_channels")
      .select("creator_id, creators(id, name, slug)")
      .eq("channel_id", row.channel_id)
      .limit(1)
      .maybeSingle();
    if (ccRow) {
      const cr = ccRow.creators as unknown as { id: string; name: string; slug: string } | null;
      creatorId = cr?.id ?? null;
      creatorName = cr?.name ?? null;
      creatorSlug = cr?.slug ?? null;
    }
  }

  // Parse chapters from JSONB
  let chapters: VideoMeta["chapters"] = null;
  if (row.chapters && Array.isArray(row.chapters)) {
    chapters = (row.chapters as { title: string; start_time: number; end_time: number }[]).map(
      (ch) => ({
        title: ch.title,
        startTime: ch.start_time,
        endTime: ch.end_time,
      })
    );
  }

  return {
    id: videoId,
    title: row.title ?? "Untitled",
    description: row.description ?? "",
    channel: channelData?.title ?? "",
    channelId: row.channel_id ?? "",
    handle: row.handle ?? "",
    channelFollowers: null,
    uploadDate: row.published_at
      ? row.published_at.slice(0, 10)
      : "",
    duration,
    durationFormatted: formatSeconds(duration),
    viewCount: 0,
    likeCount: Number(row.like_count) || 0,
    commentCount: Number(row.comment_count) || 0,
    tags: row.tags ?? [],
    categories: row.categories ?? [],
    chapters,
    thumbnail: row.thumbnail_url ?? "",
    resolution: w && h ? `${w}x${h}` : "",
    width: w,
    height: h,
    fps: row.fps ?? 0,
    language: row.language ?? null,
    webpageUrl: row.webpage_url ?? "",
    mediaPath: row.media_path,
    thumbnailPath: row.thumbnail_path ?? null,
    creatorId,
    creatorName,
    creatorSlug,
  };
}

/** Convert seconds to "M:SS" or "H:MM:SS" */
function formatSeconds(sec: number | undefined): string {
  if (!sec) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const sPad = s.toString().padStart(2, "0");
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sPad}`;
  return `${m}:${sPad}`;
}