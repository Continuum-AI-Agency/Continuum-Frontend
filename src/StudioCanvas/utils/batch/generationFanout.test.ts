import { describe, expect, it } from 'bun:test';
import type { Edge } from '@xyflow/react';

import type { StudioNode } from '../../types';
import type { NodeOutput } from '../../types/execution';
import {
  batchGenerationPlan,
  collectionSourcesFor,
  rightIndexFor,
  runGenerationFanOut,
  substituteCollections,
} from './generationFanout';

const img = (url: string): NodeOutput => ({ type: 'image', mimeType: 'image/png', url });

const collection = (urls: string[], labels?: string[]): NodeOutput => ({
  type: 'collection',
  itemType: 'image',
  items: urls.map(img),
  labels,
});

const node = (id: string, type: string, data: Record<string, unknown> = {}): StudioNode =>
  ({ id, type, data, position: { x: 0, y: 0 } }) as unknown as StudioNode;

const edge = (source: string, target: string, targetHandle = 'ref-images'): Edge => ({
  id: `${source}->${target}:${targetHandle}`,
  source,
  target,
  targetHandle,
});

describe('rightIndexFor', () => {
  it('walks the right batch row-major for cross', () => {
    // crossBatches is `for left { for right }`, so with 2 rights the right index cycles.
    expect([0, 1, 2, 3, 4, 5].map((i) => rightIndexFor('cross', i, 2))).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('is positional for zip', () => {
    expect([0, 1, 2].map((i) => rightIndexFor('zip', i, 3))).toEqual([0, 1, 2]);
  });

  it('has no right index when there is no partner', () => {
    expect(rightIndexFor('cross', 0, 0)).toBeUndefined();
  });
});

describe('collectionSourcesFor', () => {
  const resolved = new Map<string, NodeOutput>([
    ['A', collection(['p1', 'p2', 'p3'])],
    ['B', collection(['m1'])],
    ['S', { type: 'text', value: 'a prompt' }],
  ]);
  const nodeById = new Map([
    ['A', node('A', 'batch', { combine: 'cross' })],
    ['B', node('B', 'batch', { combine: 'zip' })],
    ['S', node('S', 'string')],
  ]);

  it('finds a lone collection and takes its combine mode', () => {
    const edges = [edge('A', 'gen'), edge('S', 'gen', 'prompt')];
    const found = collectionSourcesFor('gen', edges, resolved, nodeById);
    expect(found?.primary.nodeId).toBe('A');
    expect(found?.partner).toBeUndefined();
    expect(found?.combine).toBe('cross');
  });

  it('picks the COMBINED batch as primary — the one the other is wired into', () => {
    // B feeds A (the partner edge materializeBatch reads) and both feed the generator.
    const edges = [edge('B', 'A', 'items'), edge('A', 'gen'), edge('B', 'gen')];
    const found = collectionSourcesFor('gen', edges, resolved, nodeById);
    expect(found?.primary.nodeId).toBe('A');
    expect(found?.partner?.nodeId).toBe('B');
    // A is the batch that combined, so A's mode decides — not B's.
    expect(found?.combine).toBe('cross');
  });

  it('returns nothing when no input resolved to a collection', () => {
    expect(
      collectionSourcesFor('gen', [edge('S', 'gen', 'prompt')], resolved, nodeById),
    ).toBeUndefined();
  });

  it('defaults an unset combine to zip rather than guessing cross', () => {
    const bare = new Map([['A', node('A', 'batch')]]);
    const found = collectionSourcesFor('gen', [edge('A', 'gen')], resolved, bare);
    expect(found?.combine).toBe('zip');
  });
});

describe('batchGenerationPlan', () => {
  it('pairs each left item with the right one crossBatches would have chosen', () => {
    const primary = { nodeId: 'A', output: collection(['p1', 'p2', 'p3']) as never };
    const partner = { nodeId: 'B', output: collection(['m1', 'm2']) as never };
    const plan = batchGenerationPlan({ primary, partner, combine: 'cross' });
    expect(plan?.pairs).toHaveLength(3);
    expect(plan?.pairs.map((pair) => pair.rightIndex)).toEqual([0, 1, 0]);
  });

  it('carries the labels materializeBatch wrote', () => {
    const primary = {
      nodeId: 'A',
      output: collection(['p1', 'p2'], ['p1 × m1', 'p2 × m1']) as never,
    };
    const plan = batchGenerationPlan({ primary, combine: 'zip' });
    expect(plan?.pairs.map((pair) => pair.label)).toEqual(['p1 × m1', 'p2 × m1']);
  });

  it('refuses an empty batch instead of running zero items and reporting success', () => {
    const primary = { nodeId: 'A', output: collection([]) as never };
    expect(batchGenerationPlan({ primary, combine: 'zip' })).toBeUndefined();
  });
});

describe('substituteCollections', () => {
  it('swaps BOTH sides of a pair, leaving every other resolved output shared', () => {
    const resolved = new Map<string, NodeOutput>([
      ['A', collection(['p1', 'p2'])],
      ['B', collection(['m1'])],
      ['S', { type: 'text', value: 'keep me' }],
    ]);
    const primary = { nodeId: 'A', output: collection(['p1', 'p2']) as never };
    const partner = { nodeId: 'B', output: collection(['m1']) as never };
    const plan = batchGenerationPlan({ primary, partner, combine: 'cross' });
    const perItem = substituteCollections(resolved, plan as never, plan!.pairs[1]);

    expect(perItem.get('A')).toEqual(img('p2'));
    expect(perItem.get('B')).toEqual(img('m1'));
    expect(perItem.get('S')).toEqual({ type: 'text', value: 'keep me' });
    // The original map is untouched — a mutated shared map would leak item N's
    // substitution into item N+1's payload.
    expect(resolved.get('A')?.type).toBe('collection');
  });
});

describe('runGenerationFanOut', () => {
  const gen = node('gen', 'nanoGen');

  const planFor = (lefts: string[], rights?: string[], combine: 'zip' | 'cross' = 'cross') =>
    batchGenerationPlan({
      primary: { nodeId: 'A', output: collection(lefts) as never },
      partner: rights ? { nodeId: 'B', output: collection(rights) as never } : undefined,
      combine,
    })!;

  it('builds ONE payload per item, each seeing its own reference', async () => {
    // The bug this rules out: the pre-Wave-4 behaviour, where every item generated from
    // the same (or no) reference and produced N copies of one picture.
    const seen: string[] = [];
    const plan = planFor(['p1', 'p2', 'p3'], ['m1']);
    const resolved = new Map<string, NodeOutput>();

    const result = await runGenerationFanOut(gen, plan, resolved, {
      outputItemType: 'image',
      buildPayload: (_target, perItem) => {
        const left = perItem.get('A');
        const right = perItem.get('B');
        seen.push(
          `${left?.type === 'image' ? left.url : '?'}+${right?.type === 'image' ? right.url : '?'}`,
        );
        return { medium: 'image' } as never;
      },
      executeGeneration: async (executionId) => ({
        success: true,
        output: img(`out-${executionId}`),
      }),
    });

    expect(seen.sort()).toEqual(['p1+m1', 'p2+m1', 'p3+m1']);
    expect(result?.output.items).toHaveLength(3);
    expect(result?.record.completed).toBe(3);
    expect(result?.record.failed).toBe(0);
  });

  it('gives every item its own execution id so three in flight cannot collide', () => {
    // executeGeneration keys its abort-controller map by the id it is handed; reusing the
    // real node id for three concurrent calls loses two controllers.
    const ids: string[] = [];
    const plan = planFor(['p1', 'p2', 'p3']);
    return runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async (executionId) => {
        ids.push(executionId);
        return { success: true, output: img('x') };
      },
    }).then(() => {
      expect(new Set(ids).size).toBe(3);
      expect(ids.every((id) => id.startsWith('gen::b'))).toBe(true);
    });
  });

  it('never runs more than three at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const plan = planFor(Array.from({ length: 9 }, (_, i) => `p${i}`));

    await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { success: true, output: img('x') };
      },
    });

    expect(peak).toBeLessThanOrEqual(3);
  });

  it('isolates one failure to its own slot instead of sinking the batch', async () => {
    const plan = planFor(['p1', 'p2', 'p3']);
    const result = await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async (executionId) =>
        executionId.endsWith('b1')
          ? { success: false, error: 'provider said no' }
          : { success: true, output: img(executionId) },
    });

    expect(result?.output.items).toHaveLength(2);
    expect(result?.record.completed).toBe(2);
    expect(result?.record.failed).toBe(1);
    expect(result?.record.items[1].status).toBe('failed');
    expect(result?.record.items[0].status).toBe('completed');
  });

  it('returns undefined only when EVERY item failed', async () => {
    const plan = planFor(['p1', 'p2']);
    const result = await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async () => ({ success: false, error: 'down' }),
    });
    expect(result).toBeUndefined();
  });

  it('labels the emitted collection with the GENERATOR modality, not the batch kind', async () => {
    // A batch of text prompts fanned through an image generator emits IMAGES. Copying the
    // batch's itemType would send every downstream consumer looking for a string.
    const plan = batchGenerationPlan({
      primary: {
        nodeId: 'A',
        output: {
          type: 'collection',
          itemType: 'text',
          items: [{ type: 'text', value: 'a' }],
        } as never,
      },
      combine: 'zip',
    })!;
    const result = await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async () => ({ success: true, output: img('x') }),
    });
    expect(plan.itemType).toBe('text');
    expect(result?.output.itemType).toBe('image');
  });

  it('reports progress as items land so the matrix fills in during the run', async () => {
    const seenCounts: number[] = [];
    const plan = planFor(['p1', 'p2', 'p3']);
    await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async () => ({ success: true, output: img('x') }),
      onProgress: (record) => seenCounts.push(record.completed),
    });
    expect(seenCounts.length).toBeGreaterThan(1);
    expect(seenCounts.at(-1)).toBe(3);
  });

  it('records the axis headers without carrying any base64', async () => {
    const plan = planFor(['p1', 'p2'], ['m1']);
    const result = await runGenerationFanOut(gen, plan, new Map(), {
      outputItemType: 'image',
      buildPayload: () => ({ medium: 'image' }) as never,
      executeGeneration: async () => ({
        success: true,
        output: { type: 'image', mimeType: 'image/png', url: 'u', base64: 'AAAA'.repeat(500) },
      }),
    });
    expect(result?.record.left).toHaveLength(2);
    expect(result?.record.right).toHaveLength(1);
    expect(JSON.stringify(result?.record)).not.toContain('AAAA');
  });
});
