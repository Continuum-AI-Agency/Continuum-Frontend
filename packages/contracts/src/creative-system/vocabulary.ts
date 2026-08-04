// The closed vocabulary of craft decisions, extending `ArtDirection` rather than replacing it.
//
// `creative/art-direction.ts` established the law this file obeys: the vocabulary is
// CLOSED wherever a real decision exists, because open strings are what let "cinematic,
// ultra detailed, 8K" pass for art direction. An enum forces a choice a camera operator
// could actually execute, and — the half that matters here — a choice an evaluator can
// actually check against the pixels.
//
// `ArtDirection` already closes angle, framing, light direction and light quality. It
// leaves open, as free strings, the four decisions that turn out to carry most of the
// difference between a frame that reads as real and one that reads as generated:
//
//   lens        — "35mm environmental" and "cinematic lens" are both accepted today
//   motion      — one string for what is really movement + duration + intent
//   palette     — three colour words with no statement of CONTRAST or GRADE
//   (nothing)   — there is no field at all for how POLISHED the result should be
//
// This module closes those four, and adds the two axes the existing contract has no
// place for at all: deliberate imperfection, and art/cultural style.
//
// How the closing is done matters as much as what is closed. Each decision is added to
// the object that ALREADY owns it — `.extend()` widens `cameraDirectionSchema`,
// `lightDirectionSchema` and `paletteDirectionSchema` in place, and `sceneDirectionSchema`
// swaps the widened forms into `artDirectionSchema`. A sibling `cameraCraft` object would
// have meant two places to look for one camera decision, and two places is how a system
// ends up with a lens band that contradicts its lens string. Because `.extend()` replaces
// keys rather than nesting, a `SceneDirection` is a structural SUPERSET of `ArtDirection`:
// `renderArtDirection`, `gradeArtDirection` and `summarizeArtDirection` keep working on it
// unchanged, which is the whole reason `creative/art-direction.ts` is not edited.
//
// Why imperfection needs a schema. Every image model's untuned default is a glossy
// advertising photograph: even light, clean surfaces, centred subject, no lens error.
// That default IS the slop. You cannot instruct your way out of it with adjectives —
// "make it feel authentic" produces a glossy advertising photograph of an authentic-
// looking person. You get out of it by naming physical devices a camera would have
// produced, and then checking the output for them. So a realism device is not a mood:
// it is a cause (`what physically happens`), a prompt fragment (`how to induce it`),
// and an observable (`what an evaluator looks for`). A device with no observable is a
// mood adjective wearing a costume, and is rejected at authoring time.

import { z } from 'zod';

import {
  artDirectionSchema,
  cameraDirectionSchema,
  lightDirectionSchema,
  paletteDirectionSchema,
} from '../creative/art-direction';
import { boundedText, boundedTextArray } from './limits';

/* -------------------------------------------------------------------------- */
/*  Camera                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Focal bands, not focal lengths.
 *
 * A model cannot honour "37mm" — it can honour the perspective signature of a band.
 * Naming the band is also what lets an evaluator check the result: `telephoto-compression`
 * predicts a flattened background and a subject separated from it, and that is visible.
 */
export const LENS_BANDS = [
  'ultra-wide-distortion',
  'wide-environmental',
  'normal-human-eye',
  'short-telephoto-portrait',
  'telephoto-compression',
  'macro-detail',
] as const;
export type LensBand = (typeof LENS_BANDS)[number];

/**
 * Depth of field as a decision about what is SEPARATED from what.
 *
 * `uniform-sharp` is listed deliberately: it is the correct choice for a flat-lay or a
 * scan, and the wrong-but-default choice everywhere else. Naming it makes the "every
 * surface equally sharp" slop tell an explicit selection rather than an accident.
 */
export const DEPTH_OF_FIELD = [
  'razor-thin',
  'shallow-subject-isolated',
  'moderate',
  'deep-everything-legible',
  'uniform-sharp',
] as const;
export type DepthOfField = (typeof DEPTH_OF_FIELD)[number];

/**
 * Camera movement. Still targets ignore it; reel shots require it.
 *
 * Split from `ArtDirection.motion` (which conflates camera movement with subject action)
 * because a reel shot list has to say which one is moving — "handheld-follow" and
 * "locked-off" describe the same subject doing the same thing and produce entirely
 * different footage.
 */
