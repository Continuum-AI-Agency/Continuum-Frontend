// The effects catalog (owner 2026-09-29: "styles we can employ on top", Templify's Digital, Haze,
// Fish Eye, Printed, Film, VHS…): a named treatment of the FOOTAGE, never of the brand's type. An
// effect is a short list of primitive ops Render turns into one deterministic ffmpeg chain; an
// agent composes new ones from the same primitives (a brand draft, usable once the brand approves
// it), so no effect ever needs new code. Some also change the shoot: `capture` is the sentence the
// compiler adds to the Omni or still prompt, and a clip shot without it is never reused for it.

import { z } from 'zod';
import { headlessGrammarSchema } from './grammar';

const unit = z.number().min(0).max(1);
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
/** 'brand' is the brand's accent colour; the Backend resolves it (withBrandInk) before Render. */
const ink = z.union([hex, z.literal('brand')]);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(40);

export const EFFECT_FRAME_ASSETS = [
  'polaroid',
  'film-strip',
  'super8-gate',
  'paper',
  'photobooth',
  'viewfinder',
] as const;
export const EFFECT_STAMP_KINDS = ['date', 'rec', 'vhs', 'timecode', 'cam'] as const;
export const EFFECT_CURVES = [
  'vintage',
  'cross_process',
  'lighter',
  'darker',
  'increase_contrast',
  'medium_contrast',
  'strong_contrast',
  'linear_contrast',
] as const;

/** Ops on the picture's colour and texture: the person matte is unaffected by them. */
const pictureOps = [
  z
    .object({
      op: z.literal('grade'),
      brightness: z.number().min(-0.3).max(0.3).default(0),
      contrast: z.number().min(0.5).max(1.8).default(1),
      saturation: z.number().min(0).max(2).default(1),
      gamma: z.number().min(0.6).max(1.6).default(1),
      /** -1 cool … +1 warm. */
      warmth: z.number().min(-1).max(1).default(0),
      /** -1 green … +1 magenta. */
      tint: z.number().min(-1).max(1).default(0),
    })
    .strict(),
  z.object({ op: z.literal('curves'), preset: z.enum(EFFECT_CURVES) }).strict(),
  z.object({ op: z.literal('mono'), tone: z.enum(['neutral', 'sepia', 'cool']) }).strict(),
  z.object({ op: z.literal('duotone'), shadow: ink, highlight: ink }).strict(),
  z.object({ op: z.literal('grain'), amount: unit, animated: z.boolean().default(true) }).strict(),
  z.object({ op: z.literal('vignette'), amount: unit }).strict(),
  z
    .object({
      op: z.literal('bloom'),
      radius: z.number().min(2).max(60),
      amount: unit,
      /** A red-orange glow around highlights, the way film scatters light. */
      halation: z.boolean().default(false),
    })
    .strict(),
  z.object({ op: z.literal('soften'), amount: unit }).strict(),
  /** `cell` is the dot pitch in pixels at 1080 px wide. */
  z.object({ op: z.literal('halftone'), cell: z.number().min(3).max(16), ink }).strict(),
  z
    .object({ op: z.literal('scanlines'), spacing: z.number().int().min(2).max(8), opacity: unit })
    .strict(),
  z.object({ op: z.literal('chroma'), shift: z.number().min(1).max(12) }).strict(),
  /** The share of the height kept sharp across the middle. */
  z.object({ op: z.literal('tiltShift'), band: z.number().min(0.2).max(0.7) }).strict(),
  /** Reels only: a still's read-back would read it as the copy (stillEffect drops it). */
  z
    .object({
      op: z.literal('stamp'),
      kind: z.enum(EFFECT_STAMP_KINDS),
      corner: z.enum(['tl', 'tr', 'bl', 'br']),
    })
    .strict(),
  z.object({ op: z.literal('frame'), asset: z.enum(EFFECT_FRAME_ASSETS) }).strict(),
] as const;

