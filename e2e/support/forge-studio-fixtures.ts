import { randomUUID } from 'node:crypto';
import {
  type ApiRenderBatchPreflightRequest,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateLayout,
  apiRenderBatchPreflightRequestSchema,
  apiRenderBatchPreflightResponseSchema,
  apiRenderBatchSchema,
  apiRenderCreateDeliveryDestinationRequestSchema,
  apiRenderCreateJobRequestSchema,
  apiRenderDeliveryDestinationSchema,
  apiRenderDeliveryDestinationsResponseSchema,
  apiRenderEnvironmentListResponseSchema,
  apiRenderInputSetListResponseSchema,
  apiRenderJobListQuerySchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderPreflightRequestSchema,
  apiRenderPreflightResponseSchema,
  apiRenderSlackChannelListResponseSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
  apiRenderTemplateSummarySchema,
  createForgeRenderSetRequestSchema,
  type ForgeRenderSet,
  type ForgeRenderSetRow,
  forgeLineageViewSchema,
  forgeRenderSetListResponseSchema,
  forgeRenderSetSchema,
  paidCanvasTargetSearchRequestSchema,
  paidCanvasTargetSearchResponseSchema,
  renameTemplateSourceRequestSchema,
  renderWorkspaceSchema,
  type TemplateParse,
  type TemplateSource,
  type TemplateSourceSummary,
  templateDisplayName,
  templateSourceSchema,
  templateSourceSummarySchema,
  updateForgeRenderSetRequestSchema,
  workspaceTemplateSchema,
} from '@continuum/contracts';
import type { BrowserContext, Route } from '@playwright/test';
import type { ZodType } from 'zod';
import type { TemplateVariablesResponse } from '@/lib/library/templateSources';

// Typed fixtures for `forge:studio:e2e:bench` — a stateful fake of every `/api/ai-studio/**`
// route Forge Studio calls, answered in the browser with `context.route`.
//
// Every response body goes through the REAL `@continuum/contracts` schema before it is sent, and
// every request body the page sends is parsed by the real request schema. A contract that drifts
// under the Frontend fails here, loudly, as a `violation` — the bench asserts there are none.
//
// What this does NOT prove: the Fastify backend, the render fleet, Slack and Meta. Those are the
// LIVE mode's job. What it does prove: the real browser, the real minted session, the server-
// rendered brand context, and every Forge Studio component against contract-valid data.

export const STARCRAFT_BRAND_ID = 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';

const BINDING_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const WORKSPACE_ID = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const PROMO_ASSET_ID = '7a1e4c2b-3d5f-4a6b-9c8d-0e1f2a3b4c5d';
const PROMO_VERSION_ID = '8b2f5d3c-4e6a-4b7c-8d9e-1f2a3b4c5d6e';
/** A Library upload whose filename is nothing but a uuid — what every real upload is called. */
const DRAFT_ASSET_ID = 'c0ffee12-3456-4789-abcd-ef0123456789';
const DRAFT_VERSION_ID = 'd1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6';
const SET_ID = '3c4d5e6f-7081-4923-8a4b-5c6d7e8f9012';
const SLACK_DESTINATION_ID = '4d5e6f70-8192-4a34-9b5c-6d7e8f901234';
const AD_ACCOUNT_ID = 'act_1029384756';

const PROMO_TEMPLATE_KEY = 'sc_promo_v1';
const ZERG_TEMPLATE_KEY = 'zerg_rush_teaser';

export const FORGE_FIXTURE = {
  brandId: STARCRAFT_BRAND_ID,
  promo: {
    assetId: PROMO_ASSET_ID,
    templateKey: PROMO_TEMPLATE_KEY,
    title: 'StarCraft Promo',
    compName: 'Square 1080',
  },
  /** Built as `[DRAFT/agent] terran_dropship_launch`; its upload's filename is a bare uuid. */
  draft: {
    assetId: DRAFT_ASSET_ID,
    filename: `${DRAFT_ASSET_ID}.aep`,
    displayName: 'Terran dropship launch',
  },
  shared: { templateKey: ZERG_TEMPLATE_KEY, displayName: 'Zerg rush teaser' },
  set: {
    id: SET_ID,
    name: 'Launch week',
    /** Row labels, root → fork. Max depth used: 2 (`Launch · B · B`). */
    rows: {
      root: 'Root',
      rootFork: 'Root · B',
      launch: 'Launch',
      launchFork: 'Launch · B',
      launchGrandFork: 'Launch · B · B',
      solo: 'Solo',
    },
  },
  variables: {
    headline: 'Headline',
    tagline: 'Tagline',
    price: 'Price',
    accent: 'Accent colour',
    hero: 'Hero image',
  },
  outputs: { square: 'Square', story: 'Story' },
  slack: { destinationId: SLACK_DESTINATION_ID, channelName: 'forge-renders' },
  meta: {
    adAccountId: AD_ACCOUNT_ID,
    adAccountName: 'StarCraft Ads',
    campaign: { id: '120210000000000001', name: 'Koprulu Launch' },
    adset: { id: '120210000000000002', name: 'Protoss fans' },
    ad: { id: '120210000000000003', name: 'Carrier has arrived', creativeId: '120210000000000009' },
  },
  jobs: { deliveredLabel: 'Root', zergGroup: 'Zerg rush teaser' },
} as const;

