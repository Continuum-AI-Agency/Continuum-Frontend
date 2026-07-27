import {
  buildPlannerReelCompositionCluster,
  type PlannerComposition,
  plannerCompositionListResponseSchema,
  plannerCompositionStatusSchema,
  preparePlannerCompositionRequestSchema,
  preparePlannerCompositionResponseSchema,
  type StudioGraphEdge,
  type StudioGraphNode,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  extractPlannerCompositionClips,
  fingerprintPlannerCompositionClips,
  mergePlannerCompositionCluster,
  nextPlannerCompositionOrigin,
} from '@/lib/organic/plannerComposition.server';
import { computeWeekStartId } from '@/lib/organic/publish-canvas';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const CANVAS_WRITE_RETRIES = 3;

type DraftRow = {
  id: string;
  brand_id: string;
  content_json: Record<string, unknown> | null;
  scheduled_date: string | null;
  platform: string | null;
};

type CompositionRow = {
  id: string;
  brand_id: string;
  draft_id: string;
  room_id: string;
  timeline_node_id: string;
  publish_node_id: string;
  revision: number;
  source_fingerprint: string;
  status: PlannerComposition['status'];
  is_current: boolean;
  result_asset_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const toComposition = (row: CompositionRow, weekStartId?: string): PlannerComposition => ({
  id: row.id,
  brandId: row.brand_id,
  draftId: row.draft_id,
  roomId: row.room_id,
  timelineNodeId: row.timeline_node_id,
  publishNodeId: row.publish_node_id,
  revision: row.revision,
  status: row.status,
  isCurrent: row.is_current,
  sourceFingerprint: row.source_fingerprint,
  resultAssetId: row.result_asset_id,
  error: row.error,
  openHref: `/ai-studio?roomId=${encodeURIComponent(row.room_id)}&focusNodeId=${encodeURIComponent(row.timeline_node_id)}&source=organic-planner&draftId=${encodeURIComponent(row.draft_id)}`,
  returnHref: `/organic?${new URLSearchParams({
    tab: 'planner',
    draftId: row.draft_id,
    ...(weekStartId ? { weekStartId } : {}),
    from: 'ai-studio',
  }).toString()}`,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function authenticateBrand(brandId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };
  const { data: hasAccess, error } = await supabase
    .schema('brand_profiles')
    .rpc('has_brand_access', { brand_id: brandId });
  if (error || !hasAccess) {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }
  return { user };
}

async function readDraft(admin: SupabaseClient, brandId: string, draftId: string) {
  const { data, error } = await admin
    .schema('organic')
    .from('organic_calendar_drafts')
    .select('id, brand_id, content_json, scheduled_date, platform')
    .eq('id', draftId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read Planner draft: ${error.message}`);
  if (!data) throw new Error('Planner draft not found.');
  return data as DraftRow;
}

async function listRows(admin: SupabaseClient, draftId: string): Promise<CompositionRow[]> {
  const { data, error } = await admin
    .schema('organic')
    .from('planner_canvas_compositions')
    .select('*')
    .eq('draft_id', draftId)
    .order('revision', { ascending: false });
  if (error) throw new Error(`Unable to read composition revisions: ${error.message}`);
  return (data ?? []) as CompositionRow[];
}

async function writeDraftCompositionPointer(
  admin: SupabaseClient,
  draft: DraftRow,
  composition: PlannerComposition,
) {
  const contentJson = draft.content_json ?? {};
  const creative = (contentJson.creative as Record<string, unknown> | undefined) ?? {};
  const suggestion = (creative.mediaSuggestion as Record<string, unknown> | undefined) ?? {};
  const reel = (suggestion.reel as Record<string, unknown> | undefined) ?? {};
  const nextContentJson = {
    ...contentJson,
    creative: {
      ...creative,
      mediaSuggestion: {
        ...suggestion,
        reel: { ...reel, composition },
      },
    },
  };
  const updated = await admin
    .schema('organic')
    .from('organic_calendar_drafts')
    .update({ content_json: nextContentJson, updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('brand_id', draft.brand_id);
  if (updated.error) {
    throw new Error(`Unable to link composition to Planner: ${updated.error.message}`);
  }
}

async function ensurePlannerRoom(admin: SupabaseClient, brandId: string, userId: string) {
  const rooms = admin.schema('brand_profiles').from('canvas_rooms');
  const existing = await rooms
    .select('id')
    .eq('brand_profile_id', brandId)
    .eq('kind', 'planner')
    .maybeSingle();
  if (existing.error)
    throw new Error(`Unable to find Planner workspace: ${existing.error.message}`);
  if (existing.data?.id) return existing.data.id as string;

  const inserted = await rooms
    .insert({
      brand_profile_id: brandId,
      name: 'Planner Compositions',
      kind: 'planner',
      created_by: userId,
    })
    .select('id')
    .maybeSingle();
  if (inserted.data?.id) return inserted.data.id as string;

  // A concurrent request may have won the partial-unique race.
  const raced = await rooms
    .select('id')
    .eq('brand_profile_id', brandId)
    .eq('kind', 'planner')
    .single();
  if (raced.error || !raced.data?.id) {
    throw new Error(
      `Unable to create Planner workspace: ${inserted.error?.message ?? raced.error?.message}`,
    );
  }
  return raced.data.id as string;
}

async function writeCluster(params: {
  admin: SupabaseClient;
  brandId: string;
  roomId: string;
  userId: string;
  build: (nodes: StudioGraphNode[]) => ReturnType<typeof buildPlannerReelCompositionCluster>;
}) {
  const sessions = params.admin.schema('brand_profiles').from('canvas_sessions');
  for (let attempt = 0; attempt < CANVAS_WRITE_RETRIES; attempt += 1) {
    const current = await sessions
      .select('nodes, edges, revision')
      .eq('brand_profile_id', params.brandId)
      .eq('room_id', params.roomId)
      .maybeSingle();
    if (current.error) throw new Error(`Unable to read Canvas workspace: ${current.error.message}`);

    const nodes = Array.isArray(current.data?.nodes)
      ? (current.data.nodes as StudioGraphNode[])
      : [];
    const edges = Array.isArray(current.data?.edges)
      ? (current.data.edges as StudioGraphEdge[])
      : [];
    const cluster = params.build(nodes);
    const merged = mergePlannerCompositionCluster(nodes, edges, cluster);

    if (!current.data) {
      const inserted = await sessions.insert({
        brand_profile_id: params.brandId,
        room_id: params.roomId,
        nodes: merged.nodes,
        edges: merged.edges,
        editor_user_id: params.userId,
      });
      if (!inserted.error) return cluster;
      continue;
    }

    const updated = await sessions
      .update({
        nodes: merged.nodes,
        edges: merged.edges,
        editor_user_id: params.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('brand_profile_id', params.brandId)
      .eq('room_id', params.roomId)
      .eq('revision', current.data.revision)
      .select('revision')
      .maybeSingle();
    if (!updated.error && updated.data) return cluster;
  }
  throw new Error('Canvas changed while preparing the reel. Try again.');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brandId = url.searchParams.get('brandId') ?? '';
  const draftId = url.searchParams.get('draftId') ?? '';
  if (!brandId || !draftId) {
    return NextResponse.json({ error: 'brandId and draftId are required.' }, { status: 400 });
  }
  const auth = await authenticateBrand(brandId);
  if ('error' in auth) return auth.error;

  try {
    const admin = createSupabaseAdminClient() as unknown as SupabaseClient;
    const [draft, rows] = await Promise.all([
      readDraft(admin, brandId, draftId),
      listRows(admin, draftId),
    ]);
    const weekStartId = computeWeekStartId(draft.scheduled_date ?? new Date().toISOString());
    const revisions = rows.map((row) => toComposition(row, weekStartId));
    return NextResponse.json(
      plannerCompositionListResponseSchema.parse({
        current: revisions.find((revision) => revision.isCurrent) ?? null,
        revisions,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load compositions.' },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = preparePlannerCompositionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid composition request.' }, { status: 400 });
  }
  const auth = await authenticateBrand(parsed.data.brandId);
  if ('error' in auth) return auth.error;

  const admin = createSupabaseAdminClient() as unknown as SupabaseClient;
  const organic = admin.schema('organic');
  let compositionId: string | null = null;
  try {
    const draft = await readDraft(admin, parsed.data.brandId, parsed.data.draftId);
    const rawClips = extractPlannerCompositionClips(draft.content_json);
    const clips = await Promise.all(
      rawClips.map(async (clip) => {
        if (!clip.storagePath.startsWith(`${draft.brand_id}/canvas-creations/reel/`)) {
          throw new Error(`Scene ${clip.index + 1} is outside this brand's media path.`);
        }
        const signed = await admin.storage
          .from(clip.bucket)
          .createSignedUrl(clip.storagePath, SIGNED_URL_TTL_SECONDS);
        if (signed.error || !signed.data?.signedUrl) {
          throw new Error(`Unable to sign scene ${clip.index + 1}.`);
        }
        return { ...clip, signedUrl: signed.data.signedUrl };
      }),
    );
    const sourceFingerprint = fingerprintPlannerCompositionClips(clips);
    const existingRows = await listRows(admin, draft.id);
    const existing = existingRows.find((row) => row.source_fingerprint === sourceFingerprint);
    const weekStartId = computeWeekStartId(draft.scheduled_date ?? new Date().toISOString());
    if (existing && existing.status !== 'failed') {
      if (!existing.is_current) {
        const cleared = await organic
          .from('planner_canvas_compositions')
          .update({ is_current: false })
          .eq('draft_id', draft.id)
          .eq('is_current', true);
        if (cleared.error)
          throw new Error(`Unable to select composition: ${cleared.error.message}`);
        const selected = await organic
          .from('planner_canvas_compositions')
          .update({ is_current: true })
          .eq('id', existing.id);
        if (selected.error)
          throw new Error(`Unable to select composition: ${selected.error.message}`);
        existing.is_current = true;
        for (const row of existingRows) row.is_current = row.id === existing.id;
      }
      const composition = toComposition(existing, weekStartId);
      await writeDraftCompositionPointer(admin, draft, composition);
      const revisions = existingRows.map((row) => toComposition(row, weekStartId));
      return NextResponse.json(
        preparePlannerCompositionResponseSchema.parse({
          composition,
          revisions,
          clips,
          created: false,
        }),
      );
    }

    const roomId = await ensurePlannerRoom(admin, draft.brand_id, auth.user.id);
    const revision = existing?.revision ?? (existingRows[0]?.revision ?? 0) + 1;
    compositionId = existing?.id ?? crypto.randomUUID();
    const timelineNodeId = `planner-composition:${compositionId}:timeline`;
    const publishNodeId = `planner-composition:${compositionId}:publish`;

    if (!existing) {
      const cleared = await organic
        .from('planner_canvas_compositions')
        .update({ is_current: false })
        .eq('draft_id', draft.id)
        .eq('is_current', true);
      if (cleared.error) throw new Error(`Unable to create composition: ${cleared.error.message}`);
      const inserted = await organic.from('planner_canvas_compositions').insert({
        id: compositionId,
        brand_id: draft.brand_id,
        draft_id: draft.id,
        room_id: roomId,
        timeline_node_id: timelineNodeId,
        publish_node_id: publishNodeId,
        revision,
        source_fingerprint: sourceFingerprint,
        status: 'preparing',
        is_current: true,
        created_by: auth.user.id,
      });
      if (inserted.error)
        throw new Error(`Unable to create composition: ${inserted.error.message}`);
    } else {
      const cleared = await organic
        .from('planner_canvas_compositions')
        .update({ is_current: false })
        .eq('draft_id', draft.id)
        .neq('id', existing.id)
        .eq('is_current', true);
      if (cleared.error) throw new Error(`Unable to retry composition: ${cleared.error.message}`);
      const retried = await organic
        .from('planner_canvas_compositions')
        .update({ status: 'preparing', error: null, is_current: true })
        .eq('id', existing.id);
      if (retried.error) throw new Error(`Unable to retry composition: ${retried.error.message}`);
    }

    await writeCluster({
      admin,
      brandId: draft.brand_id,
      roomId,
      userId: auth.user.id,
      build: (nodes) =>
        buildPlannerReelCompositionCluster({
          compositionId: compositionId as string,
          draftId: draft.id,
          weekStartId,
          platform: draft.platform ?? 'instagram',
          scheduledAt: draft.scheduled_date ?? undefined,
          clips,
          origin: nextPlannerCompositionOrigin(nodes),
        }),
    });

    const completed = await organic
      .from('planner_canvas_compositions')
      .update({ status: 'clips_ready', error: null })
      .eq('id', compositionId)
      .select('*')
      .single();
    if (completed.error || !completed.data) {
      throw new Error(`Unable to finish composition: ${completed.error?.message ?? 'no row'}`);
    }
    const rows = await listRows(admin, draft.id);
    const revisions = rows.map((row) => toComposition(row, weekStartId));
    const composition = toComposition(completed.data as CompositionRow, weekStartId);
    await writeDraftCompositionPointer(admin, draft, composition);
    return NextResponse.json(
      preparePlannerCompositionResponseSchema.parse({
        composition,
        revisions,
        clips,
        created: !existing,
      }),
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    if (compositionId) {
      await organic
        .from('planner_canvas_compositions')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Composition preparation failed.',
        })
        .eq('id', compositionId);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Composition preparation failed.' },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const brandId = typeof payload?.brandId === 'string' ? payload.brandId : '';
  const compositionId = typeof payload?.compositionId === 'string' ? payload.compositionId : '';
  const status = plannerCompositionStatusSchema.safeParse(payload?.status);
  if (!brandId || !compositionId || !status.success) {
    return NextResponse.json({ error: 'Invalid composition status request.' }, { status: 400 });
  }
  const auth = await authenticateBrand(brandId);
  if ('error' in auth) return auth.error;

  const admin = createSupabaseAdminClient() as unknown as SupabaseClient;
  const updated = await admin
    .schema('organic')
    .from('planner_canvas_compositions')
    .update({
      status: status.data,
      error: typeof payload?.error === 'string' ? payload.error : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', compositionId)
    .eq('brand_id', brandId)
    .select('id')
    .maybeSingle();
  if (updated.error || !updated.data) {
    return NextResponse.json({ error: 'Composition not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
