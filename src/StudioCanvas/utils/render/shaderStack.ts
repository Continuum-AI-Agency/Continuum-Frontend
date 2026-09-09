import type { ShaderStackV1 } from '@continuum/contracts';

import type { ClipEffectSpec } from './effectSpec';

export function shaderStackFromClipEffects(effects: ClipEffectSpec | undefined): ShaderStackV1 {
  const byId = new Map(
    effects?.shaderStack?.effects.map((effect) => [effect.effectId, effect] as const) ?? [],
  );
  const set = (effect: ShaderStackV1['effects'][number]) => byId.set(effect.effectId, effect);
  if (effects?.chromaKey) {
    set({
      effectId: 'chroma_key',
      enabled: true,
      parameters: effects.chromaKey,
      keyframes: [],
    });
  }
  if (effects?.tint && effects.tint.amount > 0) {
    set({
      effectId: 'tint',
      enabled: true,
      parameters: effects.tint,
      keyframes: [],
    });
  }
  if (effects?.vignette?.amount) {
    set({
      effectId: 'vignette',
      enabled: true,
      parameters: effects.vignette,
      keyframes: [],
    });
  }
  if (effects?.filmGrain?.amount) {
    set({
      effectId: 'film_grain',
      enabled: true,
      parameters: effects.filmGrain,
      keyframes: [],
    });
  }
  if (effects?.pixelate && effects.pixelate.blockPx >= 2) {
    set({
      effectId: 'pixelate',
      enabled: true,
      parameters: effects.pixelate,
      keyframes: [],
    });
  }
  if (effects?.chromaticAberration?.amount) {
    set({
      effectId: 'chromatic_aberration',
      enabled: true,
      parameters: effects.chromaticAberration,
      keyframes: [],
    });
  }
  if (effects?.vhs?.amount) {
    set({ effectId: 'vhs', enabled: true, parameters: effects.vhs, keyframes: [] });
  }
  return { version: 1, effects: [...byId.values()] };
}

/** Carry deferred source effects into a clip while letting that clip override duplicate ids. */
export function mergeClipShaderEffects(
  itemEffects: ClipEffectSpec | undefined,
  sourceStack: ShaderStackV1 | undefined,
): ClipEffectSpec | undefined {
  if (!sourceStack) return itemEffects;
  const byId = new Map(sourceStack.effects.map((effect) => [effect.effectId, effect] as const));
  for (const effect of itemEffects?.shaderStack?.effects ?? []) byId.set(effect.effectId, effect);
  return {
    ...itemEffects,
    shaderStack: { version: 1, effects: [...byId.values()] },
  };
}

export function hasShaderStack(effects: ClipEffectSpec | undefined): boolean {
  return shaderStackFromClipEffects(effects).effects.some((effect) => effect.enabled);
}
