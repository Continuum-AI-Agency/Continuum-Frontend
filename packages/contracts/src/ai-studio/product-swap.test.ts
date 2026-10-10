import { describe, expect, it } from 'bun:test';
import {
  compileProductSwapWorkflow,
  productSwapPrompts,
  productSwapRecipeSchema,
} from './product-swap';
import { buildWorkflowGraph } from './workflow-builder';

const recipe = productSwapRecipeSchema.parse({
  recipe: 'product_swap',
  sourceVideoNodeId: 'source',
  sourceDurationSec: 7,
  productRefNodeIds: ['samsung'],
  sourceProduct: 'Apple iPhone',
  replacementProduct: 'Samsung Galaxy S26',
  visualChanges: 'Change the title from iPhone to Galaxy.',
  shots: [
    { id: 'closeup', startSec: 0, endSec: 2 },
    {
      id: 'turn',
      startSec: 2,
      endSec: 7,
      direction: 'Turn the device clockwise in the same hand.',
    },
  ],
});

describe('product swap preparation recipe', () => {
  it('builds runnable trim/frame nodes with literal prompts and valid reference wiring', () => {
    const compiled = compileProductSwapWorkflow(recipe);
    const built = buildWorkflowGraph(
      [{ ref: 'source', type: 'video' }, { ref: 'samsung', type: 'image' }, ...compiled.nodes],
      compiled.connections,
    );
    expect(built.errors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(
      compiled.nodes.filter((node) => node.type === 'action').map((node) => node.data?.config),
    ).toEqual([
      { trimStartSec: 0, trimEndSec: 2 },
      { trimStartSec: 2, trimEndSec: 7 },
    ]);
    expect(
      compiled.nodes
        .filter((node) => node.type === 'frameExtract')
        .map((node) => node.data?.selector),
    ).toEqual(['first', 'last', 'first', 'last']);
    expect(
      compiled.nodes
        .filter((node) => node.type === 'string')
        .every((node) => node.data?.promptMode === 'literal'),
    ).toBe(true);
    expect(new Set(compiled.nodes.map((node) => node.type))).toEqual(
      new Set(['action', 'frameExtract', 'string']),
    );
    expect(compiled.outputRefs).toHaveLength(12);
  });

  it('keeps image-edit instructions separate from source-motion and audio instructions', () => {
    const prompts = productSwapPrompts(recipe, recipe.shots[1]);
    expect(prompts.firstFrame).toContain('connected first source frame');
    expect(prompts.lastFrame).toContain('connected last source frame');
    expect(prompts.firstFrame).toContain('Samsung Galaxy S26');
    expect(prompts.firstFrame).toContain('Change the title from iPhone to Galaxy.');
    expect(prompts.motion).toContain('Target duration: 5.000 seconds');
    expect(prompts.motion).toContain('Turn the device clockwise');
    expect(prompts.motion).toContain('Review spoken source-brand mentions');
    expect(prompts.motion).toContain('do not guarantee');
  });

  it('refuses invalid ranges, duplicate ids, absent refs and unknown fields', () => {
    for (const patch of [
      { shots: [{ id: 'bad', startSec: 2, endSec: 2 }] },
      { shots: [{ id: 'bad', startSec: 0, endSec: 8 }] },
      {
        shots: [
          { id: 'same', startSec: 0, endSec: 3 },
          { id: 'same', startSec: 3, endSec: 7 },
        ],
      },
      {
        shots: [
          { id: 'a', startSec: 0, endSec: 4 },
          { id: 'b', startSec: 3, endSec: 7 },
        ],
      },
      { productRefNodeIds: [] },
      { productRefNodeIds: ['same', 'same'] },
      { sourceDurationSec: Number.POSITIVE_INFINITY },
      { model: 'kling-omni' },
    ])
      expect(productSwapRecipeSchema.safeParse({ ...recipe, ...patch }).success).toBe(false);
  });
});
