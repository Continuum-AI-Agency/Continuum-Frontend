import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Resolves the canvas workspace a brand should open with, BEFORE the client canvas
// mounts. This is what keeps AI Studio from spinning on "Connecting…": the canvas
// always receives a real room id, so realtime channels subscribe on first paint and
// the presence heartbeat (which the MCP co-pilot reads) starts immediately.
//
// Identity: prefer the user's most-recent canvas_active_view row — the same signal
// the MCP backend targets — so a reload returns to the workspace they were last in
// and the UI and the agent converge on one room. Falls back to the idempotent
// ensure_default_canvas_room RPC, which selects the brand's first room or creates a
// "Main Workspace" when the brand has none.
export async function resolveInitialCanvasRoomId(brandProfileId: string): Promise<string> {
  if (!brandProfileId) {
    throw new Error("resolveInitialCanvasRoomId requires a brand profile id");
  }

  const supabase = await createSupabaseServerClient();

  // RLS scopes canvas_active_view to the current user, so filtering by brand alone
  // returns that user's last-viewed room for this brand (one row per user+brand).
  const { data: activeView, error: activeViewError } = await supabase
    .schema("brand_profiles")
    .from("canvas_active_view")
    .select("room_id")
    .eq("brand_profile_id", brandProfileId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeViewError) {
    console.error("[ai-studio] canvas_active_view lookup failed", activeViewError);
  } else if (activeView?.room_id) {
    return activeView.room_id;
  }

  const { data: ensuredRoomId, error: ensureError } = await supabase
    .schema("brand_profiles")
    .rpc("ensure_default_canvas_room", { p_brand_profile_id: brandProfileId });

  if (ensureError || !ensuredRoomId) {
    throw new Error(
      `Failed to resolve a default AI Studio workspace for brand ${brandProfileId}: ${
        ensureError?.message ?? "no room id returned"
      }`,
    );
  }

  return ensuredRoomId;
}