export const CAMERA_MOVEMENTS = [
  'locked-off',
  'handheld-drift',
  'handheld-follow',
  'slow-push-in',
  'slow-pull-out',
  'pan',
  'tilt',
  'tracking-lateral',
  'orbit',
  'crash-zoom',
  'whip-pan',
  'gimbal-glide',
] as const;
export type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];

/**
 * Where the subject sits in frame and why.
 *
 * Named `COMPOSITION_RULES` rather than "framing" because `camera.framing` already means
 * shot size in the production contract, and one word meaning two things across a single
 * object is a reliable way to get the wrong field set.
 *
 * `dead-centre-static` earns its place for the same reason `uniform-sharp` does: it is
 * the model's default, it is right for a packshot and a symmetrical portrait, and it is
 * a slop tell everywhere else. Forcing it to be chosen makes the accident visible.
 */
export const COMPOSITION_RULES = [
  'dead-centre-static',
  'rule-of-thirds',
  'golden-ratio',
  'symmetrical',
  'edge-weighted',
  'negative-space-dominant',
  'crop-through-subject',
  'off-centre-headroom-wrong',
] as const;
export type CompositionRule = (typeof COMPOSITION_RULES)[number];

/**
 * The production camera object, widened with the decisions it was missing.
 *
 * `framing` (inherited) is the shot size and stays the only place shot size is stated —
 * there is deliberately no `shotSize` field. `lens` (inherited) is the free-text feel;
 * `lensBand` is the checkable band the evaluator can actually test against the pixels.
 */
export const extendedCameraDirectionSchema = cameraDirectionSchema
  .extend({
    lensBand: z.enum(LENS_BANDS),
    depthOfField: z.enum(DEPTH_OF_FIELD),
    compositionRule: z.enum(COMPOSITION_RULES),
    /** Required by motion targets, ignored by still ones — mirrors `ArtDirection.motion`'s split. */
    movement: z.enum(CAMERA_MOVEMENTS).nullable().optional(),
  })
  .strict();
export type ExtendedCameraDirection = z.infer<typeof extendedCameraDirectionSchema>;

/* -------------------------------------------------------------------------- */
/*  Light and colour                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Lighting setup — the arrangement, where `LIGHT_QUALITIES` is the character of one source.
 *
 * `mixed-practical` is the workhorse of the anti-polish axis. Real rooms are lit by a
 * warm lamp and a cold window at once, and the resulting colour cast across a face is
 * the single most reliable tell that a photograph was taken rather than rendered.
 */
export const LIGHTING_SETUPS = [
  'single-source-hard',
  'single-source-soft',
  'key-fill-balanced',
  'key-fill-rim',
  'high-key-even',
  'low-key-chiaroscuro',
  'natural-available-only',
  'mixed-practical',
  'on-camera-direct-flash',
  'bounced-indirect',
  'silhouette-backlit',
] as const;
export type LightingSetup = (typeof LIGHTING_SETUPS)[number];

export const COLOUR_TEMPERATURES = [
  'candle-warm',
  'tungsten',
  'neutral-daylight',
  'overcast-cool',
  'shade-blue',
  'mixed-warm-cool-clash',
] as const;
export type ColourTemperature = (typeof COLOUR_TEMPERATURES)[number];

export const TIMES_OF_DAY = [
  'blue-hour-dawn',
  'early-morning',
  'midday-harsh',
  'afternoon',
  'golden-hour',
  'dusk',
  'night-ambient',
  'night-artificial',
  'interior-no-daylight',
] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const CONTRAST_LEVELS = [
  'flat-low-contrast',
  'gentle',
  'normal',
  'punchy',
  'crushed-high-contrast',
] as const;
export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];

/**
 * The grade, named as a reproduction process rather than a look.
 *
 * `teal-and-orange` is included so it can be FORBIDDEN by name. It is the most common
 * single signature of an over-processed generated image, and a negative constraint that
 * cannot name its target is not enforceable.
 */
export const COLOUR_GRADES = [
  'neutral-untouched',
  'kodachrome-saturated',
  'portra-soft-warm',
  'ektachrome-cool',
  'cross-processed',
  'bleach-bypass',
  'monochrome-silver',
  'duotone',
  'faded-print',
  'teal-and-orange',
] as const;
export type ColourGrade = (typeof COLOUR_GRADES)[number];

