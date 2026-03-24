import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Allow setting creator_id (null to ungroup)
    if ("creator_id" in body) updates.creator_id = body.creator_id;
    if (body.display_order !== undefined)
      updates.display_order = body.display_order;
    if (body.priority !== undefined) {
      const p = Number(body.priority);
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return NextResponse.json(
          { error: "priority must be an integer between 0 and 100" },
          { status: 400 }
        );
      }
      updates.priority = p;
    }
    if ("date_range_override" in body) {
      updates.date_range_override = body.date_range_override || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("curated_channels")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update curated channel:", error);
      return NextResponse.json(
        { error: "Failed to update channel" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error("Update curated channel error:", e);
    return NextResponse.json(
      { error: "Failed to update channel" },
      { status: 500 }
    );
  }
}
