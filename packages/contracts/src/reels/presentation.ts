import { z } from 'zod';
import {
  type BrandTypeInputs,
  type FaceClass,
  resolveBrandType,
} from '../design-system/typeResolution';

/** Agent-editable presentation intent. Source media stays pinned by the caller. */
export const reelAnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), atSec: z.number().nonnegative() }).strict(),
  z
    .object({
      kind: z.literal('shot'),
      shotId: z.string().min(1),
      edge: z.enum(['start', 'end']),
      offsetSec: z.number().default(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal('speech'),
      phrase: z.string().trim().min(1),
      occurrence: z.number().int().nonnegative().default(0),
    })
    .strict(),
]);

/** Faces Continuum Render ships as static fonts; libass matches these internal names. */
export const reelFontFamilySchema = z.enum([
  'Anton',
  'Inter',
  'Montserrat',
  'Cormorant Garamond',
  'DejaVu Sans',
  'Caveat',
]);
export type ReelFontFamily = z.infer<typeof reelFontFamilySchema>;

/** The shipped reel face nearest each class of face. There is no mono reel face: the neutral one. */
const REEL_FACE_FOR_CLASS: Record<FaceClass, ReelFontFamily> = {
  'condensed-sans': 'Anton',
  'geometric-sans': 'Montserrat',
  'humanist-sans': 'Montserrat',
  'grotesque-sans': 'Inter',
  serif: 'Cormorant Garamond',
  slab: 'Cormorant Garamond',
  script: 'Caveat',
  mono: 'DejaVu Sans',
};

/** A face's class from its name alone, for a face nobody classified; first match wins. */
const CLASS_BY_NAME: readonly [RegExp, FaceClass][] = [
  [/condensed|narrow|compressed|oswald|bebas|anton|league gothic|fjalla|teko/i, 'condensed-sans'],
  [/script|hand|caveat|brush|marker|pacifico|dancing|kaushan|allura|satisfy/i, 'script'],
  [/mono|code|courier/i, 'mono'],
  [/slab|arvo|rockwell|zilla/i, 'slab'],
  [
    /sans|grotesk|grotesque|inter\b|helvetica|arial|roboto|archivo|manrope|söhne|suisse|graphik/i,
    'grotesque-sans',
  ],
  [
    /serif|garamond|playfair|lora|merriweather|baskerville|georgia|times|canela|tiempos|publico|didot|bodoni/i,
    'serif',
  ],
];

/**
 * The reel face for a brand: its display face when Render ships it, else the shipped face of the
 * same class, and the brand face it stands in for. Pure; the reels lane does not read it yet
 * (the strict caption schema is a follow-up), so a substitution is visible before it is wired.
 */
export function reelFaceFor(brand: BrandTypeInputs): {
  family: ReelFontFamily;
  substitutedFor: string | null;
} {
  const type = resolveBrandType(brand);
  const shipped = reelFontFamilySchema.options.find(
    (face) => face.toLowerCase() === type.display.toLowerCase(),
  );
  if (shipped) return { family: shipped, substitutedFor: null };
  const faceClass =
    (type.source === 'ads' ? brand.ads?.classes?.display : undefined) ??
    CLASS_BY_NAME.find(([pattern]) => pattern.test(type.display))?.[1] ??
    'geometric-sans';
  return { family: REEL_FACE_FOR_CLASS[faceClass], substitutedFor: type.display };
}

export const reelPresentationCaptionStyleSchema = z
  .object({
    case: z.enum(['as-spoken', 'upper', 'lower']),
    wordsPerGroup: z.number().int().min(1).max(6),
    positionY: z.number().min(0.1).max(0.9).describe('Caption baseline as a fraction of height.'),
    sizeScale: z.number().min(0.5).max(1.6),
    accentHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    fontFamily: reelFontFamilySchema,
  })
  .strict();
