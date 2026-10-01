// The Video Studio motion vocabulary: text animations, clip motion presets, look effects
// and text templates.
//
// Presets are DATA, and the one expansion from a preset to V2 keyframes lives here, so the
// Backend op that writes them, the workspace that previews them and the agent that names
// them all read the same table. The compositor renders the keyframes and effects; it never
// sees a preset id.

import { z } from 'zod';
import type {
  EditorEffectInstance,
  EditorKeyframe,
  EditorKeyframeEasing,
  EditorTransform,
} from './editor-project-v2';

// ── Text animations (a text clip's animationIn / animationOut) ─────────────────────────

/** Hyphenated like the ids projects already store (`scale-in`, `float-in`, `pop`). */
export const TEXT_ANIMATION_IDS = [
  'none',
  'fade',
  'pop',
  'scale-in',
  'float-in',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'typewriter',
  'word-pop',
  'bounce',
  'blur-in',
  'zoom-out',
  'wipe',
] as const;
export const textAnimationIdSchema = z.enum(TEXT_ANIMATION_IDS);
export type TextAnimationId = z.infer<typeof textAnimationIdSchema>;

export const TEXT_ANIMATION_LABELS: Record<TextAnimationId, string> = {
  none: 'None',
  fade: 'Fade',
  pop: 'Pop',
  'scale-in': 'Scale in',
  'float-in': 'Float in',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'slide-left': 'Slide left',
  'slide-right': 'Slide right',
  typewriter: 'Typewriter',
  'word-pop': 'Word by word',
  bounce: 'Bounce',
  'blur-in': 'Blur in',
  'zoom-out': 'Zoom out',
  wipe: 'Wipe',
};

// ── Clip motion presets (keyframes on any visual clip, text included) ──────────────────

export const EASE_OUT: EditorKeyframeEasing = { x1: 0.16, y1: 1, x2: 0.3, y2: 1 };
export const EASE_IN: EditorKeyframeEasing = { x1: 0.7, y1: 0, x2: 0.84, y2: 0 };
export const EASE_IN_OUT: EditorKeyframeEasing = { x1: 0.65, y1: 0, x2: 0.35, y2: 1 };

type MotionProperty =
  | 'transform.position'
  | 'transform.scaleX'
  | 'transform.scaleY'
  | 'transform.rotationDeg'
  | 'transform.opacity';

/**
 * One animated property. `at` runs 0→1 over the preset's duration. Values are relative to
 * the clip's own transform: `offset` adds (position in canvas fractions, degrees), `factor`
 * multiplies (scale, opacity). Position values are `{ x, y }` offsets.
 */
type MotionChannel = {
  property: MotionProperty;
  mode: 'offset' | 'factor';
  stops: { at: number; value: number | { x: number; y: number } }[];
  /** How each stop eases into the next. */
  interpolation: 'linear' | 'bezier' | 'spring';
  easing?: EditorKeyframeEasing;
  bounce?: number;
};

export type ClipMotionPreset = {
  label: string;
  /** in = from the clip's start; out = ending at its end; emphasis = at a chosen moment;
   * whole = across the entire clip (duration ignored). */
  phase: 'in' | 'out' | 'emphasis' | 'whole';
  defaultDurationSec: number;
  channels: MotionChannel[];
};

const fadeFrom = (from: number, to: number, until = 1): MotionChannel => ({
  property: 'transform.opacity',
  mode: 'factor',
  stops: [
    { at: 0, value: from },
    { at: until, value: to },
  ],
  interpolation: 'bezier',
  easing: EASE_OUT,
});
const slide = (x: number, y: number, into: boolean): MotionChannel => ({
  property: 'transform.position',
  mode: 'offset',
  stops: into
    ? [
        { at: 0, value: { x, y } },
        { at: 1, value: { x: 0, y: 0 } },
      ]
    : [
        { at: 0, value: { x: 0, y: 0 } },
        { at: 1, value: { x, y } },
      ],
  interpolation: 'bezier',
  easing: into ? EASE_OUT : EASE_IN,
});
const scale = (
  stops: MotionChannel['stops'],
  interpolation: MotionChannel['interpolation'],
  extra: Partial<MotionChannel> = {},
): MotionChannel[] =>
  (['transform.scaleX', 'transform.scaleY'] as const).map((property) => ({
    property,
    mode: 'factor',
    stops,
    interpolation,
    ...extra,
  }));

