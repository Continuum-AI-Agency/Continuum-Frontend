import {
  type EditorProjectV2,
  HEADLESS_CONCEPTS,
  type HeadlessConcept,
  type HeadlessGrammar,
  type PlatformExportPresetId,
  type VideoEditorOpInput,
  type VideoEditorOpParsedInput,
  type VideoEditorPoolAsset,
  type VideoEditorQuickStart,
} from '@continuum/contracts';
import type { VideoStudioSelection } from '../types';

type GenerateInput = Omit<VideoEditorOpInput<'generate'>, 'projectId'>;
export type SlotRole = VideoEditorOpParsedInput<'generate'>['refs'][number]['role'];

export type QuickStartSlot = { role: SlotRole; label: string; required: boolean };

export type QuickStartCard = {
  id: VideoEditorQuickStart;
  label: string;
  description: string;
  output: 'image' | 'video' | 'audio';
  slots: QuickStartSlot[];
  promptRequired: boolean;
  promptPlaceholder: string;
  /** What the prompt box is called on this card; "Prompt" when absent. */
  promptLabel?: string;
  /** Said when a required prompt is empty. */
  promptMissing?: string;
  /** A bed runs from the top of the edit; everything else lands at the playhead. */
  placeFrom: 'playhead' | 'start';
};

/** The StyleFrame cards, each backed by a generator the canvas already runs. */
export const QUICK_START_CARDS: readonly QuickStartCard[] = [
  {
    id: 'create_image',
    label: 'Create Image',
    description: 'A new still from a prompt, your @subject, @environment and a style.',
    output: 'image',
    slots: [
      { role: 'subject', label: '@subject', required: false },
      { role: 'environment', label: '@environment', required: false },
      { role: 'style', label: 'Style', required: false },
    ],
    promptRequired: false,
    promptPlaceholder: 'The subject on a clean studio sweep, soft key light',
    placeFrom: 'playhead',
  },
  {
    id: 'restyle_image',
    label: 'Restyle Image',
    description: 'Give an image the look of a style reference.',
    output: 'image',
    slots: [
      { role: 'source', label: 'Image', required: true },
      { role: 'style', label: 'Style', required: true },
    ],
    promptRequired: false,
    promptPlaceholder: 'Optional: what to keep or push',
    placeFrom: 'playhead',
  },
  {
    id: 'edit_image',
    label: 'Edit Image',
    description: 'Change one thing in an image and keep the rest.',
    output: 'image',
    slots: [{ role: 'source', label: 'Image', required: true }],
    promptRequired: true,
    promptMissing: 'Say what to change.',
    promptPlaceholder: 'Swap the background for a sunlit gym',
    placeFrom: 'playhead',
  },
  {
    id: 'storyboard_to_video',
    label: 'Storyboard to Video',
    description: 'Animate an opening frame, with one optional reference.',
    output: 'video',
    slots: [
      { role: 'first_frame', label: 'Opening frame', required: true },
      { role: 'subject', label: 'Reference', required: false },
    ],
    promptRequired: false,
    promptPlaceholder: 'She turns to camera and smiles',
    placeFrom: 'playhead',
  },
  {
    id: 'keyframes_to_video',
    label: 'Keyframes to Video',
    description: 'One shot that travels from a first frame to a last frame.',
    output: 'video',
    slots: [
      { role: 'first_frame', label: 'First frame', required: true },
      { role: 'last_frame', label: 'Last frame', required: true },
    ],
    promptRequired: false,
    promptPlaceholder: 'A slow push-in as the lights come up',
    placeFrom: 'playhead',
  },
  {
    id: 'rotate_360',
    label: '360 Rotation',
    description: 'Orbit the camera once around a product.',
    output: 'video',
    slots: [{ role: 'source', label: 'Product image', required: true }],
    promptRequired: false,
    promptPlaceholder: 'Optional: surface, lighting, background',
    placeFrom: 'playhead',
  },
  {
    id: 'music_bed',
    label: 'Music Bed',
    description: 'An instrumental bed as long as the edit, dipped under speech.',
    output: 'audio',
    slots: [],
    promptRequired: true,
    promptLabel: 'Mood',
    promptMissing: 'Pick a mood or describe one.',
    promptPlaceholder: 'Warm acoustic guitar, light percussion, hopeful, 95 bpm',
    placeFrom: 'start',
  },
  {
    id: 'voiceover',
    label: 'Voiceover',
    description: 'Your script read aloud, placed at the playhead.',
    output: 'audio',
    slots: [],
    promptRequired: true,
    promptLabel: 'Script',
    promptMissing: 'Write the script.',
    promptPlaceholder: 'Your first class is on us. Book it tonight.',
    placeFrom: 'playhead',
  },
  {
    id: 'headless_concept',
    label: 'Concept Reel',
    description: 'A finished reel with your approved cast, from a proven concept.',
    output: 'video',
    slots: [],
    promptRequired: false,
    promptLabel: 'Angle',
    promptPlaceholder: 'Optional: the offer or pain to lead with',
    placeFrom: 'playhead',
  },
];

/** Mood chips for the music bed: each fills the prompt with instruments, texture and tempo
 *  (described, not named after a genre's famous tracks, which Lyria's recitation check blocks). */
