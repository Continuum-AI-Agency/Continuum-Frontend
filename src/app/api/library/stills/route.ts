import { NextResponse } from 'next/server';
import { z } from 'zod';
import { claimsIdentityOf } from '@/lib/auth/claims';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { displayDerivativeKey } from '@/lib/media/mapper';
import {
  DISPLAYED_RENDITION_ROLES,
  loadAssetRenditions,
  renditionSignablePaths,
} from '@/lib/media/renditions';
import { mintSignedUrls, stillSignable } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  brandId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1).max(100),
  // A few fixed sizes, so the reuse memo and Supabase's render cache see few variants.
  edge: z.union([z.literal(96), z.literal(160), z.literal(320), z.literal(480)]),
});

type StillRow = {
  id: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  thumbnail_path: string | null;
  updated_at: string | null;
  head_version_id: string | null;
};

// A small still for each Library asset: what a 36 px ledger row or a 160 px approval card draws
// for a render whose own 480p rendition was never made, instead of the full-size original.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!(await claimsIdentityOf(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetIds, edge } = parsed.data;
  if (!(await callerHasBrandAccess(supabase, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // User-scoped read: media.assets RLS restricts the rows to the caller's brands.
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('id, bucket, storage_path, mime_type, thumbnail_path, updated_at, head_version_id')
    .in('id', [...new Set(assetIds)])
    .eq('brand_id', brandId)
    .is('deleted_at', null);
  if (error) {
    console.error('[library/stills] asset read failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  const rows = (data ?? []) as StillRow[];

  // The row's own poster or a resize at `edge` first; a video with neither may still have its
  // poster as a rendition.
  const stillOf = new Map(rows.map((row) => [row.id, stillSignable(row, edge)]));
  const renditions = (
    await loadAssetRenditions(
      supabase,
      rows.flatMap((row) =>
        stillOf.get(row.id) || !row.head_version_id ? [] : [row.head_version_id],
      ),
    ).catch(() => [])
  ).filter(
    (rendition) =>
      rendition.state === 'ready' &&
      rendition.role !== 'preview_video' &&
      DISPLAYED_RENDITION_ROLES.includes(rendition.role),
  );
  const renditionOf = new Map(renditions.map((rendition) => [rendition.asset_id, rendition]));

  const plan = rows.map((row) => {
    const still = stillOf.get(row.id) ?? null;
    return { id: row.id, still, rendition: still ? undefined : renditionOf.get(row.id) };
  });
  const signed = await mintSignedUrls([
    ...renditionSignablePaths(plan.flatMap((item) => (item.rendition ? [item.rendition] : []))),
    ...plan.flatMap((item) => (item.still ? [item.still] : [])),
  ]);

  const stills: Record<string, string | null> = {};
  for (const id of assetIds) stills[id] = null;
  for (const { id, rendition, still } of plan) {
    const path = rendition?.storage_path ?? still?.path;
    stills[id] = path
      ? (signed.get(still?.displayDerivative ? displayDerivativeKey(path) : path) ?? null)
      : null;
  }
  return NextResponse.json({ stills });
}