/**
 * The production light object, widened with the arrangement it was missing.
 *
 * `quality` (inherited) is the character of one source; `setup` is how the sources are
 * arranged. `direction` (inherited) has no `three-quarter` member — that gap is real and
 * is NOT fixed here, because widening a const tuple the reel path already parses is a
 * contract change that belongs in its own review. Until then a three-quarter key is
 * `direction: 'camera-left'` plus the inherited free-text `shadow` rider.
 */
export const extendedLightDirectionSchema = lightDirectionSchema
  .extend({
    setup: z.enum(LIGHTING_SETUPS),
    colourTemperature: z.enum(COLOUR_TEMPERATURES),
    timeOfDay: z.enum(TIMES_OF_DAY).nullable().optional(),
  })
  .strict();
export type ExtendedLightDirection = z.infer<typeof extendedLightDirectionSchema>;

/**
 * The production palette object, widened with the two decisions three colour words omit.
 *
 * Contrast and grade sit here rather than on light because they are reproduction
 * decisions about colour, not about the arrangement of sources — a `bleach-bypass` grade
 * survives any lighting setup, and putting it next to `setup` invites an author to
 * re-decide the look twice.
 */
export const extendedPaletteDirectionSchema = paletteDirectionSchema
  .extend({
    contrast: z.enum(CONTRAST_LEVELS),
    grade: z.enum(COLOUR_GRADES),
  })
  .strict();
export type ExtendedPaletteDirection = z.infer<typeof extendedPaletteDirectionSchema>;

/* -------------------------------------------------------------------------- */
/*  Scene direction                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `ArtDirection` with the three widened blocks swapped in place.
 *
 * The swap — not a wrapper, not an intersection — is what keeps this a `ZodObject` and
 * keeps its inferred type assignable to `ArtDirection`. `z.intersection()` would produce
 * a `ZodIntersection` with no `.extend()`, no `.strict()` and no discriminated-union
 * membership; a `{ base, extra }` wrapper would push every existing consumer through an
 * indirection and tempt an author to restate `heroSubject` at the outer level.
 *
 * One asymmetry is deliberate: `artDirectionSchema` is not strict and this is. A payload
 * carrying an unknown key parses as an `ArtDirection` and fails as a `SceneDirection`,
 * because a stray key in a creative-system spec is a typo the author needs to see.
 */
export const sceneDirectionSchema = artDirectionSchema
  .extend({
    camera: extendedCameraDirectionSchema,
    light: extendedLightDirectionSchema,
    palette: extendedPaletteDirectionSchema,
  })
  .strict();
export type SceneDirection = z.infer<typeof sceneDirectionSchema>;

/* -------------------------------------------------------------------------- */
/*  Polish and deliberate imperfection                                         */
/* -------------------------------------------------------------------------- */

/**
 * How finished the artefact should look, as an ordinal scale.
 *
 * Ordinal, not a set of tags, because the compiler has to answer "is this MORE raw than
 * the brand allows?" — and a brand rule that says "never below `studio-clean`" is only
 * checkable if the steps are ordered. `POLISH_RANK` below is that order.
 *
 * The default is NOT the middle. It is `campaign-polished`, because that is what every
 * provider produces unbidden, and pretending otherwise would let a recipe claim a grit
 * level it never actually requested.
 */
export const POLISH_LEVELS = [
  'raw-amateur',
  'documentary-candid',
  'crafted-natural',
  'studio-clean',
  'campaign-polished',
] as const;
export type PolishLevel = (typeof POLISH_LEVELS)[number];

/** Ordered low-to-high. Comparisons use the index, never string equality. */
export const POLISH_RANK: Readonly<Record<PolishLevel, number>> = Object.freeze(
  Object.fromEntries(POLISH_LEVELS.map((level, index) => [level, index])) as Record<
    PolishLevel,
    number
  >,
);

export const comparePolish = (a: PolishLevel, b: PolishLevel): number =>
  POLISH_RANK[a] - POLISH_RANK[b];

/**
 * What each level LOOKS like, which is what makes the scale scorable.
 *
 * A vision judge cannot grade the token `crafted-natural` — it can only grade a
 * description of what should be visible. These strings are the ones handed to the judge
 * and the ones the compiler renders, so the label and the criterion cannot drift apart.
 * Every entry is written as a positive production fact for the same reason a realism
 * device is: "not over-lit" tells a model nothing it can act on.
 */