/** Ops that move pixels: Render applies them to the person matte too, deterministic per frame. */
const geometryOps = [
  z
    .object({
      op: z.literal('lens'),
      kind: z.enum(['fisheye', 'barrel']),
      amount: unit,
      circle: z.boolean().default(false),
    })
    .strict(),
  z.object({ op: z.literal('weave'), px: z.number().min(0.5).max(4) }).strict(),
  /** A crop band top and bottom, each `amount` of the height (9:16 has no room for 2.39). */
  z.object({ op: z.literal('bars'), amount: z.number().min(0.02).max(0.12) }).strict(),
] as const;

export const effectOpSchema = z.discriminatedUnion('op', [...pictureOps, ...geometryOps]);
export type EffectOp = z.infer<typeof effectOpSchema>;
export const GEOMETRY_OPS: ReadonlySet<EffectOp['op']> = new Set(['lens', 'weave', 'bars']);

export const headlessEffectCategorySchema = z.enum([
  'camera',
  'film',
  'retro',
  'lens',
  'print',
  'grade',
]);

const effectOpsSchema = z
  .array(effectOpSchema)
  .min(1)
  .max(8)
  .superRefine((ops, ctx) => {
    const count = (op: EffectOp['op']) => ops.filter((item) => item.op === op).length;
    for (const op of ['lens', 'frame', 'bars', 'mono', 'duotone', 'halftone'] as const)
      if (count(op) > 1) ctx.addIssue({ code: 'custom', message: `at most one ${op} op` });
    if (count('stamp') > 2) ctx.addIssue({ code: 'custom', message: 'at most two stamps' });
  });

export const headlessEffectSchema = z
  .object({
    id: slug,
    label: z.string().trim().min(1).max(40),
    summary: z.string().trim().min(1).max(200),
    whenToUse: z.string().trim().min(1).max(300),
    category: headlessEffectCategorySchema,
    ops: effectOpsSchema,
    /** The shoot it needs, added to the prompt; absent = any footage takes it. */
    capture: z
      .object({
        reel: z.string().trim().min(1).max(300).optional(),
        still: z.string().trim().min(1).max(300).optional(),
      })
      .strict()
      .optional(),
    /** Concepts it suits; empty = any. */
    suits: z.array(headlessGrammarSchema).max(10),
    avoid: z.array(z.string().trim().min(1).max(160)).max(4),
    /** draft: defined; benched: its bench is green; proven: the owner accepted its render. */
    status: z.enum(['draft', 'benched', 'proven']),
    exemplar: z
      .object({ reel: z.string().startsWith('gs://'), still: z.string().startsWith('gs://') })
      .strict()
      .nullable(),
    origin: z.enum(['catalog', 'brand']),
  })
  .strict();
export type HeadlessEffect = z.infer<typeof headlessEffectSchema>;

/** What a composition persists: the ops as they were, so a later catalog edit never re-styles an
 *  old reel, and a brand effect keeps rendering after it is retired. */
export const resolvedEffectSchema = z
  .object({
    id: slug,
    ops: effectOpsSchema,
    capture: headlessEffectSchema.shape.capture,
  })
  .strict();
export type ResolvedEffect = z.infer<typeof resolvedEffectSchema>;

/** A still takes the ops without stamps. */
export const stillEffectOps = (ops: readonly EffectOp[]): EffectOp[] =>
  ops.filter((op) => op.op !== 'stamp');

/** 'brand' inks as the brand's accent, so Render only ever reads hex. */
export const withBrandInk = (ops: readonly EffectOp[], brandHex: string): EffectOp[] =>
  ops.map((op) => {
    if (op.op === 'duotone')
      return {
        ...op,
        shadow: op.shadow === 'brand' ? brandHex : op.shadow,
        highlight: op.highlight === 'brand' ? brandHex : op.highlight,
      };
    if (op.op === 'halftone' && op.ink === 'brand') return { ...op, ink: brandHex };
    return op;
  });

