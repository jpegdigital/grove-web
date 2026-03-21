import { NextRequest, NextResponse } from "next/server";
import {
  parseChannelInput,
  getChannelByHandle,
  getChannelById,
} from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("input");

  if (!input) {
    return NextResponse.json(
      { error: "Missing 'input' query parameter" },
      { status: 400 }
    );
  }

  try {
    const parsed = parseChannelInput(input);
    let channel;

    if (parsed.type === "id") {
      channel = await getChannelById(parsed.value);
    } else {
      channel = await getChannelByHandle(parsed.value);
    }

    if (!channel) {
      return NextResponse.json(
        { error: "Channel not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(channel);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
