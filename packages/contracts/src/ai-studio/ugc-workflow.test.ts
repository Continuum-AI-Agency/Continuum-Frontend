import { describe, expect, it } from 'bun:test';
import { compileUgcTalkingHeadWorkflow, ugcTalkingHeadRecipeSchema } from './ugc-workflow';
import { buildWorkflowGraph } from './workflow-builder';

const recipe = ugcTalkingHeadRecipeSchema.parse({
  recipe: 'ugc_talking_head',
  objective: 'A founder-style product recommendation',
  characterRefNodeIds: ['character-ref'],
  productRefNodeIds: ['product-ref'],
  shots: [
    {
      id: 'hook',
      spokenLine: 'I finally found one that works.',
      visualDirection: 'Direct-to-camera close-up.',
      durationSeconds: 4,
      continuityFromPrevious: 'independent',
    },
    {
      id: 'proof',
      spokenLine: 'Here is the part that surprised me.',
      visualDirection: 'Hold the product beside the face.',
      durationSeconds: 6,
      continuityFromPrevious: 'exact',
    },
  ],
});

describe('compileUgcTalkingHeadWorkflow', () => {
  it('expands the recipe into ordinary editable nodes and typed module manifests', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe);

    expect(compiled.nodes.map((node) => node.type)).toEqual([
      'string',
      'videoGen',
      'string',
      'videoGen',
      'frameExtract',
      'timelineEditor',
    ]);
    expect(compiled.modules.map((module) => module.kind)).toEqual([
      'character_reference',
      'product_reference',
      'shot_sequence',
      'assembly',
    ]);
    expect(compiled.nodes.every((node) => node.type !== 'subflow')).toBe(true);
  });

  it('uses the exact previous last frame while preserving character and product references', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe);
    const nextShot = compiled.shots[1];

    expect(
      compiled.connections.some(
        (connection) =>
          connection.from_ref === 'shot:hook:video' && connection.to_ref === 'shot:hook:last-frame',
      ),
    ).toBe(true);
    expect(
      compiled.connections.some(
        (connection) =>
          connection.from_ref === 'shot:hook:last-frame' &&
          connection.to_ref === nextShot.videoRef &&
          connection.role === 'first-frame',
      ),
    ).toBe(true);
    expect(
      compiled.connections.filter(
        (connection) => connection.to_ref === nextShot.videoRef && connection.role === 'ref-images',
      ),
    ).toHaveLength(2);
  });

  it('builds a provider-valid graph with a populated edit-ready timeline', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe);
    const built = buildWorkflowGraph(
      [
        { ref: 'character-ref', type: 'image' },
        { ref: 'product-ref', type: 'image' },
        ...compiled.nodes,
      ],
      compiled.connections,
    );

    expect(built.errors).toEqual([]);
    const timeline = built.graph.nodes.find((node) => node.id === compiled.timelineRef);
    expect(timeline?.data.items).toEqual([
      { sourceNodeId: 'shot:hook:video', order: 0, kind: 'video' },
      { sourceNodeId: 'shot:proof:video', order: 1, kind: 'video' },
    ]);
  });
});
