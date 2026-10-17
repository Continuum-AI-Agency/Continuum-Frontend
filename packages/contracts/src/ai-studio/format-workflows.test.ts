import { describe, expect, it } from 'bun:test';
import {
  compileCarouselSetWorkflow,
  compileControlledPairWorkflow,
  compileFastCutWorkflow,
  compileMasterAndCropsWorkflow,
} from './format-workflows';
import { buildWorkflowGraph } from './workflow-builder';
import { fastCutNodeDataSchema } from './workflow-graph';

const promptEdgesInto = (
  connections: Array<{ from_ref: string; to_ref: string; role?: string }>,
  target: string,
) => connections.filter((edge) => edge.to_ref === target && edge.role === 'prompt');

describe('compileCarouselSetWorkflow', () => {
  const recipe = {
    recipe: 'carousel_set' as const,
    invariantLedger: '50mm, key camera-left, mid-grey sweep',
    aspectRatio: '4:5' as const,
    imageModel: 'nano-banana-2',
    slides: [
      { id: 's1', subject: 'a ceramic mug' },
      { id: 's2', subject: 'a steel kettle' },
      { id: 's3', subject: 'a glass carafe' },
    ],
  };

  // The trap this compiler exists for: a wired prompt REPLACES the generator's
  // positivePrompt, so slides sharing one text node all render the same image.
  it('gives every slide its own prompt node', () => {
    const compiled = compileCarouselSetWorkflow(recipe);
    const promptNodes = compiled.nodes.filter((node) => node.type === 'string');

    expect(promptNodes).toHaveLength(3);
    expect(new Set(promptNodes.map((node) => node.ref)).size).toBe(3);
    for (const slide of recipe.slides) {
      expect(promptEdgesInto(compiled.connections, `slide:${slide.id}:image`)).toHaveLength(1);
    }
  });

  it('repeats the invariant ledger verbatim in every slide prompt', () => {
    const compiled = compileCarouselSetWorkflow(recipe);
    for (const node of compiled.nodes.filter((n) => n.type === 'string')) {
      expect(String(node.data?.value)).toContain(recipe.invariantLedger);
    }
  });

  it('anchors slides 2..N on slide 1 and never the reverse', () => {
    const compiled = compileCarouselSetWorkflow(recipe);
    const refEdges = compiled.connections.filter((edge) => edge.role === 'ref-images');

    expect(refEdges).toHaveLength(2);
    for (const edge of refEdges) expect(edge.from_ref).toBe('slide:s1:image');
    expect(refEdges.some((edge) => edge.to_ref === 'slide:s1:image')).toBe(false);
  });

  it('terminates on a carousel publisher carrying every slide in order', () => {
    const compiled = compileCarouselSetWorkflow(recipe);
    const publisher = compiled.nodes.find((node) => node.type === 'plannerDraft');

    expect(publisher?.data?.format).toBe('carousel');
    expect(
      compiled.connections
        .filter((edge) => edge.to_ref === publisher?.ref)
        .map((edge) => edge.from_ref),
    ).toEqual(['slide:s1:image', 'slide:s2:image', 'slide:s3:image']);
  });

  // Asserting the compiled spec is not enough: the spec was always right. The publisher
  // inherited a two-slot default, so the third slide had no handle to land on and
  // buildWorkflowGraph silently dropped its edge. Resolve the graph for real.
  it('resolves every slide edge through buildWorkflowGraph', () => {
    const compiled = compileCarouselSetWorkflow(recipe);
    const { graph, errors } = buildWorkflowGraph(compiled.nodes, compiled.connections);
    const publisher = graph.nodes.find((node) => node.type === 'plannerDraft');
    const intoPublisher = graph.edges.filter((edge) => edge.target === publisher?.id);

    expect(errors).toEqual([]);
    expect(intoPublisher).toHaveLength(recipe.slides.length);
    expect(new Set(intoPublisher.map((edge) => edge.targetHandle)).size).toBe(recipe.slides.length);
  });

  it('rejects duplicate slide ids', () => {
    expect(() =>
      compileCarouselSetWorkflow({
        ...recipe,
        slides: [
          { id: 'dup', subject: 'a' },
          { id: 'dup', subject: 'b' },
        ],
      }),
    ).toThrow();
  });
});

