/**
 * The `data-jaina-campaign-structure` part, projected onto the chat message. Asserted with
 * positive observables (the transcript renders `campaignStructures`), the convention of
 * uiMessageProjection.test.ts.
 */

import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';

import { fixtureStructure } from '@/components/paid-media/jaina/blocks/campaignStructure.fixtures';
import { campaignStructuresOf, toJainaChatMessage } from './uiMessageProjection';

const message = (structures: unknown[]): JainaUIMessage =>
  ({
    id: 'msg_1',
    role: 'assistant',
    parts: structures.map((structure, index) => ({
      type: JAINA_UI_DATA_PART.campaignStructure,
      id: `part-${index}`,
      data: structure,
    })),
  }) as unknown as JainaUIMessage;

describe('campaignStructuresOf', () => {
  it('reads every drawing, in order, onto the chat message', () => {
    const tree = fixtureStructure('tree');
    const matrix = fixtureStructure('matrix');
    expect(campaignStructuresOf(message([tree, matrix])).map((s) => s.layout)).toEqual([
      'tree',
      'matrix',
    ]);
    expect(toJainaChatMessage(message([tree]), { isStreaming: false }).campaignStructures?.[0]?.partId).toBe(tree.partId);
  });

  it('draws a layout this Frontend does not know as the outline of the same nodes', () => {
    const future = { ...fixtureStructure('tree'), layout: 'timeline' };
    const [degraded] = campaignStructuresOf(message([future]));
    expect(degraded?.layout).toBe('outline');
    expect(degraded?.html).toBeNull();
    expect(degraded?.nodes.length).toBe(fixtureStructure('tree').nodes.length);
  });

  it('drops a part that is not a structure at all', () => {
    expect(campaignStructuresOf(message([{ nope: true }, 'text']))).toEqual([]);
    expect(toJainaChatMessage(message([]), { isStreaming: false }).campaignStructures).toBeUndefined();
  });
});
