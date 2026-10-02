import { z } from 'zod';
import type { EditorKeyframe } from './editor-project-v2';
import { editorKeyframeSchema } from './editor-project-v2';
import { motionExpressionAtScale } from './motion-eval';

export type MotionRecipe = {
  durationSec: number;
  keyframes: EditorKeyframe[];
  keyframeOffsetSec?: number;
};

export function motionRecipeFromClip(clip: {
  durationSec: number;
  keyframes?: EditorKeyframe[];
  keyframeOffsetSec?: number;
}): MotionRecipe | null {
  const keyframes = clip.keyframes ?? [];
  if (keyframes.length === 0) return null;
  return {
    durationSec: clip.durationSec,
    keyframes,
    ...(clip.keyframeOffsetSec !== undefined ? { keyframeOffsetSec: clip.keyframeOffsetSec } : {}),
  };
}

const motionRecipeSchema = z
  .object({
    durationSec: z.number().finite().positive().max(86_400),
    keyframes: z.array(editorKeyframeSchema).min(1).max(500),
    keyframeOffsetSec: z.number().finite().min(-86_400).max(86_400).optional(),
  })
  .strict();

export function parseMotionRecipe(value: unknown): MotionRecipe | null {
  const parsed = motionRecipeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function applyMotionRecipe<
  T extends { id: string; durationSec: number; keyframeOffsetSec?: number },
>(clip: T, recipe: MotionRecipe): T & { keyframes: EditorKeyframe[] } {
  const scale = recipe.durationSec > 0 ? clip.durationSec / recipe.durationSec : 1;
  const { keyframeOffsetSec: _offset, ...rest } = clip;
  return {
    ...rest,
    ...(recipe.keyframeOffsetSec !== undefined
      ? { keyframeOffsetSec: recipe.keyframeOffsetSec * scale }
      : {}),
    keyframes: recipe.keyframes.map((keyframe) => ({
      ...keyframe,
      id: `${clip.id}:${keyframe.id}`,
      timeSec: keyframe.timeSec * scale,
      ...(keyframe.expression
        ? { expression: motionExpressionAtScale(keyframe.expression, scale) }
        : {}),
    })),
  } as T & { keyframes: EditorKeyframe[] };
}