// A 1×1 PNG, so every render output is a real image the browser decodes rather than a broken link.
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhAG/7Z0t0QAAAABJRU5ErkJggg==';

const SQUARE_COMP = FORGE_FIXTURE.promo.compName;
const STORY_COMP = 'Story 1080x1920';

const squareLayout: ApiRenderTemplateLayout = {
  comp: { name: SQUARE_COMP, width: 1080, height: 1080 },
  boxes: [
    { key: 'headline', label: 'Headline', box: [80, 90, 1000, 330], role: 'name', kind: 'text' },
    { key: 'tagline', label: 'Tagline', box: [80, 350, 1000, 450], role: null, kind: 'text' },
    { key: 'hero', label: 'Hero image', box: [80, 470, 1000, 940], role: null, kind: 'image' },
    { key: 'accent', label: 'Accent colour', box: [0, 960, 1080, 1080], role: null, kind: 'color' },
  ],
};

const storyLayout: ApiRenderTemplateLayout = {
  comp: { name: STORY_COMP, width: 1080, height: 1920 },
  boxes: [
    { key: 'headline', label: 'Headline', box: [80, 160, 1000, 520], role: 'name', kind: 'text' },
    { key: 'hero', label: 'Hero image', box: [80, 600, 1000, 1700], role: null, kind: 'image' },
  ],
};

/**
 * The long comp names and binding path are deliberate: the variable editor's cut-off (D5) came
 * from an After Effects binding line setting a table column's width.
 */
const LONG_COMP = 'MASTER_Square_1080_FINAL_v7_render_this_one_not_the_other_one';
const bindingKey = (layer: string) =>
  `comp:${LONG_COMP} › layer:${layer}_TEXT_LAYER_WITH_A_DESIGNER_NAME_NOBODY_SHORTENED › property:Source Text`;

const contractVariables = [
  {
    key: 'headline',
    label: 'Headline',
    kind: 'text',
    required: true,
    charBudget: 28,
    sample: 'Build your army',
    comps: [SQUARE_COMP, STORY_COMP],
  },
  {
    key: 'tagline',
    label: 'Tagline',
    kind: 'text',
    required: false,
    sample: 'In the Koprulu sector',
  },
  { key: 'price', label: 'Price', kind: 'number', required: false, sample: '19.99' },
  { key: 'accent', label: 'Accent colour', kind: 'color', required: false, sample: '#1e90ff' },
  { key: 'hero', label: 'Hero image', kind: 'image', required: false },
  { key: 'watermark_logo', label: 'Brand logo', kind: 'image', required: true, reserved: true },
] as const;

function promoContract(displayName: string | null): ApiRenderTemplateContract {
  return apiRenderTemplateContractSchema.parse({
    template: promoSummary(displayName),
    variables: contractVariables,
    fonts: [{ family: 'HeadingNow-36CompBold', layers: 2, held: true }],
    layout: squareLayout,
    outputs: [
      { id: 'square', label: 'Square', ratio: '1:1', layout: squareLayout },
      { id: 'story', label: 'Story', ratio: '9:16', layout: storyLayout },
    ],
  });
}

function promoSummary(displayName: string | null) {
  return apiRenderTemplateSummarySchema.parse({
    key: PROMO_TEMPLATE_KEY,
    name: PROMO_TEMPLATE_KEY,
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'sc-promo-v1-contract-hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: contractVariables.length,
    previewUrl: null,
    updatedAt: '2026-09-14T09:00:00.000Z',
    ratios: ['1:1', '9:16'],
    sourceAssetId: PROMO_ASSET_ID,
    fontsMissing: 0,
    displayName,
  });
}

