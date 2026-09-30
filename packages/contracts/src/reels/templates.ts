import { z } from 'zod';
import {
  type ReelPresentation,
  type ReelPresentationCaptionStyle,
  type ReelTransitionKind,
  reelPresentationSchema,
} from './presentation';

/**
 * One-pick reel looks. Templates expand here, on the caller's side, because Continuum
 * Render deliberately has no contracts dependency: it only ever receives the resolved plan.
 */
export const reelTemplateIdSchema = z.enum([
  'ugc-native',
  'bold-punch',
  'karaoke-clean',
  'product-proof',
  'editorial',
  'cinematic-occlusion',
]);
export type ReelTemplateId = z.infer<typeof reelTemplateIdSchema>;
/** The storyboard beat vocabulary the director writes; overhead and pov are insert/b-roll setups. */
export const reelShotRoleSchema = z.enum(['hook', 'detail', 'proof', 'cta', 'overhead', 'pov']);
export type ReelShotRole = z.infer<typeof reelShotRoleSchema>;

export type ReelTemplateShot = {
  /** The scene id the caller renders this shot under. */
  id: string;
  role: ReelShotRole;
  durationSec: number;
  /** Scene-local end of the last transcribed word; null when the shot has no speech. */
  lastWordEndSec: number | null;
  /** Where it was shot ('gym'); shots sharing one share one room-tone bed. Null = its own. */
  location: string | null;
  /** The beat's one giant display word, a word of its own line; absent or null = none. */
  displayWord?: string | null;
};

export type ReelTemplateInput<Asset extends { assetId: string }> = {
  shots: ReelTemplateShot[];
  insetAsset: Asset | null;
  headline: string | null;
  cta: string | null;
  accentHex: string | null;
  emphasisPhrases: string[];
  /** Where the product sits in the proof shot (0–1 of width/height); null zooms to centre. */
  productFocus: { x: number; y: number } | null;
  /**
   * The product's moment. On a concept, a full-screen cutaway over the first durationSec of that
   * shot's picture (its voice runs on): the packshot on an accent gradient. On a single it never
   * covers her: a picture-in-picture packshot under her captions from atSec into her line, the
   * word landing with it. Absent = none.
   */
  productHero?: {
    shotId: string;
    durationSec: number;
    displayWord: string | null;
    atSec?: number;
  } | null;
  /** A dark-grain full-screen card over the first durationSec of that shot's picture. Absent = none. */
  typeCard?: { shotId: string; durationSec: number; title: string; lines: string[] } | null;
};

type Face = ReelPresentationCaptionStyle['fontFamily'];
type Look = {
  captionPreset: ReelPresentation['captionPreset'];
  treatment: ReelPresentation['treatment'];
  /** The caption face and size; with a display track the caption is the small sentence under it. */
  style: Omit<ReelPresentationCaptionStyle, 'accentHex'>;
  /** The type system's display face, or null for a template with no display track. */
  display: Face | null;
  accentHex: string;
  join: { kind: ReelTransitionKind; durationSec: number };
  /** The template's motion signature: what the footage does, not just the type. */
  motion: {
    punchIn: 'none' | 'emphasis' | 'display';
    shake: 'none' | 'accents';
    pushIn: boolean;
    snapZoom: boolean;
    drift: boolean;
  };
  ctaEntrance: ReelPresentation['ctaEntrance'];
  ctaStyle: ReelPresentation['ctaStyle'];
};