export const POLISH_LEVEL_OBSERVABLE: Readonly<Record<PolishLevel, string>> = Object.freeze({
  'raw-amateur':
    'No colour work, no retouch, no set styling, no framing correction. Exposure may be plainly wrong. Reads as one frame pulled straight off a phone roll.',
  'documentary-candid':
    'Available light and a real, undressed location. Framing is intentional but the room was not rearranged for the camera; cleanup goes no further than dust.',
  'crafted-natural':
    'Light is shaped rather than manufactured and props are edited down rather than replaced, and the result still reads as a moment that happened on its own.',
  'studio-clean':
    'Controlled lighting, a styled set, deliberate colour and product-grade retouch. Nothing in frame is accidental and every surface reads as prepared.',
  'campaign-polished':
    'Flawless surfaces, ideal specular behaviour, full skin and product retouch, no dust, no fingerprints, and no visible capture artefact of any kind.',
});

/**
 * A physical imperfection, named by its cause.
 *
 * Every id here is something a real camera or a real room does. That is the whole
 * discipline: `direct-flash-falloff` is enforceable because the evidence is checkable
 * (hot near subject, black background, hard shadow on the wall behind), whereas
 * "authentic feel" is not enforceable at all.
 */
export const REALISM_DEVICES = [
  'direct-flash-falloff',
  'handheld-micro-shake',
  'rolling-shutter-skew',
  'high-iso-sensor-grain',
  'blown-highlight-clipping',
  'crushed-shadow-detail',
  'mixed-colour-temperature-cast',
  'auto-white-balance-drift',
  'lens-smudge-veiling-flare',
  'subject-motion-blur',
  'focus-miss',
  'off-centre-crop',
  'unstyled-background-clutter',
  'visible-rig-or-reflection',
  'compression-artifacting',
  'camcorder-scanlines',
  'phone-screen-glare',
  'imperfect-skin-texture',
  'flyaway-hair',
  'wardrobe-wrinkles',
  'worn-product-surface',
  'partially-consumed-food',
  'fingerprints-and-dust',
  'uneven-handmade-edge',
] as const;
export type RealismDevice = (typeof REALISM_DEVICES)[number];

export interface RealismDeviceProfile {
  /** The clause the compiler emits. Always a positive production fact, never a negation. */
  readonly mechanism: string;
  /** What a vision judge points at to confirm the device landed. */
  readonly evaluatorCue: string;
  /** Above this level the device contradicts the brief rather than decorating it. */
  readonly maxPolishLevel: PolishLevel;
}

/**
 * The one frozen table the prompt clause and the evaluation seed both read.
 *
 * Two properties of this map are load-bearing. First, it is the SINGLE source: the
 * compiler writes `mechanism` into the prompt and `realismHardChecks` writes
 * `evaluatorCue` into the check, so the thing that asked for the imperfection is the
 * thing that checks for it and they cannot drift.
 *
 * Second, every `mechanism` states what the camera or the room DID, never what the image
 * should avoid. "Not glossy" is unreliable guidance to a diffusion model at the best of
 * times, and several providers discard a negative prompt entirely — a positive
 * production fact survives every adapter, including the ones with no negative channel.
 */