describe('compileControlledPairWorkflow', () => {
  const recipe = {
    recipe: 'controlled_pair' as const,
    invariantLedger: 'same person, 50mm at 60cm, key 45deg camera-left at 5200K, mid-grey seamless',
    changedVariable: 'day 0 vs day 28',
    beforeState: 'dry matte texture across cheekbones',
    afterState: 'even surface sheen across cheekbones',
    aspectRatio: '4:5' as const,
    imageModel: 'nano-banana-2',
  };

  it('emits two sequential frames, never a composite', () => {
    const compiled = compileControlledPairWorkflow(recipe);
    const generators = compiled.nodes.filter((node) => node.type === 'nanoGen');

    expect(generators.map((node) => node.ref)).toEqual(['pair:before:image', 'pair:after:image']);
    for (const node of compiled.nodes.filter((n) => n.type === 'string')) {
      expect(String(node.data?.value)).toContain('No split screen');
    }
  });

  it('differs the two prompts by the state clause alone', () => {
    const compiled = compileControlledPairWorkflow(recipe);
    const [before, after] = compiled.nodes
      .filter((node) => node.type === 'string')
      .map((node) => String(node.data?.value));

    expect(before).toContain(recipe.invariantLedger);
    expect(after).toContain(recipe.invariantLedger);
    expect(before).toContain(recipe.beforeState);
    expect(after).toContain(recipe.afterState);
    expect(after).not.toContain(recipe.beforeState);
  });

  it('holds the scene by wiring the before frame into the after generator', () => {
    const compiled = compileControlledPairWorkflow(recipe);
    expect(
      compiled.connections.filter(
        (edge) =>
          edge.role === 'ref-images' &&
          edge.from_ref === 'pair:before:image' &&
          edge.to_ref === 'pair:after:image',
      ),
    ).toHaveLength(1);
  });

  it('names the changed variable in both prompts so the control is auditable', () => {
    const compiled = compileControlledPairWorkflow(recipe);
    for (const node of compiled.nodes.filter((n) => n.type === 'string')) {
      expect(String(node.data?.value)).toContain(recipe.changedVariable);
    }
  });
});

describe('compileMasterAndCropsWorkflow', () => {
  const recipe = {
    recipe: 'master_and_crops' as const,
    prompt: 'halved lemon on a plaster ledge, hard low sun from camera left',
    masterAspectRatio: '9:16' as const,
    cropAspectRatios: ['9:16', '4:5'] as const,
    imageModel: 'nano-banana-2' as const,
    masterImageSize: '2K' as const,
  };

  it('pins imageSize only on the master, on a model that honours it', () => {
    const compiled = compileMasterAndCropsWorkflow({ ...recipe, cropAspectRatios: ['4:5'] });
    const master = compiled.nodes.find((node) => node.ref === 'master:image');

    expect(master?.data?.imageSize).toBe('2K');
    expect(master?.data?.model).toBe('nano-banana-2');
    expect(compiled.nodes.find((node) => node.ref === 'crop:4-5:image')?.data?.imageSize).toBe(
      undefined,
    );
  });

  it('derives each crop from the master rather than from the brief', () => {
    const compiled = compileMasterAndCropsWorkflow({ ...recipe, cropAspectRatios: ['4:5'] });
    expect(
      compiled.connections.filter(
        (edge) => edge.from_ref === 'master:image' && edge.role === 'ref-images',
      ),
    ).toHaveLength(1);
  });

  // Asking for the ratio the master already is would spend a generation to
  // reproduce a frame that already exists.
  it('skips a crop that matches the master ratio', () => {
    const compiled = compileMasterAndCropsWorkflow(recipe);
    expect(compiled.outputRefs).toEqual(['master:image', 'crop:4-5:image']);
    expect(compiled.nodes.some((node) => node.ref === 'crop:9-16:image')).toBe(false);
  });

  it('gives each crop its own prompt node', () => {
    const compiled = compileMasterAndCropsWorkflow({ ...recipe, cropAspectRatios: ['4:5'] });
    expect(promptEdgesInto(compiled.connections, 'crop:4-5:image')).toHaveLength(1);
    expect(promptEdgesInto(compiled.connections, 'master:image')).toHaveLength(1);
  });
});