function parseFor(filename: string): TemplateParse {
  const instance = (comp: string, box: number[], size: number[]) => ({
    compId: comp === SQUARE_COMP ? 1 : 2,
    comp,
    layerId: 3,
    box,
    compSize: size,
  });
  return {
    parser: 'py_aep',
    sourceFamily: 'after_effects',
    appVersion: '25.2',
    filename,
    comps: [
      {
        name: SQUARE_COMP,
        width: 1080,
        height: 1080,
        layerCount: 14,
        isTop: true,
        isDelivery: true,
      },
      {
        name: STORY_COMP,
        width: 1080,
        height: 1920,
        layerCount: 14,
        isTop: true,
        isDelivery: true,
      },
    ],
    ratios: [
      { ratio: '1:1', width: 1080, height: 1080, comps: [SQUARE_COMP] },
      { ratio: '9:16', width: 1080, height: 1920, comps: [STORY_COMP] },
    ],
    slots: squareLayout.boxes.map((box) => ({
      key: box.key,
      name: box.label,
      kind: box.kind ?? 'text',
      origin: 'essential' as const,
      driver: 'static' as const,
      comps: [SQUARE_COMP, STORY_COMP],
      layerIds: [3],
      instances: [
        instance(SQUARE_COMP, [...box.box], [1080, 1080]),
        ...storyLayout.boxes
          .filter((story) => story.key === box.key)
          .map((story) => instance(STORY_COMP, [...story.box], [1080, 1920])),
      ],
    })),
    fonts: [{ family: 'HeadingNow-36CompBold', layers: 2 }],
    staticText: [],
    warnings: [],
  };
}

function templateSources(state: FixtureState): TemplateSource[] {
  return [
    {
      assetId: PROMO_ASSET_ID,
      versionId: PROMO_VERSION_ID,
      family: 'after_effects',
      parseState: 'parsed',
      parse: parseFor(`${PROMO_ASSET_ID}.aep`),
      fonts: ['HeadingNow-36CompBold'],
      ratios: ['1:1', '9:16'],
      slotCount: 5,
      forgeRunId: 'run_sc_promo_v1',
      forgeState: 'published',
      templateKey: PROMO_TEMPLATE_KEY,
      displayName: state.promoTitle,
      createdAt: '2026-09-10T09:00:00.000Z',
      updatedAt: '2026-09-14T09:00:00.000Z',
    },
    {
      assetId: DRAFT_ASSET_ID,
      versionId: DRAFT_VERSION_ID,
      family: 'after_effects',
      parseState: 'parsed',
      parse: parseFor(FORGE_FIXTURE.draft.filename),
      fonts: ['HeadingNow-36CompBold'],
      ratios: ['1:1', '9:16'],
      slotCount: 5,
      forgeRunId: 'run_terran_dropship',
      forgeState: 'draft_ready',
      templateKey: null,
      displayName: null,
      createdAt: '2026-09-12T09:00:00.000Z',
      updatedAt: '2026-09-13T09:00:00.000Z',
    },
  ].map((source) => templateSourceSchema.parse({ brandId: STARCRAFT_BRAND_ID, ...source }));
}

function templateSourceSummaries(state: FixtureState): TemplateSourceSummary[] {
  return templateSources(state).map((source) =>
    templateSourceSummarySchema.parse({
      ...source,
      parse: source.parse
        ? {
            parser: source.parse.parser,
            sourceFamily: source.parse.sourceFamily,
            filename: source.parse.filename,
            comps: source.parse.comps.map(({ name, width, height, durationSec, isDelivery }) => ({
              name,
              width,
              height,
              durationSec,
              isDelivery,
            })),
            ratios: source.parse.ratios,
            slots: source.parse.slots.map(({ key, kind, comps, box, placement, instances }) => ({
              key,
              kind,
              comps,
              box,
              placement,
              instances,
            })),
          }
        : null,
    }),
  );
}

function variablesResponse(): TemplateVariablesResponse {
  return {
    parseState: 'parsed',
    edits: [
      {
        assetId: PROMO_ASSET_ID,
        slotKey: bindingKey('HEADLINE'),
        kind: 'text',
        defaultValue: 'Build your army',
        updatedAt: '2026-09-14T09:00:00.000Z',
      },
    ],
    variables: squareLayout.boxes.map((box, index) => ({
      key: bindingKey(box.key.toUpperCase()),
      label: box.label,
      kind: box.kind ?? 'text',
      required: index === 0,
      multiple: false,
      accept: [],
      options: [],
      description:
        index === 0
          ? 'The big line across the top of every format. The designer composed it for three short words and it shrinks to fit anything longer, down to a floor.'
          : null,
      reserved: false,
      role: box.role,
      roleSource: box.role ? 'human' : null,
      charBudget: box.kind === 'text' ? 28 : null,
      comps: [LONG_COMP, `${LONG_COMP}_STORY_9x16`, `${LONG_COMP}_PORTRAIT_4x5`],
      sample: box.kind === 'text' ? 'Build your army' : null,
      placement: null,
    })),
  };
}

