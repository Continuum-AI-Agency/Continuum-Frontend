import { describe, expect, it } from 'bun:test';
import type { ShaderEffectV1 } from '@continuum/contracts';
import { resolveShaderParameter } from '@/lib/vgpu/renderShaderStack';
import { hasShaderStack, mergeClipShaderEffects, shaderStackFromClipEffects } from './shaderStack';

describe('shaderStackFromClipEffects', () => {
  it('keeps the curated render order and skips disabled/no-op fields', () => {
    const stack = shaderStackFromClipEffects({
      tint: { color: '#ff0000', amount: 0.4 },
      vignette: { amount: 0.8 },
      filmGrain: { amount: 0 },
      pixelate: { blockPx: 12 },
      vhs: { amount: 0.2 },
    });
    expect(stack.effects.map((effect) => effect.effectId)).toEqual([
      'tint',
      'vignette',
      'pixelate',
      'vhs',
    ]);
    expect(hasShaderStack({ shaderStack: stack })).toBe(true);
    expect(hasShaderStack(undefined)).toBe(false);
  });

  it('merges deferred source, canonical clip, and legacy clip effects by curated id', () => {
    const effects = mergeClipShaderEffects(
      {
        shaderStack: {
          version: 1,
          effects: [
            { effectId: 'vignette', enabled: true, parameters: { amount: 0.6 }, keyframes: [] },
          ],
        },
        vignette: { amount: 0.9 },
        vhs: { amount: 0.3 },
      },
      {
        version: 1,
        effects: [
          { effectId: 'vignette', enabled: true, parameters: { amount: 0.2 }, keyframes: [] },
          { effectId: 'film_grain', enabled: true, parameters: { amount: 0.1 }, keyframes: [] },
        ],
      },
    );

    expect(
      Object.fromEntries(
        shaderStackFromClipEffects(effects).effects.map((effect) => [
          effect.effectId,
          effect.parameters,
        ]),
      ),
    ).toEqual({
      vignette: { amount: 0.9 },
      film_grain: { amount: 0.1 },
      vhs: { amount: 0.3 },
    });
  });
});

describe('resolveShaderParameter', () => {
  const effect: ShaderEffectV1 = {
    effectId: 'vignette',
    enabled: true,
    parameters: { amount: 0.1 },
    keyframes: [
      {
        id: 'start',
        property: 'effect.parameter',
        parameterName: 'amount',
        timeSec: 0,
        value: 0.2,
        interpolation: 'linear',
      },
      {
        id: 'end',
        property: 'effect.parameter',
        parameterName: 'amount',
        timeSec: 4,
        value: 1,
        interpolation: 'linear',
      },
    ],
  };

  it('interpolates in source seconds and clamps at the endpoints', () => {
    expect(resolveShaderParameter(effect, 'amount', -1)).toBe(0.2);
    expect(resolveShaderParameter(effect, 'amount', 2)).toBeCloseTo(0.6);
    expect(resolveShaderParameter(effect, 'amount', 9)).toBe(1);
  });
});
