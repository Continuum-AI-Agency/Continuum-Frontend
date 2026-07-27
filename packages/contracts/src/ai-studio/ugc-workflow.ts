import { z } from 'zod';

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
    visualDirection: z.string().min(1).max(1000),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    continuityFromPrevious: z.enum(['exact', 'reference', 'independent']),
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
    if (recipe.shots[0]?.continuityFromPrevious !== 'independent') {
      context.addIssue({
        code: 'custom',
        path: ['shots', 0, 'continuityFromPrevious'],
        message: 'The first shot cannot continue from a previous shot',
      });
    }
  });
export type UgcTalkingHeadRecipe = z.infer<typeof ugcTalkingHeadRecipeSchema>;

export interface CompiledUgcShot {
  id: string;
  promptRef: string;
  videoRef: string;
  continuityFrameRef?: string;
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
  const shotNodeRefs: string[] = [];

  for (const [index, shot] of recipe.shots.entries()) {
    const promptRef = `shot:${shot.id}:prompt`;
    const videoRef = `shot:${shot.id}:video`;
    const shotModuleId = 'ugc:shots';
    const prompt = [
      recipe.objective,
      `Spoken line: ${shot.spokenLine}`,
      `Direction: ${shot.visualDirection}`,
      'Keep the same identifiable character, product, wardrobe, lighting logic, and lens language.',
      'Natural creator-style talking-head delivery. Do not add captions or logos in-model.',
    ].join('\n');

    nodes.push({
      ref: promptRef,
      type: 'string',
      data: { value: prompt, ...moduleData(shotModuleId, `shot:${shot.id}:prompt`) },
    });
    nodes.push({
      ref: videoRef,
      type: 'videoGen',
      data: {
        model: 'seedance-2.0',
        referenceMode: 'images',
        prompt: '',
        aspectRatio: recipe.aspectRatio,
        durationSeconds: shot.durationSeconds,
        resolution: '1080p',
        ...moduleData(shotModuleId, `shot:${shot.id}:video`),
      },
    });
    connections.push({ from_ref: promptRef, to_ref: videoRef, role: 'prompt' });
    for (const characterRef of recipe.characterRefNodeIds) {
      connections.push({ from_ref: characterRef, to_ref: videoRef, role: 'ref-images' });
    }
    for (const productRef of recipe.productRefNodeIds) {
      connections.push({ from_ref: productRef, to_ref: videoRef, role: 'ref-images' });
    }

    const compiledShot: CompiledUgcShot = { id: shot.id, promptRef, videoRef };
    if (index > 0 && shot.continuityFromPrevious !== 'independent') {
      const previous = shots[index - 1];
      if (shot.continuityFromPrevious === 'exact') {
        const continuityFrameRef = `shot:${previous.id}:last-frame`;
        nodes.push({
          ref: continuityFrameRef,
          type: 'frameExtract',
          data: {
            selector: 'last',
            outputWidth: 1280,
            quality: 0.9,
            ...moduleData(shotModuleId, `shot:${previous.id}:last-frame`),
          },
        });
        connections.push({
          from_ref: previous.videoRef,
          to_ref: continuityFrameRef,
          role: 'video',
        });
        connections.push({
          from_ref: continuityFrameRef,
          to_ref: videoRef,
          role: 'first-frame',
        });
        compiledShot.continuityFrameRef = continuityFrameRef;
        shotNodeRefs.push(continuityFrameRef);
      } else {
        connections.push({ from_ref: previous.videoRef, to_ref: videoRef, role: 'ref-video' });
      }
    }
    shots.push(compiledShot);
    shotNodeRefs.push(promptRef, videoRef);
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
        id: 'ugc:shots',
        label: 'Talking-head shots',
        kind: 'shot_sequence',
        nodeRefs: shotNodeRefs,
        inputPorts: ['character-images', 'product-images'],
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
