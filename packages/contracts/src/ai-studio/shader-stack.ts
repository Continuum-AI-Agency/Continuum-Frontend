import { z } from 'zod';

export const SHADER_PRESET_IDS = [
  'chroma_key',
  'tint',
  'vignette',
  'film_grain',
  'pixelate',
  'chromatic_aberration',
  'vhs',
] as const;

export const shaderPresetIdSchema = z.enum(SHADER_PRESET_IDS);
export type ShaderPresetId = z.infer<typeof shaderPresetIdSchema>;

const shaderParameterNameSchema = z.enum(['amount', 'blockPx', 'color', 'tolerance', 'softness']);
const unitIntervalSchema = z.number().finite().min(0).max(1);
const pixelBlockSchema = z.number().int().min(2).max(512);
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const shaderKeyframeSchema = z
  .object({
    id: z.string().min(1).max(200),
    property: z.literal('effect.parameter'),
    parameterName: shaderParameterNameSchema,
    timeSec: z.number().finite().nonnegative().max(86_400),
    value: z.number().finite(),
    interpolation: z.enum(['hold', 'linear', 'bezier']),
    easing: z
      .object({
        x1: unitIntervalSchema,
        y1: z.number().finite().min(-4).max(4),
        x2: unitIntervalSchema,
        y2: z.number().finite().min(-4).max(4),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((keyframe, context) => {
    if (keyframe.interpolation === 'bezier' && keyframe.easing === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['easing'],
        message: 'bezier keyframes require easing control points',
      });
    }
  });
export type ShaderKeyframe = z.infer<typeof shaderKeyframeSchema>;

const shaderParametersSchema = z
  .object({
    amount: unitIntervalSchema.optional(),
    blockPx: pixelBlockSchema.optional(),
    color: hexColorSchema.optional(),
    tolerance: unitIntervalSchema.optional(),
    softness: unitIntervalSchema.optional(),
  })
  .strict();

const parameterNamesByEffect = {
  chroma_key: ['color', 'tolerance', 'softness'],
  tint: ['color', 'amount'],
  vignette: ['amount'],
  film_grain: ['amount'],
  pixelate: ['blockPx'],
  chromatic_aberration: ['amount'],
  vhs: ['amount'],
} as const satisfies Record<ShaderPresetId, readonly string[]>;

const keyframeValueSchemas = {
  amount: unitIntervalSchema,
  blockPx: pixelBlockSchema,
  tolerance: unitIntervalSchema,
  softness: unitIntervalSchema,
} as const;

export const shaderEffectV1Schema = z
  .object({
    effectId: shaderPresetIdSchema,
    enabled: z.boolean().default(true),
    parameters: shaderParametersSchema,
    keyframes: z.array(shaderKeyframeSchema).max(100).default([]),
  })
  .strict()
  .superRefine((effect, context) => {
    const required = parameterNamesByEffect[effect.effectId];
    for (const parameterName of required) {
      if (effect.parameters[parameterName] === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['parameters', parameterName],
          message: `${effect.effectId} requires ${parameterName}`,
        });
      }
    }
    for (const parameterName of Object.keys(effect.parameters)) {
      if (!required.includes(parameterName as never)) {
        context.addIssue({
          code: 'custom',
          path: ['parameters', parameterName],
          message: `${parameterName} is not used by ${effect.effectId}`,
        });
      }
    }
    for (const [index, keyframe] of effect.keyframes.entries()) {
      if (!required.includes(keyframe.parameterName as never)) {
        context.addIssue({
          code: 'custom',
          path: ['keyframes', index, 'parameterName'],
          message: `${keyframe.parameterName} is not animatable on ${effect.effectId}`,
        });
        continue;
      }
      const valueSchema =
        keyframeValueSchemas[keyframe.parameterName as keyof typeof keyframeValueSchemas];
      if (!valueSchema || !valueSchema.safeParse(keyframe.value).success) {
        context.addIssue({
          code: 'custom',
          path: ['keyframes', index, 'value'],
          message: `${keyframe.parameterName} keyframe value is invalid`,
        });
      }
    }
  });
export type ShaderEffectV1 = z.infer<typeof shaderEffectV1Schema>;

export const shaderStackV1Schema = z
  .object({
    version: z.number().int().min(1).max(1),
    effects: z.array(shaderEffectV1Schema).max(SHADER_PRESET_IDS.length),
  })
  .strict()
  .superRefine((stack, context) => {
    const seen = new Set<ShaderPresetId>();
    for (const [index, effect] of stack.effects.entries()) {
      if (seen.has(effect.effectId)) {
        context.addIssue({
          code: 'custom',
          path: ['effects', index, 'effectId'],
          message: `${effect.effectId} may appear only once in a shader stack`,
        });
      }
      seen.add(effect.effectId);
    }
  });
export type ShaderStackV1 = z.infer<typeof shaderStackV1Schema>;

export const shaderActionModeSchema = z.enum(['deferred', 'bake']);
export type ShaderActionMode = z.infer<typeof shaderActionModeSchema>;

export const shaderActionConfigSchema = z
  .object({
    mode: shaderActionModeSchema.default('deferred'),
    shaderStack: shaderStackV1Schema.default({ version: 1, effects: [] }),
  })
  .strict();
export type ShaderActionConfig = z.infer<typeof shaderActionConfigSchema>;
