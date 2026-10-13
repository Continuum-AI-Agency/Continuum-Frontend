import { z } from 'zod';

const easeSchema = z
  .object({ speed: z.number().finite(), influence: z.number().min(0.1).max(100) })
  .strict();
const valueSchema = z.union([
  z.number().finite(),
  z.tuple([z.number().finite(), z.number().finite()]),
]);
export const motionAepTrackEditSchema = z
  .object({
    compId: z.number().int().nonnegative(),
    layerId: z.number().int().nonnegative(),
    property: z.enum(['position', 'scale', 'rotation', 'opacity']),
    expectedTrackFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    baseValue: valueSchema.optional(),
    keys: z
      .array(
        z
          .object({
            timeSeconds: z.number().finite().nonnegative(),
            value: valueSchema,
            inInterpolation: z.enum(['linear', 'bezier', 'hold']),
            outInterpolation: z.enum(['linear', 'bezier', 'hold']),
            inTemporalEase: z.array(easeSchema).min(1).max(2),
            outTemporalEase: z.array(easeSchema).min(1).max(2),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()
  .superRefine((track, ctx) => {
    if (!track.keys.length && track.baseValue === undefined)
      ctx.addIssue({ code: 'custom', message: 'Removing all keys requires baseValue.' });
    const dimensions = track.property === 'position' || track.property === 'scale' ? 2 : 1;
    for (const [index, key] of track.keys.entries()) {
      if (
        (Array.isArray(key.value) ? 2 : 1) !== dimensions ||
        key.inTemporalEase.length !== (track.property === 'scale' ? 2 : 1) ||
        key.outTemporalEase.length !== (track.property === 'scale' ? 2 : 1)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['keys', index],
          message: 'Track dimensions must match the property.',
        });
      if (index && key.timeSeconds <= track.keys[index - 1]!.timeSeconds)
        ctx.addIssue({
          code: 'custom',
          path: ['keys', index],
          message: 'Key times must be strictly increasing.',
        });
    }
    if (track.baseValue !== undefined && (Array.isArray(track.baseValue) ? 2 : 1) !== dimensions)
      ctx.addIssue({
        code: 'custom',
        path: ['baseValue'],
        message: 'Base value dimensions must match the property.',
      });
  });
export type MotionAepTrackEdit = z.infer<typeof motionAepTrackEditSchema>;
