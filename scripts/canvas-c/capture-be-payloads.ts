/**
 * Capture REAL Backend payloads for the FE canvas e2e bench — READ-ONLY everywhere.
 *
 *  (a) paid.live_change_preview: the production emitter + resolver over a real Easy Fit campaign
 *      (the same walk as jaina:live-change:bench), every Graph call a GET.
 *  (b) a duplicate scaffold proposal (copy + 2 test ad sets): the production
 *      paid_scaffold_propose_duplicate tool body over a real Easy Fit campaign, its rows saved
 *      on a THROWAWAY LOCAL Postgres 16 (never the hosted project), the gateway refusing any
 *      non-GET, the structure HTML upload stubbed.
 *
 * Every frame is then passed through the production UI chunk adapter, so the fixture is the
 * part the Frontend receives. Run from Continuum-Backend:
 *   bun --no-env-file --env-file=.env <this file> <out-dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BE = process.cwd();
const imp = async (rel: string) => import(join(BE, rel));

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: capture-be-payloads.ts <out-dir>');
mkdirSync(OUT, { recursive: true });

type Row = Record<string, unknown>;
const recordOf = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};

// Registry first, as every runtime enters it (closes a cycle through the meta tools).
await imp('App/agents-ts/Jaina/src/agents/toolGateRegistry.ts');
const { liveChangePreviewPayloadSchema, campaignStructurePayloadSchema } = await imp(
  '../packages/contracts/src/index.ts',
);
const { createLiveChangePreviewResolver } = await imp(
  'App/agents-ts/Jaina/src/agents/liveChangePreview.ts',
);
const { consumeStreamForEvents, createAiSdkEmitter } = await imp(
  'App/agents-ts/Jaina/src/runtime/aiSdkEvents.ts',
);
const { previewForGatedTool } = await imp('App/agents-ts/Jaina/src/runtime/gatedToolPreview.ts');
const { createJainaUIChunkAdapter } = await imp(
  'App/agents-ts/Jaina/src/runtime/uiMessageChunks.ts',
);
const { resolveScaffoldAccessToken } = await imp('App/paid/scaffold/derivations.ts');
const { MetaScaffoldGateway } = await imp('App/shared/meta/metaScaffoldGateway.ts');
const { META_MARKETING_API_VERSION } = await imp('App/shared/meta/version.ts');
const { PAUSED_VERIFICATION_ACCOUNTS } = await imp('scripts/_bench/pausedWrites.ts');
const { SupabaseScaffoldStore } = await imp('App/agents-ts/Jaina/src/scaffold/scaffoldStore.ts');
const { createPaidScaffoldProposeDuplicateTool } = await imp(
  'App/agents-ts/Jaina/src/tools/paidScaffoldTools.ts',
);
const { startLocalScaffoldDb } = await imp('scripts/jaina-scaffold-p5/localScaffoldDb.ts');

const ACCOUNT = PAUSED_VERIFICATION_ACCOUNTS.easyFit as {
  adAccountId: string;
  brandId: string;
  label: string;
};
const GRAPH = `https://graph.facebook.com/${META_MARKETING_API_VERSION}`;
const SOURCE_CAMPAIGN = process.argv[3] ?? '120253141147440236';
const BENCH_ACTOR = '6d77f933-3eaf-4050-9aba-12d119413297';

let gets = 0;
let refusedWrites = 0;
/** GET only. Any other method throws before a byte leaves the machine. */
const readOnlyFetch = (async (input: unknown, init?: RequestInit) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    refusedWrites += 1;
    throw new Error(`capture: refused ${method} ${String(input)} — this capture is read-only`);
  }
  gets += 1;
  return fetch(input as string, init);
}) as unknown as typeof fetch;

const graphGet = async (path: string, params: Record<string, string>, token: string) => {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await readOnlyFetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = recordOf(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(`GET ${path} HTTP ${response.status}`);
  return body;
};

const scrub = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value)
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'bench@example.com')
      .replace(/EAA[A-Za-z0-9]{20,}/g, '<token>'),
  );

const runContextOf = (brandId: string, currency: string | null, frames: Row[], ask: string) =>
  ({
    userEmail: 'bench@example.com',
    brandId,
    adAccountId: ACCOUNT.adAccountId,
    adAccounts: [{ id: ACCOUNT.adAccountId, name: ACCOUNT.label, currency }],
    lastUserQuery: ask,
    recentCampaignIds: [],
    recentAdSetIds: [],
    recentAdIds: [],
    reports: [],
    formatting: {},
    handoffLog: [],
    runCache: new Map(),
    inFlightToolCalls: new Map(),
    eventCallback: async (frame: unknown) => {
      frames.push(recordOf(frame));
    },
    sharedState: {
      brand_id: brandId,
      ad_account_id: ACCOUNT.adAccountId,
      actor_user_id: BENCH_ACTOR,
      last_user_query: ask,
      recent_entities: { campaign_ids: [], ad_set_ids: [], ad_ids: [] },
      reports_by_scope: {},
      report_order: [],
    },
  }) as never;