export type ReelPresentationCaptionStyle = z.infer<typeof reelPresentationCaptionStyleSchema>;
/** Today's look; the default keeps every pre-template presentation rendering as it did. */
export const DEFAULT_REEL_CAPTION_STYLE: ReelPresentationCaptionStyle = {
  case: 'as-spoken',
  wordsPerGroup: 3,
  positionY: 0.7,
  sizeScale: 1,
  accentHex: '#FFD100',
  fontFamily: 'Anton',
};
/** Footage moves Render draws on the joined picture (and on the subject masks) before any graphics. */
export const reelMotionKindSchema = z.enum(['punch-in', 'push-in', 'snap-zoom', 'shake', 'drift']);
export type ReelMotionKind = z.infer<typeof reelMotionKindSchema>;
export const reelCtaEntranceSchema = z.enum(['rise', 'punch', 'slide', 'fade']);
/**
 * plate: a brand-colour plate · card: a full-screen type card. A link-icon pill was retired: it
 * looked tappable in a video, where nothing is.
 */
export const reelCtaStyleSchema = z.enum(['plate', 'card']);
const reelDisplayStyleSchema = z
  .object({ fontFamily: reelFontFamilySchema, behindSubject: z.boolean() })
  .strict();
export const DEFAULT_REEL_DISPLAY_STYLE = { fontFamily: 'Anton' as const, behindSubject: true };
export const reelCardKindSchema = z.enum(['type-card', 'product-hero']);

export const reelTransitionKindSchema = z.enum(['cut', 'crossfade', 'whip', 'dip-black', 'j-cut']);
export type ReelTransitionKind = z.infer<typeof reelTransitionKindSchema>;
const reelTransitionSchema = z
  .object({
    afterSceneId: z.string().min(1),
    kind: reelTransitionKindSchema,
    durationSec: z.number().nonnegative().max(1.5),
  })
  .strict();

