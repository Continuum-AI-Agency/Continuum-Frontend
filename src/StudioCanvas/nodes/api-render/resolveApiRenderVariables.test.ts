import { describe, expect, test } from 'bun:test';
import { API_RENDER_MEDIA_LIST_MAX } from '@continuum/contracts';
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

const headlineEdge = (source: string) =>
  ({
    id: 'edge-headline',
    source,
    sourceHandle: 'text',
    target: 'render',
    targetHandle: 'variable-headline',
  }) as Edge;

describe('API render Canvas inputs — a wired text variable', () => {
  test('a connected Text Block overrides the value typed on the node', () => {
    // `renderData.variables.headline` is 'Switch today'. The canvas SHOWS text flowing in
    // from upstream; sending the inline value instead would render something the graph
    // does not depict.
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image', type: 'image', data: { assetId: 'asset-1', assetVersionId: 'version-1' } },
      { id: 'text', type: 'string', data: { value: 'Wired headline' } },
    ] as StudioNode[];
    const edges = [
      {
        id: 'edge',
        source: 'image',
        sourceHandle: 'image',
        target: 'render',
        targetHandle: 'variable-hero_image',
      } as Edge,
      headlineEdge('text'),
    ];

    const result = resolveApiRenderVariables({ nodeId: 'render', data: renderData, nodes, edges });
    expect(result.errors).toEqual([]);
    expect(result.variables.headline).toBe('Wired headline');
  });

  test('reads text a generator wrote rather than only a Text Block', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image', type: 'image', data: { assetId: 'asset-1', assetVersionId: 'version-1' } },
      { id: 'text', type: 'string', data: { generatedText: 'Enriched headline' } },
    ] as StudioNode[];

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: renderData,
      nodes,
      edges: [
        {
          id: 'edge',
          source: 'image',
          sourceHandle: 'image',
          target: 'render',
          targetHandle: 'variable-hero_image',
        } as Edge,
        headlineEdge('text'),
      ],
    });
    expect(result.variables.headline).toBe('Enriched headline');
  });

  test('an empty wired source is missing, not an empty string', () => {
    // Falling back to the inline value here would send text the canvas no longer shows,
    // and sending '' would satisfy a required slot with a blank.
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image', type: 'image', data: { assetId: 'asset-1', assetVersionId: 'version-1' } },
      { id: 'text', type: 'string', data: { value: '   ' } },
    ] as StudioNode[];

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: renderData,
      nodes,
      edges: [
        {
          id: 'edge',
          source: 'image',
          sourceHandle: 'image',
          target: 'render',
          targetHandle: 'variable-hero_image',
        } as Edge,
        headlineEdge('text'),
      ],
    });
    expect(result.errors).toEqual(['Headline is required']);
    expect(result.variables.headline).toBeUndefined();
  });
});

const galleryData: ApiRenderNodeData = {
  templateKey: '47',
  templateName: 'Vivo',
  contractHash: 'hash',
  status: 'idle',
  variables: {},
  variableDefinitions: [
    {
      key: 'gallery',
      label: 'Gallery',
      kind: 'image',
      required: true,
      multiple: true,
      accept: ['image/*'],
      options: [],
      description: null,
      reserved: false,
    },
  ],
};

const libraryNode = (index: number) =>
  ({
    id: `image-${index}`,
    type: 'image',
    data: { assetId: `asset-${index}`, assetVersionId: `version-${index}` },
  }) as StudioNode;

const galleryEdge = (index: number) =>
  ({
    id: `edge-${index}`,
    source: `image-${index}`,
    sourceHandle: 'image',
    target: 'render',
    targetHandle: 'variable-gallery',
  }) as Edge;

describe('API render Canvas inputs — a multiple media variable', () => {
  test('resolves five connected Library images to five pins in edge order', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: galleryData },
      ...[3, 1, 4, 2, 5].map(libraryNode),
    ] as StudioNode[];
    const edges = [3, 1, 4, 2, 5].map(galleryEdge);

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: galleryData,
      nodes,
      edges,
    });

    expect(result.errors).toEqual([]);
    // Edge order, not node order and not sorted — the order the user wired them.
    expect(result.variables.gallery).toEqual([
      { assetId: 'asset-3', versionId: 'version-3' },
      { assetId: 'asset-1', versionId: 'version-1' },
      { assetId: 'asset-4', versionId: 'version-4' },
      { assetId: 'asset-2', versionId: 'version-2' },
      { assetId: 'asset-5', versionId: 'version-5' },
    ]);
  });

  test('refuses a preview-only member instead of quietly rendering four of five', () => {
    // Dropping it would send a shorter list than the canvas shows — the render would
    // succeed and be wrong, which is worse than refusing to prepare.
    const nodes = [
      { id: 'render', type: 'apiRender', data: galleryData },
      ...[1, 2, 4, 5].map(libraryNode),
      { id: 'image-3', type: 'image', data: { image: 'data:image/png;base64,preview' } },
    ] as StudioNode[];
    const edges = [1, 2, 3, 4, 5].map(galleryEdge);

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: galleryData,
      nodes,
      edges,
    });

    expect(result.errors).toEqual(['Gallery needs a version-pinned Library asset']);
    expect(result.variables.gallery).toBeUndefined();
  });

  test('emits an array even for a single connection, because the port is a list', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: galleryData },
      libraryNode(1),
    ] as StudioNode[];

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: galleryData,
      nodes,
      edges: [galleryEdge(1)],
    });

    expect(result.variables.gallery).toEqual([{ assetId: 'asset-1', versionId: 'version-1' }]);
  });

  test('refuses more connections than the wire contract accepts', () => {
    const indexes = Array.from({ length: API_RENDER_MEDIA_LIST_MAX + 1 }, (_, i) => i);
    const nodes = [
      { id: 'render', type: 'apiRender', data: galleryData },
      ...indexes.map(libraryNode),
    ] as StudioNode[];

    const result = resolveApiRenderVariables({
      nodeId: 'render',
      data: galleryData,
      nodes,
      edges: indexes.map(galleryEdge),
    });

    expect(result.errors).toEqual(['Gallery needs a version-pinned Library asset']);
  });

  test('a single-value variable still resolves to one bare pin, not a list', () => {
    const nodes = [
      { id: 'render', type: 'apiRender', data: renderData },
      { id: 'image-1', type: 'image', data: { assetId: 'asset-1', assetVersionId: 'version-1' } },
    ] as StudioNode[];
    const edges = [
      {
        id: 'edge',
        source: 'image-1',
        sourceHandle: 'image',
        target: 'render',
        targetHandle: 'variable-hero_image',
      },
    ] as Edge[];

    const result = resolveApiRenderVariables({ nodeId: 'render', data: renderData, nodes, edges });
    expect(result.variables.hero_image).toEqual({ assetId: 'asset-1', versionId: 'version-1' });
  });
});
