import { describe, expect, it } from 'bun:test';
import {
  API_RENDER_MEDIA_LIST_MAX,
  apiRenderPreflightRequestSchema,
  apiRenderPreflightResponseSchema,
  apiRenderTemplateContractSchema,
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
      mergeEncodeSettings(
        { fps: 25, audio: { sampleRate: 44100, bitrate: '128k' } },
        undefined,
        { audio: { sampleRate: 48000 }, video: { crf: 18 } },
      ),
    ).toEqual({ fps: 25, audio: { sampleRate: 48000, bitrate: '128k' }, video: { crf: 18 } });
    expect(mergeEncodeSettings({}, undefined)).toBeUndefined();
    expect(compactEncodeBlock({ default: {}, outputs: { square: {} } })).toBeUndefined();
  });

  it('publishes optional template settings without breaking an older contract', () => {
    const base = {
      template: {
        key: '133',
        name: 'Hero',
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
