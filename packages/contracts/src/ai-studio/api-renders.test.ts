import { describe, expect, it } from 'bun:test';
import {
  API_RENDER_DESTINATIONS_ROUTE,
  API_RENDER_MEDIA_LIST_MAX,
  apiRenderApprovalSummarySchema,
  apiRenderBatchPreflightRequestSchema,
  apiRenderBatchPreflightResponseSchema,
  apiRenderCreateDeliveryDestinationRequestSchema,
  apiRenderDeliveryDestinationsResponseSchema,
  apiRenderDeliveryTargetSchema,
  apiRenderDestinationRoute,
  apiRenderJobListQuerySchema,
  apiRenderJobSchema,
  apiRenderPreflightRequestSchema,
  apiRenderPreflightResponseSchema,
  apiRenderSlackChannelListResponseSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateSummarySchema,
  apiRenderVariableKeySchema,
  compactEncodeBlock,
  encodeContainerOf,
  encodeSettingsSchema,
  mergeEncodeSettings,
  WATERMARK_LOGO_VARIABLE_KEY,
} from './api-renders';
import {
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  isValidConnection,
} from './workflow-graph';

describe('API render contracts', () => {
  it('accepts stable public aliases and version-pinned image inputs', () => {
    const request = apiRenderPreflightRequestSchema.parse({
      brandId: '00000000-0000-4000-8000-000000000001',
      templateKey: 'vivo-hero',
      contractHash: 'contract-1',
      variables: {
        hero_image: {
          assetId: '00000000-0000-4000-8000-000000000002',
          versionId: '00000000-0000-4000-8000-000000000003',
        },
      },
      delivery: {
        adAccountId: '123',
        campaignId: '456',
        adsetId: '789',
      },
    });

    expect(request.variables.hero_image).toEqual({
      assetId: '00000000-0000-4000-8000-000000000002',
      versionId: '00000000-0000-4000-8000-000000000003',
    });
  });

  it('refuses physical render field names in the public contract', () => {
    const result = apiRenderTemplateContractSchema.safeParse({
      template: {
        key: 'vivo-hero',
        name: 'Vivo Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Parsed_app',
        contractVersion: '1',
        contractHash: 'hash',
        contractSource: 'legacy_reflection',
        outputKinds: ['image'],
        variableCount: 1,
        previewUrl: null,
        updatedAt: null,
      },
      variables: [
        {
          key: 'f_deadbeef',
          label: 'Hero image',
          kind: 'image',
          required: true,
          multiple: false,
          accept: ['image/*'],
          options: [],
          description: null,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  // The reserved key is the whole handshake with template-forge. If this string
  // drifts, a template's watermark slot silently becomes an ordinary caller input
  // that nobody fills — a render with a blank logo, not an error.
  it('names the reserved watermark key as a legal public variable key', () => {
    expect(WATERMARK_LOGO_VARIABLE_KEY).toBe('watermark_logo');
    expect(apiRenderVariableKeySchema.safeParse(WATERMARK_LOGO_VARIABLE_KEY).success).toBe(true);
  });

  it('reads a variable from a server too old to mark reserved as caller-supplied', () => {
    const contract = apiRenderTemplateContractSchema.parse({
      template: {
        key: 'vivo-hero',
        name: 'Vivo Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Parsed_app',
        contractVersion: '1',
        contractHash: 'hash',
        contractSource: 'legacy_reflection',
        outputKinds: ['image'],
        variableCount: 1,
        previewUrl: null,
        updatedAt: null,
      },
      variables: [
        {
          key: 'hero_image',
          label: 'Hero image',
          kind: 'image',
          required: true,
          multiple: false,
          accept: ['image/*'],
          options: [],
          description: null,
        },
      ],
    });
    // Defaulting to false is the safe direction: an unknown variable is one the
    // caller must fill, never one a client silently hides from the user.
    expect(contract.variables[0]?.reserved).toBe(false);
  });

  it('carries the frozen watermark pin, and defaults it to null on an older response', () => {
    const base = {
      confirmationToken: 'token',
      confirmationHash: 'a'.repeat(64),
      expiresAt: '2026-08-24T10:00:00.000Z',
      template: {
        key: 'vivo-hero',
        name: 'Vivo Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Parsed_app',
        contractVersion: '1',
        contractHash: 'hash',
        contractSource: 'legacy_reflection' as const,
        outputKinds: ['image' as const],
        variableCount: 1,
        previewUrl: null,
        updatedAt: null,
      },
      target: null,
      inputKeys: ['watermark_logo'],
      effects: 'none' as const,
    };

    expect(apiRenderPreflightResponseSchema.parse(base).watermarkLogo).toBeNull();

    const pinned = apiRenderPreflightResponseSchema.parse({
      ...base,
      watermarkLogo: {
        assetId: '00000000-0000-4000-8000-000000000004',
        versionId: '00000000-0000-4000-8000-000000000005',
      },
    });
    expect(pinned.watermarkLogo).toEqual({
      assetId: '00000000-0000-4000-8000-000000000004',
      versionId: '00000000-0000-4000-8000-000000000005',
    });
  });

  // A URL in the pin slot is the exact failure this feature exists to prevent: it
  // parses as "a value was frozen" while being a thing that expires.
  it('refuses a URL where the watermark pin belongs', () => {
    const result = apiRenderPreflightResponseSchema.safeParse({
      confirmationToken: 'token',
      confirmationHash: 'a'.repeat(64),
      expiresAt: '2026-08-24T10:00:00.000Z',
      template: {
        key: 'vivo-hero',
        name: 'Vivo Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Parsed_app',
        contractVersion: '1',
        contractHash: 'hash',
        contractSource: 'legacy_reflection',
        outputKinds: ['image'],
        variableCount: 1,
        previewUrl: null,
        updatedAt: null,
      },
      target: null,
      inputKeys: [],
      effects: 'none',
      watermarkLogo: 'https://cdn.example.com/logo.png',
    });
    expect(result.success).toBe(false);
  });

  it('derives version-pinned media handles from the selected template contract', () => {
    const node = {
      id: 'render-1',
      type: 'apiRender',
      data: {
        variableDefinitions: [
          { key: 'hero_image', kind: 'image' },
          { key: 'headline', kind: 'text' },
          { key: 'end_card', kind: 'video' },
        ],
      },
    };
    expect(getAllowedTargetHandles(node)).toEqual([
      'variable-hero_image',
      'variable-headline',
      'variable-end_card',
    ]);
    expect(getTargetHandleConnectionLimit(node, 'variable-hero_image', [])).toBe(
      API_RENDER_MEDIA_LIST_MAX,
    );
    expect(
      isValidConnection(
        {
          source: 'image-1',
          sourceHandle: 'image',
          target: 'render-1',
          targetHandle: 'variable-hero_image',
        },
        [],
        [node, { id: 'image-1', type: 'image', data: {} }],
      ),
    ).toBe(true);
  });

  // Every media input accepts several wires. A media_list stays one ordered renderer
  // input; a scalar media slot is serialized into one render variation per wire.
  it('opens media variables to the Canvas variation cap', () => {
    const node = {
      id: 'render-1',
      type: 'apiRender',
      data: {
        variableDefinitions: [
          { key: 'gallery', kind: 'image', multiple: true },
          { key: 'hero_image', kind: 'image', multiple: false },
          { key: 'watermark_logo', kind: 'image', multiple: true, reserved: true },
        ],
      },
    };
    expect(getTargetHandleConnectionLimit(node, 'variable-gallery', [])).toBe(
      API_RENDER_MEDIA_LIST_MAX,
    );
    expect(getTargetHandleConnectionLimit(node, 'variable-hero_image', [])).toBe(
      API_RENDER_MEDIA_LIST_MAX,
    );
    // Reserved stays caller-forbidden: no handle, and no limit to argue about.
    expect(getAllowedTargetHandles(node)).toEqual(['variable-gallery', 'variable-hero_image']);
    expect(getTargetHandleConnectionLimit(node, 'variable-watermark_logo', [])).toBeUndefined();
  });

  it('accepts the fifth image into a multiple variable and refuses the twenty-first', () => {
    const node = {
      id: 'render-1',
      type: 'apiRender',
      data: { variableDefinitions: [{ key: 'gallery', kind: 'image', multiple: true }] },
    };
    const wire = (index: number) => ({
      id: `edge-${index}`,
      source: `image-${index}`,
      sourceHandle: 'image',
      target: 'render-1',
      targetHandle: 'variable-gallery',
    });
    const sources = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `image-${index}`,
        type: 'image',
        data: {},
      }));

    const fourWired = Array.from({ length: 4 }, (_, index) => wire(index));
    expect(isValidConnection({ ...wire(4), id: undefined }, fourWired, [node, ...sources(5)])).toBe(
      true,
    );

    const fullyWired = Array.from({ length: API_RENDER_MEDIA_LIST_MAX }, (_, index) => wire(index));
    expect(
      isValidConnection({ ...wire(API_RENDER_MEDIA_LIST_MAX), id: undefined }, fullyWired, [
        node,
        ...sources(API_RENDER_MEDIA_LIST_MAX + 1),
      ]),
    ).toBe(false);
  });

  it('caps the wire contract’s pin array at the same number the canvas enforces', () => {
    const pin = (index: number) => ({
      assetId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      versionId: `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`,
    });
    const request = (count: number) => ({
      brandId: '00000000-0000-4000-8000-000000000001',
      templateKey: 'vivo-hero',
      contractHash: 'contract-1',
      variables: { gallery: Array.from({ length: count }, (_, index) => pin(index)) },
    });
    expect(
      apiRenderPreflightRequestSchema.safeParse(request(API_RENDER_MEDIA_LIST_MAX)).success,
    ).toBe(true);
    expect(
      apiRenderPreflightRequestSchema.safeParse(request(API_RENDER_MEDIA_LIST_MAX + 1)).success,
    ).toBe(false);
  });
});

describe('output settings', () => {
  it('accepts the pinned bounds and refuses everything past them', () => {
    const ok = [
      { fps: 'comp' },
      { fps: '30000/1001' },
      { fps: 25 },
      { fps: 120 },
      { audio: { enabled: false, codec: 'pcm_s24le', sampleRate: 48000, channels: 8 } },
      { audio: { bitrate: '32k' } },
      { audio: { bitrate: '512k' } },
      { video: { crf: 10, pixFmt: 'yuv422p10le', proresProfile: '4444xq' } },
    ];
    for (const value of ok) expect(encodeSettingsSchema.safeParse(value).success).toBe(true);
    const bad = [
      { fps: 0 },
      { fps: 121 },
      { fps: '121/1' },
      { fps: '30/0' },
      { fps: 'thirty' },
      { audio: { bitrate: '31k' } },
      { audio: { bitrate: '513k' } },
      { audio: { bitrate: '128' } },
      { audio: { sampleRate: 22050 } },
      { audio: { channels: 0 } },
      { audio: { channels: 1.5 } },
      { audio: { codec: 'mp3' } },
      { video: { crf: 41 } },
      { video: { pixFmt: 'rgb24' } },
      { video: { proresProfile: 'raw' } },
      { video: { bogus: 1 } },
      { gop: 12 },
    ];
    for (const value of bad) expect(encodeSettingsSchema.safeParse(value).success).toBe(false);
  });

  it('merges per leaf inside audio and video, later layers winning', () => {
    expect(
      mergeEncodeSettings({ fps: 25, audio: { sampleRate: 44100, bitrate: '128k' } }, undefined, {
        audio: { sampleRate: 48000 },
        video: { crf: 18 },
      }),
    ).toEqual({ fps: 25, audio: { sampleRate: 48000, bitrate: '128k' }, video: { crf: 18 } });
    expect(mergeEncodeSettings({}, undefined)).toBeUndefined();
    expect(compactEncodeBlock({ default: {}, outputs: { square: {} } })).toBeUndefined();
  });

  it('publishes optional template settings without breaking an older contract', () => {
    const base = {
      template: {
        key: '133',
        name: 'Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Continuum_app',
        contractVersion: 'v1',
        contractHash: 'hash',
        contractSource: 'template_forge',
        outputKinds: ['video'],
        variableCount: 0,
        previewUrl: null,
        updatedAt: null,
      },
      variables: [],
      outputs: [{ id: 'square', label: 'Square', ratio: '1:1' }],
    };
    expect(apiRenderTemplateContractSchema.parse(base).encode).toBeUndefined();
    const parsed = apiRenderTemplateContractSchema.parse({
      ...base,
      outputs: [
        {
          id: 'square',
          label: 'Square',
          ratio: '1:1',
          mediaType: 'MP4 Video (RGB)',
          frameRate: 29.97,
          encode: { fps: '30000/1001' },
        },
      ],
      encode: {
        stored: { default: { fps: 'comp' }, outputs: { square: { audio: { channels: 1 } } } },
        defaults: { mp4: { fps: '30000/1001' }, mov: { fps: 25 } },
      },
    });
    expect(parsed.outputs[0]?.frameRate).toBe(29.97);
    expect(encodeContainerOf(parsed.outputs[0]?.mediaType)).toBe('mp4');
    expect(encodeContainerOf('MOV Video (RGBA)')).toBe('mov');
    expect(encodeContainerOf('JPG image (RGB)')).toBeNull();
    expect(
      apiRenderPreflightRequestSchema.safeParse({
        brandId: '00000000-0000-4000-8000-000000000001',
        templateKey: '133',
        contractHash: 'hash',
        variables: {},
        encode: { outputs: { square: { fps: 500 } } },
      }).success,
    ).toBe(false);
  });
});

const BRAND = '00000000-0000-4000-8000-000000000001';
const DESTINATION = '00000000-0000-4000-8000-000000000009';
const createTarget = { adAccountId: 'act_1', campaignId: 'c1', adsetId: 's1' };
const replaceTarget = {
  action: 'replace',
  adAccountId: 'act_1',
  campaignId: 'c1',
  campaignName: 'Launch',
  adsetId: 's1',
  adsetName: 'Broad',
  adId: 'ad_1',
  adName: 'Hero',
  adStatus: 'ACTIVE',
  expectedCreativeId: 'cr_1',
};
const record = (extra: Record<string, unknown> = {}) => ({ variables: {}, ...extra });
const batch = (extra: Record<string, unknown>) => ({
  brandId: BRAND,
  templateKey: '133',
  contractHash: 'hash',
  ...extra,
});

describe('delivery targets', () => {
  it('still reads a pre-union create target and fills its defaults', () => {
    expect(apiRenderDeliveryTargetSchema.parse(createTarget)).toEqual({
      ...createTarget,
      action: 'create',
      adStatus: 'PAUSED',
    });
    expect(
      apiRenderBatchPreflightRequestSchema.parse(
        batch({ delivery: createTarget, records: [record()] }),
      ).delivery,
    ).toMatchObject({ action: 'create' });
  });

  it('reads a replace target with names, and refuses a create that names an ad', () => {
    expect(apiRenderDeliveryTargetSchema.parse(replaceTarget)).toEqual(replaceTarget);
    expect(apiRenderDeliveryTargetSchema.safeParse({ ...createTarget, adId: 'ad_1' }).success).toBe(
      false,
    );
    expect(
      apiRenderDeliveryTargetSchema.safeParse({ ...createTarget, adStatus: 'ACTIVE' }).success,
    ).toBe(false);
    expect(
      apiRenderDeliveryTargetSchema.safeParse({ ...replaceTarget, adId: undefined }).success,
    ).toBe(false);
  });

  it('lets a record carry its own delivery', () => {
    const parsed = apiRenderBatchPreflightRequestSchema.parse(
      batch({
        delivery: createTarget,
        records: [record(), record({ delivery: replaceTarget, outputIds: ['square'] })],
      }),
    );
    expect(parsed.records[0]?.delivery).toBeUndefined();
    expect(parsed.records[1]?.delivery).toMatchObject({ action: 'replace', adId: 'ad_1' });
  });

  it('a replace, record-level or inherited from the batch, needs exactly one output', () => {
    const twoOutputs = apiRenderBatchPreflightRequestSchema.safeParse(
      batch({ records: [record({ delivery: replaceTarget, outputIds: ['square', 'story'] })] }),
    );
    expect(twoOutputs.success).toBe(false);
    expect(twoOutputs.error?.issues[0]?.path).toEqual(['records', 0, 'outputIds']);
    expect(
      apiRenderBatchPreflightRequestSchema.safeParse(
        batch({ records: [record({ delivery: replaceTarget })] }),
      ).success,
    ).toBe(false);
    // the batch-level replace applies to a record with no delivery of its own
    expect(
      apiRenderBatchPreflightRequestSchema.safeParse(
        batch({ delivery: replaceTarget, records: [record({ outputIds: ['square', 'story'] })] }),
      ).success,
    ).toBe(false);
    // ...but a record-level create wins over it
    expect(
      apiRenderBatchPreflightRequestSchema.safeParse(
        batch({
          delivery: replaceTarget,
          records: [record({ delivery: createTarget, outputIds: ['square', 'story'] })],
        }),
      ).success,
    ).toBe(true);
    expect(
      apiRenderPreflightRequestSchema.safeParse(
        batch({ variables: {}, delivery: replaceTarget, outputIds: ['a', 'b'] }),
      ).success,
    ).toBe(false);
  });

  it('carries the Slack destination inside the confirmed batch request', () => {
    expect(
      apiRenderBatchPreflightRequestSchema.parse(
        batch({ records: [record()], slack: { destinationId: DESTINATION } }),
      ).slack,
    ).toEqual({ destinationId: DESTINATION });
    expect(
      apiRenderBatchPreflightRequestSchema.safeParse(
        batch({ records: [record()], slack: { destinationId: 'not-a-uuid' } }),
      ).success,
    ).toBe(false);
  });
});

describe('Forge Studio seams', () => {
  const summary = {
    key: '133',
    name: '[DRAFT/agent] forge_bench_starcraft',
    bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    environment: 'Continuum_app',
    contractVersion: 'v1',
    contractHash: 'hash',
    contractSource: 'template_forge',
    outputKinds: ['image'],
    variableCount: 0,
    previewUrl: null,
    updatedAt: null,
  };

  it('template summaries default displayName to null for an older server', () => {
    expect(apiRenderTemplateSummarySchema.parse(summary).displayName).toBeNull();
    expect(
      apiRenderTemplateSummarySchema.parse({ ...summary, displayName: 'StarCraft Promo' })
        .displayName,
    ).toBe('StarCraft Promo');
  });

  it('an output may carry its own layout, in the same shape as the contract layout', () => {
    const layout = {
      comp: { name: 'Story', width: 1080, height: 1920 },
      boxes: [{ key: 'headline', label: 'Headline', box: [0, 0, 100, 50] }],
    };
    const parsed = apiRenderTemplateContractSchema.parse({
      template: summary,
      variables: [],
      layout,
      outputs: [
        { id: 'story', label: 'Story', ratio: '9:16', layout },
        { id: 'square', label: 'Square', ratio: '1:1' },
      ],
    });
    expect(parsed.outputs[0]?.layout).toEqual(parsed.layout);
    expect(parsed.outputs[1]?.layout).toBeUndefined();
  });

  it('jobs expose delivery target, Slack post and approval, all null on an older server', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000010',
      brandId: BRAND,
      templateKey: '133',
      templateName: 'Hero',
      contractHash: 'hash',
      taskUid: null,
      status: 'finished',
      outputs: [],
      delivery: [],
      error: null,
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    };
    const old = apiRenderJobSchema.parse(job);
    expect([old.deliveryTarget, old.slackDelivery, old.approval]).toEqual([null, null, null]);

    const current = apiRenderJobSchema.parse({
      ...job,
      deliveryTarget: replaceTarget,
      slackDelivery: {
        destinationId: DESTINATION,
        channelName: 'starcraft-ops',
        status: 'posted',
        permalink: 'https://example.slack.com/archives/C1/p1',
        postedAt: '2026-09-14T00:01:00.000Z',
      },
      approval: { status: 'awaiting_approval', decidedAt: null },
    });
    expect(current.deliveryTarget).toMatchObject({ action: 'replace', adName: 'Hero' });
    expect(current.slackDelivery?.status).toBe('posted');
    expect(current.approval?.status).toBe('awaiting_approval');
    expect(
      apiRenderJobSchema.safeParse({
        ...job,
        slackDelivery: { destinationId: DESTINATION, channelName: 'x', status: 'sent' },
      }).success,
    ).toBe(false);
  });

  it('the jobs list filters by template', () => {
    expect(apiRenderJobListQuerySchema.parse({ brandId: BRAND, templateKey: '133' })).toEqual({
      brandId: BRAND,
      limit: 20,
      templateKey: '133',
    });
    expect(apiRenderJobListQuerySchema.parse({ brandId: BRAND, limit: '5' }).limit).toBe(5);
  });

  it('delivery destinations: list, Slack channels, and create', () => {
    const destinations = apiRenderDeliveryDestinationsResponseSchema.parse({
      slack: {
        state: 'ready',
        workspaceName: 'Continuum',
        destinations: [
          { id: DESTINATION, role: 'ops', channelId: 'C1', channelName: 'starcraft-ops' },
        ],
      },
      meta: { connected: false, adAccountId: null, adAccountName: null },
    });
    expect(destinations.slack.destinations[0]?.role).toBe('ops');
    expect(
      apiRenderDeliveryDestinationsResponseSchema.safeParse({
        ...destinations,
        slack: { ...destinations.slack, state: 'connected' },
      }).success,
    ).toBe(false);

    expect(
      apiRenderSlackChannelListResponseSchema.parse({
        workspaceName: null,
        channels: [{ id: 'C1', name: 'general', isPrivate: false, isMember: true }],
      }).channels,
    ).toHaveLength(1);

    for (const role of ['ops', 'client', 'alerts'] as const) {
      expect(
        apiRenderCreateDeliveryDestinationRequestSchema.safeParse({
          brandId: BRAND,
          role,
          channelId: 'C1',
        }).success,
      ).toBe(true);
    }
    // `dm` is addressed by `connection_id`, not a channel: the `chat_destinations_addressed`
    // CHECK refuses the row and `postToDestination` refuses a non-channel destination outright,
    // so a dm a Settings hub could "add" could never be posted to. Refused at the contract.
    expect(
      apiRenderCreateDeliveryDestinationRequestSchema.safeParse({
        brandId: BRAND,
        role: 'dm',
        channelId: 'C1',
      }).success,
    ).toBe(false);
  });

  it('a room carries who can decide in it, and the retire path addresses it by id', () => {
    const withCounts = apiRenderDeliveryDestinationsResponseSchema.parse({
      slack: {
        state: 'ready',
        workspaceName: 'Continuum',
        destinations: [
          {
            id: DESTINATION,
            role: 'client',
            channelId: 'C1',
            channelName: 'starcraft-client',
            workspaceName: 'Continuum',
            activeApprovers: 2,
            requestedApprovers: 1,
          },
        ],
      },
      meta: { connected: false, adAccountId: null, adAccountName: null },
    });
    expect(withCounts.slack.destinations[0]).toMatchObject({
      activeApprovers: 2,
      requestedApprovers: 1,
    });
    // Optional, because the schema is strict and the Frontend ships before the Backend fills them:
    // a room from a Backend too old to count them parses, and reads as "unknown", never as zero.
    const withoutCounts = apiRenderDeliveryDestinationsResponseSchema.parse({
      ...withCounts,
      slack: {
        ...withCounts.slack,
        destinations: [
          { id: DESTINATION, role: 'client', channelId: 'C1', channelName: 'starcraft-client' },
        ],
      },
    });
    expect(withoutCounts.slack.destinations[0]?.activeApprovers).toBeUndefined();
    // A count is a whole number of people.
    for (const activeApprovers of [-1, 1.5]) {
      expect(
        apiRenderDeliveryDestinationsResponseSchema.safeParse({
          ...withCounts,
          slack: {
            ...withCounts.slack,
            destinations: [{ ...withCounts.slack.destinations[0], activeApprovers }],
          },
        }).success,
      ).toBe(false);
    }

    expect(apiRenderDestinationRoute(DESTINATION)).toBe(
      `${API_RENDER_DESTINATIONS_ROUTE}/${DESTINATION}`,
    );
  });
});

describe('delivery target account name', () => {
  it('both arms carry an optional adAccountName', () => {
    const base = { adAccountId: 'act_1', campaignId: 'c', adsetId: 's' };
    expect(
      apiRenderDeliveryTargetSchema.parse({ ...base, adAccountName: 'StarCraft Ads' }),
    ).toMatchObject({ adAccountName: 'StarCraft Ads' });
    expect(
      apiRenderDeliveryTargetSchema.parse({
        ...base,
        action: 'replace',
        adId: 'a',
        adAccountName: 'StarCraft Ads',
      }),
    ).toMatchObject({ adAccountName: 'StarCraft Ads' });
    expect(apiRenderDeliveryTargetSchema.parse(base)).not.toHaveProperty('adAccountName');
  });
});

describe('approval destinations and the package summary', () => {
  const DESTINATION = '00000000-0000-4000-8000-0000000000d1';
  const PACKAGE = '00000000-0000-4000-8000-0000000000a1';
  const summary = {
    packageId: PACKAGE,
    destinations: [
      { id: DESTINATION, platform: 'whatsapp', name: 'Vivo approvals', activeApprovers: 0 },
    ],
    warning: 'Nobody can approve yet.',
  };

  it('both preflight requests take approval destinations, and refuse a non-uuid', () => {
    expect(
      apiRenderBatchPreflightRequestSchema.parse(
        batch({
          delivery: createTarget,
          records: [record()],
          approvalDestinationIds: [DESTINATION],
        }),
      ).approvalDestinationIds,
    ).toEqual([DESTINATION]);
    expect(
      apiRenderBatchPreflightRequestSchema.safeParse(
        batch({ records: [record()], approvalDestinationIds: ['#renders'] }),
      ).success,
    ).toBe(false);
    expect(
      apiRenderPreflightRequestSchema.parse({
        brandId: BRAND,
        templateKey: '133',
        contractHash: 'hash',
        variables: {},
        approvalDestinationIds: [DESTINATION],
      }).approvalDestinationIds,
    ).toEqual([DESTINATION]);
  });

  it('a summary names each destination with its active approvers; an older server reads as none', () => {
    expect(apiRenderApprovalSummarySchema.parse(summary)).toEqual(summary);
    expect(
      apiRenderApprovalSummarySchema.safeParse({
        ...summary,
        destinations: [{ ...summary.destinations[0], platform: 'teams' }],
      }).success,
    ).toBe(false);
    const response = {
      batchId: PACKAGE,
      confirmationToken: 't',
      confirmationHash: 'a'.repeat(64),
      expiresAt: '2026-09-15T00:00:00.000Z',
      template: {
        key: '133',
        name: 'Hero',
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        environment: 'Parsed_app',
        contractVersion: '1',
        contractHash: 'hash',
        contractSource: 'template_forge',
        outputKinds: ['image'],
        variableCount: 0,
        previewUrl: null,
        updatedAt: null,
      },
      target: null,
      records: [],
      effects: 'none',
    };
    expect(apiRenderBatchPreflightResponseSchema.parse(response).approval).toBeNull();
    expect(
      apiRenderBatchPreflightResponseSchema.parse({ ...response, approval: summary }).approval,
    ).toEqual(summary);
  });
});
