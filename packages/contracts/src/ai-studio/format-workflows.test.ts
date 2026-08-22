import { describe, expect, it } from 'bun:test';
import {
  compileCarouselSetWorkflow,
  compileControlledPairWorkflow,
  compileMasterAndCropsWorkflow,
} from './format-workflows';

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