function setRows(): ForgeRenderSetRow[] {
  const id = () => randomUUID();
  const labels = FORGE_FIXTURE.set.rows;
  const root = id();
  const launch = id();
  const launchFork = id();
  const all = ['square', 'story'];
  return [
    {
      id: root,
      parentId: null,
      label: labels.root,
      overrides: { headline: 'Build your army', price: 19.99, accent: '#1e90ff' },
      clearedKeys: [],
      outputIds: all,
    },
    {
      id: id(),
      parentId: root,
      label: labels.rootFork,
      overrides: { headline: 'Build more pylons' },
      clearedKeys: [],
      outputIds: [],
    },
    {
      id: launch,
      parentId: null,
      label: labels.launch,
      overrides: { headline: 'Launch day', price: 9.99, accent: '#ff4500' },
      clearedKeys: [],
      outputIds: all,
    },
    {
      id: launchFork,
      parentId: launch,
      label: labels.launchFork,
      overrides: {},
      clearedKeys: [],
      outputIds: [],
    },
    {
      id: id(),
      parentId: launchFork,
      label: labels.launchGrandFork,
      overrides: {},
      clearedKeys: [],
      outputIds: [],
    },
    {
      id: id(),
      parentId: null,
      label: labels.solo,
      overrides: { headline: 'Solo queue' },
      clearedKeys: [],
      outputIds: all,
    },
  ];
}

function job(overrides: Partial<ApiRenderJob> & Pick<ApiRenderJob, 'templateKey'>): ApiRenderJob {
  const createdAt = overrides.createdAt ?? '2026-09-14T10:00:00.000Z';
  return apiRenderJobSchema.parse({
    id: randomUUID(),
    brandId: STARCRAFT_BRAND_ID,
    templateName:
      overrides.templateKey === PROMO_TEMPLATE_KEY
        ? FORGE_FIXTURE.promo.title
        : overrides.templateKey === ZERG_TEMPLATE_KEY
          ? FORGE_FIXTURE.shared.displayName
          : overrides.templateKey,
    contractHash: 'sc-promo-v1-contract-hash',
    taskUid: `task_${randomUUID().slice(0, 8)}`,
    status: 'finished',
    outputs: [],
    delivery: [],
    error: null,
    updatedAt: createdAt,
    renderSetId: SET_ID,
    renderSetName: FORGE_FIXTURE.set.name,
    ...overrides,
    createdAt,
  });
}

const output = (id: string, withAsset: boolean) => ({
  id,
  kind: 'image' as const,
  fileName: `${id}_1080x1080.png`,
  mimeType: 'image/png',
  url: PIXEL_PNG,
  width: 1080,
  height: 1080,
  assetId: withAsset ? randomUUID() : null,
  versionId: withAsset ? randomUUID() : null,
});

/** Two templates, five jobs: one delivered to Slack and parked for Meta approval. */
function seededJobs(): ApiRenderJob[] {
  const { meta, slack, jobs } = FORGE_FIXTURE;
  return [
    job({
      templateKey: PROMO_TEMPLATE_KEY,
      label: jobs.deliveredLabel,
      labelPath: [jobs.deliveredLabel],
      createdAt: '2026-09-14T10:05:00.000Z',
      updatedAt: '2026-09-14T10:07:10.000Z',
      outputs: [output('square', true)],
      slackDelivery: {
        destinationId: slack.destinationId,
        channelName: slack.channelName,
        status: 'posted',
        permalink: 'https://continuum.slack.com/archives/C0FORGE01/p1757844430000100',
        postedAt: '2026-09-14T10:07:20.000Z',
      },
      deliveryTarget: {
        action: 'replace',
        adAccountId: meta.adAccountId,
        adAccountName: meta.adAccountName,
        campaignId: meta.campaign.id,
        campaignName: meta.campaign.name,
        adsetId: meta.adset.id,
        adsetName: meta.adset.name,
        adId: meta.ad.id,
        adName: meta.ad.name,
        adStatus: 'PAUSED',
      },
      approval: { status: 'pending', decidedAt: null },
    }),
    job({
      templateKey: PROMO_TEMPLATE_KEY,
      label: 'Launch',
      labelPath: ['Launch'],
      createdAt: '2026-09-14T10:04:00.000Z',
      outputs: [output('square', true), output('story', true)],
    }),
    job({
      templateKey: PROMO_TEMPLATE_KEY,
      status: 'rendering',
      label: 'Launch · B',
      labelPath: ['Launch', 'Launch · B'],
      createdAt: '2026-09-14T10:03:00.000Z',
    }),
    job({
      templateKey: ZERG_TEMPLATE_KEY,
      label: 'Hatchery',
      labelPath: ['Hatchery'],
      createdAt: '2026-09-13T18:00:00.000Z',
      outputs: [output('square', true)],
      renderSetName: 'Zerg teaser',
    }),
    job({
      templateKey: ZERG_TEMPLATE_KEY,
      status: 'failed',
      label: 'Spawning pool',
      labelPath: ['Spawning pool'],
      createdAt: '2026-09-13T17:00:00.000Z',
      error: 'Render fleet timed out',
      renderSetName: 'Zerg teaser',
    }),
  ];
}

