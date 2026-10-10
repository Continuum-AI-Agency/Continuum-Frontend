import { describe, expect, it } from 'bun:test';
import { productSwapRecipeSchema, type WorkflowGraph } from '@continuum/contracts';
import { productSwapGraph } from './productSwapGraph';

const recipe = productSwapRecipeSchema.parse({
  recipe: 'product_swap',
  sourceVideoNodeId: 'source',
  sourceDurationSec: 5,
  productRefNodeIds: ['product'],
  sourceProduct: 'Apple iPhone',
  replacementProduct: 'Samsung Galaxy',
  shots: [{ id: 'shot-1', startSec: 0, endSec: 5 }],
});
const canvas: WorkflowGraph = {
  nodes: [
    {
      id: 'source',
      type: 'video',
      position: { x: 5, y: 8 },
      data: { video: 'source.mp4', assetId: 'original', assetVersionId: 'v1' },
    },
    { id: 'product', type: 'image', position: { x: 500, y: 8 }, data: { image: 'product.png' } },
    { id: 'existing', type: 'note', position: { x: 1, y: 3 }, data: { content: 'keep me' } },
  ],
  edges: [],
};

describe('productSwapGraph', () => {
  it('preserves source/library versions and existing work, and gives repeated recipes independent ids', () => {
    const before = structuredClone(canvas);
    const first = productSwapGraph(recipe, canvas);
    const second = productSwapGraph(recipe, first);
    expect(canvas).toEqual(before);
    expect(second.nodes).toHaveLength(canvas.nodes.length + 12);
    for (const original of canvas.nodes)
      expect(second.nodes.find((node) => node.id === original.id)).toEqual(original);
    expect(new Set(second.nodes.map((node) => node.id)).size).toBe(second.nodes.length);
    expect(second.edges.filter((edge) => edge.source === 'source')).toHaveLength(2);
    expect(second.edges.filter((edge) => edge.source === 'product')).toHaveLength(4);
    expect(
      second.nodes.some((node) => ['nanoGen', 'videoGen', 'omniGen'].includes(node.type)),
    ).toBe(false);
  });

  it('refuses deleted and wrong-modality references before changing the canvas', () => {
    expect(() => productSwapGraph(recipe, { nodes: [], edges: [] })).toThrow('no longer');
    expect(() =>
      productSwapGraph(recipe, {
        ...canvas,
        nodes: canvas.nodes.map((node) =>
          node.id === 'product' ? { ...node, type: 'video' } : node,
        ),
      }),
    ).toThrow('image reference');
  });
});
