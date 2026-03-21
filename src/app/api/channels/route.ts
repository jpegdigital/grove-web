import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decodeHtmlEntities } from "@/lib/youtube";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export async function GET() {
  try {
    const { data: curated, error } = await supabase
      .from("curated_channels")
      .select(
        `channel_id, display_order, channels(
          youtube_id, title, description, custom_url,
          thumbnail_url, banner_url,
          subscriber_count, subscriber_count_hidden,
          video_count, view_count, published_at
        )`
      )
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Failed to load curated channels:", error);
      return NextResponse.json(
        { error: "Failed to load channels" },
        { status: 500 }
      );
    }

    if (!curated || curated.length === 0) {
      return NextResponse.json([]);
    }

    const channels = curated
      .map((entry) => {
        const ch = entry.channels as unknown as {
          youtube_id: string;
          title: string;
          description: string | null;
          custom_url: string | null;
          thumbnail_url: string | null;
          banner_url: string | null;
          subscriber_count: number;
          subscriber_count_hidden: boolean;
          video_count: number;
          view_count: number;
          published_at: string | null;
        };
        if (!ch) return null;

        return {
          id: ch.youtube_id,
          title: decodeHtmlEntities(ch.title),
          description: ch.description
            ? decodeHtmlEntities(ch.description)
            : "",
          handle: ch.custom_url || "",
          thumbnailUrl: ch.thumbnail_url || "",
          bannerUrl: ch.banner_url || null,
          subscriberCount: ch.subscriber_count,
          subscriberCountHidden: ch.subscriber_count_hidden,
          videoCount: ch.video_count,
          viewCount: ch.view_count,
          publishedAt: ch.published_at || "",
          displayOrder: entry.display_order,
        };
      })
      .filter(Boolean);

    return NextResponse.json(channels);
  } catch (e) {
    console.error("Channels error:", e);
    return NextResponse.json(
      { error: "Failed to load channels" },
      { status: 500 }
    );
  }
}
