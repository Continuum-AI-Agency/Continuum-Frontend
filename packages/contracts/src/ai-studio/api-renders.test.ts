import { describe, expect, it } from 'bun:test';
import {
  apiRenderPreflightRequestSchema,
  apiRenderTemplateContractSchema,
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
      'variable-end_card',
    ]);
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
});