const toParts = (frames: Row[]): Row[] => {
  const adapter = createJainaUIChunkAdapter({ runId: 'capture_run' });
  return frames.flatMap((frame) => adapter.toChunks(frame as never) as Row[]);
};

const credentials = await resolveScaffoldAccessToken({ brandId: ACCOUNT.brandId });
const token = credentials.accessToken as string;
const account = await graphGet(ACCOUNT.adAccountId, { fields: 'id,name,currency' }, token);
const currency = typeof account.currency === 'string' ? account.currency : null;
console.log(`account ${String(account.name)} ${currency}`);

// ---------------------------------------------------------------------------
// (a) live change previews
// ---------------------------------------------------------------------------
// A DELIVERING ABO campaign, so the preview's budget before → after is a real daily total.
const listed = await graphGet(
  `${ACCOUNT.adAccountId}/campaigns`,
  {
    fields:
      'id,name,effective_status,daily_budget,adsets.limit(20){id,daily_budget,effective_status}',
    limit: '50',
  },
  token,
);
const liveCampaign =
  process.argv[4] ??
  String(
    ((listed.data as Row[] | undefined) ?? []).find(
      (row) =>
        row.effective_status === 'ACTIVE' &&
        !row.daily_budget &&
        ((recordOf(row.adsets).data as Row[] | undefined) ?? []).some(
          (adSet) => adSet.effective_status === 'ACTIVE' && adSet.daily_budget,
        ),
    )?.id ?? SOURCE_CAMPAIGN,
  );
console.log(`live-change campaign ${liveCampaign}`);
const oracle = await graphGet(
  liveCampaign,
  {
    fields:
      'id,name,effective_status,adsets.limit(60){id,name,daily_budget,effective_status},ads.limit(200){id,adset_id}',
  },
  token,
);
const adSets = ((recordOf(oracle.adsets).data as unknown[]) ?? []).map(recordOf);
const ads = ((recordOf(oracle.ads).data as unknown[]) ?? []).map(recordOf);
const target =
  adSets.find(
    (row) =>
      row.effective_status === 'ACTIVE' &&
      row.daily_budget &&
      ads.some((ad) => ad.adset_id === row.id),
  ) ??
  adSets.find((row) => ads.some((ad) => ad.adset_id === row.id)) ??
  adSets[0];
if (!target) throw new Error('no ad set');
const targetId = String(target.id);
const targetAds = ads.filter((ad) => ad.adset_id === targetId).map((ad) => String(ad.id));

class ReadOnlyGateway extends MetaScaffoldGateway {
  constructor() {
    super(readOnlyFetch);
  }
}
const resolver = createLiveChangePreviewResolver({
  resolveCredentials: async () => ({ accessToken: token }),
  gateway: new ReadOnlyGateway(),
});

const liveCases: { key: string; toolName: string; input: Row }[] = [
  {
    key: 'pause-adset',
    toolName: 'pause_meta_entity',
    input: {
      entity_id: targetId,
      level: 'adset',
      expected_status: target.effective_status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
      reason: 'capture: preview only',
    },
  },
  ...(target.daily_budget
    ? [
        {
          key: 'raise-budget',
          toolName: 'change_meta_budget_bid',
          input: {
            reason: 'capture: preview only',
            changes: [
              {
                entity_id: targetId,
                level: 'adset',
                entity_name: String(target.name),
                field: 'daily_budget',
                expected_current_minor_units: Number(target.daily_budget),
                new_minor_units: Math.round(Number(target.daily_budget) * 1.5),
                currency: currency ?? 'MXN',
              },
            ],
          },
        },
      ]
    : []),
  {
    key: 'new-placements',
    toolName: 'change_meta_placements',
    input: {
      source_adset_id: targetId,
      expected_name: String(target.name),
      expected_status: 'ACTIVE',
      campaign_id: liveCampaign,
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      expected_placements: ['automatic'],
      new_placements: ['instagram:reels'],
      ad_ids: targetAds,
    },
  },
];

