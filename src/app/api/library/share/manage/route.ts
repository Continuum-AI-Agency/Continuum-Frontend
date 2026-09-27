// The share owner's side of a link: its settings, the assets on it in order,
// and what external reviewers did on it. Reads use the admin client after the
// caller's brand access is checked (share_links and reviewer sessions are
// deny-all RLS); edits go through media.library_execute_operation
// (update_share_link) with the authenticated user as actor.
//
// GET ?id=<linkId> | ?token=<token>   → ShareLinkDetailResponse
// GET ?brandId=<id>&assetId=<id>      → ShareLinkActivityResponse (every link)
// PATCH UpdateShareLinkRequest         → ShareLinkDetailResponse

import {
  type ShareLinkActivityEvent,
  type ShareLinkDetailResponse,
  shareLinkEventKindSchema,
  updateShareLinkRequestSchema,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { shareMembers } from '@/app/share/[token]/loadSharePayload';
import { executeLibraryOperation, requireBrandCaller } from '@/lib/library/libraryOperation.server';
import { rowToShareLink, type ShareLinkRow } from '@/lib/library/shareValidation';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
const EVENT_LIMIT = 300;
const uuid = z.string().uuid();

type EventRow = {
  id: string;
  share_link_id: string;
  kind: string;
  asset_id: string | null;
  version_id: string | null;
  reviewer_session_id: string | null;
  created_at: string;
};

async function titlesFor(admin: AdminClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, { title: string; kind: string }>();
  const { data } = await mediaSchema(admin as unknown as SupabaseClient)
    .from('assets')
    .select('id, title, file_name, kind')
    .in('id', ids);
  return new Map(
    (
      (data ?? []) as Array<{ id: string; title: string | null; file_name: string; kind: string }>
    ).map((row) => [row.id, { title: row.title ?? row.file_name, kind: row.kind }]),
  );
}

// Events named by the reviewer who did them — the session's name and email.
async function activity(admin: AdminClient, rows: EventRow[]): Promise<ShareLinkActivityEvent[]> {
  const media = mediaSchema(admin as unknown as SupabaseClient);
  const sessionIds = [...new Set(rows.flatMap((row) => row.reviewer_session_id ?? []))];
  const { data: sessions } =
    sessionIds.length > 0
      ? await media
          .from('external_reviewer_sessions')
          .select('id, display_name, email')
          .in('id', sessionIds)
      : { data: [] };
  const reviewers = new Map(
    (
      (sessions ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>
    ).map((row) => [row.id, row]),
  );
  const titles = await titlesFor(admin, [...new Set(rows.flatMap((row) => row.asset_id ?? []))]);
  return rows.flatMap((row) => {
    const kind = shareLinkEventKindSchema.safeParse(row.kind);
    if (!kind.success) return [];
    const reviewer = row.reviewer_session_id ? reviewers.get(row.reviewer_session_id) : undefined;
    return [
      {
        id: row.id,
        shareLinkId: row.share_link_id,
        kind: kind.data,
        assetId: row.asset_id,
        assetTitle: row.asset_id ? (titles.get(row.asset_id)?.title ?? null) : null,
        versionId: row.version_id,
        reviewerName: reviewer?.display_name ?? null,
        reviewerEmail: reviewer?.email ?? null,
        createdAt: row.created_at,
      },
    ];
  });
}

const EVENT_SELECT =
  'id, share_link_id, kind, asset_id, version_id, reviewer_session_id, created_at';

async function linkDetail(
  admin: AdminClient,
  row: ShareLinkRow,
  origin: string,
): Promise<ShareLinkDetailResponse> {
  const members =
    row.scope === 'asset' && row.asset_id
      ? [{ asset_id: row.asset_id }]
      : (await shareMembers(admin, row, { pageSize: 200 })).rows;
  const ids = members.map((member) => member.asset_id);
  const [titles, { data: events }] = await Promise.all([
    titlesFor(admin, ids),
    mediaSchema(admin as unknown as SupabaseClient)
      .from('share_link_events')
      .select(EVENT_SELECT)
      .eq('share_link_id', row.id)
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT),
  ]);
  return {
    link: rowToShareLink(row, origin, ids),
    members: ids.flatMap((assetId) => {
      const found = titles.get(assetId);
      return found ? [{ assetId, title: found.title, kind: found.kind }] : [];
    }),
    events: await activity(admin, (events ?? []) as EventRow[]),
  };
}

async function findLink(admin: AdminClient, by: { id?: string; token?: string }) {
  let query = mediaSchema(admin as unknown as SupabaseClient)
    .from('share_links')
    .select('*');
  query = by.id ? query.eq('id', by.id) : query.eq('token', by.token ?? '');
  const { data } = await query.maybeSingle();
  return (data as ShareLinkRow | null) ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const admin = createSupabaseAdminClient();

  const brandId = params.get('brandId');
  const assetId = params.get('assetId');
  if (brandId && assetId) {
    if (!uuid.safeParse(brandId).success || !uuid.safeParse(assetId).success) {
      return NextResponse.json({ error: 'Invalid ids' }, { status: 400 });
    }
    const caller = await requireBrandCaller(brandId);
    if (caller instanceof NextResponse) return caller;
    const { data } = await mediaSchema(admin as unknown as SupabaseClient)
      .from('share_link_events')
      .select(EVENT_SELECT)
      .eq('brand_id', brandId)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT);
    return NextResponse.json({ events: await activity(admin, (data ?? []) as EventRow[]) });
  }

  const id = params.get('id');
  const token = params.get('token');
  if (id ? !uuid.safeParse(id).success : !token || token.length > 128) {
    return NextResponse.json({ error: 'Missing id or token' }, { status: 400 });
  }
  const row = await findLink(admin, id ? { id } : { token: token ?? '' });
  if (!row) return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
  const caller = await requireBrandCaller(row.brand_id);
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(await linkDetail(admin, row, url.origin));
}

export async function PATCH(request: Request) {
  const parsed = updateShareLinkRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const caller = await requireBrandCaller(parsed.data.brandId);
  if (caller instanceof NextResponse) return caller;
  const { idempotencyKey: _clientKey, ...edit } = parsed.data;
  const result = await executeLibraryOperation('update_share_link', edit, caller.user.id);
  if (result instanceof NextResponse) return result;

  const admin = createSupabaseAdminClient();
  const row = await findLink(admin, { id: parsed.data.shareLinkId });
  if (!row) return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
  return NextResponse.json(await linkDetail(admin, row, new URL(request.url).origin));
}
