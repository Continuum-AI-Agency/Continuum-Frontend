import { expect, test } from 'bun:test';
import { productPhotoProductionPlanSchema, ugcProductionPlanSchema } from './production-plan';

const action = {
  start: 'Both feet planted beside the bench',
  motion: 'Lift the dumbbell once with the elbow close to the torso',
  end: 'Lower the dumbbell beside the hip',
  contact: {
    object: 'Black dumbbell', hand: 'right' as const,
    startState: 'Grip closed around the handle', endState: 'Grip remains closed',
  },
};
const composition = {
  subjectPosition: 'left' as const,
  subjectScale: 'medium' as const,
  cameraHeight: 'eye' as const,
  equipmentInFrame: ['Black dumbbell'],
  clearSpace: 'upper-right' as const,
};
const references = {
  identity: 'same-person' as const,
  subject: 'same-equipment' as const,
  environment: 'same-location' as const,
  previousFrame: false,
};

test('UGC plan requires ordered physical actions and an honest continuity frame', () => {
  const plan = {
    kind: 'ugc-video' as const,
    shots: [1, 2].map((index) => ({
      index, location: 'Vivo47 weight area', action, composition, references,
      sound: { speech: null, ambience: 'Quiet gym room tone', foley: ['Dumbbell touches the mat'], unwantedSounds: ['Unscripted voice'] },
    })),
    finish: {
      captions: 'off' as const, ctaText: 'Entrena hoy', ctaDelivery: 'composited' as const,
      ctaPlacement: 'upper-right' as const, audio: 'music-and-ambience' as const,
      soundtrack: { voiceIdentity: null, musicBrief: 'Light instrumental pulse', musicMix: 'instrumental-only' as const, ambienceContinuity: 'The same gym room tone across cuts' },
    },
  };
  expect(ugcProductionPlanSchema.safeParse(plan).success).toBe(true);
  expect(ugcProductionPlanSchema.safeParse({ ...plan, shots: [{ ...plan.shots[0], references: { ...references, previousFrame: true } }, plan.shots[1]] }).success).toBe(false);
  expect(ugcProductionPlanSchema.safeParse({ ...plan, shots: [plan.shots[1], plan.shots[0]] }).success).toBe(false);
  expect(ugcProductionPlanSchema.safeParse({ ...plan, shots: [{ ...plan.shots[0], sound: { ...plan.shots[0].sound, speech: { exactLine: 'Start today', startWithinSec: 0.2, finishWithinSec: 2.5, delivery: 'Natural breathy voice' } } }, plan.shots[1]] }).success).toBe(false);
});

test('product photoshoot requires exact product role and deterministic copy', () => {
  const plan = {
    kind: 'product-photoshoot' as const,
    product: { exactFeatures: ['White ceramic ridges'], readableLabel: false, scaleCue: 'One hand beside the product' },
    frames: [{ action, composition, references: { ...references, subject: 'exact-product' as const } }],
    finish: { copy: 'deterministic-overlay' as const, exactText: 'Brew better', placement: 'upper-right' as const },
  };
  expect(productPhotoProductionPlanSchema.safeParse(plan).success).toBe(true);
  expect(productPhotoProductionPlanSchema.safeParse({ ...plan, frames: [{ ...plan.frames[0], references }] }).success).toBe(false);
  expect(productPhotoProductionPlanSchema.safeParse({ ...plan, finish: { ...plan.finish, exactText: null } }).success).toBe(false);
});