export const REALISM_DEVICE_PROFILE: Readonly<Record<RealismDevice, RealismDeviceProfile>> =
  Object.freeze({
    'direct-flash-falloff': {
      mechanism:
        'Lit by a single flash fired from the lens axis, exposed for the nearest surface so the background falls away into darkness.',
      evaluatorCue:
        'Frontal specular hotspot on the subject, a hard shadow pinned to the wall directly behind it, and corners going to near-black.',
      maxPolishLevel: 'documentary-candid',
    },
    'handheld-micro-shake': {
      mechanism:
        'Camera held in one hand at a slow shutter, so the horizon sits a degree or two off level and the subject lands slightly off its mark.',
      evaluatorCue:
        'Non-level horizon and a subject that sits on no deliberate compositional anchor.',
      maxPolishLevel: 'crafted-natural',
    },
    'rolling-shutter-skew': {
      mechanism:
        'Shot on a CMOS phone sensor while panning fast, so the frame is read line by line during the movement.',
      evaluatorCue: 'Vertical edges lean consistently in the direction of the pan.',
      maxPolishLevel: 'documentary-candid',
    },
    'high-iso-sensor-grain': {
      mechanism: 'Small sensor pushed to a high ISO in a dim room, with noise reduction left off.',
      evaluatorCue:
        'Luminance and chroma speckle heaviest in the shadows, cleaner in the highlights.',
      maxPolishLevel: 'crafted-natural',
    },
    'blown-highlight-clipping': {
      mechanism:
        'Exposed for the face so the window behind it clips to paper white with no recoverable detail.',
      evaluatorCue: 'A flat pure-white region with a hard clipping edge, carrying no texture.',
      maxPolishLevel: 'crafted-natural',
    },
    'crushed-shadow-detail': {
      mechanism:
        'Exposed for the brightest area so the unlit side of the scene falls to solid black.',
      evaluatorCue: 'Large shadow regions at or near black with no separation inside them.',
      maxPolishLevel: 'campaign-polished',
    },
    'mixed-colour-temperature-cast': {
      mechanism:
        'A warm tungsten lamp and a cold window fall on the subject at once and neither is corrected.',
      evaluatorCue: 'Warm and cool casts coexisting on the same face or surface.',
      maxPolishLevel: 'crafted-natural',
    },
    'auto-white-balance-drift': {
      mechanism:
        'Camera left on auto white balance under a single dominant source, so the whole frame carries that source colour.',
      evaluatorCue: 'A global colour cast; nominally neutral surfaces are not neutral.',
      maxPolishLevel: 'documentary-candid',
    },
    'lens-smudge-veiling-flare': {
      mechanism:
        'A fingerprint on the front element with a light source just inside the frame, lifting the blacks around it.',
      evaluatorCue: 'Localised low-contrast haze adjacent to a bright source.',
      maxPolishLevel: 'crafted-natural',
    },
    'subject-motion-blur': {
      mechanism:
        'Shutter left slow enough that the moving part of the subject smears while the static background stays defined.',
      evaluatorCue: 'Directional smear confined to the moving element, background sharp.',
      maxPolishLevel: 'crafted-natural',
    },
    'focus-miss': {
      mechanism:
        'Autofocus locked onto the plane just behind the subject and the shot was taken anyway.',
      evaluatorCue: 'The sharpest plane in the frame is demonstrably not the subject.',
      maxPolishLevel: 'documentary-candid',
    },
    'off-centre-crop': {
      mechanism: 'Framed quickly without recomposing, leaving unbalanced headroom and lead room.',
      evaluatorCue: 'Subject sits off every deliberate grid position with lopsided margins.',
      maxPolishLevel: 'documentary-candid',
    },
    'unstyled-background-clutter': {
      mechanism:
        'The room was shot as found: ordinary objects sit where the person who lives there left them, each with a plausible reason.',
      evaluatorCue:
        'Real clutter with a use narrative — a drying mug, a charging cable — rather than scattered decorative props.',
      maxPolishLevel: 'documentary-candid',
    },
    'visible-rig-or-reflection': {
      mechanism:
        'The tripod, ring light, or the photographer is caught in a reflective surface inside the frame.',
      evaluatorCue: 'Equipment or a shooter visible in a mirror, screen, or glossy surface.',
      maxPolishLevel: 'documentary-candid',
    },
    'compression-artifacting': {
      mechanism: 'The image has been re-saved and re-uploaded several times at low quality.',
      evaluatorCue: 'Blocking at high-contrast edges and ringing around lettering.',
      maxPolishLevel: 'documentary-candid',
    },
    'camcorder-scanlines': {
      mechanism:
        'Captured on interlaced tape, so alternating field lines and tape noise sit across the frame.',
      evaluatorCue: 'Horizontal interlace lines and a slight chroma bleed at edges.',
      maxPolishLevel: 'documentary-candid',
    },
    'phone-screen-glare': {
      mechanism:
        'A phone or monitor in frame reflects the room light back at the lens across part of its surface.',
      evaluatorCue: 'A bright reflected patch obscuring part of a screen in frame.',
      maxPolishLevel: 'documentary-candid',
    },
    'imperfect-skin-texture': {
      mechanism:
        'Skin is left as photographed: visible pores, a shine on the forehead, and whatever blemishes were there that day.',
      evaluatorCue: 'Pore-level texture and uneven tone across the face at full size.',
      maxPolishLevel: 'studio-clean',
    },
    'flyaway-hair': {
      mechanism:
        'Hair was left as it dried, so loose strands lift away from the head and catch the light.',
      evaluatorCue: 'Individual strands standing clear of the silhouette.',
      maxPolishLevel: 'studio-clean',
    },
    'wardrobe-wrinkles': {
      mechanism:
        'Clothing was worn to the shoot rather than steamed on set, so it creases where a body bends and an edge sits untucked.',
      evaluatorCue: 'Fabric creases at elbows, waist, and seams; a hem or collar out of place.',
      maxPolishLevel: 'studio-clean',
    },
    'worn-product-surface': {
      mechanism:
        'The product on set is the one that has been used: fine scuffs, a thumbprint at the grip point, a scratch near the opening.',
      evaluatorCue:
        'Surface wear concentrated exactly where a hand or daily use would put it, not scattered evenly.',
      maxPolishLevel: 'crafted-natural',
    },
    'partially-consumed-food': {
      mechanism:
        'The dish is photographed mid-meal — a bite taken, a slice lifted, crumbs and a used fork on the cloth.',
      evaluatorCue: 'A missing portion with a matching implement and debris nearby.',
      maxPolishLevel: 'crafted-natural',
    },
    'fingerprints-and-dust': {
      mechanism:
        'Glass and gloss surfaces are shot unwiped, so handling marks and settled dust catch the key light.',
      evaluatorCue: 'Smears and specks visible where the light rakes across a glossy surface.',
      maxPolishLevel: 'crafted-natural',
    },
    'uneven-handmade-edge': {
      mechanism:
        'The mark was made by hand or by a hand-fed tool, so no two repetitions of it are identical.',
      evaluatorCue: 'Repeated shapes differ from one another in width, register, or termination.',
      maxPolishLevel: 'crafted-natural',
    },
  });

