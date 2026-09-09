import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { shaderActionConfigSchema, shaderStackV1Schema } from './shader-stack';

describe('shaderStackV1Schema', () => {
  test('parses curated effects with the existing effect keyframe shape', () => {
    expect(
      shaderStackV1Schema.parse({
        version: 1,
        effects: [
          {
            effectId: 'vignette',
            parameters: { amount: 0.65 },
            keyframes: [
              {
                id: 'vignette-in',
                property: 'effect.parameter',
                parameterName: 'amount',
                timeSec: 0,
                value: 0,
                interpolation: 'linear',
              },
            ],
          },
          { effectId: 'pixelate', parameters: { blockPx: 12 } },
          {
            effectId: 'chroma_key',
            parameters: { color: '#00ff00', tolerance: 0.25, softness: 0.1 },
          },
        ],
      }),
    ).toEqual({
      version: 1,
      effects: [
        {
          effectId: 'vignette',
          enabled: true,
          parameters: { amount: 0.65 },
          keyframes: [
            {
              id: 'vignette-in',
              property: 'effect.parameter',
              parameterName: 'amount',
              timeSec: 0,
              value: 0,
              interpolation: 'linear',
            },
          ],
        },
        {
          effectId: 'pixelate',
          enabled: true,
          parameters: { blockPx: 12 },
          keyframes: [],
        },
        {
          effectId: 'chroma_key',
          enabled: true,
          parameters: { color: '#00ff00', tolerance: 0.25, softness: 0.1 },
          keyframes: [],
        },
      ],
    });
  });

  test('rejects arbitrary shader source, unknown effects and invalid parameters', () => {
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [{ effectId: 'vignette', parameters: { amount: 0.5 }, wgsl: '@fragment' }],
      }).success,
    ).toBe(false);
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [
          { effectId: 'vignette', parameters: { amount: 0.25 } },
          { effectId: 'vignette', parameters: { amount: 0.75 } },
        ],
      }).success,
    ).toBe(false);
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [{ effectId: 'custom_wgsl', parameters: {} }],
      }).success,
    ).toBe(false);
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [{ effectId: 'pixelate', parameters: { blockPx: 1 } }],
      }).success,
    ).toBe(false);
  });

  test('rejects keyframes for another effect or the wrong parameter type', () => {
    const keyframe = {
      id: 'bad',
      property: 'effect.parameter',
      timeSec: 1,
      interpolation: 'linear',
    } as const;
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [
          {
            effectId: 'vignette',
            parameters: { amount: 0.5 },
            keyframes: [{ ...keyframe, parameterName: 'blockPx', value: 8 }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      shaderStackV1Schema.safeParse({
        version: 1,
        effects: [
          {
            effectId: 'vignette',
            parameters: { amount: 0.5 },
            keyframes: [{ ...keyframe, parameterName: 'amount', value: 'high' }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('shaderActionConfigSchema', () => {
  test('defaults to a deferred empty stack and accepts explicit baking', () => {
    expect(shaderActionConfigSchema.parse({})).toEqual({
      mode: 'deferred',
      shaderStack: { version: 1, effects: [] },
    });
    expect(
      shaderActionConfigSchema.parse({
        mode: 'bake',
        shaderStack: {
          version: 1,
          effects: [{ effectId: 'vhs', parameters: { amount: 0.8 } }],
        },
      }).mode,
    ).toBe('bake');
  });

  test('emits a provider-safe object schema', () => {
    const json = JSON.stringify(z.toJSONSchema(shaderActionConfigSchema));
    expect(json).not.toContain('"oneOf"');
    expect(json).not.toContain('"anyOf"');
    expect(json).not.toContain('"allOf"');
    expect(json).not.toMatch(/"enum":\[\d/);
  });
});