const readAt = new Date().toISOString();
for (const [index, testCase] of liveCases.entries()) {
  const frames: Row[] = [];
  const emitter = createAiSdkEmitter({
    runContext: runContextOf(ACCOUNT.brandId, currency, frames, 'capture'),
    previewFor: previewForGatedTool,
    liveChangeFor: resolver,
  });
  await consumeStreamForEvents(
    {
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'tool-approval-request',
          approvalId: `capture_appr_${index}`,
          toolCall: {
            toolCallId: `capture_call_${index}`,
            toolName: testCase.toolName,
            input: testCase.input,
          },
          signature: 'Y2FwdHVyZQ==',
        };
      },
    },
    emitter,
  );
  await emitter.flush(4_000);
  const preview = frames.find((frame) => frame.type === 'paid.live_change_preview');
  const parsed = liveChangePreviewPayloadSchema.safeParse(preview?.data);
  if (!parsed.success) throw new Error(`${testCase.key}: no parseable preview`);
  const parts = toParts(frames).filter((part) => part.type === 'data-jaina-live-change');
  writeFileSync(
    join(OUT, `live-change-${testCase.key}.json`),
    `${JSON.stringify(scrub({ capturedAt: readAt, source: 'live', toolName: testCase.toolName, frame: preview, parts }), null, 2)}\n`,
  );
  console.log(
    `(a) ${testCase.key}: ${parsed.data.nodes.length} nodes, ${JSON.stringify(parsed.data.counts)}`,
  );
}

// ---------------------------------------------------------------------------
// (b) duplicate scaffold proposal with 2 test ad sets, rows on a LOCAL Postgres
// ---------------------------------------------------------------------------
const local = await startLocalScaffoldDb({
  brandId: ACCOUNT.brandId,
  userId: BENCH_ACTOR,
  assetIds: [],
  withP5: true,
});
try {
  const { readDuplicateSource } = await imp('App/agents-ts/Jaina/src/scaffold/duplicateBuilder.ts');
  const gateway = new ReadOnlyGateway();
  const source = await readDuplicateSource(
    { gateway, accessToken: token },
    { level: 'campaign', id: SOURCE_CAMPAIGN },
  );
  const base = source.children[0];
  const advantage = recordOf(
    recordOf(base.fields.targeting).targeting_automation,
  ).advantage_audience;
  const tests = [
    {
      based_on_adset_id: base.id,
      name: `Test Advantage+ audience ${advantage === 1 ? 'off' : 'on'}`,
      new_advantage_audience: advantage === 1 ? 0 : 1,
    },
    { based_on_adset_id: base.id, name: 'Test Reels only', new_placements: ['instagram:reels'] },
  ];
  const frames: Row[] = [];
  const ask = `duplica la campaña ${source.name} con 2 conjuntos nuevos para probar`;
  const context = runContextOf(ACCOUNT.brandId, currency, frames, ask);
  const tool = createPaidScaffoldProposeDuplicateTool({
    store: new SupabaseScaffoldStore(local.invoke),
    gateway,
    resolveCredentials: async () => credentials,
    uploadStructureHtml: async ({ compositionId }: { compositionId: string }) => ({
      bucket: 'capture',
      path: `capture/${compositionId}.html`,
    }),
  })(context);
  const result = await tool.execute(
    { source_campaign_id: source.id, new_name: `${source.name} · test copy`, new_ad_sets: tests },
    { runContext: context, toolCallId: 'capture_duplicate' },
  );
  const data = recordOf(recordOf(result).data ?? result);
  if (data.status !== 'proposed')
    throw new Error(`duplicate: ${JSON.stringify(result).slice(0, 400)}`);
  const versionId = String(data.scaffold_version_id);
  const structure = frames.find((frame) => frame.type === 'paid.campaign_structure');
  const parsed = campaignStructurePayloadSchema.safeParse(structure?.data);
  if (!parsed.success) throw new Error('duplicate: no parseable structure frame');
  const rows = local.rows<Row>(
    `select * from brand_profiles.paid_scaffold_nodes where version_id = '${versionId}' order by path_key`,
  );
  const version = local.rows<Row>(
    `select id, scaffold_id, brand_id, version, content_hash, lifecycle, manifest from brand_profiles.paid_scaffold_versions where id = '${versionId}'`,
  )[0];
  const parts = toParts(frames);
  writeFileSync(
    join(OUT, 'duplicate-test-adsets.json'),
    `${JSON.stringify(
      scrub({
        capturedAt: new Date().toISOString(),
        source: 'live-read+local-postgres',
        sourceCampaign: { id: source.id, name: source.name },
        toolResult: data,
        frames,
        parts,
        rows,
        version,
      }),
      null,
      2,
    )}\n`,
  );
  console.log(
    `(b) duplicate: ${rows.length} rows; diff ${parsed.data.diff?.entries.length} entries: ${JSON.stringify(
      parsed.data.diff?.entries.map((entry: Row) => `${entry.path_key}:${entry.change}`),
    )}`,
  );
} finally {
  local.stop();
}
console.log(`network: ${gets} GETs, ${refusedWrites} writes refused (must be 0)`);
if (refusedWrites > 0) process.exit(1);
