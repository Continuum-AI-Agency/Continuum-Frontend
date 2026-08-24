import { describe, expect, it } from 'bun:test';
import {
  API_RENDER_MEDIA_LIST_MAX,
  apiRenderPreflightRequestSchema,
  apiRenderPreflightResponseSchema,
  apiRenderTemplateContractSchema,
  apiRenderVariableKeySchema,
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
    expect(getAllowedTargetHandles(node)).toEqual(['variable-hero_image', 'variable-end_card']);
    expect(getTargetHandleConnectionLimit(node, 'variable-hero_image', [])).toBe(1);
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

  // A `multiple` variable is a graph-runner `media_list` port the renderer LOOPS over.
  // Capping its handle at one connection made the whole multi-image path unreachable
  // from the canvas while the wire contract already accepted twenty pins.
  it('opens a multiple media variable to the wire contract’s own cap', () => {
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
    expect(getTargetHandleConnectionLimit(node, 'variable-hero_image', [])).toBe(1);
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
