// The Library timeline draft: read / upsert / discard the caller's saved cut of
// a media.assets video.
//
// SECURITY: every request runs on the USER-scoped Supabase client, so the
// per-command RLS on media.timeline_drafts (read = any brand member, write =
// author only) is the hard boundary — this route never reaches for the
// service-role key. Storage coordinates are NEVER taken from the client: the
// pool carries asset ids, and the bucket/path behind each id is resolved here
// from a brand-filtered media.assets read before anything is signed.

import type { TimelineDraftPoolMedia, TimelineDraftStatus } from '@continuum/contracts';
import {
  getTimelineDraftResponseSchema,
  timelineDraftDocumentSchema,
  timelineDraftSchema,
  upsertTimelineDraftRequestSchema,
  upsertTimelineDraftResponseSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const DRAFT_SELECT =
  'id, brand_id, asset_id, created_by, schema_version, document, status, ' +
  'rendered_asset_id, last_rendered_at, created_at, updated_at';

const querySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

type DraftRow = {
  id: string;
  brand_id: string;
  asset_id: string;
  created_by: string | null;
  schema_version: number;
  document: unknown;
  status: TimelineDraftStatus;
  rendered_asset_id: string | null;
  last_rendered_at: string | null;
  created_at: string;
  updated_at: string;
};

type PoolAssetRow = {
  id: string;
  kind: string;
  bucket: string;
  storage_path: string;
  duration_ms: number | null;
  file_name: string;
  title: string | null;
  mime_type?: string;
};

type Caller = { supabase: SupabaseClient; userId: string };

async function authorizeCaller(brandId: string): Promise<Caller | NextResponse> {
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
  return { supabase, userId: user.id };
}

// True only if the asset exists in THIS brand. The client's claimed brandId is
// never enough on its own: it is what a cross-tenant read would forge.
async function assetIsInBrand(
  supabase: SupabaseClient,
  brandId: string,
  assetId: string,
): Promise<boolean> {
  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('id')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  return !error && data !== null;
}

// Fresh playback URLs for the bin. An id that resolves to nothing in this brand
// (deleted, or never ours) comes back as a null-signed tile — present, so the
// editor can show the clip as missing, but unsigned.
async function loadPoolMedia(
  supabase: SupabaseClient,
  brandId: string,
  assetIds: readonly string[],
): Promise<TimelineDraftPoolMedia[]> {
  if (assetIds.length === 0) return [];

  const { data, error } = await mediaSchema(supabase)
    .from('assets')
    .select('id, kind, bucket, storage_path, duration_ms, file_name, title, mime_type')
    .in('id', assetIds)
    .eq('brand_id', brandId)
    .is('deleted_at', null);
  if (error) {
    console.error('[library/timeline-drafts] pool asset lookup failed', error);
    throw new Error('Pool lookup failed');
  }

  const rows = (data ?? []) as unknown as PoolAssetRow[];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const signedUrlMap = await mintSignedUrls(
    rows.map((row) => ({ path: row.storage_path, bucket: row.bucket })),
  );

  return assetIds.map((assetId) => {
    const row = rowById.get(assetId);
    if (!row) {
      return { assetId, signedUrl: null, kind: null, durationMs: null, label: null };
    }
    return {
      assetId,
      signedUrl: signedUrlMap.get(row.storage_path) ?? null,
      kind: row.mime_type?.toLowerCase().startsWith('audio/')
        ? 'audio'
        : row.kind === 'image'
          ? 'image'
          : row.kind === 'video'
            ? 'video'
            : null,
      durationMs: row.duration_ms,
      label: row.title ?? row.file_name,
    };
  });
}

// GET /api/library/timeline-drafts?brandId&assetId — the CALLER's draft (drafts
// are personal working copies) plus freshly signed pool media.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const caller = await authorizeCaller(brandId);
  if (caller instanceof NextResponse) return caller;
  const { supabase, userId } = caller;

  const { data, error } = await mediaSchema(supabase)
    .from('timeline_drafts')
    .select(DRAFT_SELECT)
    .eq('asset_id', assetId)
    .eq('brand_id', brandId)
    .eq('created_by', userId)
    .maybeSingle();
  if (error) {
    console.error('[library/timeline-drafts] draft lookup failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const row = (data ?? null) as DraftRow | null;
  if (!row) {
    return NextResponse.json(getTimelineDraftResponseSchema.parse({ draft: null, poolMedia: [] }));
  }

  // A stored document that no longer parses (hand-edited jsonb, a rolled-back
  // schema version) must never 500 the editor — it opens on a fresh seed instead.
  const document = timelineDraftDocumentSchema.safeParse(row.document);
  if (!document.success) {
    console.error('[library/timeline-drafts] stored document failed validation', {
      draftId: row.id,
      issues: document.error.issues,
    });
    return NextResponse.json(getTimelineDraftResponseSchema.parse({ draft: null, poolMedia: [] }));
  }

  try {
    const poolMedia = await loadPoolMedia(
      supabase,
      brandId,
      document.data.pool.map((source) => source.assetId),
    );
    const draft = timelineDraftSchema.parse({
      id: row.id,
      brandId: row.brand_id,
      assetId: row.asset_id,
      createdBy: row.created_by,
      schemaVersion: row.schema_version,
      document: document.data,
      status: row.status,
      renderedAssetId: row.rendered_asset_id,
      lastRenderedAt: row.last_rendered_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    return NextResponse.json(getTimelineDraftResponseSchema.parse({ draft, poolMedia }));
  } catch (err) {
    console.error('[library/timeline-drafts] GET failed', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// PUT /api/library/timeline-drafts — upsert on (asset_id, created_by). The
// editor autosaves through here, so it must be cheap and idempotent.
export async function PUT(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = upsertTimelineDraftRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, document, status, renderedAssetId } = parsed.data;

  // The draft's own envelope must agree with the row it is being written to.
  if (document.sourceAssetId !== assetId) {
    return NextResponse.json(
      { error: 'document.sourceAssetId does not match assetId' },
      { status: 422 },
    );
  }

  const caller = await authorizeCaller(brandId);
  if (caller instanceof NextResponse) return caller;
  const { supabase, userId } = caller;

  if (!(await assetIsInBrand(supabase, brandId, assetId))) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }
  if (renderedAssetId && !(await assetIsInBrand(supabase, brandId, renderedAssetId))) {
    return NextResponse.json({ error: 'Rendered asset not found' }, { status: 404 });
  }

  // Only the columns that were supplied are written: omitting `status` on a plain
  // autosave leaves a 'rendered' stamp intact rather than reverting it.
  const row: Record<string, unknown> = {
    brand_id: brandId,
    asset_id: assetId,
    created_by: userId,
    schema_version: document.schemaVersion,
    document,
    updated_at: new Date().toISOString(),
  };
  if (status) row.status = status;
  if (renderedAssetId !== undefined) row.rendered_asset_id = renderedAssetId;
  if (status === 'rendered') row.last_rendered_at = new Date().toISOString();

  const { data, error } = await mediaSchema(supabase)
    .from('timeline_drafts')
    .upsert(row, { onConflict: 'asset_id,created_by' })
    .select('id, updated_at')
    .single();
  if (error || !data) {
    console.error('[library/timeline-drafts] upsert failed', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }

  const saved = data as { id: string; updated_at: string };
  return NextResponse.json(
    upsertTimelineDraftResponseSchema.parse({ id: saved.id, updatedAt: saved.updated_at }),
  );
}

// DELETE /api/library/timeline-drafts?brandId&assetId — discard the caller's
// draft. RLS restricts the delete to its author regardless of what is claimed.
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const caller = await authorizeCaller(brandId);
  if (caller instanceof NextResponse) return caller;
  const { supabase, userId } = caller;

  const { error } = await mediaSchema(supabase)
    .from('timeline_drafts')
    .delete()
    .eq('asset_id', assetId)
    .eq('brand_id', brandId)
    .eq('created_by', userId);
  if (error) {
    console.error('[library/timeline-drafts] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
