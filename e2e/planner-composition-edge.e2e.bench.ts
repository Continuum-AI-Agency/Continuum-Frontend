#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const OWNER_EMAIL = 'local@continuum.test';
const OWNER_PASSWORD = 'localdev123';
const BUCKET = 'media-library';
const RUN_ID = crypto.randomUUID();
const DRAFT_ID = crypto.randomUUID();
const PATH_PREFIX = `${BRAND_ID}/canvas-creations/reel/planner-composition-edge-${RUN_ID}`;

function requireLocalEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[planner:composition:e2e:bench] Missing ${name}. Run bun run supabase:env:local.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[planner:composition:e2e:bench] ${message}`);
  console.log(`✓ ${message}`);
}

const supabaseUrl = requireLocalEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
assert(
  /^(?:http:\/\/127\.0\.0\.1|http:\/\/localhost)/.test(supabaseUrl),
  'refuses to write outside the local Supabase stack',
);
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ??
  requireLocalEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const serviceKey = requireLocalEnv('SUPABASE_SERVICE_ROLE_KEY');
const service = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const user = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let plannerRoomId: string | null = null;
let priorSession: { nodes: unknown; edges: unknown; editor_user_id: string | null } | null = null;
let createdPlannerRoom = false;

async function invoke(path: string, init: RequestInit, token?: string): Promise<Response> {
  return fetch(`${supabaseUrl}/functions/v1/planner-compositions${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

try {
  const signedIn = await user.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  assert(
    !signedIn.error && signedIn.data.session?.access_token && signedIn.data.user,
    'mints a real local owner JWT',
  );
  const accessToken = signedIn.data.session.access_token;

  const existingRoom = await service
    .schema('brand_profiles')
    .from('canvas_rooms')
    .select('id')
    .eq('brand_profile_id', BRAND_ID)
    .eq('kind', 'planner')
    .maybeSingle();
  if (existingRoom.error) throw existingRoom.error;
  plannerRoomId = existingRoom.data?.id ?? null;
  if (plannerRoomId) {
    const existingSession = await service
      .schema('brand_profiles')
      .from('canvas_sessions')
      .select('nodes, edges, editor_user_id')
      .eq('brand_profile_id', BRAND_ID)
      .eq('room_id', plannerRoomId)
      .maybeSingle();
    if (existingSession.error) throw existingSession.error;
    priorSession = existingSession.data;
  }

  const scenePaths = [`${PATH_PREFIX}/scene-0.mp4`, `${PATH_PREFIX}/scene-1.mp4`];
  for (const path of scenePaths) {
    const uploaded = await service.storage.from(BUCKET).upload(path, new Uint8Array([0, 1, 2]), {
      contentType: 'video/mp4',
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
  }
  console.log('✓ writes temporary private reel clips');

  const inserted = await service.schema('organic').from('organic_calendar_drafts').insert({
    id: DRAFT_ID,
    brand_id: BRAND_ID,
    user_id: signedIn.data.user.id,
    client_key: `planner-composition-edge-${RUN_ID}`,
    platform: 'instagram',
    platform_account_id: 'unassigned',
    status: 'draft',
    scheduled_date: '2026-08-10T12:00:00.000Z',
    media_stage: 'realized',
    slot_data: { weekStart: '2026-08-10', dayId: '2026-08-10', platform: 'instagram' },
    content_json: {
      creative: {
        mediaSuggestion: {
          mediaStatus: 'ready',
          reel: {
            scenes: [
              { index: 0, role: 'hook', durationSec: 3, bucket: BUCKET, clipUrl: scenePaths[0], signedClipUrl: 'https://stale.example/0' },
              { index: 1, role: 'cta', durationSec: 3, bucket: BUCKET, clipUrl: scenePaths[1], signedClipUrl: 'https://stale.example/1' },
            ],
          },
        },
      },
    },
  });
  if (inserted.error) throw inserted.error;
  console.log('✓ persists a temporary Planner draft with durable reel coordinates');

  const unauthorized = await invoke('', { method: 'POST', body: JSON.stringify({ brandId: BRAND_ID, draftId: DRAFT_ID }) });
  assert(unauthorized.status === 401, 'rejects an Edge Function request without a user JWT');

  const prepared = await invoke(
    '',
    { method: 'POST', body: JSON.stringify({ brandId: BRAND_ID, draftId: DRAFT_ID }) },
    accessToken,
  );
  const preparedBody = await prepared.json() as {
    composition?: { id?: string; roomId?: string; status?: string; sourceFingerprint?: string };
    clips?: Array<{ signedUrl?: string }>;
    created?: boolean;
    error?: string;
  };
  assert(prepared.status === 201, `creates the composition through Edge Function (${preparedBody.error ?? 'ok'})`);
  assert(preparedBody.created === true && preparedBody.composition?.id && preparedBody.composition.roomId, 'returns the durable composition identity');
  assert(preparedBody.composition.status === 'clips_ready', 'marks the persisted composition clips_ready');
  assert(preparedBody.clips?.length === 2 && preparedBody.clips.every((clip) => Boolean(clip.signedUrl)), 'returns freshly signed private clip URLs');
  if (!plannerRoomId) {
    plannerRoomId = preparedBody.composition.roomId;
    createdPlannerRoom = true;
  }

  const listed = await invoke(`?brandId=${BRAND_ID}&draftId=${DRAFT_ID}`, { method: 'GET' }, accessToken);
  const listedBody = await listed.json() as { current?: { id?: string; status?: string } | null };
  assert(listed.status === 200 && listedBody.current?.id === preparedBody.composition.id, 'reads back the current composition through Edge Function');

  const canvas = await service
    .schema('brand_profiles')
    .from('canvas_sessions')
    .select('nodes, edges')
    .eq('brand_profile_id', BRAND_ID)
    .eq('room_id', preparedBody.composition.roomId)
    .single();
  if (canvas.error) throw canvas.error;
  const nodes = Array.isArray(canvas.data.nodes) ? canvas.data.nodes as Array<{ data?: { plannerCompositionId?: string } }> : [];
  assert(nodes.some((node) => node.data?.plannerCompositionId === preparedBody.composition?.id), 'persists the editable Canvas graph under the Planner room');

  const updated = await invoke(
    '',
    { method: 'PATCH', body: JSON.stringify({ brandId: BRAND_ID, compositionId: preparedBody.composition.id, status: 'editing' }) },
    accessToken,
  );
  assert(updated.status === 200, 'updates composition status through the same authorized Edge boundary');
} finally {
  if (plannerRoomId) {
    if (priorSession) {
      await service
        .schema('brand_profiles')
        .from('canvas_sessions')
        .update({ nodes: priorSession.nodes, edges: priorSession.edges, editor_user_id: priorSession.editor_user_id })
        .eq('brand_profile_id', BRAND_ID)
        .eq('room_id', plannerRoomId);
    } else {
      await service
        .schema('brand_profiles')
        .from('canvas_sessions')
        .delete()
        .eq('brand_profile_id', BRAND_ID)
        .eq('room_id', plannerRoomId);
    }
  }
  await service.schema('organic').from('organic_calendar_drafts').delete().eq('id', DRAFT_ID);
  await service.storage.from(BUCKET).remove([`${PATH_PREFIX}/scene-0.mp4`, `${PATH_PREFIX}/scene-1.mp4`]);
  if (plannerRoomId && !priorSession && createdPlannerRoom) {
    // The function created this room; it is isolated to the local fixture and safe to remove.
    await service.schema('brand_profiles').from('canvas_rooms').delete().eq('id', plannerRoomId);
  }
}

console.log('Planner composition Edge Function e2e bench passed.');