export type FixtureMeta = 'connected' | 'not_connected';

export type FixtureState = {
  promoTitle: string;
  meta: FixtureMeta;
  /** Held before a single-row preflight answers, so a response can land mid-typing (D7). */
  preflightDelayMs: number;
  sets: ForgeRenderSet[];
  jobs: ApiRenderJob[];
  lastBatchPreflight: ApiRenderBatchPreflightRequest | null;
};

export type RecordedRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  at: number;
};

export type ForgeFixtures = {
  state: FixtureState;
  requests: RecordedRequest[];
  /** `Date.now()` at the moment each single-row preflight response was sent. */
  preflightAnsweredAt: number[];
  /** Routes the page called that no fixture answers — printed, never silently 200'd. */
  unhandled: string[];
  /** Request or response bodies the real contract refused. The bench requires none. */
  violations: string[];
  /** Every brand id a request carried. The bench requires exactly StarCraft. */
  brandIds: Set<string>;
  calls: (method: string, path: RegExp) => RecordedRequest[];
};

type Reply = { status: number; body?: unknown };
type Handler = (input: {
  match: RegExpMatchArray;
  query: Record<string, string>;
  body: unknown;
  fixtures: ForgeFixtures;
}) => Reply | Promise<Reply>;

const ok = (body: unknown): Reply => ({ status: 200, body });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse with the real contract; a refusal is recorded and answered 400, never papered over. */
function checked<T>(
  fixtures: ForgeFixtures,
  label: string,
  schema: ZodType<T>,
  value: unknown,
): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  fixtures.violations.push(`${label}: ${result.error.message}`);
  return null;
}

const refused = (label: string): Reply => ({ status: 400, body: { error: `${label}_refused` } });

