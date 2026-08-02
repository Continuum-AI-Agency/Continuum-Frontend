// Art direction, expressed as an object instead of a sentence.
//
// A generation prompt used to be one freeform string the model wrote, concatenated
// after a brand block. Nothing in that string was addressable: you could not ask it
// what the light was doing, you could not render it differently for a still than for
// a clip, you could not tell a weak one from a strong one without reading it, and you
// could not index it to find the direction that worked last time.
//
// So the direction is the object and the prompt is DERIVED from it:
//
//   renderArtDirection  — one direction, two targets. A still panel needs a copy-safe
//                         zone and a single-frame rule; a Veo shot needs a movement
//                         clause and neither. Same decisions, different machine.
//   gradeArtDirection   — deterministic, no model call. Names the dimensions a prompt
//                         never decided and the empty quality words it leaned on.
//   summarizeArtDirection — the one-line label an index entry carries, so a caller can
//                         browse past directions the way it browses skills.
//
// The vocabulary is deliberately CLOSED where a real decision exists (angle, framing,
// light direction, light quality). Open strings are what let "cinematic, ultra
// detailed, 8K" pass for art direction; an enum forces a choice a camera operator
// could actually execute.

import { z } from 'zod';

export const CAMERA_ANGLES = [
  'eye-level',
  'low-angle',
  'high-angle',
  'overhead',
  'dutch',
  'over-the-shoulder',
] as const;

export const CAMERA_FRAMINGS = [
  'extreme-close-up',
  'close-up',
  'medium-close-up',
  'medium',
  'wide',
  'extreme-wide',
] as const;

export const LIGHT_DIRECTIONS = [
  'front',
  'camera-left',
  'camera-right',
  'back',
  'top',
  'ambient',
] as const;

export const LIGHT_QUALITIES = [
  'hard-sun',
  'soft-window',
  'large-softbox',
  'overcast',
  'rim',
  'practical',
  'flash',
] as const;

export const COPY_SAFE_LOCATIONS = [
  'top',
  'upper-third',
  'center',
  'lower-third',
  'bottom',
  'left',
  'right',
] as const;

export const cameraDirectionSchema = z.object({
  angle: z.enum(CAMERA_ANGLES),
  framing: z.enum(CAMERA_FRAMINGS),
  /** Lens feeling in production language — "35mm environmental", "85mm compression", "macro". */
  lens: z.string().min(1),
});
export type CameraDirection = z.infer<typeof cameraDirectionSchema>;

export const lightDirectionSchema = z.object({
  direction: z.enum(LIGHT_DIRECTIONS),
  quality: z.enum(LIGHT_QUALITIES),
  /** What the shadows do — the half of lighting that decides whether a frame reads as real. */
  shadow: z.string().min(1),
});
export type LightDirection = z.infer<typeof lightDirectionSchema>;

export const paletteDirectionSchema = z.object({
  dominant: z.string().min(1),
  support: z.string().min(1),
  accent: z.string().min(1),
});
export type PaletteDirection = z.infer<typeof paletteDirectionSchema>;

/**
 * Where the words will live, decided BEFORE the image exists.
 *
 * `coveragePct` is capped at 60 because a copy zone larger than that is not a banner
 * with breathing room, it is a background — and it is capped at 5 below because a
 * zone smaller than that cannot hold a headline and is a promise the frame breaks.
 */
export const copySafeZoneSchema = z.object({
  location: z.enum(COPY_SAFE_LOCATIONS),
  coveragePct: z.number().int().min(5).max(60),
});
export type CopySafeZone = z.infer<typeof copySafeZoneSchema>;

/**
 * What a regeneration may not touch.
 *
 * This is the mechanism by which a creator keeps seeing THEMSELVES across a re-roll:
 * the panel is the identity carrier for its clip, so a second attempt must re-frame
 * without re-casting. Reuse the vocabulary `buildCharacterAnchorPrompt` established
 * rather than inventing a second list.
 */
export const identityLockSchema = z.object({
  preserve: z.array(z.string().min(1)).min(1),
});
export type IdentityLock = z.infer<typeof identityLockSchema>;

