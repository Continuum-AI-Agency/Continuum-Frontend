// Typed compilers for the graph shapes the composer reliably gets wrong.
//
// These exist for the same reason `ugc-workflow.ts` does: a graph shape written
// as prose drifts the moment a node type or handle changes, and the composer
// pays repair calls out of an 8-call budget when it drifts. A compiler emits
// validated `NodeSpec`/`ConnectSpec` and lets the canvas resolve handles by
// role, so the shape is guaranteed rather than suggested.
//
// Each one encodes a trap that is invisible from the node vocabulary alone:
//   carousel_set       -- a wired prompt REPLACES a generator's own positivePrompt,
//                         so N slides fed by one text node render N identical images.
//   controlled_pair    -- a comparison is only evidence when one variable moved,
//                         and it must be two sequential frames, never a composite.
//   master_and_crops   -- one master at the tallest ratio, derivatives referencing
//                         it, so a set shares one exposure instead of N generations.

import { z } from 'zod';
import type { ConnectSpec, NodeSpec } from './workflow-builder';

/** Delivery ratios the organic pipeline actually emits. There is deliberately no 1:1. */
export const deliveryAspectRatioSchema = z.enum(['9:16', '4:5']);
export type DeliveryAspectRatio = z.infer<typeof deliveryAspectRatioSchema>;

export interface CompiledFormatWorkflow {
  nodes: NodeSpec[];
  connections: ConnectSpec[];
  /** Refs the caller may want to report back or wire further. */
  outputRefs: string[];
}

// ---------------------------------------------------------------------------
// carousel_set
// ---------------------------------------------------------------------------

export const carouselSlideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i),
    subject: z
      .string()
      .min(1)
      .max(600)
      .describe('What changes on THIS slide. The invariant ledger is supplied once, separately.'),
  })
  .strict();
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

export const carouselSetRecipeSchema = z
  .object({
    recipe: z.literal('carousel_set'),
    invariantLedger: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        'Light direction, background value, focal length, camera height, crop margin, saturation, subject scale — everything that must NOT change between slides.',
      ),
    aspectRatio: deliveryAspectRatioSchema.default('4:5'),
    imageModel: z.string().min(1).default('nano-banana-2'),
    slides: z.array(carouselSlideSchema).min(2).max(10),
  })
  .strict()
  .superRefine((recipe, context) => {
    const ids = recipe.slides.map((slide) => slide.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['slides'], message: 'Slide ids must be unique' });
    }
  });
export type CarouselSetRecipe = z.infer<typeof carouselSetRecipeSchema>;

/**
 * One `string` per slide carrying the ledger verbatim plus that slide's subject,
 * and slide 1's image wired as a reference into every later slide.
 *
 * The per-slide text node is the whole point: sharing one node across generators
 * would make every slide render the same image, because a wired prompt replaces
 * the generator's own `positivePrompt` rather than appending to it.
 */
export function compileCarouselSetWorkflow(input: CarouselSetRecipe): CompiledFormatWorkflow {
  const recipe = carouselSetRecipeSchema.parse(input);
  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];
  const slideRefs: string[] = [];

  let anchorRef: string | null = null;
  for (const slide of recipe.slides) {
    const promptRef = `slide:${slide.id}:prompt`;
    const imageRef = `slide:${slide.id}:image`;

    nodes.push({
      ref: promptRef,
      type: 'string',
      data: {
        value: [
          'Single full-bleed frame, one scene, no panels or collage.',
          `Invariant across every slide of this set: ${recipe.invariantLedger}`,
          `Subject on this slide only: ${slide.subject}`,
        ].join('\n'),
      },
    });
    nodes.push({
      ref: imageRef,
      type: 'nanoGen',
      data: {
        model: recipe.imageModel,
        positivePrompt: '',
        aspectRatio: recipe.aspectRatio,
      },
    });
    connections.push({ from_ref: promptRef, to_ref: imageRef, role: 'prompt' });

    // Slide 1 is the anchor every later slide matches, mirroring
    // renderCarouselSlidesWithSharedReference on the organic side.
    if (anchorRef) {
      connections.push({ from_ref: anchorRef, to_ref: imageRef, role: 'ref-images' });
    } else {
      anchorRef = imageRef;
    }
    slideRefs.push(imageRef);
  }

  const publisherRef = 'carousel:publisher';
  nodes.push({
    ref: publisherRef,
    type: 'organicPublisher',
    // One slot per slide. A publisher's only legal target handles are derived from
    // assetSlots, and each holds exactly one edge, so inheriting the two-slot default
    // left every slide past the second with nowhere to land — the canvas reported
    // "no compatible handle from nanoGen to organicPublisher" and dropped the edge.
    data: {
      format: 'carousel',
      assetSlots: recipe.slides.map((slide, order) => ({ id: slide.id, order })),
    },
  });
  for (const slideRef of slideRefs) {
    connections.push({ from_ref: slideRef, to_ref: publisherRef });
  }

  return {
    nodes,
    connections,
    outputRefs: slideRefs,
  };
}

// ---------------------------------------------------------------------------
// controlled_pair
// ---------------------------------------------------------------------------

export const controlledPairRecipeSchema = z
  .object({
    recipe: z.literal('controlled_pair'),
    invariantLedger: z
      .string()
      .min(1)
      .max(2000)
      .describe('Subject, lens, distance, height, light direction, colour temp, background, crop.'),
    changedVariable: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'The ONE thing that differs. If it takes more than a few words, it is not controlled.',
      ),
    beforeState: z.string().min(1).max(600),
    afterState: z.string().min(1).max(600),
    aspectRatio: deliveryAspectRatioSchema.default('4:5'),
    imageModel: z.string().min(1).default('nano-banana-2'),
  })
  .strict();
