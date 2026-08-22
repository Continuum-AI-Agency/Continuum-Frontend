import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { resolveInitialCanvasRoomId } from '@/lib/ai-studio/canvas-room.server';
import {
  type CanvasGraphStore,
  CanvasSeedConflictError,
  seedCanvasGraph,
} from '@/lib/library/canvasSeeding';
import {
  buildLibraryCanvasTemplate,
  type LibrarySeedAsset,
  type PersistedGraph,
  referenceNodeId,
  templateSupportsAsset,
} from '@/lib/library/canvasTemplates';
import { openInCanvasRequestSchema } from '@/lib/library/openInCanvas';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SeedAssetRow = {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  file_name: string;
};

// Service-role writes, exactly as the Backend canvas tools do: a canvas the user has
// open drops realtime events it authored itself, so every write carries a fresh
// editor_session_id or the browser would ignore the seed it is meant to receive.
function canvasGraphStore(admin: AdminClient, brandId: string, userId: string): CanvasGraphStore {
  const table = () => admin.schema('brand_profiles').from('canvas_sessions');

  const row = (roomId: string, graph: PersistedGraph) => ({
    brand_profile_id: brandId,
    room_id: roomId,
    nodes: graph.nodes as Json,
    edges: graph.edges as Json,
    // The seed is append-only, so nothing is ever deleted by this write.
    deleted_node_ids: [] as Json,
    deleted_edge_ids: [] as Json,
    editor_session_id: randomUUID(),
    editor_user_id: userId,
  });

  return {
    async read(roomId) {
      const { data, error } = await table()
        .select('nodes, edges, revision')
        .eq('brand_profile_id', brandId)
        .eq('room_id', roomId)
        .maybeSingle();
      if (error) throw new Error(`Could not read the canvas: ${error.message}`);
      const current = data as { nodes?: unknown[]; edges?: unknown[]; revision?: number } | null;
      return {
        graph: { nodes: current?.nodes ?? [], edges: current?.edges ?? [] },
        revision: current ? (current.revision ?? null) : null,
      };
    },

    async insert(roomId, graph) {
      const { error } = await table().insert(row(roomId, graph));
      if (!error) return true;
      // Someone opened the canvas and saved between our read and our insert.
      if ((error as { code?: string }).code === '23505') return false;
      throw new Error(`Could not seed the canvas: ${error.message}`);
    },

    async update(roomId, graph, expectedRevision) {
      const { data, error } = await table()
        .update(row(roomId, graph))
        .eq('brand_profile_id', brandId)
        .eq('room_id', roomId)
        .eq('revision', expectedRevision)
        .select('revision')
        .maybeSingle();
      if (error) throw new Error(`Could not seed the canvas: ${error.message}`);
      return data !== null;
    },
  };
}

async function loadSeedAsset(
  admin: AdminClient,
  brandId: string,
  assetId: string,
): Promise<LibrarySeedAsset | null> {
  const { data } = await mediaSchema(admin)
    .from('assets')
    .select('id, kind, bucket, storage_path, file_name')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();

  const row = data as SeedAssetRow | null;
  if (!row) return null;
  if (row.kind !== 'image' && row.kind !== 'video') return null;
  return {
    id: row.id,
    kind: row.kind,
    bucket: row.bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
  };
}

// Seeds the Library asset into the canvas room the user is about to land in —
// resolveInitialCanvasRoomId is the same resolver /ai-studio uses on load, so the
// seed and the page converge on one room without passing a room id through the URL.
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = openInCanvasRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, template } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const asset = await loadSeedAsset(admin, brandId, assetId);
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  if (!templateSupportsAsset(template, asset.kind)) {
    return NextResponse.json(
      { error: `The "${template}" workflow needs an image asset.` },
      { status: 422 },
    );
  }

  const seedId = randomUUID().slice(0, 8);
  const seed = buildLibraryCanvasTemplate({ template, asset, seedId });

  try {
    const roomId = await resolveInitialCanvasRoomId(brandId);
    await seedCanvasGraph(canvasGraphStore(admin, brandId, user.id), roomId, seed);
    return NextResponse.json({
      roomId,
      seedId,
      referenceNodeId: referenceNodeId(seedId),
      genNodeIds: seed.nodes.filter((node) => node.type === 'nanoGen').map((node) => node.id),
    });
  } catch (error) {
    if (error instanceof CanvasSeedConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Could not open the canvas';
    console.warn('[open-in-canvas] seeding failed', { assetId, template, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
