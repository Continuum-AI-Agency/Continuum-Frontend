import type { EditorKeyframe } from './editor-project-v2';
import { editorKeyframeSchema } from './editor-project-v2';

export type MotionRecipe = {
  durationSec: number;
  keyframes: EditorKeyframe[];
};

export function motionRecipeFromClip(clip: {
  durationSec: number;
  keyframes?: EditorKeyframe[];
}): MotionRecipe | null {
  const keyframes = clip.keyframes ?? [];
  if (keyframes.length === 0) return null;
  return { durationSec: clip.durationSec, keyframes };
}

export function parseMotionRecipe(value: unknown): MotionRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { durationSec?: unknown; keyframes?: unknown };
  if (typeof record.durationSec !== 'number' || !Array.isArray(record.keyframes)) return null;
  const keyframes: EditorKeyframe[] = [];
  for (const entry of record.keyframes) {
    const parsed = editorKeyframeSchema.safeParse(entry);
    if (parsed.success) keyframes.push(parsed.data);
  }
  if (keyframes.length === 0) return null;
  return { durationSec: record.durationSec, keyframes };
}

export function applyMotionRecipe<T extends { id: string; durationSec: number }>(
  clip: T,
  recipe: MotionRecipe,
): T & { keyframes: EditorKeyframe[] } {
  const scale = recipe.durationSec > 0 ? clip.durationSec / recipe.durationSec : 1;
  return {
    ...clip,
    keyframes: recipe.keyframes.map((keyframe) => ({
      ...keyframe,
      id: `${clip.id}:${keyframe.id}`,
      timeSec: Math.max(0, Math.min(clip.durationSec, keyframe.timeSec * scale)),
    })),
  };
}