export type ControlledPairRecipe = z.infer<typeof controlledPairRecipeSchema>;

/**
 * Two sequential frames whose prompts differ by exactly one clause, with the
 * before frame wired as a reference into the after so the scene is held rather
 * than re-invented. Never a composite — the organic pipeline bans before/after
 * collages by name in every branch, and a composited pair is not evidence anyway.
 */
export function compileControlledPairWorkflow(input: ControlledPairRecipe): CompiledFormatWorkflow {
  const recipe = controlledPairRecipeSchema.parse(input);

  const frame = (phase: 'before' | 'after', state: string) => ({
    promptRef: `pair:${phase}:prompt`,
    imageRef: `pair:${phase}:image`,
    value: [
      'Single frame, one state only. No split screen, side-by-side, diptych, or panel layout.',
      `Held identical across both frames: ${recipe.invariantLedger}`,
      `State in this frame: ${state}`,
      `The only variable that differs between the two frames is: ${recipe.changedVariable}`,
    ].join('\n'),
  });

  const before = frame('before', recipe.beforeState);
  const after = frame('after', recipe.afterState);
  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];

  for (const [phase, spec] of [
    ['before', before],
    ['after', after],
  ] as const) {
    nodes.push({
      ref: spec.promptRef,
      type: 'string',
      data: { value: spec.value },
    });
    nodes.push({
      ref: spec.imageRef,
      type: 'nanoGen',
      data: {
        model: recipe.imageModel,
        positivePrompt: '',
        aspectRatio: recipe.aspectRatio,
      },
    });
    connections.push({ from_ref: spec.promptRef, to_ref: spec.imageRef, role: 'prompt' });
  }
  connections.push({ from_ref: before.imageRef, to_ref: after.imageRef, role: 'ref-images' });

  const publisherRef = 'proof:publisher';
  nodes.push({
    ref: publisherRef,
    type: 'organicPublisher',
    // Two frames, two slots. This happens to match the default today; state it anyway so
    // the pair does not silently break if that default ever changes.
    data: {
      format: 'carousel',
      assetSlots: [
        { id: 'before', order: 0 },
        { id: 'after', order: 1 },
      ],
    },
  });
  connections.push({ from_ref: before.imageRef, to_ref: publisherRef });
  connections.push({ from_ref: after.imageRef, to_ref: publisherRef });

  return {
    nodes,
    connections,
    outputRefs: [before.imageRef, after.imageRef],
  };
}

// ---------------------------------------------------------------------------
// master_and_crops
// ---------------------------------------------------------------------------

export const masterAndCropsRecipeSchema = z
  .object({
    recipe: z.literal('master_and_crops'),
    prompt: z.string().min(1).max(2000),
    /** 9:16 is the tallest delivery ratio, so a 4:5 safe box is a subset of it. */
    masterAspectRatio: deliveryAspectRatioSchema.default('9:16'),
    cropAspectRatios: z.array(deliveryAspectRatioSchema).min(1).max(2),
    /** Only nano-banana-pro and nano-banana-2 honour an imageSize at all. */
    imageModel: z.enum(['nano-banana-pro', 'nano-banana-2']).default('nano-banana-2'),
    masterImageSize: z.enum(['2K', '4K']).default('2K'),
  })
  .strict();
export type MasterAndCropsRecipe = z.infer<typeof masterAndCropsRecipeSchema>;

/**
 * One high-resolution master, then a derivative generator per delivery ratio with
 * the master wired in as a reference, so every crop inherits one exposure,
 * background, and grade instead of arriving as unrelated generations.
 */
export function compileMasterAndCropsWorkflow(input: MasterAndCropsRecipe): CompiledFormatWorkflow {
  const recipe = masterAndCropsRecipeSchema.parse(input);
  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];

  const masterPromptRef = 'master:prompt';
  const masterRef = 'master:image';
  nodes.push({
    ref: masterPromptRef,
    type: 'string',
    data: {
      value: [
        recipe.prompt,
        'Compose so the subject and any type sit inside the region shared by every delivery crop; keep the outer bands empty enough to lose.',
      ].join('\n'),
    },
  });
  nodes.push({
    ref: masterRef,
    type: 'nanoGen',
    data: {
      model: recipe.imageModel,
      positivePrompt: '',
      aspectRatio: recipe.masterAspectRatio,
      imageSize: recipe.masterImageSize,
    },
  });
  connections.push({ from_ref: masterPromptRef, to_ref: masterRef, role: 'prompt' });

  const outputRefs: string[] = [masterRef];
  for (const ratio of recipe.cropAspectRatios) {
    if (ratio === recipe.masterAspectRatio) continue;
    const slug = ratio.replace(':', '-');
    const cropPromptRef = `crop:${slug}:prompt`;
    const cropRef = `crop:${slug}:image`;

    // Its own text node: a wired prompt replaces the generator's positivePrompt,
    // so sharing the master's node would defeat the recomposition instruction.
    nodes.push({
      ref: cropPromptRef,
      type: 'string',
      data: {
        value: [
          recipe.prompt,
          `Recompose the SAME scene for a ${ratio} frame. Same subject, light, background, grade and treatment as the reference; only the framing changes.`,
        ].join('\n'),
      },
    });
    nodes.push({
      ref: cropRef,
      type: 'nanoGen',
      data: {
        model: recipe.imageModel,
        positivePrompt: '',
        aspectRatio: ratio,
      },
    });
    connections.push({ from_ref: cropPromptRef, to_ref: cropRef, role: 'prompt' });
    connections.push({ from_ref: masterRef, to_ref: cropRef, role: 'ref-images' });
    outputRefs.push(cropRef);
  }

  return {
    nodes,
    connections,
    outputRefs,
  };
}
