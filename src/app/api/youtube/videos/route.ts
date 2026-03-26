import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getChannelVideos } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  // Auth: admin-only (protects YouTube API quota)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll() {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channelId = request.nextUrl.searchParams.get("channelId");

  if (!channelId) {
    return NextResponse.json(
      { error: "Missing 'channelId' query parameter" },
      { status: 400 }
    );
  }

  try {
    const videos = await getChannelVideos(channelId, 12);
    return NextResponse.json(videos);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
