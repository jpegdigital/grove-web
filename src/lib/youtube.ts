const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function getApiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error("YOUTUBE_API_KEY is not set in environment variables");
  }
  return key;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  bannerUrl: string | null;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  publishedAt: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
}

export interface VideoDetails {
  id: string;
  duration: string; // ISO 8601 e.g. "PT3M45S"
  viewCount: string;
  likeCount: string;
}

/** Decode HTML entities that YouTube API returns in titles/descriptions */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

interface YouTubeApiChannelItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
    publishedAt: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
  brandingSettings?: {
    image?: {
      bannerExternalUrl?: string;
    };
  };
}

function mapChannelItem(item: YouTubeApiChannelItem): YouTubeChannel {
  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    customUrl: item.snippet.customUrl || "",
    thumbnailUrl:
      item.snippet.thumbnails.high?.url ||
      item.snippet.thumbnails.medium?.url ||
      item.snippet.thumbnails.default?.url ||
      "",
    bannerUrl:
      item.brandingSettings?.image?.bannerExternalUrl || null,
    subscriberCount: item.statistics?.subscriberCount || "0",
    videoCount: item.statistics?.videoCount || "0",
    viewCount: item.statistics?.viewCount || "0",
    publishedAt: item.snippet.publishedAt,
  };
}

/**
 * Resolve a YouTube channel from a handle like @FunQuesters
 */
export async function getChannelByHandle(
  handle: string
): Promise<YouTubeChannel | null> {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const key = getApiKey();

  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics,brandingSettings");
  url.searchParams.set("forHandle", cleanHandle);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json();
    throw new Error(
      `YouTube API error: ${error.error?.message || res.statusText}`
    );
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;

  return mapChannelItem(data.items[0]);
}

/**
 * Get channel by ID
 */
export async function getChannelById(
  channelId: string
): Promise<YouTubeChannel | null> {
  const key = getApiKey();

  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics,brandingSettings");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json();
    throw new Error(
      `YouTube API error: ${error.error?.message || res.statusText}`
    );
  }

  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;

  return mapChannelItem(data.items[0]);
}

/**
 * Search for channels by query string
 */
export async function searchChannels(
  query: string,
  maxResults = 5
): Promise<YouTubeChannel[]> {
  const key = getApiKey();

  // First search for channel IDs
  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("key", key);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const error = await searchRes.json();
    throw new Error(
      `YouTube API error: ${error.error?.message || searchRes.statusText}`
    );
  }

  const searchData = await searchRes.json();
  if (!searchData.items || searchData.items.length === 0) return [];

  // Get full channel details
  const channelIds = searchData.items
    .map((item: { id: { channelId: string } }) => item.id.channelId)
    .join(",");

  const channelUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
  channelUrl.searchParams.set(
    "part",
    "snippet,statistics,brandingSettings"
  );
  channelUrl.searchParams.set("id", channelIds);
  channelUrl.searchParams.set("key", key);

  const channelRes = await fetch(channelUrl.toString());
  if (!channelRes.ok) {
    const error = await channelRes.json();
    throw new Error(
      `YouTube API error: ${error.error?.message || channelRes.statusText}`
    );
  }

  const channelData = await channelRes.json();
  return (channelData.items || []).map(mapChannelItem);
}

/**
 * Get recent videos from a channel
 */
export async function getChannelVideos(
  channelId: string,
  maxResults = 10
): Promise<YouTubeVideo[]> {
  const key = getApiKey();

  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("order", "date");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", key);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = await res.json();
    throw new Error(
      `YouTube API error: ${error.error?.message || res.statusText}`
    );
  }

  const data = await res.json();
  return (data.items || []).map(
    (item: {
      id: { videoId: string };
      snippet: {
        title: string;
        description: string;
        thumbnails: {
          high?: { url: string };
          medium?: { url: string };
          default?: { url: string };
        };
        publishedAt: string;
        channelId: string;
        channelTitle: string;
      };
    }) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnailUrl:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        "",
      publishedAt: item.snippet.publishedAt,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
    })
  );
}

/**
 * Batch-enrich videos with duration and view count via videos.list.
 * Accepts up to 50 IDs per call (YouTube API limit).
 */
export async function enrichVideos(
  videoIds: string[]
): Promise<Map<string, VideoDetails>> {
  const key = getApiKey();
  const result = new Map<string, VideoDetails>();
  if (videoIds.length === 0) return result;

  // Process in chunks of 50
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "contentDetails,statistics");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("videos.list error:", await res.text());
      continue;
    }

    const data = await res.json();
    for (const item of data.items || []) {
      result.set(item.id, {
        id: item.id,
        duration: item.contentDetails?.duration || "",
        viewCount: item.statistics?.viewCount || "0",
        likeCount: item.statistics?.likeCount || "0",
      });
    }
  }

  return result;
}

/**
 * Parse a YouTube channel URL/handle input into a handle or channel ID
 */
export function parseChannelInput(input: string): {
  type: "handle" | "id" | "unknown";
  value: string;
} {
  const trimmed = input.trim();

  // Direct handle: @FunQuesters
  if (trimmed.startsWith("@")) {
    return { type: "handle", value: trimmed };
  }

  // URL with handle: https://www.youtube.com/@FunQuesters
  const handleMatch = trimmed.match(
    /youtube\.com\/@([a-zA-Z0-9_-]+)/
  );
  if (handleMatch) {
    return { type: "handle", value: `@${handleMatch[1]}` };
  }

  // URL with channel ID: https://www.youtube.com/channel/UC...
  const channelIdMatch = trimmed.match(
    /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/
  );
  if (channelIdMatch) {
    return { type: "id", value: channelIdMatch[1] };
  }

  // Raw channel ID
  if (trimmed.startsWith("UC") && trimmed.length > 20) {
    return { type: "id", value: trimmed };
  }

  // Treat as search query / handle guess
  return { type: "handle", value: `@${trimmed}` };
}