describe('compileFastCutWorkflow', () => {
  const recipe = {
    recipe: 'fast_cut' as const,
    pacing: 'stutter' as const,
    bars: 8,
    elements: [{ elementId: 'el-product', styleSlugs: ['goldenhour'] }],
    shots: [
      { id: 'pour', prompt: 'the shake poured over ice, /moonlight', kind: 'video' as const },
      { id: 'bottle', prompt: 'the bottle on a gym bench' },
      { id: 'lift', prompt: 'a deadlift lockout, chalk in the air', kind: 'video' as const },
    ],
  };

  it('leads every shot prompt with the Elements\' style tokens, so a shot\'s own slug comes later', () => {
    const compiled = compileFastCutWorkflow(recipe);
    const prompt = (ref: string) => {
      const data = compiled.nodes.find((node) => node.ref === ref)?.data ?? {};
      return String(data.positivePrompt ?? data.prompt);
    };
    expect(prompt('shot:pour')).toBe('/goldenhour the shake poured over ice, /moonlight');
    expect(prompt('shot:bottle')).toBe('/goldenhour the bottle on a gym bench');
    expect(compiled.nodes.find((node) => node.ref === 'shot:bottle')?.type).toBe('nanoGen');
    expect(compiled.nodes.find((node) => node.ref === 'shot:pour')?.type).toBe('videoGen');
  });

  it('resolves through buildWorkflowGraph: Element → every shot → fastCut, and a bed slot', () => {
    const compiled = compileFastCutWorkflow(recipe);
    const { graph, errors } = buildWorkflowGraph(compiled.nodes, compiled.connections);
    expect(errors).toEqual([]);
    const cut = graph.nodes.find((node) => node.type === 'fastCut');
    const element = graph.nodes.find((node) => node.type === 'element');
    const bed = graph.nodes.find((node) => node.type === 'audio');
    const into = (target: string | undefined, handle: string) =>
      graph.edges.filter((edge) => edge.target === target && edge.targetHandle === handle);
    expect(into(cut?.id, 'media-in')).toHaveLength(3);
    expect(into(cut?.id, 'audio-in').map((edge) => edge.source)).toEqual([bed?.id]);
    expect(graph.edges.filter((edge) => edge.source === element?.id)).toHaveLength(3);
    expect(fastCutNodeDataSchema.parse(cut?.data)).toMatchObject({ pacing: 'stutter', bars: 8 });
    expect(compiled.outputRefs).toEqual(['fastcut:montage']);
  });

  it('lays the montage down as a collage when the recipe asks; cut otherwise', () => {
    const data = (compiled: ReturnType<typeof compileFastCutWorkflow>) =>
      fastCutNodeDataSchema.parse(compiled.nodes.find((node) => node.type === 'fastCut')?.data);
    expect(data(compileFastCutWorkflow({ ...recipe, layout: 'collage' })).layout).toBe('collage');
    expect(data(compileFastCutWorkflow(recipe)).layout).toBe('cut');
  });

  it('refuses a montage of one shot and duplicate shot ids', () => {
    expect(() => compileFastCutWorkflow({ ...recipe, shots: [recipe.shots[1]] })).toThrow();
    expect(() =>
      compileFastCutWorkflow({ ...recipe, shots: [recipe.shots[1], recipe.shots[1]] }),
    ).toThrow();
  });
});
