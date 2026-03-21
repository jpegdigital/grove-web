import { NextRequest } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const MEDIA_DIR = process.env.MEDIA_DIRECTORY ?? "E:/Entertainment/PradoTube";

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
  // Local media paths (relative, for /api/media/... streaming)
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
    // 1. Try DB lookup first (fast, no filesystem scan)
    const result = await findVideoFromDb(id);
    if (result) {
      return Response.json(result, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    // 2. Fall back to filesystem scan (handles pre-sync edge cases)
    const fsResult = await findVideoFromFilesystem(id);
    if (fsResult) {
      return Response.json(fsResult, {
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
       channels(title)`
    )
    .eq("youtube_id", videoId)
    .eq("is_downloaded", true)
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

/**
 * Scan the media directory to find a video by its YouTube ID.
 * Structure: MEDIA_DIR/@handle/YYYY-MM/{id}.info.json
 */
async function findVideoFromFilesystem(
  videoId: string
): Promise<VideoMeta | null> {
  const targetInfoFile = `${videoId}.info.json`;

  // Scan all channel directories
  let channels: string[];
  try {
    channels = await readdir(MEDIA_DIR);
  } catch {
    return null;
  }

  for (const channel of channels) {
    const channelDir = join(MEDIA_DIR, channel);

    let dateFolders: string[];
    try {
      dateFolders = await readdir(channelDir);
    } catch {
      continue;
    }

    for (const dateFolder of dateFolders) {
      const dateFolderPath = join(channelDir, dateFolder);

      let files: string[];
      try {
        files = await readdir(dateFolderPath);
      } catch {
        continue;
      }

      if (!files.includes(targetInfoFile)) continue;

      // Found it — read and parse
      const infoPath = join(dateFolderPath, targetInfoFile);
      const raw = await readFile(infoPath, "utf-8");
      const data = JSON.parse(raw);

      // Find the video file extension
      const videoFile = files.find(
        (f) =>
          f.startsWith(videoId) &&
          !f.endsWith(".info.json") &&
          !f.endsWith(".jpg") &&
          !f.endsWith(".webp") &&
          !f.endsWith(".png")
      );

      // Find thumbnail sidecar
      const thumbFile = files.find(
        (f) =>
          f.startsWith(videoId) &&
          (f.endsWith(".jpg") || f.endsWith(".webp") || f.endsWith(".png"))
      );

      const relativePath = `${channel}/${dateFolder}`;

      return {
        id: videoId,
        title: data.title ?? data.fulltitle ?? "Untitled",
        description: data.description ?? "",
        channel: data.channel ?? data.uploader ?? "",
        channelId: data.channel_id ?? "",
        handle: data.uploader_id ?? "",
        channelFollowers: data.channel_follower_count ?? null,
        uploadDate: parseUploadDate(data.upload_date),
        duration: data.duration ?? 0,
        durationFormatted:
          data.duration_string ?? formatSeconds(data.duration),
        viewCount: data.view_count ?? 0,
        likeCount: data.like_count ?? 0,
        commentCount: data.comment_count ?? 0,
        tags: data.tags ?? [],
        categories: data.categories ?? [],
        chapters: parseChapters(data.chapters),
        thumbnail: data.thumbnail ?? "",
        resolution:
          data.resolution ?? `${data.width}x${data.height}`,
        width: data.width ?? 0,
        height: data.height ?? 0,
        fps: data.fps ?? 0,
        language: data.language ?? null,
        webpageUrl: data.webpage_url ?? "",
        mediaPath: videoFile
          ? `${relativePath}/${videoFile}`
          : `${relativePath}/${videoId}.mp4`,
        thumbnailPath: thumbFile
          ? `${relativePath}/${thumbFile}`
          : null,
        creatorId: null,
        creatorName: null,
        creatorSlug: null,
      };
    }
  }

  return null;
}

/** Convert yt-dlp date string "20210922" → ISO date "2021-09-22" */
function parseUploadDate(raw: string | undefined): string {
  if (!raw || raw.length !== 8) return "";
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
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

/** Parse yt-dlp chapters array into a cleaner shape */
function parseChapters(
  chapters:
    | { title: string; start_time: number; end_time: number }[]
    | null
): VideoMeta["chapters"] {
  if (!chapters || !Array.isArray(chapters) || chapters.length === 0)
    return null;
  return chapters.map((ch) => ({
    title: ch.title,
    startTime: ch.start_time,
    endTime: ch.end_time,
  }));
}
