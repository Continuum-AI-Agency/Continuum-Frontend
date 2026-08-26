import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

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
//
// Every candidate id is proven against canvas_rooms before it is returned, so a room
// that was deleted or belongs to another brand can never reach the canvas.
export async function resolveInitialCanvasRoomId(
  brandProfileId: string,
  preferredRoomId?: string,
): Promise<string> {
  if (!brandProfileId) {
    throw new Error('resolveInitialCanvasRoomId requires a brand profile id');
  }

  const supabase = await createSupabaseServerClient();

  if (preferredRoomId) {
    const preferredRoom = await findBrandRoomId(
      supabase,
      brandProfileId,
      preferredRoomId,
      'preferred',
    );
    if (preferredRoom) {
      return preferredRoom;
    }
  }

  // RLS scopes canvas_active_view to the current user, so filtering by brand alone
  // returns that user's last-viewed room for this brand (one row per user+brand).
  const { data: activeView, error: activeViewError } = await supabase
    .schema('brand_profiles')
    .from('canvas_active_view')
    .select('room_id')
    .eq('brand_profile_id', brandProfileId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeViewError) {
    console.error('[ai-studio] canvas_active_view lookup failed', activeViewError);
  } else if (activeView?.room_id) {
    const lastSeenRoom = await findBrandRoomId(
      supabase,
      brandProfileId,
      activeView.room_id,
      'last-seen',
    );
    if (lastSeenRoom) {
      return lastSeenRoom;
    }
  }

  const { data: ensuredRoomId, error: ensureError } = await supabase
    .schema('brand_profiles')
    .rpc('ensure_default_canvas_room', { p_brand_profile_id: brandProfileId });

  if (ensureError || !ensuredRoomId) {
    throw new Error(
      `Failed to resolve a default AI Studio workspace for brand ${brandProfileId}: ${
        ensureError?.message ?? 'no room id returned'
      }`,
    );
  }

  return ensuredRoomId;
}

// Proves a candidate room is still a live room of this brand. Neither candidate can
// be trusted on its own: preferredRoomId arrives from the URL, and canvas_active_view
// carries no foreign key on room_id, so deleting a room (a plain DELETE — only
// canvas_sessions cascades) or a brand switch racing the presence heartbeat leaves a
// row still naming a room this brand does not own. Handing that id to the canvas
// violates canvas_sessions_room_id_fkey on the very first autosave.
async function findBrandRoomId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  brandProfileId: string,
  roomId: string,
  source: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('canvas_rooms')
    .select('id')
    .eq('brand_profile_id', brandProfileId)
    .eq('id', roomId)
    .maybeSingle();

  if (error) {
    console.error(`[ai-studio] ${source} canvas room lookup failed`, error);
    return null;
  }

  return data?.id ?? null;
}