export const reelPresentationSchema = z
  .object({
    version: z.literal(1),
    captionPreset: z
      .enum([
        'active-word@1',
        'boxed-word-pop@1',
        'progressive-reveal@1',
        'keyword-punch@1',
        'editorial-strip@1',
        'pop-word@1',
        'bounce@1',
        'karaoke-fill@1',
        'highlight-box@1',
        'glow@1',
        'dim-ahead@1',
        'none',
      ])
      .describe(
        'Reels caption motion: single active word, boxed pop, accumulating words, emphasized keyword, restrained editorial strip, per-word pop, bouncing group, karaoke fill, highlight box, glow, or none (words still time anchors and the speech gate).',
      ),
    treatment: z
      .enum([
        'none',
        'focus-blur@1',
        'paper-notes@1',
        'neon-frame@1',
        'editorial-split@1',
        'subject-occlusion@1',
      ])
      .default('none')
      .describe(
        'Deterministic Reels visual treatment, applied after Omni. Subject occlusion places typography behind the subject.',
      ),
    cta: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('none') }).strict(),
      z.object({ mode: z.literal('text'), text: z.string().trim().min(1).max(160) }).strict(),
    ]),
    emphasisPhrases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    events: z
      .array(
        z
          .object({
            kind: z.enum(['headline', 'inset', 'blur', 'paper-note', 'neon-frame', 'sound-accent']),
            anchor: reelAnchorSchema,
            durationSec: z.number().positive().max(30),
            text: z.string().trim().min(1).max(160).optional(),
          })
          .strict(),
      )
      .max(40)
      .default([])
      .describe(
        'Timeline edit instructions anchored to shot edges, transcript phrases, or absolute time; resolved after clip analysis.',
      ),
    insetAssetId: z.string().uuid().nullable().default(null),
    soundAccents: z.enum(['none', 'subtle']).default('none'),
    captionStyle: reelPresentationCaptionStyleSchema.default(DEFAULT_REEL_CAPTION_STYLE),
    transitions: z
      .array(reelTransitionSchema)
      .max(23)
      .default([])
      .describe(
        'Joins between consecutive scenes; a scene without one is a cut. An overlap is clamped so the last word of the outgoing scene is never clipped.',
      ),
    speechGate: z
      .enum(['off', 'line@1'])
      .default('off')
      .describe(
        "line@1 keeps each scene's spoken line whole, from 0.25 s before its first word to 0.4 s after its last, and mutes the rest under the room tone.",
      ),
    motion: z
      .object({
        punchIn: z
          .enum(['none', 'emphasis', 'display'])
          .describe('emphasis: on emphasised words; display: on every display word too.'),
        shake: z.enum(['none', 'accents']),
        // Optional so hand-built presentations that predate it still type; absent = none.
        drift: z
          .enum(['none', 'handheld'])
          .optional()
          .describe(
            'handheld: a small, slow two-axis drift over every scene, as if the phone were held.',
          ),
        moves: z
          .array(
            z
              .object({
                kind: z.enum(['push-in', 'snap-zoom']),
                anchor: reelAnchorSchema,
                durationSec: z.number().positive().max(30),
                focusX: z.number().min(0).max(1),
                focusY: z.number().min(0).max(1),
              })
              .strict(),
          )
          .max(24),
      })
      .strict()
      .default({ punchIn: 'none', shake: 'none', moves: [] })
      .describe(
        'Footage motion: punch-ins on emphasised words (first word of each beat when none is), micro-shake on sound accents, and anchored push-ins / snap-zooms.',
      ),
    loudnessTargetLufs: z
      .number()
      .min(-30)
      .max(-9)
      .nullable()
      .default(null)
      .describe("Each scene's speech is gained to this loudness, measured over its own words."),
    roomTone: z
      .array(
        z
          .object({
            sceneIds: z.array(z.string().min(1)).min(1).max(24),
            levelDb: z.number().min(-70).max(-30),
          })
          .strict(),
      )
      .max(24)
      .default([])
      .describe(
        'One continuous room-tone bed per location, at one level, under every scene it names.',
      ),
    ctaEntrance: reelCtaEntranceSchema.default('rise'),
    ctaStyle: reelCtaStyleSchema.default('plate'),
    displayStyle: reelDisplayStyleSchema.default(DEFAULT_REEL_DISPLAY_STYLE),
    displayWords: z
      .array(
        z
          .object({
            anchor: reelAnchorSchema,
            durationSec: z.number().positive().max(30),
            text: z.string().trim().min(1).max(24),
          })
          .strict(),
      )
      .max(24)
      .default([])
      .describe(
        'One giant display word per beat: 60–100 % of the frame width, behind the subject unless displayStyle says otherwise.',
      ),
    cards: z
      .array(
        z
          .object({
            kind: reelCardKindSchema,
            anchor: reelAnchorSchema,
            durationSec: z.number().positive().max(10),
            title: z.string().trim().min(1).max(40).nullable(),
            lines: z.array(z.string().trim().min(1).max(60)).max(5),
          })
          .strict(),
      )
      .max(6)
      .default([])
      .describe(
        'Full-screen cutaways over the picture while the voice runs on: a dark-grain type card, or the packshot hero on an accent gradient.',
      ),
    beatSync: z
      .boolean()
      .default(false)
      .describe(
        'A hard cut ends on a detected beat of the outgoing scene, never inside its last word. Overlaps stay speech-timed.',
      ),
  })
  .strict()
  // Continuum Render refuses these at render time, after every clip is paid for; refuse them here.
  .superRefine((value, ctx) => {
    if (new Set(value.transitions.map((t) => t.afterSceneId)).size !== value.transitions.length)
      ctx.addIssue({
        code: 'custom',
        path: ['transitions'],
        message: 'one transition per scene boundary',
      });
    const toned = value.roomTone.flatMap((group) => group.sceneIds);
    if (new Set(toned).size !== toned.length)
      ctx.addIssue({
        code: 'custom',
        path: ['roomTone'],
        message: 'each scene sits in at most one room-tone group',
      });
    if (
      value.treatment === 'subject-occlusion@1' &&
      !value.events.some((event) => event.kind === 'headline' && event.text)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['treatment'],
        message: 'subject-occlusion@1 needs a headline event with text',
      });
    if (value.cards.some((card) => card.kind === 'product-hero') && !value.insetAssetId)
      ctx.addIssue({
        code: 'custom',
        path: ['cards'],
        message: 'a product-hero card needs an insetAssetId (the packshot)',
      });
    if (value.treatment === 'editorial-split@1' && !value.insetAssetId)
      ctx.addIssue({
        code: 'custom',
        path: ['treatment'],
        message: 'editorial-split@1 needs an insetAssetId',
      });
  });

