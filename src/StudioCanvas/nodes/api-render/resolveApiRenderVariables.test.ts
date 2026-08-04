import { describe, expect, test } from 'bun:test';
import type { Edge } from '@xyflow/react';
import type { ApiRenderNodeData, StudioNode } from '../../types';
import { resolveApiRenderVariables } from './resolveApiRenderVariables';

const renderData: ApiRenderNodeData = {
  templateKey: '47',
  templateName: 'Vivo',
  contractHash: 'hash',
  status: 'idle',
  variables: { headline: 'Switch today' },
  variableDefinitions: [
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
    {
      key: 'headline',
      label: 'Headline',
      kind: 'text',
      required: true,
      multiple: false,
      accept: [],
      options: [],
      description: null,
    },
  ],
};

describe('API render Canvas inputs', () => {
  test('converts a connected Library node into an exact asset/version pin', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image', type: 'image', data: { assetId: 'asset-1', assetVersionId: 'version-1' } },
    ] as StudioNode[];
    const edges = [
      {
        id: 'edge',
        source: 'image',
        sourceHandle: 'image',
        target: 'render',
        targetHandle: 'variable-hero_image',
      },
    ] as Edge[];

    expect(resolveApiRenderVariables({ nodeId: 'render', data: renderData, nodes, edges })).toEqual(
      {
        variables: {
          hero_image: { assetId: 'asset-1', versionId: 'version-1' },
          headline: 'Switch today',
        },
        errors: [],
      },
    );
  });

  test('refuses a preview-only image without durable Library identity', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image', type: 'image', data: { image: 'data:image/png;base64,preview' } },
    ] as StudioNode[];
    const edges = [
      {
        id: 'edge',
        source: 'image',
        sourceHandle: 'image',
        target: 'render',
        targetHandle: 'variable-hero_image',
      },
    ] as Edge[];

    const result = resolveApiRenderVariables({ nodeId: 'render', data: renderData, nodes, edges });
    expect(result.errors).toEqual(['Hero image needs a version-pinned Library asset']);
  });
});
