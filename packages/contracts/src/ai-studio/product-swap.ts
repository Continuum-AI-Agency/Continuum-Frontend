import { z } from 'zod';
import type { CompiledFormatWorkflow } from './format-workflows';

export const productSwapShotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().positive(),
    direction: z.string().max(2000).default(''),
  })
  .strict()
  .refine((shot) => shot.endSec > shot.startSec, {
    message: 'Shot end must be after its start.',
    path: ['endSec'],
  });
export type ProductSwapShot = z.infer<typeof productSwapShotSchema>;

export const productSwapRecipeSchema = z
  .object({
    recipe: z.literal('product_swap'),
    sourceVideoNodeId: z.string().min(1),
    sourceDurationSec: z.number().finite().positive(),
    productRefNodeIds: z.array(z.string().min(1)).min(1).max(4),
    sourceProduct: z.string().trim().min(1).max(500),
    replacementProduct: z.string().trim().min(1).max(500),
    visualChanges: z.string().max(2000).default(''),
    shots: z.array(productSwapShotSchema).min(1).max(20),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    if (new Set(recipe.shots.map((shot) => shot.id)).size !== recipe.shots.length) {
      ctx.addIssue({ code: 'custom', path: ['shots'], message: 'Shot ids must be unique.' });
    }
    if (new Set(recipe.productRefNodeIds).size !== recipe.productRefNodeIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['productRefNodeIds'],
        message: 'Product references must be unique.',
      });
    }
    for (const [index, shot] of recipe.shots.entries()) {
      if (
        shot.endSec > recipe.sourceDurationSec ||
        (index > 0 && shot.startSec < recipe.shots[index - 1].endSec)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['shots', index],
          message: 'Shots must be ordered, non-overlapping and inside the source video.',
        });
      }
    }
  });
export type ProductSwapRecipe = z.infer<typeof productSwapRecipeSchema>;

export function productSwapPrompts(recipe: ProductSwapRecipe, shot: ProductSwapShot) {
  const replacement = [
    `Replace only ${recipe.sourceProduct} with the exact ${recipe.replacementProduct} shown in the connected product references.`,
    'Match the reference product shape, proportions, finish, logo and distinguishing details. Do not invent features.',
    'Preserve the person, pose, hand contact and occlusion, camera framing, background and lighting. Match perspective, reflections and contact shadows.',
    recipe.visualChanges
      ? `Explicit visual branding/copy changes: ${recipe.visualChanges}`
      : 'Keep all other visible text and branding unchanged.',
    shot.direction ? `Shot-specific direction: ${shot.direction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    firstFrame: `FIRST FRAME IMAGE EDIT\nUse the connected first source frame as the composition.\n${replacement}\nReturn one edited image at the source aspect ratio, with no added captions.`,
    lastFrame: `LAST FRAME IMAGE EDIT\nUse the connected last source frame as the composition. Keep the same replacement product as the edited first frame.\n${replacement}\nReturn one edited image at the source aspect ratio, with no added captions.`,
    motion: [
      'VIDEO MOTION INSTRUCTIONS',
      `Source shot: ${shot.startSec.toFixed(3)}–${shot.endSec.toFixed(3)} seconds. Target duration: ${(shot.endSec - shot.startSec).toFixed(3)} seconds.`,
      `Product: ${recipe.replacementProduct}. Use the approved edited first and last frames as endpoints.`,
      'Follow the source clip for action, hand movement, camera movement, pacing and timing. Preserve product identity through turns and occlusion; avoid morphing, flicker and extra fingers.',
      shot.direction
        ? `Shot-specific direction: ${shot.direction}`
        : 'Describe the visible action and camera movement from the source before generating.',
      'Preserve source audio during assembly. Review spoken source-brand mentions separately.',
      'Endpoint frames constrain appearance; they do not guarantee that a generated video preserves the source motion.',
    ].join('\n'),
  };
}

/** Preparation only: running this graph trims and extracts; generation is a later deliberate step. */
export function compileProductSwapWorkflow(input: ProductSwapRecipe): CompiledFormatWorkflow {
  const recipe = productSwapRecipeSchema.parse(input);
  const nodes: CompiledFormatWorkflow['nodes'] = [];
  const connections: CompiledFormatWorkflow['connections'] = [];
  const outputRefs: string[] = [];
  for (const shot of recipe.shots) {
    const prefix = `product-swap:${shot.id}`;
    const clip = `${prefix}:clip`;
    const prompts = productSwapPrompts(recipe, shot);
    const provenance = {
      sourceVideoNodeId: recipe.sourceVideoNodeId,
      sourceStartSec: shot.startSec,
      sourceEndSec: shot.endSec,
      recipe: recipe.recipe,
    };
    nodes.push({
      ref: clip,
      type: 'action',
      data: {
        label: `${shot.id} · source shot`,
        actionId: 'video.trim',
        config: { trimStartSec: shot.startSec, trimEndSec: shot.endSec },
        ...provenance,
      },
    });
    connections.push({ from_ref: recipe.sourceVideoNodeId, to_ref: clip, role: 'in' });
    for (const selector of ['first', 'last'] as const) {
      const frame = `${prefix}:${selector}`;
      const prompt = `${prefix}:${selector}-prompt`;
      nodes.push({
        ref: frame,
        type: 'frameExtract',
        data: { selector, label: `${shot.id} · ${selector} frame`, ...provenance },
      });
      nodes.push({
        ref: prompt,
        type: 'string',
        data: {
          value: selector === 'first' ? prompts.firstFrame : prompts.lastFrame,
          promptMode: 'literal',
          label: `${shot.id} · ${selector} frame prompt`,
          ...provenance,
        },
      });
      connections.push(
        { from_ref: clip, to_ref: frame, role: 'video' },
        { from_ref: frame, to_ref: prompt, role: 'image' },
      );
      for (const productRef of recipe.productRefNodeIds) {
        connections.push({ from_ref: productRef, to_ref: prompt, role: 'image' });
      }
      outputRefs.push(frame, prompt);
    }
    const motion = `${prefix}:motion-prompt`;
    nodes.push({
      ref: motion,
      type: 'string',
      data: {
        value: prompts.motion,
        promptMode: 'literal',
        label: `${shot.id} · motion prompt`,
        ...provenance,
      },
    });
    outputRefs.push(clip, motion);
  }
  return { nodes, connections, outputRefs };
}
