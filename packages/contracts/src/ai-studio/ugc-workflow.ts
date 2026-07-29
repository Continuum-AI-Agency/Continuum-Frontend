import { z } from 'zod';

import { planContactSheetFrames, shotContinuitySchema } from './contact-sheet';
import type { ConnectSpec, NodeSpec } from './workflow-builder';
import type { TimelineItemSpec } from './workflow-graph';

export const workflowModuleKindSchema = z.enum([
  'character_reference',
  'product_reference',
  'shot_sequence',
  'assembly',
]);
export type WorkflowModuleKind = z.infer<typeof workflowModuleKindSchema>;

export const workflowModuleManifestSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    label: z.string().min(1),
    kind: workflowModuleKindSchema,
    nodeRefs: z.array(z.string().min(1)),
    inputPorts: z.array(z.string().min(1)).default([]),
    outputPorts: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type WorkflowModuleManifest = z.infer<typeof workflowModuleManifestSchema>;

export const ugcShotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i),
    spokenLine: z.string().min(1).max(500),
    /** Static framing for this shot's storyboard panel — what the still must show. */
    frameDirection: z.string().min(1).max(1000),
    /** Motion for the clip once the panel is animated. Deliberately separate: a
     *  panel prompt says "preserve the exact person from reference 1"; a motion
     *  prompt says "animate this exact first frame". They are not the same text. */
    visualDirection: z.string().min(1).max(1000),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    /** `match` closes this shot on the NEXT shot's panel so it flows seamlessly
     *  into it; `cut` (default) lets the shot end where the model takes it. */
    continuity: shotContinuitySchema.default('cut'),
  })
  .strict();
export type UgcShot = z.infer<typeof ugcShotSchema>;

export const ugcTalkingHeadRecipeSchema = z
  .object({
    recipe: z.literal('ugc_talking_head'),
    objective: z.string().min(1).max(2000),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
    characterRefNodeIds: z.array(z.string().min(1)).min(1).max(4),
    productRefNodeIds: z.array(z.string().min(1)).min(1).max(4),
    shots: z.array(ugcShotSchema).min(1).max(8),
  })
  .strict()
  .superRefine((recipe, context) => {
    const ids = recipe.shots.map((shot) => shot.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['shots'], message: 'Shot ids must be unique' });
    }
  });
export type UgcTalkingHeadRecipe = z.infer<typeof ugcTalkingHeadRecipeSchema>;

export interface CompiledUgcShot {
  id: string;
  /** Static-framing prompt feeding this shot's storyboard panel. */
  framePromptRef: string;
  /** The panel itself — a clean vertical still. This is what the human reviews. */
  frameRef: string;
  /** Motion prompt feeding the clip. */
  motionPromptRef: string;
  videoRef: string;
  /** Panel supplying the closing frame, when this shot match-cuts into the next. */
  lastFramePanelRef?: string;
}

export interface CompiledUgcTalkingHeadWorkflow {
  nodes: NodeSpec[];
  connections: ConnectSpec[];
  modules: WorkflowModuleManifest[];
  shots: CompiledUgcShot[];
  timelineRef: string;
}

const moduleData = (moduleId: string, moduleRole: string): Record<string, string> => ({
  workflowModuleId: moduleId,
  workflowModuleRole: moduleRole,
});

const STORYBOARD_MODULE = 'ugc:storyboard';
const SHOT_MODULE = 'ugc:shots';

