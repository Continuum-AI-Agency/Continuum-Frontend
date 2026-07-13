import {
  type RegisteredAssetOriginRef,
  registerCanvasAssetRequestSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import {
  type AssetProvenance,
  buildCanvasAssetRow,
  collectContributingAssetIds,
  mergeOriginRefLineage,
  readSeedSourceAssetId,
  shouldAnalyzeCanvasAsset,
} from '@/lib/media/canvas-register';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Kill switch (defaults ON). Set CANVAS_AUTO_REGISTER_ENABLED=false to stop
// auto-registering canvas creations into the media library.
function autoRegisterEnabled(): boolean {
  return process.env.CANVAS_AUTO_REGISTER_ENABLED !== 'false';
}

// Register-in-place: the generator already uploaded the bytes to its own bucket
// (brand-profile-assets); we only record a media.assets row pointing at that
// object. No byte copy. Cross-bucket signing already works everywhere the library
// is read.
export async function POST(request: Request) {
  if (!autoRegisterEnabled()) {
    return NextResponse.json({ assetId: null });
  }

  const json = await request.json().catch(() => null);
  const parsed = registerCanvasAssetRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(supabase, input.brandProfileId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const provenance = await resolveProvenance(admin, input.brandProfileId, input.originRef);
  const row = buildCanvasAssetRow(input, user.id, provenance);

  // Idempotent on (bucket, storage_path): a canvas re-run that reuses the same
  // storage object will not create a duplicate. With ignoreDuplicates the insert
  // is skipped on conflict and select returns [].
  const { data: inserted, error } = await mediaSchema(admin)
    .from('assets')
    .upsert(row, { onConflict: 'bucket,storage_path', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.warn('[register-canvas] upsert failed', {
      storagePath: input.storagePath,
      error: error.message,
    });
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const insertedRow = (inserted ?? [])[0] as { id: string } | undefined;

  if (insertedRow) {
    if (shouldAnalyzeCanvasAsset(input.kind)) {
      enqueueAnalyze({
        brandId: input.brandProfileId,
        assetId: insertedRow.id,
        storagePath: input.storagePath,
        bucket: input.bucket,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
    }
    return NextResponse.json({ assetId: insertedRow.id });
  }

  // Conflict: the asset was already registered — by an earlier run, or by the AI
  // Studio backend the moment it stored the bytes. Recover its id and fold in any
  // lineage that row is missing; do not re-analyze.
  const existingId = await stampLineageOnExistingAsset(admin, input, provenance);
  return NextResponse.json({ assetId: existingId });
}

// A canvas output inherits every Library asset that fed the generating node — the
// asset the room was seeded from ("Open in Canvas") AND each reference wired into
// it — so the persisted graph is the lookup. Read here rather than trusted from the
// client, and best-effort: provenance must never be the reason a generation fails
// to register.
async function resolveProvenance(
  admin: AdminClient,
  brandProfileId: string,
  originRef: RegisteredAssetOriginRef,
): Promise<AssetProvenance | null> {
  if (originRef.kind === 'resize') {
    // Smart resize runs outside any canvas: there is no graph, and the caller is
    // already proven to hold the brand, so its claim about which asset it reframed
    // is the only source there is.
    return { sourceAssetId: originRef.sourceAssetId, sourceAssetIds: [originRef.sourceAssetId] };
  }
  if (!originRef.roomId) return null;
  try {
    const { data } = await admin
      .schema('brand_profiles')
      .from('canvas_sessions')
      .select('nodes, edges')
      .eq('brand_profile_id', brandProfileId)
      .eq('room_id', originRef.roomId)
      .maybeSingle();

    const graph = (data ?? null) as { nodes?: unknown; edges?: unknown } | null;
    const sourceAssetIds = collectContributingAssetIds(
      graph?.nodes,
      graph?.edges,
      originRef.nodeId,
    );
    const seedAssetId = readSeedSourceAssetId(graph?.nodes, originRef.nodeId);
    if (sourceAssetIds.length === 0 && !seedAssetId) return null;
    return {
      ...(seedAssetId ? { sourceAssetId: seedAssetId } : {}),
      sourceAssetIds,
    };
  } catch (err) {
    console.warn('[register-canvas] provenance lookup failed', {
      nodeId: originRef.nodeId,
      error: String(err),
    });
    return null;
  }
}

// Returns the id of the row already sitting at (bucket, storage_path), after
// merging in any lineage it does not carry yet. Best-effort on the write: a failed
// lineage patch still returns the id, because the caller's asset does exist.
async function stampLineageOnExistingAsset(
  admin: AdminClient,
  input: { bucket: string; storagePath: string; brandProfileId: string },
  provenance: AssetProvenance | null,
): Promise<string | null> {
  const { data: existing } = await mediaSchema(admin)
    .from('assets')
    .select('id, origin_ref')
    .eq('bucket', input.bucket)
    .eq('storage_path', input.storagePath)
    .eq('brand_id', input.brandProfileId)
    .maybeSingle();

  const row = existing as { id: string; origin_ref: unknown } | null;
  if (!row) return null;
  if (!provenance) return row.id;

  const merged = mergeOriginRefLineage(row.origin_ref, provenance);
  if (!merged) return row.id;

  const { error } = await mediaSchema(admin)
    .from('assets')
    .update({ origin_ref: merged })
    .eq('id', row.id);
  if (error) {
    console.warn('[register-canvas] lineage merge failed', {
      assetId: row.id,
      error: error.message,
    });
  }
  return row.id;
}

// Tier-gated inside the edge function. Fire-and-forget; never blocks the response.
function enqueueAnalyze(params: {
  brandId: string;
  assetId: string;
  storagePath: string;
  bucket: string;
  mimeType: string;
  fileName: string;
}): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  fetch(`${supabaseUrl}/functions/v1/analyze_media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.warn('[register-canvas] analyze_media enqueue failed', {
      assetId: params.assetId,
      error: String(err),
    });
  });
}