export const CLIP_MOTION_PRESETS = {
  fade_in: { label: 'Fade in', phase: 'in', defaultDurationSec: 0.4, channels: [fadeFrom(0, 1)] },
  fade_out: {
    label: 'Fade out',
    phase: 'out',
    defaultDurationSec: 0.4,
    channels: [{ ...fadeFrom(1, 0), easing: EASE_IN }],
  },
  slide_in_left: {
    label: 'Slide in from left',
    phase: 'in',
    defaultDurationSec: 0.5,
    channels: [slide(-0.6, 0, true), fadeFrom(0, 1, 0.4)],
  },
  slide_in_right: {
    label: 'Slide in from right',
    phase: 'in',
    defaultDurationSec: 0.5,
    channels: [slide(0.6, 0, true), fadeFrom(0, 1, 0.4)],
  },
  slide_in_up: {
    label: 'Slide up into place',
    phase: 'in',
    defaultDurationSec: 0.5,
    channels: [slide(0, 0.4, true), fadeFrom(0, 1, 0.4)],
  },
  slide_in_down: {
    label: 'Slide down into place',
    phase: 'in',
    defaultDurationSec: 0.5,
    channels: [slide(0, -0.4, true), fadeFrom(0, 1, 0.4)],
  },
  slide_out_left: {
    label: 'Slide out left',
    phase: 'out',
    defaultDurationSec: 0.5,
    channels: [slide(-0.6, 0, false)],
  },
  slide_out_right: {
    label: 'Slide out right',
    phase: 'out',
    defaultDurationSec: 0.5,
    channels: [slide(0.6, 0, false)],
  },
  pop: {
    label: 'Pop',
    phase: 'in',
    defaultDurationSec: 0.35,
    channels: [
      ...scale(
        [
          { at: 0, value: 0.2 },
          { at: 0.65, value: 1.12 },
          { at: 1, value: 1 },
        ],
        'bezier',
        { easing: EASE_OUT },
      ),
      fadeFrom(0, 1, 0.3),
    ],
  },
  spring_in: {
    label: 'Spring in',
    phase: 'in',
    defaultDurationSec: 0.6,
    channels: [
      ...scale(
        [
          { at: 0, value: 0.6 },
          { at: 1, value: 1 },
        ],
        'spring',
        { bounce: 0.5 },
      ),
      fadeFrom(0, 1, 0.25),
    ],
  },
  zoom_out: {
    label: 'Zoom out into place',
    phase: 'in',
    defaultDurationSec: 0.6,
    channels: scale(
      [
        { at: 0, value: 1.3 },
        { at: 1, value: 1 },
      ],
      'bezier',
      { easing: EASE_OUT },
    ),
  },
  punch_in: {
    label: 'Punch in',
    phase: 'emphasis',
    defaultDurationSec: 0.5,
    channels: scale(
      [
        { at: 0, value: 1 },
        { at: 0.3, value: 1.15 },
        { at: 1, value: 1.15 },
      ],
      'bezier',
      { easing: EASE_OUT },
    ),
  },
  shake: {
    label: 'Shake',
    phase: 'emphasis',
    defaultDurationSec: 0.4,
    channels: [
      {
        property: 'transform.position',
        mode: 'offset',
        stops: [0, 0.02, -0.02, 0.015, -0.01, 0].map((x, index, all) => ({
          at: index / (all.length - 1),
          value: { x, y: 0 },
        })),
        interpolation: 'linear',
      },
    ],
  },
  ken_burns: {
    label: 'Ken Burns',
    phase: 'whole',
    defaultDurationSec: 0,
    channels: [
      ...scale(
        [
          { at: 0, value: 1 },
          { at: 1, value: 1.15 },
        ],
        'linear',
      ),
      {
        property: 'transform.position',
        mode: 'offset',
        stops: [
          { at: 0, value: { x: 0, y: 0 } },
          { at: 1, value: { x: 0.03, y: -0.02 } },
        ],
        interpolation: 'linear',
      },
    ],
  },
} as const satisfies Record<string, ClipMotionPreset>;

