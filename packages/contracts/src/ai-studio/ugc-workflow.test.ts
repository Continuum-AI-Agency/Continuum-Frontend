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

const refNodes = [
  { ref: 'character-ref', type: 'image' },
  { ref: 'product-ref', type: 'image' },
];

const edgesInto = (
  compiled: ReturnType<typeof compileUgcTalkingHeadWorkflow>,
  target: string,
  role: string,
) => compiled.connections.filter((edge) => edge.to_ref === target && edge.role === role);

describe('compileUgcTalkingHeadWorkflow — contact sheet shape', () => {
  it('emits one storyboard panel and one clip per shot', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook'), shot('proof')]));
    const byType = (type: string) => compiled.nodes.filter((node) => node.type === type);

    expect(byType('nanoGen')).toHaveLength(2);
    expect(byType('videoGen')).toHaveLength(2);
    expect(byType('timelineEditor')).toHaveLength(1);
    // One frame prompt + one motion prompt per shot — they are different texts.
    expect(byType('string')).toHaveLength(4);
    expect(byType('frameExtract')).toHaveLength(0);
  });

  // The whole point: Veo takes frames XOR reference images, so identity has to be
  // locked on the still. A single ref edge into a video node breaks the build.
  it('wires character and product references into the panels, never into the clips', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook'), shot('proof')]));

    for (const id of ['hook', 'proof']) {
      expect(edgesInto(compiled, `shot:${id}:frame`, 'ref-images')).toHaveLength(2);
      expect(edgesInto(compiled, `shot:${id}:video`, 'ref-images')).toHaveLength(0);
    }
  });

  it('opens every clip on its own panel', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook'), shot('proof')]));

    for (const id of ['hook', 'proof']) {
      const first = edgesInto(compiled, `shot:${id}:video`, 'first-frame');
      expect(first).toHaveLength(1);
      expect(first[0].from_ref).toBe(`shot:${id}:frame`);
    }
  });

  it('pins veo-3.1-fast at 720p and leaves referenceMode to its frames default', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook')]));
    const video = compiled.nodes.find((node) => node.type === 'videoGen');

    expect(video?.data?.model).toBe('veo-3.1-fast');
    // 1080p+ requires an 8s duration; a 4s shot there compiles green then 400s.
    expect(video?.data?.resolution).toBe('720p');
    expect(video?.data?.referenceMode).toBeUndefined();
  });

  it('labels panels and clips so the row reads as a contact sheet', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook')]));
    expect(compiled.nodes.find((n) => n.type === 'nanoGen')?.data?.label).toBe('Panel hook');
    expect(compiled.nodes.find((n) => n.type === 'videoGen')?.data?.label).toBe('Clip hook');
  });
});

describe('compileUgcTalkingHeadWorkflow — panel-to-panel continuity', () => {
  it('closes a match shot on the next shot panel', () => {
    const compiled = compileUgcTalkingHeadWorkflow(
      recipe([shot('hook', 'match'), shot('proof', 'match'), shot('cta')]),
    );

    expect(edgesInto(compiled, 'shot:hook:video', 'last-frame')[0].from_ref).toBe(
      'shot:proof:frame',
    );
    expect(edgesInto(compiled, 'shot:proof:video', 'last-frame')[0].from_ref).toBe(
      'shot:cta:frame',
    );
  });

  it('never gives the final shot a closing frame', () => {
    const compiled = compileUgcTalkingHeadWorkflow(
      recipe([shot('hook', 'match'), shot('cta', 'match')]),
    );
    expect(edgesInto(compiled, 'shot:cta:video', 'last-frame')).toHaveLength(0);
  });

  it('omits the closing frame entirely for a cut shot', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook'), shot('cta')]));
    expect(edgesInto(compiled, 'shot:hook:video', 'last-frame')).toHaveLength(0);
  });

  // Continuity must not depend on a rendered clip — that would serialise the
  // graph behind the first paid render and break review-before-spend.
  it('never sources a closing frame from a video node', () => {
    const compiled = compileUgcTalkingHeadWorkflow(
      recipe([shot('hook', 'match'), shot('proof', 'match'), shot('cta')]),
    );
    const videoRefs = new Set(
      compiled.nodes.filter((n) => n.type === 'videoGen').map((n) => n.ref),
    );

    for (const edge of compiled.connections.filter((e) => e.role === 'last-frame')) {
      expect(videoRefs.has(edge.from_ref)).toBe(false);
    }
  });
});

describe('compileUgcTalkingHeadWorkflow — assembly and validity', () => {
  it('produces a provider-valid graph with an ordered timeline', () => {
    const compiled = compileUgcTalkingHeadWorkflow(
      recipe([shot('hook', 'match'), shot('proof'), shot('cta')]),
    );
    const built = buildWorkflowGraph([...refNodes, ...compiled.nodes], compiled.connections);

    expect(built.errors).toEqual([]);
    const timeline = built.graph.nodes.find((node) => node.type === 'timelineEditor');
    expect(timeline?.data?.items).toEqual([
      { sourceNodeId: 'shot:hook:video', order: 0, kind: 'video' },
      { sourceNodeId: 'shot:proof:video', order: 1, kind: 'video' },
      { sourceNodeId: 'shot:cta:video', order: 2, kind: 'video' },
    ]);
  });

  it('reports panel refs so the agent can address a panel for revision', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook', 'match'), shot('cta')]));

    expect(compiled.shots.map((s) => s.frameRef)).toEqual(['shot:hook:frame', 'shot:cta:frame']);
    expect(compiled.shots[0].lastFramePanelRef).toBe('shot:cta:frame');
    expect(compiled.shots[1].lastFramePanelRef).toBeUndefined();
  });

  it('exposes the storyboard as its own module feeding the shots', () => {
    const compiled = compileUgcTalkingHeadWorkflow(recipe([shot('hook')]));

    expect(compiled.modules.find((m) => m.id === 'ugc:storyboard')?.outputPorts).toEqual([
      'panels',
    ]);
    expect(compiled.modules.find((m) => m.id === 'ugc:shots')?.inputPorts).toEqual(['panels']);
  });

  it('rejects duplicate shot ids', () => {
    expect(() => compileUgcTalkingHeadWorkflow(recipe([shot('dup'), shot('dup')]))).toThrow();
  });
});