export const artDirectionSchema = z.object({
  heroSubject: z.string().min(1),
  action: z.string().min(1),
  environment: z.string().min(1),
  camera: cameraDirectionSchema,
  light: lightDirectionSchema,
  palette: paletteDirectionSchema,
  /** Surface behaviour — "brushed aluminium", "wet glass", "knitted fabric". */
  materials: z.array(z.string().min(1)).optional(),
  depth: z
    .object({
      foreground: z.string().min(1).nullable(),
      background: z.string().min(1),
    })
    .optional(),
  copySafeZone: copySafeZoneSchema.nullable().optional(),
  identityLock: identityLockSchema.nullable().optional(),
  /** Camera or subject movement. Ignored by the still target, required by the motion one. */
  motion: z.string().min(1).nullable().optional(),
  mandatory: z.array(z.string().min(1)).optional(),
  prohibited: z.array(z.string().min(1)).optional(),
});
export type ArtDirection = z.infer<typeof artDirectionSchema>;

export type RenderTarget = 'still-panel' | 'veo-motion';

/** Invariants every generated frame carries, whatever the direction says. */
const NO_TEXT_RULE =
  'Do not render any text, letters, captions, logos, or watermarks in the image.';
const SINGLE_FRAME_RULE =
  'One clean single-scene frame — no panels, collage, split screens, or storyboard grids.';
const CONTINUOUS_SHOT_RULE = 'One continuous shot, no cuts.';
const DEFAULT_MOTION = 'Subject-led movement; the camera holds steady.';

const sentence = (value: string): string =>
  value.trim().endsWith('.') ? value.trim() : `${value.trim()}.`;

/**
 * The direction as the prompt that machine will actually be sent.
 *
 * The two targets differ by more than wording. A still panel is reviewed as a
 * composition and later carries burned-in headline copy, so it gets the copy-safe
 * zone and the single-frame rule. A Veo shot is animated from that panel and has its
 * captions burned by the stitcher afterwards, so a copy-safe instruction there would
 * reserve space nothing ever fills — it gets the movement clause instead.
 */
export function renderArtDirection(
  direction: ArtDirection,
  options: { target: RenderTarget },
): string {
  const lines: string[] = [
    sentence(`${direction.heroSubject}, ${direction.action}`),
    sentence(`Environment: ${direction.environment}`),
    sentence(
      `Camera: ${direction.camera.framing.replace(/-/g, ' ')}, ${direction.camera.angle.replace(/-/g, ' ')}, ${direction.camera.lens}`,
    ),
    sentence(
      `Light: ${direction.light.quality.replace(/-/g, ' ')} from ${direction.light.direction.replace(/-/g, ' ')}; ${direction.light.shadow}`,
    ),
    sentence(
      `Colour: ${direction.palette.dominant} dominant, ${direction.palette.support} support, ${direction.palette.accent} accent`,
    ),
  ];

  if (direction.materials?.length) {
    lines.push(sentence(`Materials: ${direction.materials.join(', ')}`));
  }

  if (direction.depth) {
    const foreground = direction.depth.foreground
      ? `foreground ${direction.depth.foreground}, `
      : '';
    lines.push(sentence(`Depth: ${foreground}background ${direction.depth.background}`));
  }

  if (options.target === 'still-panel') {
    if (direction.copySafeZone) {
      lines.push(
        sentence(
          `Reserve the ${direction.copySafeZone.location.replace(/-/g, ' ')} of the frame — roughly ${direction.copySafeZone.coveragePct}% — as a visually calm, high-contrast area for headline copy added later, and point the pose and leading lines toward it`,
        ),
      );
    }
    lines.push(SINGLE_FRAME_RULE);
  } else {
    lines.push(sentence(`Motion: ${direction.motion ?? DEFAULT_MOTION}`));
    lines.push(CONTINUOUS_SHOT_RULE);
  }

  if (direction.identityLock) {
    lines.push(sentence(`Preserve exactly: ${direction.identityLock.preserve.join(', ')}`));
  }
  if (direction.mandatory?.length) {
    lines.push(sentence(`Must include: ${direction.mandatory.join(', ')}`));
  }
  if (direction.prohibited?.length) {
    lines.push(sentence(`Must not appear: ${direction.prohibited.join(', ')}`));
  }

  lines.push(NO_TEXT_RULE);
  return lines.join('\n');
}

export const ART_DIRECTION_DIMENSIONS = [
  'subject',
  'camera',
  'light',
  'palette',
  'depth',
  'copySafeZone',
  'identityLock',
] as const;
export type ArtDirectionDimension = (typeof ART_DIRECTION_DIMENSIONS)[number];