export type ReelPresentation = z.infer<typeof reelPresentationSchema>;

export const reelTimedWordSchema = z
  .object({
    text: z.string().min(1).max(100),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
  })
  .strict();
export const reelSceneSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    words: z.array(reelTimedWordSchema).max(3000),
  })
  .strict();
export const reelAnalysisSchema = z
  .object({
    version: z.literal(1),
    scenes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            durationSec: z.number().positive(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            hasAudio: z.boolean(),
            silence: z.array(
              z.object({ startSec: z.number().nonnegative(), endSec: z.number().positive() }),
            ),
            cutTimesSec: z.array(z.number().nonnegative()),
            /** Momentary loudness (LUFS, 400 ms window) every 100 ms; entry k ends at (k + 1) / 10 s. */
            loudness: z.array(z.number()).max(12000).default([]),
            /** Onsets from that loudness. Empty when the scene had no audio. */
            beatsSec: z.array(z.number().nonnegative()).max(4000).default([]),
            /** Median tempo of those onsets, doubled or halved into 70–180. Null under four beats. */
            bpm: z.number().positive().nullable().default(null),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();
export const reelResolvedPresentationSchema = z
  .object({
    version: z.literal(1),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    durationSec: z.number().positive(),
    output: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.number().int().positive(),
      })
      .strict(),
    sceneIds: z.array(z.string().min(1)).min(1).max(24),
    words: z
      .array(
        z
          .object({
            id: z.string().min(1),
            text: z.string().min(1),
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            emphasized: z.boolean(),
          })
          .strict(),
      )
      .max(10000),
    events: z
      .array(
        z
          .object({
            kind: z.enum(['headline', 'inset', 'blur', 'paper-note', 'neon-frame', 'sound-accent']),
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            text: z.string().optional(),
          })
          .strict(),
      )
      .max(40),
    captionPreset: reelPresentationSchema.shape.captionPreset,
    treatment: reelPresentationSchema.shape.treatment,
    cta: reelPresentationSchema.shape.cta,
    // Everything below is newer than the deployed continuum-reels rev 00002: each defaults, so an
    // old Render's plan parses, and reelResolvedWire drops it again on the way back.
    captionStyle: reelPresentationCaptionStyleSchema.default(DEFAULT_REEL_CAPTION_STYLE),
    scenes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            frames: z.number().int().positive(),
            speechSpans: z
              .array(
                z
                  .object({ startSec: z.number().nonnegative(), endSec: z.number().positive() })
                  .strict(),
              )
              .nullable(),
            gainDb: z.number(),
          })
          .strict(),
      )
      .min(1)
      .max(24)
      .default([]),
    transitions: z.array(reelTransitionSchema).max(23).default([]),
    motion: z
      .array(
        z
          .object({
            kind: reelMotionKindSchema,
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            focusX: z.number().min(0).max(1),
            focusY: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(80)
      .default([]),
    roomTone: reelPresentationSchema.shape.roomTone,
    ctaEntrance: reelCtaEntranceSchema.default('rise'),
    loudnessTargetLufs: z.number().nullable().default(null),
    ctaStyle: reelCtaStyleSchema.default('plate'),
    displayStyle: reelDisplayStyleSchema.default(DEFAULT_REEL_DISPLAY_STYLE),
    displayWords: z
      .array(
        z
          .object({
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            text: z.string().min(1),
          })
          .strict(),
      )
      .max(24)
      .default([]),
    cards: z
      .array(
        z
          .object({
            kind: reelCardKindSchema,
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            title: z.string().nullable(),
            lines: z.array(z.string()),
          })
          .strict(),
      )
      .max(6)
      .default([]),
  })
  .strict();
export type ReelAnalysis = z.infer<typeof reelAnalysisSchema>;
export type ReelResolvedPresentation = z.infer<typeof reelResolvedPresentationSchema>;
export type ReelScene = z.infer<typeof reelSceneSchema>;

/**
 * The deployed continuum-reels (rev 00002) knows none of these keys, and its schemas are strict.
 * On the wire each is sent only when it carries something, so an old Render gets exactly its own
 * shape and a new one re-fills the same defaults in the same key order: the plan hash holds.
 * Using a newer feature against an old Render still 400s — deploy Render before the Backend.
 */
const INTENT_SINCE_REV2 = [
  'captionStyle',
  'transitions',
  'speechGate',
  'motion',
  'loudnessTargetLufs',
  'roomTone',
  'ctaEntrance',
  'ctaStyle',
  'displayStyle',
  'displayWords',
  'cards',
  'beatSync',
];
const RESOLVED_SINCE_REV2 = [
  'captionStyle',
  'scenes',
  'transitions',
  'motion',
  'roomTone',
  'ctaEntrance',
  'loudnessTargetLufs',
  'ctaStyle',
  'displayStyle',
  'displayWords',
  'cards',
];
const INTENT_DEFAULTS: Record<string, unknown> = reelPresentationSchema.parse({
  version: 1,
  captionPreset: 'active-word@1',
  cta: { mode: 'none' },
});
const RESOLVED_DEFAULTS: Record<string, unknown> = reelResolvedPresentationSchema.parse({
  version: 1,
  hash: '0'.repeat(64),
  durationSec: 1,
  output: { width: 2, height: 2, fps: 1 },
  sceneIds: ['s'],
  words: [],
  events: [],
  captionPreset: 'active-word@1',
  treatment: 'none',
  cta: { mode: 'none' },
});
function withoutDefaults<T extends object>(
  value: T,
  keys: string[],
  defaults: Record<string, unknown>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, field]) =>
        !keys.includes(key) || JSON.stringify(field) !== JSON.stringify(defaults[key]),
    ),
  ) as Partial<T>;
}
export const reelPresentationWire = (presentation: ReelPresentation): Partial<ReelPresentation> =>
  withoutDefaults(presentation, INTENT_SINCE_REV2, INTENT_DEFAULTS);
export const reelResolvedWire = (
  resolved: ReelResolvedPresentation,
): Partial<ReelResolvedPresentation> =>
  withoutDefaults(resolved, RESOLVED_SINCE_REV2, RESOLVED_DEFAULTS);
/** Occlusion needs a subject matte for every scene: the treatment, or display words set behind the subject. */
export const reelNeedsSubjectMasks = (resolved: ReelResolvedPresentation): boolean =>
  resolved.treatment === 'subject-occlusion@1' ||
  (resolved.displayStyle.behindSubject && resolved.displayWords.length > 0);
export const reelAnalysisWire = (analysis: ReelAnalysis) => ({
  ...analysis,
  scenes: analysis.scenes.map(({ loudness, beatsSec, bpm, ...scene }) => ({
    ...scene,
    ...(loudness.length ? { loudness } : {}),
    ...(beatsSec.length ? { beatsSec } : {}),
    ...(bpm !== null ? { bpm } : {}),
  })),
});
