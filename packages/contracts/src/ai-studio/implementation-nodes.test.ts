import { expect, test } from 'bun:test';
import { pinFromNode } from './api-render-variables';
import {
  canvasPublishingAssets,
  implementationRenderRequests,
  plannerDraftRequest,
  renderOutputForHandle,
} from './implementation-nodes';
import { getAllowedSourceHandles } from './workflow-graph';

const brandId = '22222222-2222-4222-8222-222222222222';
const asset = '11111111-1111-4111-8111-111111111111';
const version = '33333333-3333-4333-8333-333333333333';
const render = {
  id: 'render',
  type: 'apiRender',
  data: {
    renderOutputs: [1, 2].map((index) => ({
      jobId: `job${index}`,
      outputId: 'same-format-id',
      kind: 'image',
      fileName: `${index}.png`,
      assetId: asset,
      versionId: index === 1 ? asset : version,
    })),
  },
};
test('scalar render refuses ambiguous batch; numbered output keeps exact version', () => {
  expect(renderOutputForHandle(render, 'image')).toBeNull();
  expect(renderOutputForHandle(render, 'render-image-2')?.versionId).toBe(version);
  expect(renderOutputForHandle(render, 'render-image-3')).toBeNull();
  expect(getAllowedSourceHandles(render)).toContain('render-image-2');
});
test('Planner reads the selected render pin and the wired caption', () => {
  const nodes = [
    render,
    { id: 'caption', type: 'string', data: { value: 'Wired copy' } },
    { id: 'draft', type: 'plannerDraft', data: {} },
  ];
  const edges = [
    {
      id: 'media',
      source: 'render',
      sourceHandle: 'render-image-2',
      target: 'draft',
      targetHandle: 'image-in',
    },
    { id: 'copy', source: 'caption', target: 'draft', targetHandle: 'text-in' },
  ];
  const request = plannerDraftRequest({
    brandId,
    nodeId: 'draft',
    data: {
      platform: 'instagram',
      platformAccountId: asset,
      format: 'image',
      caption: 'stale copy',
    },
    nodes,
    edges,
    clientKey: 'test',
    dayId: '2026-10-02',
  });
  expect(request.caption).toBe('Wired copy');
  expect(request.assets?.[0]?.versionId).toBe(version);
  nodes[1]!.data = { value: '' };
  expect(() =>
    plannerDraftRequest({
      brandId,
      nodeId: 'draft',
      data: { caption: 'stale copy' },
      nodes,
      edges,
      clientKey: 'test',
      dayId: '2026-10-02',
    }),
  ).toThrow('connected caption');
});
test('carousel ordering follows slots and refuses incomplete or unversioned inputs', () => {
  const data = {
    format: 'carousel',
    assetSlots: [
      { id: 'second', order: 1 },
      { id: 'first', order: 0 },
    ],
  };
  const nodes = [render];
  const edges = [
    {
      id: 'b',
      source: 'render',
      sourceHandle: 'render-image-2',
      target: 'draft',
      targetHandle: 'asset-second',
    },
    {
      id: 'a',
      source: 'render',
      sourceHandle: 'render-image-1',
      target: 'draft',
      targetHandle: 'asset-first',
    },
  ];
  expect(
    canvasPublishingAssets({ nodeId: 'draft', data, nodes, edges }).map((item) => item.versionId),
  ).toEqual([asset, version]);
  expect(() =>
    plannerDraftRequest({
      brandId,
      nodeId: 'draft',
      data,
      nodes,
      edges: edges.slice(1),
      clientKey: 'test',
      dayId: '2026-10-02',
    }),
  ).toThrow('Connect 2');
  expect(() =>
    plannerDraftRequest({
      brandId,
      nodeId: 'draft',
      data: { format: 'image' },
      nodes: [{ id: 'raw', type: 'image', data: { assetId: asset } }],
      edges: [{ id: 'raw', source: 'raw', target: 'draft', targetHandle: 'image-in' }],
      clientKey: 'test',
      dayId: '2026-10-02',
    }),
  ).toThrow('Library version');
});
test('every preset and selected format is kept; delivery is explicit', () => {
  const data = {
    templateKey: 'template',
    contractHash: 'hash',
    batchInputSetIds: [asset, version],
    outputIds: ['square', 'portrait'],
    delivery: { action: 'create', adAccountId: 'a', campaignId: 'c', adsetId: 's' },
  };
  const requests = implementationRenderRequests({
    brandId,
    nodeId: 'render',
    data,
    nodes: [],
    edges: [],
  });
  expect(requests).toHaveLength(2);
  expect(requests[1]?.inputSetId).toBe(version);
  expect(requests[0]?.outputIds).toEqual(data.outputIds);
  expect(requests[0]?.delivery).toBeUndefined();
});
test('a removed numbered variation cannot silently fall back to its cover', () => {
  expect(
    pinFromNode(
      {
        id: 'source',
        type: 'nanoGen',
        data: { assetId: asset, generatedImages: [{ assetId: asset, assetVersionId: version }] },
      },
      'image-2',
    ),
  ).toBeNull();
});
