import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  approvalReportToCsv,
  buildApprovalReport,
  type ReportDecisionRow,
  type ReportEventRow,
  type ReportVersionRow,
} from '@/lib/library/approvalReport';
import { requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { mediaSchema } from '@/lib/media/supabase-media';

// GET /api/library/review/report?brandId[&collectionId][&assetId] — the approval
// audit as CSV: who approved (or sent back) which version, when, and through
// which path. Brand-wide by default, narrowed to one collection or one asset.
// Everything is read on the caller's RLS-scoped client: the audit tables are
// member-readable, and a private collection stays its creator's.

// ponytail: one page of 5000 verdicts per source; page by created_at when a
// brand's audit outgrows it.
const MAX_ROWS = 5000;
const IN_CHUNK = 200;

const querySchema = z.object({
  brandId: z.string().uuid(),
  collectionId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
});

async function scopedAssetIds(
  supabase: SupabaseClient,
  query: z.infer<typeof querySchema>,
): Promise<Set<string> | null | NextResponse> {
  if (query.assetId) return new Set([query.assetId]);
  if (!query.collectionId) return null;
  const { data: collection } = await mediaSchema(supabase)
    .from('collections')
    .select('id')
    .eq('id', query.collectionId)
    .eq('brand_id', query.brandId)
    .maybeSingle();
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  const { data, error } = await mediaSchema(supabase)
    .from('collection_items')
    .select('asset_id')
    .eq('collection_id', query.collectionId);
  if (error) throw error;
  return new Set(((data ?? []) as { asset_id: string }[]).map((row) => row.asset_id));
}

async function inChunks<T>(ids: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += IN_CHUNK) {
    rows.push(...(await read(ids.slice(start, start + IN_CHUNK))));
  }
  return rows;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    collectionId: url.searchParams.get('collectionId') ?? undefined,
    assetId: url.searchParams.get('assetId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const query = parsed.data;
  const caller = await requireBrandCaller(query.brandId);
  if (caller instanceof NextResponse) return caller;

  try {
    const scope = await scopedAssetIds(caller.supabase, query);
    if (scope instanceof NextResponse) return scope;
    const inScope = (assetId: string) => scope === null || scope.has(assetId);
    const media = mediaSchema(caller.supabase);

    const decisionResult = await media
      .from('review_assignments')
      .select(
        'reviewer_user_id, decision, note, decided_at, review_requests!inner(asset_id, version_id)',
      )
      .eq('brand_id', query.brandId)
      .not('decided_at', 'is', null)
      .order('decided_at', { ascending: false })
      .limit(MAX_ROWS);
    if (decisionResult.error) throw decisionResult.error;
    const decisions: ReportDecisionRow[] = (
      (decisionResult.data ?? []) as unknown as {
        reviewer_user_id: string;
        decision: ReportDecisionRow['decision'];
        note: string | null;
        decided_at: string;
        review_requests: { asset_id: string; version_id: string | null };
      }[]
    )
      .map((row) => ({
        assetId: row.review_requests.asset_id,
        versionId: row.review_requests.version_id,
        reviewerUserId: row.reviewer_user_id,
        decision: row.decision,
        note: row.note,
        decidedAt: row.decided_at,
      }))
      .filter((row) => inScope(row.assetId));

    const eventResult = await media
      .from('asset_review_events')
      .select('asset_id, actor, to_status, note, created_at')
      .eq('brand_id', query.brandId)
      .in('to_status', ['approved', 'needs_changes'])
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    if (eventResult.error) throw eventResult.error;
    const events: ReportEventRow[] = (
      (eventResult.data ?? []) as {
        asset_id: string;
        actor: string | null;
        to_status: string;
        note: string | null;
        created_at: string;
      }[]
    )
      .map((row) => ({
        assetId: row.asset_id,
        actor: row.actor,
        toStatus: row.to_status,
        note: row.note,
        createdAt: row.created_at,
      }))
      .filter((row) => inScope(row.assetId));

    const assetIds = [...new Set([...decisions, ...events].map((row) => row.assetId))];
    const versions = await inChunks<ReportVersionRow>(assetIds, async (chunk) => {
      const { data, error } = await media
        .from('asset_versions')
        .select('id, asset_id, version_number, created_at')
        .eq('brand_id', query.brandId)
        .in('asset_id', chunk);
      if (error) throw error;
      return (
        (data ?? []) as {
          id: string;
          asset_id: string;
          version_number: number;
          created_at: string;
        }[]
      ).map((row) => ({
        id: row.id,
        assetId: row.asset_id,
        versionNumber: row.version_number,
        createdAt: row.created_at,
      }));
    });
    const assets = await inChunks(assetIds, async (chunk) => {
      const { data, error } = await media
        .from('assets')
        .select('id, title, file_name')
        .eq('brand_id', query.brandId)
        .in('id', chunk);
      if (error) throw error;
      return (data ?? []) as { id: string; title: string | null; file_name: string | null }[];
    });
    const { data: members } = await caller.supabase
      .schema('brand_profiles')
      .from('permissions')
      .select('user_id, email')
      .eq('brand_profile_id', query.brandId);

    const rows = buildApprovalReport({
      decisions,
      events,
      versions,
      assetNames: new Map(
        assets.map((asset) => [asset.id, asset.title || asset.file_name || asset.id]),
      ),
      emails: new Map(
        ((members ?? []) as { user_id: string | null; email: string | null }[]).flatMap((m) =>
          m.user_id && m.email ? [[m.user_id, m.email] as const] : [],
        ),
      ),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(approvalReportToCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="approval-report-${stamp}.csv"`,
      },
    });
  } catch (error) {
    console.error('[library/review/report] failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
