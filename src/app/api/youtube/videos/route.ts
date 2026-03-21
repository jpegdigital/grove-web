import { NextRequest, NextResponse } from "next/server";
import { getChannelVideos } from "@/lib/youtube";

export async function GET(request: NextRequest) {
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