export type ClipMotionPresetId = keyof typeof CLIP_MOTION_PRESETS;
export const CLIP_MOTION_PRESET_IDS = Object.keys(CLIP_MOTION_PRESETS) as ClipMotionPresetId[];
export const clipMotionPresetIdSchema = z.enum(
  CLIP_MOTION_PRESET_IDS as [ClipMotionPresetId, ...ClipMotionPresetId[]],
);

/** The clip-local window a preset occupies. */
export function motionPresetWindow(
  presetId: ClipMotionPresetId,
  clipDurationSec: number,
  options: { durationSec?: number; atSec?: number } = {},
): { startSec: number; endSec: number } {
  const preset: ClipMotionPreset = CLIP_MOTION_PRESETS[presetId];
  if (preset.phase === 'whole') return { startSec: 0, endSec: clipDurationSec };
  const length = Math.min(options.durationSec ?? preset.defaultDurationSec, clipDurationSec);
  const startSec =
    preset.phase === 'in'
      ? 0
      : preset.phase === 'out'
        ? clipDurationSec - length
        : Math.min(Math.max(0, options.atSec ?? 0), clipDurationSec - length);
  return { startSec, endSec: startSec + length };
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

const baseValue = (base: EditorTransform, property: MotionProperty) =>
  property === 'transform.position'
    ? base.position
    : property === 'transform.scaleX'
      ? base.scaleX
      : property === 'transform.scaleY'
        ? base.scaleY
        : property === 'transform.rotationDeg'
          ? base.rotationDeg
          : base.opacity;

/**
 * A preset as V2 keyframes on one clip: clip-local times, absolute values computed from the
 * clip's own transform, so the clip rests exactly where it was placed once the motion ends.
 * Callers replace the clip's keyframes of the same properties inside `motionPresetWindow`.
 */
export function motionPresetKeyframes(
  presetId: ClipMotionPresetId,
  input: {
    clipDurationSec: number;
    base: EditorTransform;
    idPrefix: string;
    durationSec?: number;
    atSec?: number;
  },
): EditorKeyframe[] {
  const preset: ClipMotionPreset = CLIP_MOTION_PRESETS[presetId];
  const window = motionPresetWindow(presetId, input.clipDurationSec, input);
  const length = window.endSec - window.startSec;
  return preset.channels.flatMap((channel, channelIndex) =>
    channel.stops.map((stop, stopIndex): EditorKeyframe => {
      const base = baseValue(input.base, channel.property);
      const value =
        typeof base === 'object' && typeof stop.value === 'object'
          ? { x: round6(base.x + stop.value.x), y: round6(base.y + stop.value.y) }
          : typeof base === 'number' && typeof stop.value === 'number'
            ? round6(channel.mode === 'factor' ? base * stop.value : base + stop.value)
            : base;
      return {
        id: `${input.idPrefix}-${channelIndex}-${stopIndex}`,
        property: channel.property,
        timeSec: round6(window.startSec + stop.at * length),
        value: typeof value === 'object' ? { x: value.x, y: value.y } : value,
        interpolation: channel.interpolation,
        ...(channel.interpolation === 'bezier' ? { easing: channel.easing ?? EASE_IN_OUT } : {}),
        ...(channel.interpolation === 'spring'
          ? { spring: { bounce: channel.bounce ?? 0.4 } }
          : {}),
      };
    }),
  );
}

// ── Look effects (what the compositor renders from a clip's effect instances) ──────────

export const LOOK_EFFECTS = {
  bw: { label: 'Black & white', effectType: 'video_filter', parameter: null },
  vintage: { label: 'Vintage', effectType: 'video_filter', parameter: null },
  vivid: { label: 'Vivid', effectType: 'video_filter', parameter: null },
  cool: { label: 'Cool', effectType: 'video_filter', parameter: null },
  warm: { label: 'Warm', effectType: 'video_filter', parameter: null },
  noir: { label: 'Noir', effectType: 'video_filter', parameter: null },
  dream: { label: 'Dream', effectType: 'video_filter', parameter: null },
  blur: { label: 'Blur', effectType: 'blur', parameter: 'blur' },
  tint: { label: 'Tint', effectType: 'video_filter', parameter: 'amount' },
  vignette: { label: 'Vignette', effectType: 'video_filter', parameter: 'amount' },
  film_grain: { label: 'Film grain', effectType: 'video_filter', parameter: 'amount' },
  chromatic_aberration: {
    label: 'Chromatic aberration',
    effectType: 'video_filter',
    parameter: 'amount',
  },
  vhs: { label: 'VHS', effectType: 'video_filter', parameter: 'amount' },
  pixelate: { label: 'Pixelate', effectType: 'video_filter', parameter: 'blockPx' },
  corner_radius: { label: 'Rounded corners', effectType: 'video_filter', parameter: 'radiusFrac' },
  chroma_key: { label: 'Green screen key', effectType: 'chroma_key', parameter: 'tolerance' },
} as const satisfies Record<
  string,
  {
    label: string;
    effectType: EditorEffectInstance['effectType'];
    parameter: string | null;
  }
>;
export type LookEffectId = keyof typeof LOOK_EFFECTS;
export const LOOK_EFFECT_IDS = Object.keys(LOOK_EFFECTS) as LookEffectId[];
export const lookEffectIdSchema = z.enum(LOOK_EFFECT_IDS as [LookEffectId, ...LookEffectId[]]);

/** `strength` 0..1 → the parameter the compositor reads, on its own scale. */
const PARAMETER_AT_FULL: Record<string, number> = {
  blur: 12,
  amount: 1,
  blockPx: 48,
  radiusFrac: 0.12,
  tolerance: 0.6,
};

/** One look as the effect instance the compositor reads. */
export function lookEffectInstance(
  effectId: LookEffectId,
  options: { id: string; strength?: number; color?: string },
): EditorEffectInstance {
  const look = LOOK_EFFECTS[effectId];
  const strength = Math.min(1, Math.max(0, options.strength ?? 0.6));
  const parameters: EditorEffectInstance['parameters'] = {};
  if (look.parameter === 'blockPx') parameters.blockPx = Math.max(2, Math.round(48 * strength));
  else if (look.parameter)
    parameters[look.parameter] = round6((PARAMETER_AT_FULL[look.parameter] ?? 1) * strength);
  if (effectId === 'tint' || effectId === 'chroma_key')
    parameters.color = options.color ?? (effectId === 'tint' ? '#ff7a00' : '#00ff00');
  return {
    id: options.id,
    effectType: look.effectType,
    effectId,
    enabled: true,
    mix: look.parameter ? 1 : strength,
    parameters,
  };
}

// ── Text templates (one or two text layers with a look and motion) ─────────────────────

export type TextTemplateLayer = {
  /** `primary` takes the op's `text`; `secondary` takes `secondaryText`. */
  role: 'primary' | 'secondary';
  /** Canvas fractions: the layer's centre. */
  x: number;
  y: number;
  /** Font size as a fraction of canvas height. */
  sizeFrac: number;
  fontWeight: number;
  uppercase?: boolean;
  color: string;
  backgroundColor?: string;
  outline: boolean;
  animationIn: TextAnimationId;
  animationOut: TextAnimationId;
  /** Seconds after the template's start that this layer appears. */
  delaySec: number;
};

export type TextTemplate = {
  label: string;
  description: string;
  defaultDurationSec: number;
  layers: TextTemplateLayer[];
};

const layer = (
  role: TextTemplateLayer['role'],
  look: Omit<TextTemplateLayer, 'role' | 'x' | 'outline' | 'animationOut' | 'delaySec'> &
    Partial<Pick<TextTemplateLayer, 'x' | 'outline' | 'animationOut' | 'delaySec'>>,
): TextTemplateLayer => ({
  role,
  x: 0.5,
  outline: true,
  animationOut: 'fade',
  delaySec: 0,
  ...look,
});

export const TEXT_TEMPLATES = {
  hook_title: {
    label: 'Hook title',
    description: 'A big opening line in the top third that pops in over the first seconds.',
    defaultDurationSec: 2.5,
    layers: [
      layer('primary', {
        y: 0.3,
        sizeFrac: 0.07,
        fontWeight: 900,
        uppercase: true,
        color: '#ffffff',
        animationIn: 'pop',
      }),
    ],
  },
  lower_third: {
    label: 'Lower third',
    description: 'A name on a bar with a role beneath it, sliding in from the left.',
    defaultDurationSec: 4,
    layers: [
      layer('primary', {
        x: 0.35,
        y: 0.78,
        sizeFrac: 0.038,
        fontWeight: 800,
        color: '#ffffff',
        backgroundColor: '#111111',
        outline: false,
        animationIn: 'slide-right',
      }),
      layer('secondary', {
        x: 0.35,
        y: 0.83,
        sizeFrac: 0.026,
        fontWeight: 500,
        color: '#ffffff',
        animationIn: 'fade',
        delaySec: 0.2,
      }),
    ],
  },
  kinetic_words: {
    label: 'Kinetic words',
    description: 'A centred line that builds word by word.',
    defaultDurationSec: 3,
    layers: [
      layer('primary', {
        y: 0.5,
        sizeFrac: 0.075,
        fontWeight: 900,
        color: '#ffffff',
        animationIn: 'word-pop',
      }),
    ],
  },
  cta_end_card: {
    label: 'CTA end card',
    description: 'The call to action on a solid box near the bottom, with a line above it.',
    defaultDurationSec: 3,
    layers: [
      layer('secondary', {
        y: 0.74,
        sizeFrac: 0.03,
        fontWeight: 600,
        color: '#ffffff',
        animationIn: 'fade',
      }),
      layer('primary', {
        y: 0.82,
        sizeFrac: 0.048,
        fontWeight: 800,
        color: '#ffffff',
        backgroundColor: '#000000',
        outline: false,
        animationIn: 'bounce',
        delaySec: 0.15,
      }),
    ],
  },
  listicle_number: {
    label: 'List number',
    description: 'A large number with the point it introduces beneath.',
    defaultDurationSec: 2.5,
    layers: [
      layer('primary', {
        y: 0.26,
        sizeFrac: 0.14,
        fontWeight: 900,
        color: '#ffd400',
        animationIn: 'zoom-out',
      }),
      layer('secondary', {
        y: 0.36,
        sizeFrac: 0.04,
        fontWeight: 700,
        color: '#ffffff',
        animationIn: 'slide-up',
        delaySec: 0.2,
      }),
    ],
  },
  quote: {
    label: 'Quote',
    description: 'A quoted line typed on, with who said it beneath.',
    defaultDurationSec: 4,
    layers: [
      layer('primary', {
        y: 0.45,
        sizeFrac: 0.045,
        fontWeight: 600,
        color: '#ffffff',
        animationIn: 'typewriter',
      }),
      layer('secondary', {
        y: 0.56,
        sizeFrac: 0.028,
        fontWeight: 500,
        color: '#dddddd',
        animationIn: 'fade',
        delaySec: 0.6,
      }),
    ],
  },
  stat_callout: {
    label: 'Stat callout',
    description: 'A figure that scales in, with its label beside it.',
    defaultDurationSec: 3,
    layers: [
      layer('primary', {
        y: 0.4,
        sizeFrac: 0.11,
        fontWeight: 900,
        color: '#ffffff',
        animationIn: 'scale-in',
      }),
      layer('secondary', {
        y: 0.49,
        sizeFrac: 0.032,
        fontWeight: 600,
        uppercase: true,
        color: '#ffffff',
        animationIn: 'blur-in',
        delaySec: 0.2,
      }),
    ],
  },
  subtitle_bar: {
    label: 'Subtitle bar',
    description: 'One line on a dark bar across the lower third, wiped on.',
    defaultDurationSec: 3,
    layers: [
      layer('primary', {
        y: 0.7,
        sizeFrac: 0.034,
        fontWeight: 700,
        color: '#ffffff',
        backgroundColor: '#000000',
        outline: false,
        animationIn: 'wipe',
      }),
    ],
  },
} as const satisfies Record<string, TextTemplate>;

export type TextTemplateId = keyof typeof TEXT_TEMPLATES;
export const TEXT_TEMPLATE_IDS = Object.keys(TEXT_TEMPLATES) as TextTemplateId[];
export const textTemplateIdSchema = z.enum(
  TEXT_TEMPLATE_IDS as [TextTemplateId, ...TextTemplateId[]],
);
