import { describe, expect, it } from 'bun:test';
import { compileUgcTalkingHeadWorkflow } from './ugc-workflow';
import { buildWorkflowGraph } from './workflow-builder';

const shot = (id: string, continuity: 'cut' | 'match' = 'cut') => ({
  id,
  spokenLine: `Line for ${id}`,
  frameDirection: `Static framing for ${id}`,
  visualDirection: `Motion for ${id}`,
  durationSeconds: 4 as const,
  continuity,
});

const recipe = (shots: ReturnType<typeof shot>[]) => ({
  recipe: 'ugc_talking_head' as const,
  objective: 'Sell the pipe',
  aspectRatio: '9:16' as const,
  characterRefNodeIds: ['character-ref'],
  productRefNodeIds: ['product-ref'],
  shots,
});

describe('compileUgcTalkingHeadWorkflow', () => {
  it('creates one gated production workspace and spends nothing on generators', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook'), shot('proof')]));
    expect(compiled.nodes).toHaveLength(1);
    expect(compiled.nodes[0]?.type).toBe('timelineEditor');
    expect(compiled.nodes.some((node) => node.type === 'nanoGen')).toBe(false);
    expect(compiled.nodes.some((node) => node.type === 'videoGen')).toBe(false);
    expect(compiled.nodes[0]?.data?.items).toEqual([]);
  });

  it('seeds shot direction and reference roles inside the workspace', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook', 'match'), shot('proof')]));
    expect(compiled.nodes[0]?.data?.productionSeed).toMatchObject({
      recipe: 'ugc_talking_head',
      objective: 'Sell the pipe',
      references: [
        { nodeId: 'character-ref', role: 'character' },
        { nodeId: 'product-ref', role: 'product' },
      ],
      shots: [
        {
          id: 'hook',
          order: 0,
          spokenLine: 'Line for hook',
          continuity: 'match',
          targetDurationSec: 4,
        },
        { id: 'proof', order: 1, continuity: 'cut' },
      ],
    });
  });

  it('connects durable reference nodes directly to the production workspace', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook')]));
    expect(compiled.connections).toEqual([
      { from_ref: 'character-ref', to_ref: compiled.timelineRef, role: 'media-in' },
      { from_ref: 'product-ref', to_ref: compiled.timelineRef, role: 'media-in' },
    ]);
    const built = buildWorkflowGraph(
      [
        { ref: 'character-ref', type: 'image' },
        { ref: 'product-ref', type: 'image' },
        ...compiled.nodes,
      ],
      compiled.connections,
    );
    expect(built.errors).toEqual([]);
  });

  it('rejects duplicate shot ids', () => {
    expect(() => compileUgcTalkingHeadWorkflow(recipe([shot('dup'), shot('dup')]))).toThrow();
  });
});
