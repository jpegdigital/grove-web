import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  try {
    const { data: creators, error } = await supabase
      .from("creators")
      .select(
        `id, name, slug, avatar_channel_id, cover_channel_id, display_order, priority, created_at,
         curated_channels(
           id, channel_id, display_order, priority, creator_id, date_range_override,
           channels(youtube_id, title, description, custom_url, thumbnail_url, banner_url, subscriber_count, video_count, view_count)
         )`
      )
      .order("display_order", { ascending: true });

    if (error) {
      console.error("Failed to load creators:", error);
      return NextResponse.json(
        { error: "Failed to load creators" },
        { status: 500 }
      );
    }

    // Also fetch ungrouped channels (creator_id is null)
    const { data: ungrouped, error: ungroupedError } = await supabase
      .from("curated_channels")
      .select(
        `id, channel_id, display_order, priority, creator_id, date_range_override,
         channels(youtube_id, title, description, custom_url, thumbnail_url, banner_url, subscriber_count, video_count, view_count)`
      )
      .is("creator_id", null)
      .order("display_order", { ascending: true });

    if (ungroupedError) {
      console.error("Failed to load ungrouped channels:", ungroupedError);
    }

    return NextResponse.json({
      creators: creators || [],
      ungrouped: ungrouped || [],
    });
  } catch (e) {
    console.error("Creators error:", e);
    return NextResponse.json(
      { error: "Failed to load creators" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const slug = slugify(name.trim());

    // Get next display_order
    const { data: existing } = await supabase
      .from("creators")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1);

    const nextOrder =
      existing && existing.length > 0 ? existing[0].display_order + 1 : 0;

    const { data: creator, error } = await supabase
      .from("creators")
      .insert({
        name: name.trim(),
        slug,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A creator with that name already exists" },
          { status: 409 }
        );
      }
      console.error("Failed to create creator:", error);
      return NextResponse.json(
        { error: "Failed to create creator" },
        { status: 500 }
      );
    }

    return NextResponse.json(creator, { status: 201 });
  } catch (e) {
    console.error("Create creator error:", e);
    return NextResponse.json(
      { error: "Failed to create creator" },
      { status: 500 }
    );
  }
}
