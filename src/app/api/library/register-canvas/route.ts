import { createHash } from 'node:crypto';
import {
  type RegisteredAssetOriginRef,
  registerCanvasAssetRequestSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { registerGeneratedAssetOperation } from '@/lib/library/creativeOperations';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import {
  type AssetProvenance,
  buildCanvasAssetRow,
  collectContributingAssetIds,
  readSeedSourceAssetId,
  shouldAnalyzeCanvasAsset,
} from '@/lib/media/canvas-register';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Register-in-place: the generator already uploaded the bytes to its own bucket
// (brand-profile-assets); we only record a media.assets row pointing at that
// object. No byte copy. Cross-bucket signing already works everywhere the library
// is read.
export async function POST(request: Request) {
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
  try {
    const identity = `${input.bucket}\0${input.storagePath}`;
    const registered = await registerGeneratedAssetOperation(supabase, {
      brandId: row.brand_id,
      kind: row.kind,
      bucket: row.bucket,
      storagePath: row.storage_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      sizeBytes: row.size_bytes,
      source: row.source,
      operation: input.originRef.kind === 'resize' ? 'quick_resize' : 'canvas_generation',
      originRef: row.origin_ref,
      sourceAssetIds: provenance
        ? [
            ...new Set(
              [provenance.sourceAssetId, ...provenance.sourceAssetIds].filter(
                (id): id is string => typeof id === 'string',
              ),
            ),
          ]
        : [],
      tags: [],
      integrityState: 'unknown',
      idempotencyKey: `canvas:${createHash('sha256').update(identity).digest('hex')}`,
    });

    // The analysis enqueue is intentionally outside the registration transaction:
    // the durable asset/version/lineage graph already exists if the provider is
    // unavailable, and a duplicate registration does not spend twice.
    if (registered.status === 'created' && shouldAnalyzeCanvasAsset(input.kind)) {
      enqueueAnalyze({
        brandId: input.brandProfileId,
        assetId: registered.assetId,
        storagePath: input.storagePath,
        bucket: input.bucket,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
    }
    return NextResponse.json({
      assetId: registered.assetId,
      assetVersionId: registered.versionId,
    });
  } catch (error) {
    console.warn('[register-canvas] Creative Operations registration failed', {
      storagePath: input.storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
  }
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