/**
 * The observable tells of a generated image, kept as a closed list so a negative
 * constraint can name its target and a hard gate can look for it.
 *
 * These are failure signatures, never selectable direction. Nothing in the system may
 * put one of these in a `must` list; the compiler rejects a spec that tries.
 */
export const SLOP_SIGNATURES = [
  'plastic-airbrushed-skin',
  'impossible-hands-or-fingers',
  'garbled-text-or-glyphs',
  'floating-ungrounded-objects',
  'uniform-creamy-bokeh',
  'hdr-halo-edges',
  'teal-orange-oversaturation',
  'unmotivated-centred-subject',
  'every-surface-equally-clean',
  'symmetrical-uncanny-face',
  'no-depth-cue',
  'duplicated-limbs-or-objects',
  'inconsistent-shadow-direction',
  'melted-background-detail',
  'hallucinated-logo-or-brandmark',
] as const;
export type SlopSignature = (typeof SLOP_SIGNATURES)[number];

/**
 * A device definition. Authored once in the library, referenced by id everywhere else.
 *
 * `observable` is required and has a floor of 12 characters for a reason: it is the
 * field that stops this becoming a mood list. If an author cannot write what an
 * evaluator would SEE, the device does not exist yet.
 */
export const realismDeviceDefinitionSchema = z
  .object({
    id: z.enum(REALISM_DEVICES),
    label: boundedText(1, 80),
    /** What physically happens in the world or the sensor to cause this. */
    cause: boundedText(12, 400),
    /** The prose fragment the compiler emits to induce it. Kept short — it is one clause. */
    promptFragment: boundedText(8, 240),
    /** What an evaluator looks for in the pixels to confirm it landed. */
    observable: boundedText(12, 400),
    /** Below this polish level the device is implied; above it, it fights the brief. */
    maxPolishLevel: z.enum(POLISH_LEVELS),
    suitsFamilies: boundedTextArray(1, 60).max(20),
    ruinsFamilies: boundedTextArray(1, 60).max(20),
  })
  .strict()
  .refine((device) => device.maxPolishLevel === REALISM_DEVICE_PROFILE[device.id].maxPolishLevel, {
    message: "a device definition may not disagree with the profile's polish ceiling",
    path: ['maxPolishLevel'],
  });
export type RealismDeviceDefinition = z.infer<typeof realismDeviceDefinitionSchema>;