export const MUSIC_MOODS = [
  {
    id: 'lofi',
    label: 'Calm lo-fi',
    prompt:
      'Calm instrumental with mellow electric piano chords, soft vinyl texture and gentle brushed drums, 80 bpm',
  },
  {
    id: 'pop',
    label: 'Upbeat pop',
    prompt:
      'Upbeat bright instrumental with plucky synths, handclaps and a bouncy bass line, 118 bpm',
  },
  {
    id: 'cinematic',
    label: 'Cinematic build',
    prompt:
      'Cinematic instrumental build: low strings swell over a pulsing synth bass, rising to a final hit',
  },
  {
    id: 'workout',
    label: 'Workout energy',
    prompt:
      'Driving electronic instrumental for a workout: punchy four-on-the-floor kick, bright synth stabs, 128 bpm',
  },
  {
    id: 'acoustic',
    label: 'Warm acoustic',
    prompt: 'Warm acoustic guitar instrumental with light percussion, hopeful and gentle, 95 bpm',
  },
  {
    id: 'tech',
    label: 'Minimal tech',
    prompt: 'Minimal electronic instrumental: clean synth plucks over a steady groove, 110 bpm',
  },
] as const;

/** Delivery presets for the voiceover; the field stays free text. */
export const VOICE_PRESETS = [
  'Warm, confident',
  'Energetic, upbeat',
  'Calm narrator',
  'Warm, confident, Mexican Spanish',
] as const;

/**
 * What one generated shot of a concept reel may cost at most, in USD. Display only: the
 * Backend's own bound is `clipPriceUpperBoundUsd` in headless-content/routes.ts.
 */
const CONCEPT_SHOT_UPPER_USD = 2;

/** A concept reel's worst case: one generated shot per beat. */
export const conceptUpperUsd = (concept: HeadlessConcept): number =>
  concept.beats.length * CONCEPT_SHOT_UPPER_USD;

export const conceptById = (id: HeadlessGrammar | undefined): HeadlessConcept | undefined =>
  HEADLESS_CONCEPTS.find((concept) => concept.id === id);

export type QuickStartForm = {
  refs: Partial<Record<SlotRole, string>>;
  prompt: string;
  preset?: PlatformExportPresetId;
  /** Null leaves the result in the pool without touching the timeline. */
  placeAtSec: number | null;
  /** voiceover: how it is spoken. */
  voice?: string;
  /** music_bed: seconds; absent follows the timeline. */
  durationSec?: number;
  /** music_bed: dip under speech. */
  duck?: boolean;
  /** headless_concept: which concept makes the reel. */
  concept?: HeadlessGrammar;
};

export function generateRequest(
  card: QuickStartCard,
  form: QuickStartForm,
): { ok: true; input: GenerateInput } | { ok: false; reason: string } {
  const missing = card.slots.find((slot) => slot.required && !form.refs[slot.role]);
  if (missing) return { ok: false, reason: `Pick the ${missing.label}.` };
  const prompt = form.prompt.trim();
  if (card.promptRequired && !prompt) {
    return { ok: false, reason: card.promptMissing ?? 'Write a prompt.' };
  }
  if (card.id === 'headless_concept' && !form.concept) {
    return { ok: false, reason: 'Pick a concept.' };
  }
  if (
    card.id === 'music_bed' &&
    form.durationSec !== undefined &&
    !(form.durationSec >= 1 && form.durationSec <= 600)
  ) {
    return { ok: false, reason: 'Length is 1 s to 10 min.' };
  }
  const refs = card.slots.flatMap((slot) => {
    const assetId = form.refs[slot.role];
    return assetId ? [{ assetId, role: slot.role }] : [];
  });
  if (card.id === 'create_image' && !prompt && refs.length === 0) {
    return { ok: false, reason: 'Describe the image or pick a reference.' };
  }
  return {
    ok: true,
    input: {
      quickStart: card.id,
      prompt,
      refs,
      ...(form.preset && card.output !== 'audio' ? { preset: form.preset } : {}),
      ...(form.placeAtSec === null ? {} : { place: { atSec: Math.max(0, form.placeAtSec) } }),
      ...(card.id === 'music_bed'
        ? {
            duck: form.duck ?? true,
            ...(form.durationSec === undefined ? {} : { durationSec: form.durationSec }),
          }
        : {}),
      ...(card.id === 'voiceover' && form.voice?.trim() ? { voice: form.voice.trim() } : {}),
      ...(card.id === 'headless_concept' && form.concept ? { concept: form.concept } : {}),
    },
  };
}

/** Still images a card can take: the pool's images. */
export const referenceImages = (pool: readonly VideoEditorPoolAsset[]) =>
  pool.filter((asset) => asset.kind === 'image');

/**
 * The card's slots prefilled from the timeline selection: each selected clip that plays a
 * pool still fills the next empty slot, required slots first.
 */
export function refsFromSelection(
  card: QuickStartCard,
  project: EditorProjectV2,
  selection: VideoStudioSelection,
  pool: readonly VideoEditorPoolAsset[],
): QuickStartForm['refs'] {
  const stills = new Set(referenceImages(pool).map((asset) => asset.assetId));
  const selected = project.tracks.flatMap((track) =>
    track.clips.flatMap((clip) =>
      selection.clipIds.includes(clip.id) &&
      'source' in clip &&
      'assetId' in clip.source &&
      clip.source.assetId &&
      stills.has(clip.source.assetId)
        ? [clip.source.assetId]
        : [],
    ),
  );
  const ordered = [...card.slots].sort((a, b) => Number(b.required) - Number(a.required));
  const refs: QuickStartForm['refs'] = {};
  for (const [index, slot] of ordered.entries()) {
    const assetId = selected[index];
    if (assetId) refs[slot.role] = assetId;
  }
  return refs;
}
