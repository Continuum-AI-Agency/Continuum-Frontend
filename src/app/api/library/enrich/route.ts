// Enrich assets on demand — the alternative to a blanket backfill.
//
// A library that predates the analysis pipeline holds assets with no tags, no
// description, no embedding and no transcript: invisible to semantic search and
// to agents. Backfilling every one of them is a bill nobody asked for. This
// route lets the cost follow the attention: the detail modal enriches the asset
// you just opened, and a batch call (capped) is the seam for a deliberate,
// user-initiated sweep of a collection.
//
// Idempotent and cheap to call: an asset that is already analysing, ready,
// errored, or deliberately skipped for billing is left alone, so hammering this
// from a modal that re-mounts costs nothing.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type EnrichmentCandidate,
  MAX_ENRICH_PER_CALL,
  selectAssetsNeedingEnrichment,
} from '@/lib/library/enrichment';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const requestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetIds: z.array(z.string().uuid()).min(1).max(MAX_ENRICH_PER_CALL),
  })
  .strict();

// The same service-key invocation the register paths use. Fire-and-forget: the
// edge function owns the work and its own retries, and the caller is a user
// looking at a picture — they must never wait on it, or see it fail.
function enqueueAnalysis(asset: EnrichmentCandidate, brandId: string): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  void fetch(`${supabaseUrl}/functions/v1/analyze_media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      brandId,
      assetId: asset.id,
      bucket: asset.bucket,
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
      fileName: asset.file_name,
    }),
  }).catch((err) => {
    console.warn('[library/enrich] analyze_media enqueue failed', {
      assetId: asset.id,
      error: String(err),
    });
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetIds } = parsed.data;

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

  // Brand-scoped read: the caller names ids, but only this brand's rows come
  // back, so a foreign id enriches nothing and leaks nothing.
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('id, status, bucket, storage_path, mime_type, file_name')
    .in('id', assetIds)
    .eq('brand_id', brandId)
    .is('deleted_at', null);
  if (error) {
    console.error('[library/enrich] asset lookup failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as EnrichmentCandidate[];
  const candidates = selectAssetsNeedingEnrichment(rows, MAX_ENRICH_PER_CALL);

  for (const asset of candidates) {
    enqueueAnalysis(asset, brandId);
  }

  return NextResponse.json({
    enqueued: candidates.length,
    skipped: rows.length - candidates.length,
  });
}
