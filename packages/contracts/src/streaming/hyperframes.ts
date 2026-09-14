import { z } from 'zod';

/**
 * Canonical HyperFrames composition spec — the model's shot + direction output.
 * Backend generates it (ai-studio), the renderer turns it into HTML, and it is
 * persisted on the draft + streamed to the FE. Defined here so both sides share
 * one type instead of the FE consuming it as `unknown` (FE/BE drift guard).
 */

export const HYPERFRAMES_LAYOUTS = [
  'centered-title',
  'split-text-media',
  'stat-hero',
  'media-fullbleed',
  'quote',
  'outro',
] as const;
export type HyperframesLayout = (typeof HYPERFRAMES_LAYOUTS)[number];

export const HYPERFRAMES_TRANSITIONS = ['cut', 'crossfade', 'wipe', 'slide', 'scale'] as const;
export type HyperframesTransition = (typeof HYPERFRAMES_TRANSITIONS)[number];

export const HYPERFRAMES_SCENE_ROLES = ['hook', 'development', 'payoff', 'cta'] as const;
export type HyperframesSceneRole = (typeof HYPERFRAMES_SCENE_ROLES)[number];

export const HYPERFRAMES_ENERGIES = ['calm', 'balanced', 'high-energy'] as const;
export const hyperframesEnergySchema = z.enum(HYPERFRAMES_ENERGIES);
export type HyperframesEnergy = (typeof HYPERFRAMES_ENERGIES)[number];

export const HYPERFRAMES_MOTION_VERBS = [
  'fade',
  'rise',
  'slide',
  'scale',
  'reveal',
  'track',
  'hold',
] as const;
export type HyperframesMotionVerb = (typeof HYPERFRAMES_MOTION_VERBS)[number];

export const hyperframeSceneCopySchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(180).optional(),
  body: z.string().max(360).optional(),
  stat_value: z.string().max(40).optional(),
  stat_label: z.string().max(80).optional(),
});

export const hyperframeSceneMotionSchema = z.object({
  verb: z.enum(HYPERFRAMES_MOTION_VERBS),
  entrance_ease: z.string().min(1).max(40),
  body_ease: z.string().min(1).max(40),
  exit_ease: z.string().min(1).max(40),
});

export const hyperframePinnedAssetSchema = z.object({
  assetId: z.string().min(1),
  assetVersionId: z.string().min(1),
});

export const sceneSpecSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'scene.id must be lowercase kebab-case'),
  role: z.enum(HYPERFRAMES_SCENE_ROLES),
  start_seconds: z.number().min(0).max(60),
  duration_seconds: z.number().min(0.5).max(20),
  layout: z.enum(HYPERFRAMES_LAYOUTS),
  copy: hyperframeSceneCopySchema,
  asset: hyperframePinnedAssetSchema.optional(),
  intentional_hold: z.boolean().default(false),
  /** Historical pre-version contract. New compositions use `asset`. */
  attachment_ref: z.string().url().optional(),
  transition_in: z.enum(HYPERFRAMES_TRANSITIONS).optional(),
  motion: hyperframeSceneMotionSchema,
});
export type SceneSpec = z.infer<typeof sceneSpecSchema>;

export const hyperframePaletteSchema = z.object({
  background: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  foreground: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  muted: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const hyperframeTypographySchema = z.object({
  headline_family: z.string().min(1).max(60),
  body_family: z.string().min(1).max(60),
  headline_weight: z.number().int().min(100).max(900),
  body_weight: z.number().int().min(100).max(900).default(400),
});

export const compositionSpecSchema = z.object({
  title: z.string().min(1).max(120),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_seconds: z.number().min(5).max(30),
  energy: hyperframesEnergySchema,
  palette: hyperframePaletteSchema,
  typography: hyperframeTypographySchema,
  scenes: z.array(sceneSpecSchema).min(2).max(8),
  background_audio: hyperframePinnedAssetSchema.optional(),
  /** Historical pre-version contract. New compositions use `background_audio`. */
  background_audio_ref: z.string().url().optional(),
});
export type CompositionSpec = z.infer<typeof compositionSpecSchema>;
