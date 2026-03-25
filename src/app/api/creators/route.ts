import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