export function compileUgcTalkingHeadWorkflow(
  input: UgcTalkingHeadRecipe,
): CompiledUgcTalkingHeadWorkflow {
  const recipe = ugcTalkingHeadRecipeSchema.parse(input);
  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];
  const shots: CompiledUgcShot[] = [];
  const shotNodeRefs: string[] = [];
  const storyboardNodeRefs: string[] = [];

  const framePlan = planContactSheetFrames({
    panelCount: recipe.shots.length,
    continuity: recipe.shots.map((shot) => shot.continuity),
  });

  // Pass 1 — every panel, drawn from the SAME references. These are independent,
  // so the canvas renders them in parallel and the human reviews the whole sheet
  // before a single clip is paid for.
  for (const shot of recipe.shots) {
    const framePromptRef = `shot:${shot.id}:frame-prompt`;
    const frameRef = `shot:${shot.id}:frame`;

    nodes.push({
      ref: framePromptRef,
      type: 'string',
      data: {
        value: [
          recipe.objective,
          `Frame: ${shot.frameDirection}`,
          'One clean vertical frame, single scene, no panels or collage.',
          'Preserve the exact person from the character reference and the exact product from the product reference: face, hair, wardrobe, packaging geometry, colorway, and label all unchanged.',
          'No captions, logos, watermarks, or rendered text of any kind.',
        ].join('\n'),
        ...moduleData(STORYBOARD_MODULE, `shot:${shot.id}:frame-prompt`),
      },
    });
    nodes.push({
      ref: frameRef,
      type: 'nanoGen',
      data: {
        model: 'nano-banana-2',
        positivePrompt: '',
        aspectRatio: recipe.aspectRatio,
        // Unlabelled, a row of generators reads as identical boxes. The role label
        // is what turns the row into a contact sheet.
        label: `Panel ${shot.id}`,
        ...moduleData(STORYBOARD_MODULE, `shot:${shot.id}:frame`),
      },
    });
    connections.push({ from_ref: framePromptRef, to_ref: frameRef, role: 'prompt' });

    // Identity is locked HERE, on the still — not on the video. Veo takes frames
    // XOR reference images, so this is the only place the references can act.
    for (const characterRef of recipe.characterRefNodeIds) {
      connections.push({ from_ref: characterRef, to_ref: frameRef, role: 'ref-images' });
    }
    for (const productRef of recipe.productRefNodeIds) {
      connections.push({ from_ref: productRef, to_ref: frameRef, role: 'ref-images' });
    }
    storyboardNodeRefs.push(framePromptRef, frameRef);
  }

  // Pass 2 — animate each approved panel. Runs entirely in `frames` mode.
  for (const [index, shot] of recipe.shots.entries()) {
    const frameRef = `shot:${shot.id}:frame`;
    const motionPromptRef = `shot:${shot.id}:motion-prompt`;
    const videoRef = `shot:${shot.id}:video`;
    const plan = framePlan[index];

    nodes.push({
      ref: motionPromptRef,
      type: 'string',
      data: {
        value: [
          `Animate this exact first frame. ${shot.visualDirection}`,
          `The creator says clearly: ${shot.spokenLine}`,
          'Hold the same person, product, wardrobe, location, lighting logic, and lens language as the frame.',
          'Do not render captions, logos, or on-screen text.',
        ].join('\n'),
        ...moduleData(SHOT_MODULE, `shot:${shot.id}:motion-prompt`),
      },
    });
    nodes.push({
      ref: videoRef,
      type: 'videoGen',
      data: {
        // `referenceMode` is deliberately omitted: veo-3.1-fast defaults to
        // `frames`, the only mode exposing first-frame/last-frame. Naming
        // veo-3.1 instead would default to `images` and reject the frame edge.
        model: 'veo-3.1-fast',
        prompt: '',
        aspectRatio: recipe.aspectRatio,
        durationSeconds: shot.durationSeconds,
        // 1080p and above require an 8s duration; 720p accepts 4/6/8. A 4s shot
        // at 1080p compiles green and then 400s at Run.
        resolution: '720p',
        label: `Clip ${shot.id}`,
        ...moduleData(SHOT_MODULE, `shot:${shot.id}:video`),
      },
    });
    connections.push({ from_ref: motionPromptRef, to_ref: videoRef, role: 'prompt' });
    connections.push({ from_ref: frameRef, to_ref: videoRef, role: 'first-frame' });

    const compiledShot: CompiledUgcShot = {
      id: shot.id,
      framePromptRef: `shot:${shot.id}:frame-prompt`,
      frameRef,
      motionPromptRef,
      videoRef,
    };

    // Continuity without serialization: the closing frame is the NEXT shot's
    // panel, which already exists. No frameExtract, no waiting on a render.
    if (plan?.lastFramePanelIndex != null) {
      const successor = recipe.shots[plan.lastFramePanelIndex];
      const lastFramePanelRef = `shot:${successor.id}:frame`;
      connections.push({ from_ref: lastFramePanelRef, to_ref: videoRef, role: 'last-frame' });
      compiledShot.lastFramePanelRef = lastFramePanelRef;
    }

    shots.push(compiledShot);
    shotNodeRefs.push(motionPromptRef, videoRef);
  }

  const timelineRef = 'ugc:assembly:timeline';
  const items: TimelineItemSpec[] = shots.map((shot, order) => ({
    sourceNodeId: shot.videoRef,
    order,
    kind: 'video',
  }));
  nodes.push({
    ref: timelineRef,
    type: 'timelineEditor',
    data: {
      items,
      committed: false,
      ...moduleData('ugc:assembly', 'timeline'),
    },
  });
  for (const shot of shots) {
    connections.push({ from_ref: shot.videoRef, to_ref: timelineRef, role: 'media-in' });
  }

  return {
    nodes,
    connections,
    shots,
    timelineRef,
    modules: [
      {
        version: 1,
        id: 'ugc:character-reference',
        label: 'Character references',
        kind: 'character_reference',
        nodeRefs: recipe.characterRefNodeIds,
        inputPorts: [],
        outputPorts: ['character-images'],
      },
      {
        version: 1,
        id: 'ugc:product-reference',
        label: 'Product references',
        kind: 'product_reference',
        nodeRefs: recipe.productRefNodeIds,
        inputPorts: [],
        outputPorts: ['product-images'],
      },
      {
        version: 1,
        id: STORYBOARD_MODULE,
        label: 'Storyboard contact sheet',
        kind: 'shot_sequence',
        nodeRefs: storyboardNodeRefs,
        inputPorts: ['character-images', 'product-images'],
        outputPorts: ['panels'],
      },
      {
        version: 1,
        id: SHOT_MODULE,
        label: 'Talking-head shots',
        kind: 'shot_sequence',
        nodeRefs: shotNodeRefs,
        inputPorts: ['panels'],
        outputPorts: ['clips'],
      },
      {
        version: 1,
        id: 'ugc:assembly',
        label: 'UGC assembly',
        kind: 'assembly',
        nodeRefs: [timelineRef],
        inputPorts: ['clips'],
        outputPorts: ['final-video'],
      },
    ],
  };
}