// Each look is a type system — display face, caption face, one accent — measured against the
// owner's 8/10 references: giant display words behind the subject over a small sentence caption.
const LOOKS: Record<ReelTemplateId, Look> = {
  // The testimonial: restraint, no display track, thin sentence captions with the words ahead dimmed.
  'ugc-native': {
    captionPreset: 'dim-ahead@1',
    treatment: 'none',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 4,
      positionY: 0.72,
      sizeScale: 0.7,
      fontFamily: 'Inter',
    },
    display: null,
    accentHex: '#FFD100',
    join: { kind: 'j-cut', durationSec: 0.3 },
    motion: { punchIn: 'none', shake: 'none', pushIn: true, snapZoom: false, drift: true },
    ctaEntrance: 'rise',
    ctaStyle: 'plate',
  },
  // Condensed display + handwritten sentence (the explainer reference), punch-ins and whips.
  'bold-punch': {
    captionPreset: 'pop-word@1',
    treatment: 'none',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 3,
      positionY: 0.66,
      sizeScale: 0.85,
      fontFamily: 'Caveat',
    },
    display: 'Anton',
    accentHex: '#FFD100',
    join: { kind: 'whip', durationSec: 0.2 },
    motion: { punchIn: 'display', shake: 'accents', pushIn: true, snapZoom: false, drift: false },
    ctaEntrance: 'punch',
    ctaStyle: 'card',
  },
  'karaoke-clean': {
    captionPreset: 'karaoke-fill@1',
    treatment: 'none',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 4,
      positionY: 0.7,
      sizeScale: 0.65,
      fontFamily: 'Montserrat',
    },
    display: 'Montserrat',
    accentHex: '#34D399',
    join: { kind: 'crossfade', durationSec: 0.2 },
    motion: { punchIn: 'display', shake: 'none', pushIn: true, snapZoom: false, drift: true },
    ctaEntrance: 'rise',
    ctaStyle: 'plate',
  },
  'product-proof': {
    captionPreset: 'highlight-box@1',
    treatment: 'none',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 3,
      positionY: 0.56,
      sizeScale: 0.75,
      fontFamily: 'Montserrat',
    },
    display: 'Anton',
    accentHex: '#FFD100',
    join: { kind: 'cut', durationSec: 0 },
    motion: { punchIn: 'display', shake: 'none', pushIn: true, snapZoom: true, drift: true },
    ctaEntrance: 'slide',
    ctaStyle: 'plate',
  },
  // Serif display + serif sentence in one warm accent (the thought-leadership reference).
  editorial: {
    captionPreset: 'active-word@1',
    treatment: 'none',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 3,
      positionY: 0.7,
      sizeScale: 0.6,
      fontFamily: 'Cormorant Garamond',
    },
    display: 'Cormorant Garamond',
    accentHex: '#E8412C',
    join: { kind: 'crossfade', durationSec: 0.2 },
    motion: { punchIn: 'display', shake: 'none', pushIn: true, snapZoom: false, drift: true },
    ctaEntrance: 'fade',
    ctaStyle: 'plate',
  },
  'cinematic-occlusion': {
    captionPreset: 'active-word@1',
    treatment: 'subject-occlusion@1',
    style: {
      case: 'as-spoken',
      wordsPerGroup: 2,
      positionY: 0.8,
      sizeScale: 0.6,
      fontFamily: 'Inter',
    },
    display: 'Anton',
    accentHex: '#FFFFFF',
    join: { kind: 'dip-black', durationSec: 0.3 },
    motion: { punchIn: 'display', shake: 'none', pushIn: true, snapZoom: false, drift: true },
    ctaEntrance: 'fade',
    ctaStyle: 'card',
  },
};

// Render clamps an overlap to the room after the outgoing shot's last word and refuses one
// with no room at all; the template picks only joins the footage can take, with margin for
// the caller's duration differing from Render's probe by a few milliseconds.
const MIN_OVERLAP_SEC = 0.1;
const LAST_WORD_TAIL_SEC = 0.1;
function fitJoin(shot: ReelTemplateShot, join: Look['join']): Look['join'] {
  if (join.kind === 'cut') return join;
  const room = shot.durationSec - (shot.lastWordEndSec ?? 0) - LAST_WORD_TAIL_SEC;
  if (room < MIN_OVERLAP_SEC) return { kind: 'cut', durationSec: 0 };
  return { kind: join.kind, durationSec: Math.min(join.durationSec, Math.floor(room * 100) / 100) };
}

/**
 * The closing shot carries one cutaway. A concept's hero there holds at most this long, and the CTA
 * is then a plate over her rather than a full-screen card: round 2's 6 s singles ran a 2.2 s hero
 * and a 1.2 s CTA card and kept her on camera 43–64 %.
 */
export const SINGLE_HERO_MAX_SEC = 1.2;
/**
 * A single's picture-in-picture packshot holds at most this long. She stays on screen under it, so
 * it outlasts the full-screen hero it replaced (the owner: "we don't need the product interrupting
 * as much on the whole screen").
 */
export const SINGLE_INSET_MAX_SEC = 2;

/** A display word's identity: "Mid-workout", "mid workout" and "MIDWORKOUT" are one word. */
const wordKey = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Every template levels each beat's speech to one loudness, measured over its own words. */
export const SPEECH_LOUDNESS_LUFS = -16;
/** A quiet, continuous bed per location, so a gated gap is room air, never digital silence. */
export const ROOM_TONE_DB = -52;

