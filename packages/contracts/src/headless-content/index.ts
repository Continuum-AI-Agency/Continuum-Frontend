import { z } from 'zod';

// The JSON is the source of truth. Media references are pinned separately so an
// expiring URL, a renamed Element, or a revised pack never changes a run in place.
const detail = z.string().trim().min(1).max(600);
export const headlessAssetRefSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type HeadlessAssetRef = z.infer<typeof headlessAssetRefSchema>;

export const characterSpecSchema = z
  .object({
    adult: z.literal(true),
    apparentAgeRange: detail,
    face: z
      .object({
        shape: detail,
        features: detail,
        eyes: detail,
        skinToneAndTexture: detail,
        distinguishingMarks: detail,
      })
      .strict(),
    hair: detail,
    body: z
      .object({
        height: detail,
        build: detail,
        proportions: detail,
        distinguishingDetails: detail,
      })
      .strict(),
    persona: detail,
    voice: detail.optional(),
    movement: z
      .object({
        posture: detail,
        gait: detail,
        gestures: detail,
        athleticCapabilities: detail,
        limits: detail,
      })
      .strict(),
    lookPresets: z
      .array(z.object({ id: z.string().min(1), wardrobe: detail, grooming: detail }).strict())
      .min(1)
      .max(12),
    sourceReferences: z
      .array(
        z
          .object({
            asset: headlessAssetRefSchema,
            role: z.enum(['identity', 'body', 'look', 'motion']),
            allowedInfluence: detail,
            prohibitedInfluence: detail,
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type CharacterSpec = z.infer<typeof characterSpecSchema>;

export const headlessSceneSpecSchema = z
  .object({
    setting: detail,
    spatialAnchors: z.array(detail).min(1).max(16),
    lighting: detail,
    captureDefaults: detail,
    references: z.array(headlessAssetRefSchema).max(4),
  })
  .strict();
export const headlessProductSpecSchema = z
  .object({
    concept: detail,
    sku: z.string().trim().min(1).nullable(),
    visualConstraints: z.array(detail).max(16),
    approvedClaimRefs: z.array(z.string().uuid()).max(16),
    references: z.array(headlessAssetRefSchema).max(4),
  })
  .strict();

const revisionBase = {
  elementId: z.string().uuid(),
  tenantId: z.string().uuid(),
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  rightsRef: z.string().trim().min(1),
  approved: z.boolean(),
};
export const headlessElementRevisionSchema = z.discriminatedUnion('kind', [
  z
    .object({ ...revisionBase, kind: z.literal('character'), payload: characterSpecSchema })
    .strict(),
  z
    .object({ ...revisionBase, kind: z.literal('scene'), payload: headlessSceneSpecSchema })
    .strict(),
  z
    .object({ ...revisionBase, kind: z.literal('product'), payload: headlessProductSpecSchema })
    .strict(),
]);
export type HeadlessElementRevision = z.infer<typeof headlessElementRevisionSchema>;

export const characterPanelRoleSchema = z.enum([
  'neutral_face',
  'full_body_front',
  'profile_three_quarter',
  'approved_look',
  'action_pose',
]);
export const preparedCharacterSchema = z
  .object({
    elementId: z.string().uuid(),
    revision: z.number().int().positive(),
    preparationSignature: z.string().regex(/^[a-f0-9]{64}$/),
    model: z.literal('gemini-3.1-flash-image'),
    composite: headlessAssetRefSchema,
    panels: z
      .array(z.object({ role: characterPanelRoleSchema, description: detail }).strict())
      .length(5),
    motionReference: headlessAssetRefSchema.nullable(),
    approved: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const roles = value.panels.map((panel) => panel.role);
    if (new Set(roles).size !== characterPanelRoleSchema.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['panels'],
        message: 'Every character panel role is required exactly once',
      });
    }
  });
export type PreparedCharacter = z.infer<typeof preparedCharacterSchema>;

export const elementBindingSchema = z
  .object({
    id: z.string().min(1),
    elementId: z.string().uuid(),
    revision: z.number().int().positive(),
    kind: z.enum(['character', 'scene', 'product']),
    variantId: z.string().min(1).nullable(),
    overrides: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const headlessShotSchema = z
  .object({
    id: z.string().min(1),
    characterBindingId: z.string().min(1),
    sceneBindingId: z.string().min(1),
    productUses: z
      .array(
        z
          .object({
            bindingId: z.string().min(1),
            mode: z.enum(['overlay', 'in_scene', 'both']),
            interaction: detail,
          })
          .strict(),
      )
      .max(8),
    captureRig: z
      .object({
        operator: detail,
        position: detail,
        framing: detail,
        motion: detail,
        audioPerspective: detail,
      })
      .strict(),
    performance: z
      .object({
        action: detail,
        bodyPositions: z.array(detail).min(1).max(12),
        timing: detail,
        expression: detail,
        dialogue: z.string().max(1200),
      })
      .strict(),
    sound: z
      .object({
        voiceDelivery: detail,
        ambientSource: detail,
        ambientLevel: z.enum(['silent', 'low', 'natural']),
        physicalSounds: z.array(detail).max(6),
        exclude: z.array(detail).max(8),
        continuity: detail,
      })
      .strict()
      .optional(),
    brandUse: z
      .object({
        factRefs: z.array(z.string().uuid()),
        claimRefs: z.array(z.string().uuid()),
        logoInScene: headlessAssetRefSchema.nullable(),
      })
      .strict(),
    continuityFromShotId: z.string().min(1).nullable(),
    approvedStartFrame: headlessAssetRefSchema.nullable(),
    selectedClip: z
      .object({ asset: headlessAssetRefSchema, durationSec: z.number().positive() })
      .strict()
      .nullable()
      .optional(),
    trimEndSec: z.number().min(0.2).max(60).optional(),
    aspectRatio: z.enum(['9:16', '16:9']),
    resolution: z.enum(['360p', '720p', '1080p']),
    takeVariant: z.number().int().nonnegative().default(0),
  })
  .strict();
export type HeadlessShot = z.infer<typeof headlessShotSchema>;

export const headlessStoryboardSchema = z
  .object({
    throughline: detail,
    beats: z
      .array(
        z
          .object({
            shotId: z.string().min(1),
            purpose: detail,
            opening: detail,
            development: detail,
            ending: detail,
            handoff: detail,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const captionTreatmentSchema = z
  .object({
    style: z.enum(['focus_blur', 'paper_notes', 'neon_frame', 'editorial_split']),
    emphasisPhrases: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    insetAsset: headlessAssetRefSchema.nullable().default(null),
    soundAccents: z.enum(['none', 'subtle']).default('subtle'),
    ctaText: z.string().trim().max(120).nullable().default(null),
  })
  .strict();
export type CaptionTreatment = z.infer<typeof captionTreatmentSchema>;

export const headlessCompositionSchema = z
  .object({
    id: z.string().min(1),
    shotIds: z.array(z.string().min(1)).min(1).max(20),
    cta: z.string().max(400).nullable(),
    logoAsset: headlessAssetRefSchema.nullable(),
    captions: z.boolean(),
    captionPreset: z.enum(['pop', 'pulse', 'glide', 'fusion', 'classic', 'boxed']).optional(),
    captionTreatment: captionTreatmentSchema.optional(),
    captionLanguage: z.string().min(2).max(12).nullable().optional(),
    audioBed: z
      .object({ asset: headlessAssetRefSchema, volume: z.number().min(0).max(1) })
      .strict()
      .nullable()
      .optional(),
    productOverlays: z
      .array(
        z
          .object({
            productBindingId: z.string().min(1),
            asset: headlessAssetRefSchema,
            position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
            scale: z.number().positive().max(1),
            startSec: z.number().nonnegative().nullable(),
            endSec: z.number().positive().nullable(),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export const headlessContentSpecSchema = z
  .object({
    contentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    revision: z.number().int().positive(),
    schemaVersion: z.literal(1),
    templateRef: z
      .object({ contentId: z.string().uuid(), revision: z.number().int().positive() })
      .strict()
      .nullable()
      .optional(),
    templateParameters: z.array(z.string().min(1)).max(30).optional(),
    bindings: z.array(elementBindingSchema).max(20),
    storyboard: headlessStoryboardSchema.optional(),
    shots: z.array(headlessShotSchema).min(1).max(100),
    compositions: z.array(headlessCompositionSchema).min(1).max(50),
    requestedOutputIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type HeadlessContentSpec = z.infer<typeof headlessContentSpecSchema>;