export const polishDirectionSchema = z
  .object({
    level: z.enum(POLISH_LEVELS),
    /** Explicit device selection. Empty is legitimate: the level alone still renders. */
    devices: z.array(z.enum(REALISM_DEVICES)).max(8),
    /** Signatures to forbid beyond the always-on baseline. */
    forbidSignatures: z.array(z.enum(SLOP_SIGNATURES)).max(15),
  })
  .strict()
  .superRefine((polish, ctx) => {
    /*
     * A campaign-polished brief asking for a fingerprint is two instructions with no
     * honest render between them. Refusing here is kinder than emitting a prompt that
     * contains both and letting the provider silently pick one.
     */
    if (polish.level === 'campaign-polished' && polish.devices.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'campaign-polished excludes realism devices — lower the level or drop the devices',
        path: ['devices'],
      });
    }

    for (const device of polish.devices) {
      const ceiling = REALISM_DEVICE_PROFILE[device].maxPolishLevel;
      if (comparePolish(ceiling, polish.level) < 0) {
        ctx.addIssue({
          code: 'custom',
          message: `${device} cannot survive ${polish.level}; its ceiling is ${ceiling}`,
          path: ['devices'],
        });
      }
    }
  });
export type PolishDirection = z.infer<typeof polishDirectionSchema>;

/**
 * The floor every generation carries, whatever the direction says.
 *
 * Mirrors how `renderArtDirection` always appends `NO_TEXT_RULE`: some constraints are
 * invariants, not preferences. These four are the slop tells that are never wanted at
 * any polish level, including `campaign-polished` — a glossy advertising photograph
 * still must not have six fingers or a hallucinated logo.
 */
export const ALWAYS_FORBIDDEN_SIGNATURES: readonly SlopSignature[] = Object.freeze([
  'impossible-hands-or-fingers',
  'garbled-text-or-glyphs',
  'duplicated-limbs-or-objects',
  'hallucinated-logo-or-brandmark',
]);

/* -------------------------------------------------------------------------- */
/*  Art and cultural style                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why a style needs a review flag.
 *
 * A visual language can carry a political claim, a religious meaning, a national symbol,
 * or a living community's identity. Soviet constructivist framing is a compositional
 * grammar AND an endorsement device; loteria imagery is a graphic tradition AND someone's
 * culture. The system may offer these — it may not offer them silently. A style whose
 * `sensitivity` is anything other than `none` requires an explicit human acknowledgement
 * before it can reach a provider, and the reason is shown, not hidden behind a flag.
 */
export const STYLE_SENSITIVITIES = [
  'none',
  'political-ideology',
  'national-or-state-symbol',
  'religious-iconography',
  'living-cultural-tradition',
  'living-artist-or-estate',
  'trademark-adjacent',
  /**
   * The style is bound to a regulated category — drug culture, alcohol, tobacco,
   * gambling, firearms, health claims.
   *
   * The risk is placement rather than provenance: nothing about a Fillmore-poster
   * palette infringes anyone, but a brand whose ads must clear a regulated-category
   * review cannot ship its visual argument unexamined. Without this member such a style
   * had to declare `none` while still asking for review, which reads as a contradiction
   * and teaches an author that the sensitivity field can be ignored.
   */
  'regulated-category',
] as const;
export type StyleSensitivity = (typeof STYLE_SENSITIVITIES)[number];

export const styleEraSchema = z
  .object({
    label: boundedText(1, 60),
    /** Nullable because some traditions are continuous rather than bounded. */
    startYear: z.number().int().min(-3000).max(2100).nullable(),
    endYear: z.number().int().min(-3000).max(2100).nullable(),
  })
  .strict();
export type StyleEra = z.infer<typeof styleEraSchema>;

/** The five kinds of decision a style is actually made of. */
export const STYLE_MECHANISM_BUCKETS = [
  'composition',
  'palette',
  'typography',
  'texture',
  'motif',
] as const;
export type StyleMechanismBucket = (typeof STYLE_MECHANISM_BUCKETS)[number];

/**
 * Mechanisms, sorted into the decision they belong to.
 *
 * A flat list of three strings can be satisfied by three colour statements, and a colour
 * statement is a swatch, not a style — a corpus author who has only looked at the palette
 * would sail through. Requiring two DISTINCT buckets forces the author to have looked at
 * how the thing is built as well as what colour it is. Two rather than three because
 * genuine single-medium traditions exist: a screenprint style may have nothing to say
 * about typography, and demanding a fourth bucket would invite invented filler.
 *
 * Every bucket defaults to empty so an author states only what the style actually does.
 */
