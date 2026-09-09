import { z } from 'zod';

import { shotContinuitySchema } from './contact-sheet';
import type { ConnectSpec, NodeSpec } from './workflow-builder';

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

export const storyboardShotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i),
    title: z.string().min(1).max(500),
    frameDirection: z.string().min(1).max(1000),
    visualDirection: z.string().min(1).max(1000),
    spokenLine: z.string().max(4000).optional(),
    cameraMove: z.string().min(1).max(2000).default('Locked camera.'),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    continuity: shotContinuitySchema.default('cut'),
    referenceNodeIds: z.array(z.string().min(1)).max(20).default([]),
  })
  .strict();
export type StoryboardShot = z.infer<typeof storyboardShotSchema>;

export const storyboardRecipeSchema = z
  .object({
    recipe: z.literal('storyboard'),
    objective: z.string().min(1).max(2000),
    script: z.string().min(1).max(50_000),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('16:9'),
    references: z
      .array(
        z
          .object({
            nodeId: z.string().min(1),
            role: z.enum(['style', 'character', 'location', 'product', 'score', 'ambience']),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    shots: z.array(storyboardShotSchema).min(1).max(50),
  })
  .strict()
  .superRefine((recipe, context) => {
    const ids = recipe.shots.map((shot) => shot.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['shots'], message: 'Shot ids must be unique' });
    }
  });
export type StoryboardRecipe = z.infer<typeof storyboardRecipeSchema>;

export function compileStoryboardWorkflow(input: StoryboardRecipe): CompiledUgcTalkingHeadWorkflow {
  const recipe = storyboardRecipeSchema.parse(input);
  const timelineRef = 'storyboard:assembly:timeline';
  return {
    timelineRef,
    nodes: [
      {
        ref: timelineRef,
        type: 'timelineEditor',
        data: {
          items: [],
          committed: false,
          productionSeed: {
            recipe: 'storyboard',
            objective: recipe.objective,
            sourceScript: recipe.script,
            aspectRatio: recipe.aspectRatio,
            references: recipe.references,
            shots: recipe.shots.map((shot, order) => ({
              id: shot.id,
              order,
              title: shot.title,
              brief: shot.frameDirection,
              spokenLine: shot.spokenLine,
              subjectAction: shot.frameDirection,
              cameraMove: shot.cameraMove,
              inSceneEvent: shot.visualDirection,
              continuity: shot.continuity,
              referenceIds: shot.referenceNodeIds,
              targetDurationSec: shot.durationSeconds,
            })),
          },
          ...moduleData('storyboard:assembly', 'timeline'),
        },
      },
    ],
    connections: recipe.references.map((reference) => ({
      from_ref: reference.nodeId,
      to_ref: timelineRef,
      role: 'media-in',
    })),
    shots: recipe.shots.map((shot) => ({
      id: shot.id,
      title: shot.title,
      brief: shot.frameDirection,
    })),
    modules: [
      {
        version: 1,
        id: 'storyboard:assembly',
        label: 'Storyboard assembly',
        kind: 'assembly',
        nodeRefs: [timelineRef],
        inputPorts: ['references'],
        outputPorts: ['final-video'],
      },
    ],
  };
}

export interface CompiledUgcShot {
  id: string;
  title: string;
  brief: string;
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

export function compileUgcTalkingHeadWorkflow(
  input: UgcTalkingHeadRecipe,
): CompiledUgcTalkingHeadWorkflow {
  const recipe = ugcTalkingHeadRecipeSchema.parse(input);
  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];
  const shots: CompiledUgcShot[] = [];
  const timelineRef = 'ugc:assembly:timeline';
  shots.push(
    ...recipe.shots.map((shot) => ({
      id: shot.id,
      title: `Shot ${shot.id}`,
      brief: shot.frameDirection,
    })),
  );
  nodes.push({
    ref: timelineRef,
    type: 'timelineEditor',
    data: {
      items: [],
      committed: false,
      productionSeed: {
        recipe: 'ugc_talking_head',
        objective: recipe.objective,
        aspectRatio: recipe.aspectRatio,
        references: [
          ...recipe.characterRefNodeIds.map((nodeId) => ({ nodeId, role: 'character' })),
          ...recipe.productRefNodeIds.map((nodeId) => ({ nodeId, role: 'product' })),
        ],
        shots: recipe.shots.map((shot, order) => ({
          id: shot.id,
          order,
          title: `Shot ${order + 1}`,
          brief: shot.frameDirection,
          spokenLine: shot.spokenLine,
          subjectAction: shot.frameDirection,
          cameraMove: 'Slow controlled dolly in.',
          inSceneEvent: shot.visualDirection,
          continuity: shot.continuity,
          targetDurationSec: shot.durationSeconds,
        })),
      },
      ...moduleData('ugc:assembly', 'timeline'),
    },
  });
  for (const reference of [...recipe.characterRefNodeIds, ...recipe.productRefNodeIds]) {
    connections.push({ from_ref: reference, to_ref: timelineRef, role: 'media-in' });
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
        id: 'ugc:assembly',
        label: 'UGC assembly',
        kind: 'assembly',
        nodeRefs: [timelineRef],
        inputPorts: ['character-images', 'product-images'],
        outputPorts: ['final-video'],
      },
    ],
  };
}