const ROUTES: Array<[method: string, path: RegExp, handler: Handler]> = [
  // --- Templates tab ----------------------------------------------------------------------
  [
    'GET',
    /^\/api\/ai-studio\/templates$/,
    ({ fixtures }) => ok({ items: templateSourceSummaries(fixtures.state) }),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/templates\/workspaces$/,
    () =>
      ok({
        items: [
          renderWorkspaceSchema.parse({
            id: WORKSPACE_ID,
            picinst: 'Continuum_app',
            environmentKey: 'prod',
            clientKey: 'starcraft_b17d81',
            isDefault: true,
          }),
        ],
      }),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/templates\/discover$/,
    () =>
      ok({
        workspace: renderWorkspaceSchema.parse({
          id: WORKSPACE_ID,
          picinst: 'Continuum_app',
          environmentKey: 'prod',
          clientKey: 'starcraft_b17d81',
          isDefault: true,
        }),
        items: [
          {
            templateKey: 'terran_dropship_launch',
            templateId: 131,
            name: '[DRAFT/agent] terran_dropship_launch',
            rootTable: 'tpl_starcraft_b17d81_terran_dropship_launch_root',
            granted: false,
            sourceAssetId: DRAFT_ASSET_ID,
            draft: true,
          },
          {
            templateKey: ZERG_TEMPLATE_KEY,
            templateId: 132,
            name: ZERG_TEMPLATE_KEY,
            rootTable: 'tpl_starcraft_b17d81_zerg_rush_teaser_root',
            updatedAt: '2026-09-11T09:00:00.000Z',
            granted: true,
            draft: false,
          },
        ].map((item) => workspaceTemplateSchema.parse(item)),
      }),
  ],
  [
    'PATCH',
    /^\/api\/ai-studio\/templates\/([0-9a-f-]{36})$/,
    ({ match, body, fixtures }) => {
      const request = checked(fixtures, 'rename', renameTemplateSourceRequestSchema, body);
      if (!request) return refused('rename');
      if (match[1] !== PROMO_ASSET_ID)
        return { status: 404, body: { error: 'template_not_found' } };
      fixtures.state.promoTitle = request.title;
      return ok(templateSources(fixtures.state)[0]);
    },
  ],
  ['GET', /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/variables$/, () => ok(variablesResponse())],
  ['PUT', /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/variables$/, () => ok({ saved: true })],
  ['GET', /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/run$/, () => ok({ run: null })],
  [
    'GET',
    /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/fonts$/,
    () =>
      ok({
        fonts: [{ family: 'HeadingNow-36CompBold', layers: 2, held: true }],
        missing: 0,
        parseState: 'parsed',
      }),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/templates\/[0-9a-f-]{36}\/lineage$/,
    () =>
      ok(
        forgeLineageViewSchema.parse({
          connected: false,
          known: false,
          master: null,
          currentMaster: null,
          pinnedToOlderMaster: false,
          roots: [],
          log: [],
          worktrees: [],
        }),
      ),
  ],
  ['GET', /^\/api\/ai-studio\/renders\/approvals$/, () => ok({ approvals: [] })],

  // --- Render tab ---------------------------------------------------------------------------
  [
    'GET',
    /^\/api\/ai-studio\/renders\/environments$/,
    () =>
      ok(
        apiRenderEnvironmentListResponseSchema.parse({
          items: [
            {
              bindingId: BINDING_ID,
              workspace: 'Continuum_app',
              environmentKey: 'prod',
              clientKey: 'starcraft_b17d81',
              isDefault: true,
              status: {
                workspace: 'Continuum_app',
                renderEligible: true,
                state: 'eligible',
                detail: 'Allowlisted on the render fleet.',
              },
            },
          ],
        }),
      ),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/templates$/,
    ({ fixtures }) =>
      ok(
        apiRenderTemplateListResponseSchema.parse({
          items: [promoSummary(fixtures.state.promoTitle)],
          nextCursor: null,
        }),
      ),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/templates\/([^/]+)\/contract$/,
    ({ match, fixtures }) =>
      decodeURIComponent(match[1] ?? '') === PROMO_TEMPLATE_KEY
        ? ok(promoContract(fixtures.state.promoTitle))
        : { status: 404, body: { error: 'render_template_not_found' } },
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/input-sets$/,
    () => ok(apiRenderInputSetListResponseSchema.parse({ items: [], nextCursor: null })),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/sets$/,
    ({ query, fixtures }) =>
      ok(
        forgeRenderSetListResponseSchema.parse({
          items: fixtures.state.sets.filter(
            (set) => !query.templateKey || set.templateKey === query.templateKey,
          ),
          nextCursor: null,
        }),
      ),
  ],
  [
    'POST',
    /^\/api\/ai-studio\/renders\/sets$/,
    ({ body, fixtures }) => {
      const request = checked(
        fixtures,
        'create render set',
        createForgeRenderSetRequestSchema,
        body,
      );
      if (!request) return refused('render_set');
      const now = new Date().toISOString();
      const created = forgeRenderSetSchema.parse({
        id: randomUUID(),
        brandId: request.brandId,
        bindingId: request.bindingId,
        name: request.name,
        templateKey: request.templateKey,
        contractHash: request.contractHash,
        revision: 1,
        rows: request.rows,
        createdAt: now,
        updatedAt: now,
      });
      fixtures.state.sets.unshift(created);
      return ok(created);
    },
  ],
  [
    'PUT',
    /^\/api\/ai-studio\/renders\/sets\/([0-9a-f-]{36})$/,
    ({ match, body, fixtures }) => {
      const request = checked(
        fixtures,
        'update render set',
        updateForgeRenderSetRequestSchema,
        body,
      );
      if (!request) return refused('render_set');
      const index = fixtures.state.sets.findIndex((set) => set.id === match[1]);
      const current = fixtures.state.sets[index];
      if (!current) return { status: 404, body: { error: 'render_set_not_found' } };
      if (current.revision !== request.expectedRevision) {
        return { status: 409, body: { error: 'render_set_revision_conflict' } };
      }
      const updated = forgeRenderSetSchema.parse({
        ...current,
        ...(request.name ? { name: request.name } : {}),
        ...(request.rows ? { rows: request.rows } : {}),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      fixtures.state.sets[index] = updated;
      return ok(updated);
    },
  ],
  [
    'POST',
    /^\/api\/ai-studio\/renders\/preflight$/,
    async ({ body, fixtures }) => {
      const request = checked(fixtures, 'preflight', apiRenderPreflightRequestSchema, body);
      if (!request) return refused('preflight');
      if (fixtures.state.preflightDelayMs > 0) await wait(fixtures.state.preflightDelayMs);
      fixtures.preflightAnsweredAt.push(Date.now());
      return ok(
        apiRenderPreflightResponseSchema.parse({
          confirmationToken: `confirm_${randomUUID()}`,
          confirmationHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          template: promoSummary(fixtures.state.promoTitle),
          target: null,
          inputKeys: Object.keys(request.variables ?? {}),
          effects: 'none',
        }),
      );
    },
  ],
  [
    'POST',
    /^\/api\/ai-studio\/renders\/batch-preflight$/,
    ({ body, fixtures }) => {
      const request = checked(
        fixtures,
        'batch preflight',
        apiRenderBatchPreflightRequestSchema,
        body,
      );
      if (!request) return refused('batch_preflight');
      fixtures.state.lastBatchPreflight = request;
      const rows = request.records.length;
      return ok(
        apiRenderBatchPreflightResponseSchema.parse({
          batchId: randomUUID(),
          confirmationToken: `batch_${randomUUID()}`,
          confirmationHash: 'b'.repeat(64),
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          template: promoSummary(fixtures.state.promoTitle),
          target: null,
          records: request.records.map((record) => ({
            label: record.label ?? 'Untitled',
            inputKeys: Object.keys(record.variables ?? {}),
          })),
          readiness: {
            state: 'READY',
            totalRows: rows,
            readyRows: rows,
            blockedRows: 0,
            unknownRows: 0,
            findings: [],
          },
          effects: 'none',
        }),
      );
    },
  ],
  [
    'POST',
    /^\/api\/ai-studio\/renders\/batches$/,
    ({ body, fixtures }) => {
      if (!checked(fixtures, 'create batch', apiRenderCreateJobRequestSchema, body)) {
        return refused('batch');
      }
      const preflight = fixtures.state.lastBatchPreflight;
      if (!preflight) return { status: 409, body: { error: 'render_confirmation_missing' } };
      const destination = preflight.slack ? FORGE_FIXTURE.slack : null;
      const jobs = preflight.records.map((record) =>
        job({
          templateKey: preflight.templateKey,
          status: 'queued',
          label: record.label ?? null,
          labelPath: record.label ? [record.label] : [],
          renderSetId: record.renderSetId ?? null,
          renderSetRowId: record.renderSetRowId ?? null,
          createdAt: new Date().toISOString(),
          deliveryTarget: record.delivery ?? preflight.delivery ?? null,
          slackDelivery: destination
            ? {
                destinationId: destination.destinationId,
                channelName: destination.channelName,
                status: 'pending',
              }
            : null,
        }),
      );
      fixtures.state.jobs.unshift(...jobs);
      return { status: 202, body: apiRenderBatchSchema.parse({ batchId: randomUUID(), jobs }) };
    },
  ],

  // --- Delivery -----------------------------------------------------------------------------
  [
    'GET',
    /^\/api\/ai-studio\/renders\/destinations$/,
    ({ fixtures }) =>
      ok(
        apiRenderDeliveryDestinationsResponseSchema.parse({
          slack: {
            state: 'ready',
            workspaceName: 'Continuum',
            destinations: [
              {
                id: SLACK_DESTINATION_ID,
                role: 'ops',
                channelId: 'C0FORGE01',
                channelName: FORGE_FIXTURE.slack.channelName,
              },
            ],
          },
          meta:
            fixtures.state.meta === 'connected'
              ? {
                  connected: true,
                  adAccountId: AD_ACCOUNT_ID,
                  adAccountName: FORGE_FIXTURE.meta.adAccountName,
                }
              : { connected: false, adAccountId: null, adAccountName: null },
        }),
      ),
  ],
  [
    'POST',
    /^\/api\/ai-studio\/renders\/destinations$/,
    ({ body, fixtures }) => {
      const request = checked(
        fixtures,
        'create destination',
        apiRenderCreateDeliveryDestinationRequestSchema,
        body,
      );
      if (!request) return refused('destination');
      return ok(
        apiRenderDeliveryDestinationSchema.parse({
          id: randomUUID(),
          role: request.role,
          channelId: request.channelId,
          channelName: 'zerg-approvals',
        }),
      );
    },
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/destinations\/slack-channels$/,
    () =>
      ok(
        apiRenderSlackChannelListResponseSchema.parse({
          workspaceName: 'Continuum',
          channels: [
            { id: 'C0FORGE01', name: 'forge-renders', isPrivate: false, isMember: true },
            { id: 'C0ZERG002', name: 'zerg-approvals', isPrivate: true, isMember: true },
          ],
        }),
      ),
  ],
  [
    'GET',
    /^\/api\/ai-studio\/publishing\/paid\/targets$/,
    ({ query, fixtures }) => {
      const request = checked(fixtures, 'paid targets', paidCanvasTargetSearchRequestSchema, query);
      if (!request) return refused('paid_targets');
      if (fixtures.state.meta !== 'connected') {
        return { status: 404, body: { error: 'meta_ad_account_not_found' } };
      }
      const { campaign, adset, ad } = FORGE_FIXTURE.meta;
      const base = {
        status: 'ACTIVE',
        campaignId: null,
        campaignName: null,
        adsetId: null,
        adsetName: null,
        creativeId: null,
        format: null,
        previewUrl: null,
      };
      const items =
        request.level === 'campaign'
          ? [{ ...base, id: campaign.id, level: 'campaign', name: campaign.name }]
          : request.level === 'adset'
            ? request.parentId === campaign.id
              ? [
                  {
                    ...base,
                    id: adset.id,
                    level: 'adset',
                    name: adset.name,
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                  },
                ]
              : []
            : !request.parentId || request.parentId === adset.id
              ? [
                  {
                    ...base,
                    id: ad.id,
                    level: 'ad',
                    name: ad.name,
                    status: 'PAUSED',
                    campaignId: campaign.id,
                    campaignName: campaign.name,
                    adsetId: adset.id,
                    adsetName: adset.name,
                    creativeId: ad.creativeId,
                    format: 'image',
                  },
                ]
              : [];
      return ok(
        paidCanvasTargetSearchResponseSchema.parse({
          adAccountId: AD_ACCOUNT_ID,
          items,
          nextCursor: null,
        }),
      );
    },
  ],

  // --- Renders tab ---------------------------------------------------------------------------
  [
    'GET',
    /^\/api\/ai-studio\/renders\/jobs$/,
    ({ query, fixtures }) => {
      const request = checked(fixtures, 'jobs query', apiRenderJobListQuerySchema, query);
      if (!request) return refused('jobs');
      const items = fixtures.state.jobs
        .filter((item) => !request.templateKey || item.templateKey === request.templateKey)
        .filter((item) => !request.renderSetId || item.renderSetId === request.renderSetId)
        .slice(0, request.limit);
      return ok(apiRenderJobListResponseSchema.parse({ items, nextCursor: null }));
    },
  ],
  [
    'GET',
    /^\/api\/ai-studio\/renders\/jobs\/([0-9a-f-]{36})$/,
    ({ match, fixtures }) => {
      const found = fixtures.state.jobs.find((item) => item.id === match[1]);
      return found
        ? ok(apiRenderJobSchema.parse(found))
        : { status: 404, body: { error: 'render_job_not_found' } };
    },
  ],
];

function brandIdsOf(query: Record<string, string>, body: unknown): string[] {
  const fromBody =
    body && typeof body === 'object' && 'brandId' in body && typeof body.brandId === 'string'
      ? [body.brandId]
      : [];
  return [...(query.brandId ? [query.brandId] : []), ...fromBody];
}

/**
 * Answers every `/api/ai-studio/**` request in this context from the fixtures. Cross-origin (the
 * backend URL is a dead port in fixtures mode), so each reply carries the CORS headers a real
 * Fastify would — without them the browser would refuse the stub the same way it refuses a
 * misconfigured backend.
 */
export async function installForgeFixtures(
  context: BrowserContext,
  options: { meta?: FixtureMeta; preflightDelayMs?: number } = {},
): Promise<ForgeFixtures> {
  const fixtures: ForgeFixtures = {
    state: {
      promoTitle: FORGE_FIXTURE.promo.title,
      meta: options.meta ?? 'not_connected',
      preflightDelayMs: options.preflightDelayMs ?? 0,
      sets: [
        forgeRenderSetSchema.parse({
          id: SET_ID,
          brandId: STARCRAFT_BRAND_ID,
          bindingId: BINDING_ID,
          name: FORGE_FIXTURE.set.name,
          templateKey: PROMO_TEMPLATE_KEY,
          contractHash: 'sc-promo-v1-contract-hash',
          revision: 3,
          rows: setRows(),
          createdAt: '2026-09-12T09:00:00.000Z',
          updatedAt: '2026-09-14T09:00:00.000Z',
        }),
      ],
      jobs: seededJobs(),
      lastBatchPreflight: null,
    },
    requests: [],
    preflightAnsweredAt: [],
    unhandled: [],
    violations: [],
    brandIds: new Set(),
    calls: (method, path) =>
      fixtures.requests.filter((request) => request.method === method && path.test(request.path)),
  };

  await context.route(
    (url) => url.pathname.startsWith('/api/ai-studio/'),
    async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const origin = (await request.headerValue('origin')) ?? '*';
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Content-Type, Authorization, Accept',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      };
      const method = request.method();
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }

      const query = Object.fromEntries(url.searchParams.entries());
      let body: unknown = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
      fixtures.requests.push({ method, path: url.pathname, query, body, at: Date.now() });
      for (const brandId of brandIdsOf(query, body)) fixtures.brandIds.add(brandId);

      const entry = ROUTES.find(
        ([routeMethod, pattern]) => routeMethod === method && pattern.test(url.pathname),
      );
      const match = entry ? url.pathname.match(entry[1]) : null;
      let reply: Reply;
      if (!entry || !match) {
        fixtures.unhandled.push(`${method} ${url.pathname}`);
        reply = { status: 404, body: { error: 'fixture_route_missing' } };
      } else {
        try {
          reply = await entry[2]({ match, query, body, fixtures });
        } catch (error) {
          // A fixture that no longer satisfies its own contract is drift too.
          fixtures.violations.push(
            `${method} ${url.pathname} fixture: ${error instanceof Error ? error.message : String(error)}`,
          );
          reply = { status: 500, body: { error: 'fixture_contract_drift' } };
        }
      }
      await route.fulfill({
        status: reply.status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: reply.body === undefined ? '' : JSON.stringify(reply.body),
      });
    },
  );

  return fixtures;
}