export const styleMechanismsSchema = z
  .object({
    composition: boundedTextArray(8, 300).max(8).default([]),
    palette: boundedTextArray(8, 300).max(8).default([]),
    typography: boundedTextArray(8, 300).max(8).default([]),
    texture: boundedTextArray(8, 300).max(8).default([]),
    motif: boundedTextArray(8, 300).max(8).default([]),
  })
  .strict()
  .refine(
    (mechanisms) =>
      STYLE_MECHANISM_BUCKETS.filter((bucket) => mechanisms[bucket].length > 0).length >= 2,
    { message: 'a style must state mechanisms in at least two distinct buckets' },
  );
export type StyleMechanisms = z.infer<typeof styleMechanismsSchema>;

/**
 * One art/cultural style, defined by what it DOES rather than what it evokes.
 *
 * `visualMechanisms` carries the same burden `observable` carries for a realism device:
 * every entry is a production decision. "Bold and revolutionary" is not a mechanism.
 * "Composition organised on a steep diagonal axis" is — it is drawable, checkable, and it
 * survives translation into any provider's prose. The buckets are why there is no separate
 * top-level `palette` or `typography` field: those ARE mechanisms, and holding them twice
 * is how a style entry starts contradicting itself.
 *
 * `notThis` exists because styles are most often wrong by being confused with a
 * neighbour: Art Deco rendered as Art Nouveau, constructivism rendered as generic
 * "propaganda poster". Naming the confusion is what lets the compiler emit a targeted
 * exclusion instead of hoping.
 */
export const artStyleDefinitionSchema = z
  .object({
    id: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'style ids are kebab-case'),
    version: z.number().int().min(1),
    label: boundedText(1, 80),
    summary: boundedText(12, 300),
    era: styleEraSchema,
    originRegion: boundedText(1, 120),
    /** Observable production decisions, bucketed. See `styleMechanismsSchema`. */
    visualMechanisms: styleMechanismsSchema,
    /**
     * Where this style sits on the polish axis when nothing else says otherwise.
     *
     * Ties the taxonomy to `POLISH_LEVELS` rather than leaving it floating: a risograph
     * print is not campaign-polished and a Deco commercial illustration is not raw, and
     * a style that cannot say which is not characterised yet.
     */
    defaultPolishLevel: z.enum(POLISH_LEVELS),
    /** What it is routinely confused with and is NOT. Drives the exclusion block. */
    notThis: boundedTextArray(4, 200).min(1).max(6),
    sensitivity: z.enum(STYLE_SENSITIVITIES),
    /** Required and non-empty whenever `sensitivity` is not `none` — see `refine` below. */
    sensitivityNote: boundedText(0, 600).nullable(),
    requiresReview: z.boolean(),
    /** Hard failures specific to this style, e.g. fake Cyrillic in a constructivist poster. */
    hardFailures: boundedTextArray(4, 300).max(8),
    pairsWellWith: boundedTextArray(1, 60).max(20),
    conflictsWith: boundedTextArray(1, 60).max(20),
    /** Where the characterisation came from. Techniques are extracted, never copied. */
    provenance: boundedText(4, 400),
  })
  .strict()
  .refine(
    (style) => style.sensitivity === 'none' || (!!style.sensitivityNote && style.requiresReview),
    {
      message:
        'a style with a declared sensitivity must carry a sensitivityNote and requiresReview',
      path: ['sensitivityNote'],
    },
  );
export type ArtStyleDefinition = z.infer<typeof artStyleDefinitionSchema>;

/** How strongly a chosen style governs the frame. */
export const STYLE_STRENGTHS = ['trace', 'flavour', 'strong', 'pastiche'] as const;
export type StyleStrength = (typeof STYLE_STRENGTHS)[number];

export const styleSelectionSchema = z
  .object({
    styleId: z.string().min(2).max(60),
    styleVersion: z.number().int().min(1),
    strength: z.enum(STYLE_STRENGTHS),
    /** Set once a human has accepted a non-`none` sensitivity. Compilation fails without it. */
    sensitivityAcknowledgedBy: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type StyleSelection = z.infer<typeof styleSelectionSchema>;