/**
 * Quality words that describe no decision.
 *
 * Every one of these can be deleted from a prompt without changing what the camera,
 * the light, or the subject does — which is the test for whether a word earned its
 * place. They are graded because they are what a model reaches for when it has not
 * actually directed anything.
 */
export const EMPTY_QUALITY_WORDS = [
  '8k',
  '4k resolution',
  'ultra detailed',
  'ultra-detailed',
  'hyper realistic',
  'hyper-realistic',
  'photorealistic masterpiece',
  'masterpiece',
  'cinematic',
  'dramatic lighting',
  'aesthetic',
  'award winning',
  'award-winning',
  'trending on artstation',
  'highly detailed',
  'stunning',
  'breathtaking',
] as const;

const DIMENSION_CUES: Record<ArtDirectionDimension, readonly string[]> = {
  subject: [],
  camera: [...CAMERA_ANGLES, ...CAMERA_FRAMINGS, 'mm', 'lens', 'crop', 'framing', 'angle'],
  light: [...LIGHT_DIRECTIONS, ...LIGHT_QUALITIES, 'light', 'lit', 'shadow', 'backlit'],
  palette: ['palette', 'colour', 'color', 'tone', 'hue', '#'],
  depth: ['foreground', 'background', 'depth of field', 'bokeh', 'shallow focus'],
  copySafeZone: ['copy', 'headline', 'text-safe', 'negative space', 'clear space'],
  identityLock: ['preserve', 'same person', 'identity', 'unchanged', 'consistent face'],
};

export interface ArtDirectionGrade {
  /** 0–10. One point per satisfied dimension, scaled, less one per empty quality word. */
  score: number;
  missing: ArtDirectionDimension[];
  buzzwords: string[];
}

const gradeString = (prompt: string): ArtDirectionGrade => {
  const haystack = prompt.toLowerCase();
  const missing = ART_DIRECTION_DIMENSIONS.filter((dimension) => {
    const cues = DIMENSION_CUES[dimension];
    if (cues.length === 0) return prompt.trim().length === 0;
    return !cues.some((cue) => haystack.includes(cue));
  });
  const buzzwords = EMPTY_QUALITY_WORDS.filter((word) => haystack.includes(word));
  return scoreFrom(missing, [...buzzwords]);
};

const gradeDirection = (direction: ArtDirection): ArtDirectionGrade => {
  const missing: ArtDirectionDimension[] = [];
  if (!direction.depth) missing.push('depth');
  if (!direction.copySafeZone) missing.push('copySafeZone');
  if (!direction.identityLock) missing.push('identityLock');

  const freeText = [
    direction.heroSubject,
    direction.action,
    direction.environment,
    direction.camera.lens,
    direction.light.shadow,
    ...(direction.materials ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const buzzwords = EMPTY_QUALITY_WORDS.filter((word) => freeText.includes(word));
  return scoreFrom(missing, [...buzzwords]);
};

function scoreFrom(missing: ArtDirectionDimension[], buzzwords: string[]): ArtDirectionGrade {
  const satisfied = ART_DIRECTION_DIMENSIONS.length - missing.length;
  const base = (satisfied / ART_DIRECTION_DIMENSIONS.length) * 10;
  const score = Math.max(0, Math.round(base) - buzzwords.length);
  return { score, missing, buzzwords };
}

/**
 * Grades either a typed direction or the freeform string a legacy caller still sends.
 *
 * The string arm exists because the tool-call gate sees whatever the model actually
 * passed, which today is prose. Its detection is cue-based and therefore generous —
 * it is a floor that catches "make it look cool", not a substitute for the object.
 */
export function gradeArtDirection(input: ArtDirection | string): ArtDirectionGrade {
  return typeof input === 'string' ? gradeString(input) : gradeDirection(input);
}

/**
 * The one-line label an index entry carries.
 *
 * Directions are worth browsing — the one that worked for this brand last month is
 * better evidence than anything a model invents cold. An index needs a label short
 * enough to scan and specific enough to choose from, which is the same contract
 * `SkillSummary` serves for skills.
 */
export function summarizeArtDirection(direction: ArtDirection): string {
  return [
    `${direction.camera.framing.replace(/-/g, ' ')} ${direction.camera.angle.replace(/-/g, ' ')}`,
    direction.camera.lens,
    `${direction.light.quality.replace(/-/g, ' ')} ${direction.light.direction.replace(/-/g, ' ')}`,
    `${direction.palette.dominant}/${direction.palette.support}/${direction.palette.accent}`,
  ].join(' · ');
}
