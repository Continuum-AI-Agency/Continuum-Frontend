import { z } from 'zod';

const detail = z.string().trim().min(3).max(240);

/** Physical states give a video model a movement it can finish, not a mood to improvise. */
export const physicalActionSchema = z.object({
  start: detail,
  motion: detail,
  end: detail,
  contact: z.object({
    object: detail,
    hand: z.enum(['left', 'right', 'both', 'none']),
    startState: detail,
    endState: detail,
  }).strict().nullable(),
}).strict();
export type PhysicalAction = z.infer<typeof physicalActionSchema>;

export const shotCompositionSchema = z.object({
  subjectPosition: z.enum(['left', 'center', 'right']),
  subjectScale: z.enum(['detail', 'medium', 'full-body', 'wide']),
  cameraHeight: z.enum(['low', 'eye', 'high']),
  equipmentInFrame: z.array(detail).max(4),
  clearSpace: z.enum(['upper-left', 'upper-right', 'lower-left', 'lower-right', 'none']),
}).strict();

/** These are intents; the caller binds them to actual pinned Library versions. */
export const shotReferenceUseSchema = z.object({
  identity: z.enum(['same-person', 'none']),
  subject: z.enum(['exact-product', 'same-equipment', 'same-world', 'none']),
  environment: z.enum(['same-location', 'new-grounded-zone', 'authored-setting']),
  previousFrame: z.boolean(),
}).strict();

export const ugcShotProductionSchema = z.object({
  index: z.number().int().min(1).max(40),
  location: detail,
  action: physicalActionSchema,
  composition: shotCompositionSchema,
  references: shotReferenceUseSchema,
  sound: z.object({
    speech: z.object({
      exactLine: detail,
      startWithinSec: z.number().min(0).max(2),
      finishWithinSec: z.number().positive().max(8),
      delivery: detail,
    }).strict().nullable(),
    ambience: detail,
    foley: z.array(detail).max(3),
    unwantedSounds: z.array(detail).max(3),
  }).strict(),
}).strict();
export type UgcShotProduction = z.infer<typeof ugcShotProductionSchema>;

export const ugcProductionPlanSchema = z.object({
  kind: z.literal('ugc-video'),
  shots: z.array(ugcShotProductionSchema).min(2).max(40),
  finish: z.object({
    captions: z.enum(['off', 'requested']),
    ctaText: z.string().trim().min(3).max(80),
    ctaDelivery: z.enum(['spoken', 'composited', 'spoken-and-composited']),
    ctaPlacement: z.enum(['upper-left', 'upper-right', 'lower-left', 'lower-right']),
    audio: z.enum(['native-speech', 'music-and-ambience']),
    soundtrack: z.object({
      voiceIdentity: detail.nullable(),
      musicBrief: detail,
      musicMix: z.enum(['duck-under-speech', 'instrumental-only']),
      ambienceContinuity: detail,
    }).strict(),
  }).strict(),
}).strict().superRefine((plan, ctx) => {
  plan.shots.forEach((shot, position) => {
    if (shot.index !== position + 1)
      ctx.addIssue({ code: 'custom', path: ['shots', position, 'index'], message: 'shot indices must be ordered from one' });
    if (position === 0 && shot.references.previousFrame)
      ctx.addIssue({ code: 'custom', path: ['shots', position, 'references', 'previousFrame'], message: 'the first shot has no previous frame' });
    if (shot.sound.speech && shot.sound.speech.finishWithinSec <= shot.sound.speech.startWithinSec)
      ctx.addIssue({ code: 'custom', path: ['shots', position, 'sound', 'speech'], message: 'speech must finish after it starts' });
  });
  if (plan.finish.audio === 'native-speech' && !plan.finish.soundtrack.voiceIdentity)
    ctx.addIssue({ code: 'custom', path: ['finish', 'soundtrack', 'voiceIdentity'], message: 'spoken video needs one voice identity' });
  if (plan.finish.audio === 'native-speech' && !plan.shots.some((shot) => shot.sound.speech))
    ctx.addIssue({ code: 'custom', path: ['shots'], message: 'native-speech video needs a spoken shot' });
  if (plan.finish.audio === 'music-and-ambience' && plan.shots.some((shot) => shot.sound.speech))
    ctx.addIssue({ code: 'custom', path: ['shots'], message: 'silent montage cannot contain speech' });
  if (plan.finish.audio === 'music-and-ambience' && plan.finish.soundtrack.voiceIdentity)
    ctx.addIssue({ code: 'custom', path: ['finish', 'soundtrack', 'voiceIdentity'], message: 'silent montage cannot request a voice' });
  if (plan.finish.audio === 'music-and-ambience' && plan.finish.soundtrack.musicMix !== 'instrumental-only')
    ctx.addIssue({ code: 'custom', path: ['finish', 'soundtrack', 'musicMix'], message: 'silent montage needs an instrumental mix' });
});
export type UgcProductionPlan = z.infer<typeof ugcProductionPlanSchema>;

export const productPhotoProductionPlanSchema = z.object({
  kind: z.literal('product-photoshoot'),
  product: z.object({
    exactFeatures: z.array(detail).min(1).max(8),
    readableLabel: z.boolean(),
    scaleCue: detail.nullable(),
  }).strict(),
  frames: z.array(z.object({
    action: physicalActionSchema,
    composition: shotCompositionSchema,
    references: shotReferenceUseSchema,
  }).strict()).min(1).max(8),
  finish: z.object({
    copy: z.enum(['none', 'deterministic-overlay']),
    exactText: z.string().trim().max(120).nullable(),
    placement: z.enum(['upper-left', 'upper-right', 'lower-left', 'lower-right']).nullable(),
  }).strict(),
}).strict().superRefine((plan, ctx) => {
  if (plan.frames.some((frame) => frame.references.subject !== 'exact-product'))
    ctx.addIssue({ code: 'custom', path: ['frames'], message: 'every product frame must preserve the exact product' });
  if (plan.finish.copy === 'deterministic-overlay' && (!plan.finish.exactText || !plan.finish.placement))
    ctx.addIssue({ code: 'custom', path: ['finish'], message: 'a copy overlay needs exact text and placement' });
  if (plan.finish.copy === 'none' && (plan.finish.exactText || plan.finish.placement))
    ctx.addIssue({ code: 'custom', path: ['finish'], message: 'a no-copy frame cannot carry text or placement' });
});
export type ProductPhotoProductionPlan = z.infer<typeof productPhotoProductionPlanSchema>;

export const creativeProductionPlanSchema = z.union([
  ugcProductionPlanSchema,
  productPhotoProductionPlanSchema,
]);
export type CreativeProductionPlan = z.infer<typeof creativeProductionPlanSchema>;