const catalog = (
  entry: Omit<HeadlessEffect, 'origin' | 'status' | 'exemplar' | 'suits' | 'avoid'> &
    Partial<Pick<HeadlessEffect, 'suits' | 'avoid'>>,
): HeadlessEffect =>
  headlessEffectSchema.parse({
    suits: [],
    avoid: [],
    ...entry,
    status: 'draft',
    exemplar: null,
    origin: 'catalog',
  });

const NO_SIGNS = 'no signage, lettering or logos anywhere in the frame';

export const HEADLESS_EFFECTS: readonly HeadlessEffect[] = [
  // --- Camera: a device's look, and the shoot it implies -------------------------------------
  catalog({
    id: 'digital',
    label: 'Digital',
    summary: "A 2000s point-and-shoot: crisp, a little cool, the viewfinder's grid and date.",
    whenToUse: 'Candid photo-dump energy: POV, a day in her life, a first visit.',
    category: 'camera',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.08,
        saturation: 1.1,
        gamma: 1,
        warmth: -0.15,
        tint: 0,
      },
      { op: 'grain', amount: 0.15, animated: true },
      { op: 'frame', asset: 'viewfinder' },
      { op: 'stamp', kind: 'date', corner: 'br' },
    ],
    capture: {
      reel: 'Filmed on a small 2000s point-and-shoot digital camera held at arm’s length: crisp, slightly harsh on-camera light.',
      still:
        'Shot on a small 2000s point-and-shoot digital camera: crisp, slightly harsh on-camera light, a touch oversharpened.',
    },
  }),
  catalog({
    id: 'disposable-flash',
    label: 'Disposable flash',
    summary: 'Direct flash from a throwaway film camera: bright face, dark falloff, warm grain.',
    whenToUse: 'Night-out or after-class candids; a friend caught her mid-moment.',
    category: 'camera',
    ops: [
      {
        op: 'grade',
        brightness: 0.02,
        contrast: 1.15,
        saturation: 1.1,
        gamma: 1,
        warmth: 0.25,
        tint: 0,
      },
      { op: 'bloom', radius: 6, amount: 0.15, halation: false },
      { op: 'vignette', amount: 0.35 },
      { op: 'grain', amount: 0.35, animated: true },
    ],
    capture: {
      reel: 'Lit by a direct on-camera flash: hard frontal light, a bright face, the background falling off dark behind her.',
      still:
        'Direct on-camera flash from a disposable film camera: hard frontal light, bright face, dark falloff behind her, a crisp flash shadow.',
    },
  }),
  catalog({
    id: 'webcam',
    label: 'Webcam',
    summary: 'A laptop camera at desk height: soft, a little noisy, screen-lit.',
    whenToUse: 'Talking-to-camera confessions, replies and storytimes recorded at home.',
    category: 'camera',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 0.95,
        saturation: 0.85,
        gamma: 1.1,
        warmth: 0.1,
        tint: 0,
      },
      { op: 'soften', amount: 0.3 },
      { op: 'grain', amount: 0.4, animated: true },
    ],
    capture: {
      reel: 'Filmed by a laptop webcam at eye level from a desk: soft screen glow on her face, a plain room behind her.',
    },
    suits: ['reply-to-comment', 'unpopular-opinion', 'car-storytime'],
  }),
  catalog({
    id: 'camcorder',
    label: 'Camcorder',
    summary: 'A 2000s handheld camcorder: saturated, soft, REC and a running timecode.',
    whenToUse: 'Nostalgic behind-the-scenes and routines; "found footage" hooks.',
    category: 'camera',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.05,
        saturation: 1.2,
        gamma: 1,
        warmth: 0.1,
        tint: 0,
      },
      { op: 'soften', amount: 0.2 },
      { op: 'scanlines', spacing: 3, opacity: 0.12 },
      { op: 'stamp', kind: 'rec', corner: 'tr' },
      { op: 'stamp', kind: 'timecode', corner: 'bl' },
    ],
    capture: {
      reel: 'Filmed on a 2000s handheld camcorder with auto-exposure, a slight handheld sway.',
    },
  }),
  catalog({
    id: 'security-cam',
    label: 'Security cam',
    summary: 'A ceiling camera looking down: grey, wide, CAM 01 and a date.',
    whenToUse: 'Expectation-vs-reality and unpopular-opinion reveals played as caught on camera.',
    category: 'camera',
    ops: [
      { op: 'mono', tone: 'neutral' },
      { op: 'grade', brightness: 0, contrast: 1.25, saturation: 1, gamma: 1.1, warmth: 0, tint: 0 },
      { op: 'lens', kind: 'barrel', amount: 0.25, circle: false },
      { op: 'grain', amount: 0.45, animated: true },
      { op: 'stamp', kind: 'cam', corner: 'tl' },
      { op: 'stamp', kind: 'date', corner: 'br' },
    ],
    capture: {
      reel: 'A static high corner angle looking down at her, like a ceiling camera, wide.',
    },
    suits: ['expectation-vs-reality', 'unpopular-opinion', 'pov'],
    avoid: ['the offer close: a surveillance frame reads as a warning, not an invitation'],
  }),
  // --- Film ----------------------------------------------------------------------------------
  catalog({
    id: 'film-35mm',
    label: 'Film',
    summary: 'Warm 35 mm colour negative: soft halation on the highlights, grain, a gentle weave.',
    whenToUse: 'Any warm, human story; the default when a reel should feel less digital.',
    category: 'film',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.05,
        saturation: 0.95,
        gamma: 1.02,
        warmth: 0.3,
        tint: 0,
      },
      { op: 'bloom', radius: 12, amount: 0.25, halation: true },
      { op: 'grain', amount: 0.35, animated: true },
      { op: 'weave', px: 1 },
    ],
  }),
  catalog({
    id: 'film-bw',
    label: 'Black & white film',
    summary: 'High-contrast black-and-white film with real grain.',
    whenToUse: 'Serious or reflective beats: an honest opinion, a before.',
    category: 'film',
    ops: [
      { op: 'mono', tone: 'neutral' },
      { op: 'grade', brightness: 0, contrast: 1.3, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'grain', amount: 0.5, animated: true },
      { op: 'vignette', amount: 0.3 },
    ],
  }),
  catalog({
    id: 'super8',
    label: 'Super 8',
    summary: 'Home-movie Super 8: faded warm colour, heavy grain, gate weave and a rounded gate.',
    whenToUse: 'Memories and routines; a "how it started" beat.',
    category: 'film',
    ops: [
      {
        op: 'grade',
        brightness: 0.03,
        contrast: 0.95,
        saturation: 0.8,
        gamma: 1,
        warmth: 0.35,
        tint: 0,
      },
      { op: 'soften', amount: 0.35 },
      { op: 'grain', amount: 0.6, animated: true },
      { op: 'weave', px: 2.5 },
      { op: 'vignette', amount: 0.4 },
      { op: 'frame', asset: 'super8-gate' },
    ],
  }),
  catalog({
    id: 'polaroid',
    label: 'Polaroid',
    summary: 'Instant-film colour inside a white instant-photo border.',
    whenToUse: 'Photo-dump and first-day moments; stills most of all.',
    category: 'film',
    ops: [
      {
        op: 'grade',
        brightness: 0.04,
        contrast: 0.9,
        saturation: 0.85,
        gamma: 1,
        warmth: 0.15,
        tint: -0.05,
      },
      { op: 'grain', amount: 0.2, animated: false },
      { op: 'frame', asset: 'polaroid' },
    ],
  }),
  catalog({
    id: 'film-strip',
    label: 'Film strip',
    summary: 'Warm film colour with sprocket holes and edge codes down the sides.',
    whenToUse: 'Story formats and routines told as a roll of frames.',
    category: 'film',
    ops: [
      { op: 'grade', brightness: 0, contrast: 1.05, saturation: 1, gamma: 1, warmth: 0.2, tint: 0 },
      { op: 'bloom', radius: 8, amount: 0.15, halation: true },
      { op: 'grain', amount: 0.3, animated: true },
      { op: 'frame', asset: 'film-strip' },
    ],
  }),
  // --- Retro video ---------------------------------------------------------------------------
  catalog({
    id: 'vhs',
    label: 'VHS',
    summary: 'A played-back tape: soft, colour-bleeding, scanlines, PLAY ▶ SP.',
    whenToUse: 'Nostalgia and throwback hooks; unpopular opinions delivered deadpan.',
    category: 'retro',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 0.95,
        saturation: 1.15,
        gamma: 1.05,
        warmth: 0,
        tint: 0,
      },
      { op: 'soften', amount: 0.35 },
      { op: 'chroma', shift: 4 },
      { op: 'scanlines', spacing: 3, opacity: 0.18 },
      { op: 'grain', amount: 0.3, animated: true },
      { op: 'stamp', kind: 'vhs', corner: 'tl' },
    ],
  }),
  catalog({
    id: 'crt',
    label: 'CRT',
    summary: 'An old tube TV: curved glass, glow and fine scanlines.',
    whenToUse: 'Reaction and reply formats framed as "on TV".',
    category: 'retro',
    ops: [
      { op: 'grade', brightness: 0, contrast: 1.1, saturation: 1.1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'scanlines', spacing: 3, opacity: 0.35 },
      { op: 'bloom', radius: 10, amount: 0.2, halation: false },
      { op: 'lens', kind: 'barrel', amount: 0.2, circle: false },
      { op: 'vignette', amount: 0.45 },
    ],
  }),
  catalog({
    id: 'y2k-glitch',
    label: 'Y2K glitch',
    summary: 'Saturated early-internet video with split colour edges.',
    whenToUse: 'Fast, loud hooks for a young audience; never a calm testimonial.',
    category: 'retro',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.1,
        saturation: 1.35,
        gamma: 1,
        warmth: 0,
        tint: 0.1,
      },
      { op: 'chroma', shift: 8 },
      { op: 'scanlines', spacing: 4, opacity: 0.12 },
      { op: 'grain', amount: 0.25, animated: true },
    ],
  }),
  // --- Lens ----------------------------------------------------------------------------------
  catalog({
    id: 'fish-eye',
    label: 'Fish eye',
    summary: 'A round fisheye peephole, bright sky colour.',
    whenToUse: 'Playful POV and skate-video energy; one beat, not a whole testimonial.',
    category: 'lens',
    ops: [
      { op: 'lens', kind: 'fisheye', amount: 0.7, circle: true },
      { op: 'grade', brightness: 0, contrast: 1.05, saturation: 1.1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'vignette', amount: 0.3 },
    ],
    suits: ['pov', 'busy-day-routine', 'street-interview'],
  }),
  catalog({
    id: 'tilt-shift',
    label: 'Tilt shift',
    summary: 'A sharp band across the middle, blur above and below, punchy colour.',
    whenToUse: 'Wide establishing beats: the gym floor, the street.',
    category: 'lens',
    ops: [
      { op: 'tiltShift', band: 0.45 },
      { op: 'grade', brightness: 0, contrast: 1.1, saturation: 1.25, gamma: 1, warmth: 0, tint: 0 },
    ],
  }),
  catalog({
    id: 'soft-focus',
    label: 'Soft focus',
    summary: 'A dreamy diffusion filter: glowing highlights, gentle contrast.',
    whenToUse: 'Self-care and results beats; a calm testimonial.',
    category: 'lens',
    ops: [
      { op: 'soften', amount: 0.5 },
      { op: 'bloom', radius: 20, amount: 0.35, halation: false },
      {
        op: 'grade',
        brightness: 0.03,
        contrast: 0.9,
        saturation: 1,
        gamma: 1,
        warmth: 0.1,
        tint: 0,
      },
    ],
  }),
  // --- Print ---------------------------------------------------------------------------------
  catalog({
    id: 'printed',
    label: 'Printed',
    summary: 'A black-and-white newsprint halftone.',
    whenToUse: 'Bold statements and hot takes; "headline" hooks.',
    category: 'print',
    ops: [
      { op: 'mono', tone: 'neutral' },
      { op: 'grade', brightness: 0, contrast: 1.35, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'halftone', cell: 6, ink: '#111111' },
      { op: 'grain', amount: 0.2, animated: false },
    ],
    suits: ['unpopular-opinion', 'reply-to-comment', 'problem-solution'],
  }),
  catalog({
    id: 'risograph',
    label: 'Risograph',
    summary: "A two-colour riso print in the brand's own ink on warm paper.",
    whenToUse: 'On-brand statement pieces; stills and short hooks.',
    category: 'print',
    ops: [
      { op: 'duotone', shadow: 'brand', highlight: '#F4EFE6' },
      { op: 'halftone', cell: 5, ink: 'brand' },
      { op: 'grain', amount: 0.3, animated: false },
    ],
  }),
  catalog({
    id: 'paper',
    label: 'Paper',
    summary: 'A faded photo printed on textured paper.',
    whenToUse: 'Journal-style routines and memories; photo-dump stills.',
    category: 'print',
    ops: [
      {
        op: 'grade',
        brightness: 0.04,
        contrast: 0.9,
        saturation: 0.75,
        gamma: 1,
        warmth: 0.1,
        tint: 0,
      },
      { op: 'grain', amount: 0.25, animated: false },
      { op: 'frame', asset: 'paper' },
    ],
  }),
  catalog({
    id: 'photobooth',
    label: 'Photobooth',
    summary: 'A black-and-white photobooth print with its strip border.',
    whenToUse: 'Friends, first days and "before" beats; stills first.',
    category: 'print',
    ops: [
      { op: 'mono', tone: 'neutral' },
      { op: 'grade', brightness: 0, contrast: 1.15, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'grain', amount: 0.3, animated: false },
      { op: 'frame', asset: 'photobooth' },
    ],
  }),
  // --- Grade ---------------------------------------------------------------------------------
  catalog({
    id: 'haze',
    label: 'Haze',
    summary: 'Hazy pastel air: lifted blacks, a soft glow, gentle warmth.',
    whenToUse: 'Morning routines, beach and outdoor beats, soft-sell testimonials.',
    category: 'grade',
    ops: [
      { op: 'bloom', radius: 30, amount: 0.4, halation: false },
      {
        op: 'grade',
        brightness: 0.05,
        contrast: 0.82,
        saturation: 0.9,
        gamma: 1,
        warmth: 0.15,
        tint: 0,
      },
      { op: 'soften', amount: 0.15 },
    ],
  }),
  catalog({
    id: 'golden-hour',
    label: 'Golden hour',
    summary: 'Late sun: warm, glowing, rich skin tones.',
    whenToUse: 'Outdoor and street formats; aspirational results.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.05,
        saturation: 1.1,
        gamma: 1,
        warmth: 0.6,
        tint: 0.1,
      },
      { op: 'bloom', radius: 16, amount: 0.2, halation: false },
    ],
    capture: {
      reel: 'Late-afternoon golden-hour sun low behind her: warm rim light on her hair and shoulders.',
      still:
        'Late-afternoon golden-hour sun low behind her: warm rim light on her hair and shoulders.',
    },
    suits: ['street-interview', 'street-price-guess', 'pov', 'busy-day-routine'],
  }),
  catalog({
    id: 'cinematic',
    label: 'Cinematic',
    summary: 'Teal shadows, warm skin, deeper contrast and thin bars.',
    whenToUse: 'Story formats and transformations; the premium feel.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.15,
        saturation: 0.9,
        gamma: 1,
        warmth: 0.2,
        tint: -0.15,
      },
      { op: 'curves', preset: 'medium_contrast' },
      { op: 'vignette', amount: 0.25 },
      { op: 'bars', amount: 0.06 },
    ],
    suits: ['car-storytime', 'expectation-vs-reality', 'busy-day-routine', 'problem-solution'],
  }),
  catalog({
    id: 'moody',
    label: 'Moody',
    summary: 'Cool, dark, desaturated, crushed shadows.',
    whenToUse: 'The "before" or the pain: a problem hook, an honest confession.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: -0.05,
        contrast: 1.2,
        saturation: 0.7,
        gamma: 0.9,
        warmth: -0.25,
        tint: 0,
      },
      { op: 'vignette', amount: 0.45 },
      { op: 'grain', amount: 0.2, animated: true },
    ],
    avoid: ['a whole offer reel: the close needs light'],
  }),
  catalog({
    id: 'clean-bright',
    label: 'Clean bright',
    summary: 'Bright, airy, high-key and fresh.',
    whenToUse: 'Wellness, results and offer closes; the safest effect for an ad.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: 0.06,
        contrast: 0.95,
        saturation: 1.05,
        gamma: 1.08,
        warmth: 0.05,
        tint: 0,
      },
      { op: 'bloom', radius: 12, amount: 0.12, halation: false },
    ],
  }),
  catalog({
    id: 'neon-night',
    label: 'Neon night',
    summary: 'Magenta and cyan night colour with glowing highlights.',
    whenToUse: 'Evening classes and after-work hooks; a young, loud audience.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.2,
        saturation: 1.5,
        gamma: 1,
        warmth: -0.4,
        tint: 0.4,
      },
      { op: 'bloom', radius: 18, amount: 0.35, halation: false },
      { op: 'chroma', shift: 2 },
    ],
    capture: {
      reel: `At night, lit by magenta and cyan coloured light spilling across her; ${NO_SIGNS}.`,
      still: `At night, lit by magenta and cyan coloured light spilling across her; ${NO_SIGNS}.`,
    },
  }),
  catalog({
    id: 'sepia',
    label: 'Sepia',
    summary: 'Old brown-toned photo colour with a soft vignette.',
    whenToUse: 'Throwbacks and "how it started" beats.',
    category: 'grade',
    ops: [
      { op: 'mono', tone: 'sepia' },
      { op: 'grade', brightness: 0, contrast: 1.05, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
      { op: 'vignette', amount: 0.4 },
      { op: 'grain', amount: 0.3, animated: false },
    ],
  }),
  catalog({
    id: 'cross-process',
    label: 'Cross process',
    summary: 'Cross-processed film: yellow-green highlights, blue shadows, punchy.',
    whenToUse: 'Fashion-y street and routine formats.',
    category: 'grade',
    ops: [
      { op: 'curves', preset: 'cross_process' },
      { op: 'grade', brightness: 0, contrast: 1.05, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
    ],
  }),
  catalog({
    id: 'lomo',
    label: 'Lomo',
    summary: 'A toy camera: saturated colour, heavy dark corners.',
    whenToUse: 'Fun, snapshot hooks and photo dumps.',
    category: 'grade',
    ops: [
      {
        op: 'grade',
        brightness: 0,
        contrast: 1.25,
        saturation: 1.35,
        gamma: 1,
        warmth: 0,
        tint: 0,
      },
      { op: 'vignette', amount: 0.85 },
      { op: 'grain', amount: 0.25, animated: true },
    ],
  }),
  catalog({
    id: 'brand-duotone',
    label: 'Brand duotone',
    summary: "Two tones: the brand's own colour in the shadows, white in the light.",
    whenToUse: 'On-brand hooks and offer closes that should read as the brand at a glance.',
    category: 'grade',
    ops: [
      { op: 'duotone', shadow: 'brand', highlight: '#FFFFFF' },
      { op: 'grade', brightness: 0, contrast: 1.1, saturation: 1, gamma: 1, warmth: 0, tint: 0 },
    ],
  }),
];

export const HEADLESS_EFFECT_IDS = HEADLESS_EFFECTS.map((effect) => effect.id);

export function headlessEffect(id: string): HeadlessEffect | undefined {
  return HEADLESS_EFFECTS.find((effect) => effect.id === id);
}

export const resolveEffect = (effect: HeadlessEffect): ResolvedEffect =>
  resolvedEffectSchema.parse({
    id: effect.id,
    ops: effect.ops,
    ...(effect.capture ? { capture: effect.capture } : {}),
  });
