import type {
  EditorProjectV2,
  PlatformExportPresetId,
  VideoEditorOpInput,
  VideoEditorOpParsedInput,
  VideoEditorPoolAsset,
  VideoEditorQuickStart,
} from '@continuum/contracts';
import type { VideoStudioSelection } from '../types';

type GenerateInput = Omit<VideoEditorOpInput<'generate'>, 'projectId'>;
export type SlotRole = VideoEditorOpParsedInput<'generate'>['refs'][number]['role'];

export type QuickStartSlot = { role: SlotRole; label: string; required: boolean };

export type QuickStartCard = {
  id: VideoEditorQuickStart;
  label: string;
  description: string;
  output: 'image' | 'video';
  slots: QuickStartSlot[];
  promptRequired: boolean;
  promptPlaceholder: string;
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
  },
  {
    id: 'edit_image',
    label: 'Edit Image',
    description: 'Change one thing in an image and keep the rest.',
    output: 'image',
    slots: [{ role: 'source', label: 'Image', required: true }],
    promptRequired: true,
    promptPlaceholder: 'Swap the background for a sunlit gym',
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
  },
  {
    id: 'rotate_360',
    label: '360 Rotation',
    description: 'Orbit the camera once around a product.',
    output: 'video',
    slots: [{ role: 'source', label: 'Product image', required: true }],
    promptRequired: false,
    promptPlaceholder: 'Optional: surface, lighting, background',
  },
];

export type QuickStartForm = {
  refs: Partial<Record<SlotRole, string>>;
  prompt: string;
  preset?: PlatformExportPresetId;
  /** Null leaves the result in the pool without touching the timeline. */
  placeAtSec: number | null;
};

export function generateRequest(
  card: QuickStartCard,
  form: QuickStartForm,
): { ok: true; input: GenerateInput } | { ok: false; reason: string } {
  const missing = card.slots.find((slot) => slot.required && !form.refs[slot.role]);
  if (missing) return { ok: false, reason: `Pick the ${missing.label}.` };
  const prompt = form.prompt.trim();
  if (card.promptRequired && !prompt) return { ok: false, reason: 'Say what to change.' };
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
      ...(form.preset ? { preset: form.preset } : {}),
      ...(form.placeAtSec === null ? {} : { place: { atSec: Math.max(0, form.placeAtSec) } }),
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