function roomToneGroups(shots: ReelTemplateShot[]): ReelPresentation['roomTone'] {
  const groups = new Map<string, string[]>();
  for (const shot of shots)
    groups.set(shot.location ?? `scene:${shot.id}`, [
      ...(groups.get(shot.location ?? `scene:${shot.id}`) ?? []),
      shot.id,
    ]);
  return [...groups.values()].map((sceneIds) => ({ sceneIds, levelDb: ROOM_TONE_DB }));
}

/**
 * The CTA a template ends a reel on: its look's, except a plate when the reel is one take (a
 * full-screen end card cut a 6 s take into 4.8 + 1.2 s) or the product hero closes it.
 */
function templateCtaStyle(
  id: ReelTemplateId,
  reel: { shotCount: number; heroShotId: string | null; lastShotId: string },
): ReelPresentation['ctaStyle'] {
  const look = LOOKS[id];
  return (reel.shotCount === 1 || reel.heroShotId === reel.lastShotId) && look.ctaStyle === 'card'
    ? 'plate'
    : look.ctaStyle;
}

export function presentationFromTemplate<Asset extends { assetId: string }>(
  id: ReelTemplateId,
  input: ReelTemplateInput<Asset>,
): { presentation: ReelPresentation; insetAsset: Asset | null } {
  const look = LOOKS[id];
  const [hook] = input.shots;
  if (!hook) throw new Error('template_needs_shots');
  const events: ReelPresentation['events'] = [];
  let insetAsset: Asset | null = null;
  const shotStart = (shotId: string) => ({
    kind: 'shot' as const,
    shotId,
    edge: 'start' as const,
    offsetSec: 0,
  });
  // A single is her one take: its product moment is an inset over her, never a cut away from her.
  const inset = input.shots.length === 1 ? (input.productHero ?? null) : null;
  const hero = inset ? null : (input.productHero ?? null);
  const heroCloses = hero?.shotId === input.shots.at(-1)!.id;
  // The display track replaces a headline: the hook's own word is the headline. A word shows once
  // a reel (round 2's lipstick put LIPSTICK on its hero and again on the beat): the hero's title
  // claims its word, and no beat repeats one already up. A single's inset word is its only one,
  // landing with the packshot.
  const shown = new Set(hero?.displayWord ? [wordKey(hero.displayWord)] : []);
  const insetWord = look.display && inset?.displayWord ? inset.displayWord : null;
  const displayWords = insetWord
    ? [
        {
          anchor: { ...shotStart(inset!.shotId), offsetSec: inset!.atSec ?? 0 },
          durationSec: inset!.durationSec,
          text: insetWord,
        },
      ]
    : look.display
      ? input.shots.flatMap((shot, index) => {
          if (!shot.displayWord || shown.has(wordKey(shot.displayWord))) return [];
          shown.add(wordKey(shot.displayWord));
          // Over its OWN picture: a shot starts where its incoming join does, and a J-cut, whip
          // or fade still shows the previous speaker then (TRANQUILA over the interviewer, formats
          // run 08-30-55-933Z). The word waits for the join to end.
          const previous = input.shots[index - 1];
          const join = previous ? fitJoin(previous, look.join) : null;
          const lead = join && join.kind !== 'cut' ? join.durationSec : 0;
          return [
            {
              anchor: { ...shotStart(shot.id), offsetSec: lead },
              durationSec: shot.durationSec - lead,
              text: shot.displayWord,
            },
          ];
        })
      : [];
  const hookHasWord = displayWords.some(
    (word) => word.anchor.shotId === hook.id && word.anchor.offsetSec === 0,
  );
  // A headline gives way to the inset's word when it lands.
  const headlineSec = (seconds: number) =>
    Math.min(seconds, hook.durationSec, inset?.atSec ?? seconds);
  if (id === 'bold-punch' && input.headline && !hookHasWord)
    events.push({
      kind: 'headline',
      anchor: { kind: 'time', atSec: 0 },
      durationSec: headlineSec(2.2),
      text: input.headline,
    });
  if (id === 'cinematic-occlusion' && !hookHasWord) {
    if (!input.headline) throw new Error('template_needs_headline');
    // Legible from the first frame: it is set above the head, and only the crown may cross it.
    events.push({
      kind: 'headline',
      anchor: { kind: 'shot', shotId: hook.id, edge: 'start', offsetSec: 0 },
      durationSec: Math.max(0.5, headlineSec(2.6)),
      text: input.headline,
    });
  }
  const proof =
    input.shots.find((shot) => shot.role === 'proof') ??
    input.shots.find((shot) => shot.role === 'detail') ??
    input.shots.at(-1)!;
  const cards: ReelPresentation['cards'] = [];
  if (hero) {
    if (!input.insetAsset) throw new Error('template_needs_inset');
    cards.push({
      kind: 'product-hero',
      anchor: shotStart(hero.shotId),
      durationSec: heroCloses ? Math.min(hero.durationSec, SINGLE_HERO_MAX_SEC) : hero.durationSec,
      title: hero.displayWord,
      lines: [],
    });
    insetAsset = input.insetAsset;
  }
  if (inset) {
    if (!input.insetAsset) throw new Error('template_needs_inset');
    events.push({
      kind: 'inset',
      anchor: { ...shotStart(inset.shotId), offsetSec: inset.atSec ?? 0 },
      durationSec: inset.durationSec,
    });
    insetAsset = input.insetAsset;
  }
  if (input.typeCard)
    cards.push({
      kind: 'type-card',
      anchor: shotStart(input.typeCard.shotId),
      durationSec: input.typeCard.durationSec,
      title: input.typeCard.title,
      lines: input.typeCard.lines,
    });
  if (id === 'product-proof' && !input.productHero) {
    if (!input.insetAsset) throw new Error('template_needs_inset');
    // Render draws only the first inset event, so the packshot goes on the one proof beat.
    events.push({
      kind: 'inset',
      anchor: { kind: 'shot', shotId: proof.id, edge: 'start', offsetSec: 0.3 },
      durationSec: Math.max(1, Math.min(3.5, proof.durationSec - 0.4)),
    });
    insetAsset = input.insetAsset;
  }
  const presentation = reelPresentationSchema.parse({
    version: 1,
    captionPreset: look.captionPreset,
    treatment: id === 'cinematic-occlusion' && hookHasWord ? 'none' : look.treatment,
    cta: input.cta ? { mode: 'text', text: input.cta } : { mode: 'none' },
    emphasisPhrases: input.emphasisPhrases,
    events,
    insetAssetId: insetAsset?.assetId ?? null,
    soundAccents: id === 'bold-punch' ? 'subtle' : 'none',
    captionStyle: { ...look.style, accentHex: input.accentHex ?? look.accentHex },
    transitions: input.shots.slice(0, -1).map((shot) => ({
      afterSceneId: shot.id,
      ...fitJoin(shot, look.join),
    })),
    speechGate: 'line@1',
    // Motion that reads: a slow push across every talking beat, punches on the display words and
    // emphasis, the proof beat's snap, and a handheld drift so no take sits dead still.
    motion: {
      punchIn: look.motion.punchIn,
      shake: look.motion.shake,
      drift: look.motion.drift ? 'handheld' : 'none',
      moves: [
        ...(look.motion.pushIn
          ? input.shots
              .filter((shot) => shot.lastWordEndSec !== null)
              .map((shot) => ({
                kind: 'push-in' as const,
                anchor: {
                  kind: 'shot' as const,
                  shotId: shot.id,
                  edge: 'start' as const,
                  offsetSec: 0,
                },
                durationSec: shot.durationSec,
                focusX: 0.5,
                focusY: 0.4,
              }))
          : []),
        ...(look.motion.snapZoom
          ? [
              {
                kind: 'snap-zoom' as const,
                anchor: {
                  kind: 'shot' as const,
                  shotId: proof.id,
                  edge: 'start' as const,
                  offsetSec: 0.15,
                },
                durationSec: Math.max(0.6, proof.durationSec - 0.4),
                focusX: input.productFocus?.x ?? 0.5,
                focusY: input.productFocus?.y ?? 0.55,
              },
            ]
          : []),
      ],
    },
    loudnessTargetLufs: SPEECH_LOUDNESS_LUFS,
    roomTone: roomToneGroups(input.shots),
    ctaEntrance: look.ctaEntrance,
    ctaStyle: templateCtaStyle(id, {
      shotCount: input.shots.length,
      heroShotId: hero?.shotId ?? null,
      lastShotId: input.shots.at(-1)!.id,
    }),
    displayStyle: { fontFamily: look.display ?? look.style.fontFamily, behindSubject: true },
    displayWords,
    cards,
  });
  return { presentation, insetAsset };
}
