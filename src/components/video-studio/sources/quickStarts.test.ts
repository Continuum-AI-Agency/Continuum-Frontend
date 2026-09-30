import { describe, expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  editorProjectV2Schema,
  VIDEO_EDITOR_OPS,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import {
  conceptById,
  conceptUpperUsd,
  generateRequest,
  QUICK_START_CARDS,
  refsFromSelection,
} from './quickStarts';

const card = (id: string) => {
  const found = QUICK_START_CARDS.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
};
const still = (assetId: string): VideoEditorPoolAsset => ({
  assetId,
  kind: 'image',
  title: assetId,
  origin: 'graph',
});

describe('quick-start requests', () => {
  test('every card builds an input the generate contract accepts', () => {
    for (const entry of QUICK_START_CARDS) {
      const refs = Object.fromEntries(entry.slots.map((slot) => [slot.role, `asset-${slot.role}`]));
      const built = generateRequest(entry, {
        refs,
        prompt: 'go',
        placeAtSec: 1.5,
        concept: 'offer-direct',
      });
      expect(built.ok).toBe(true);
      if (built.ok) {
        const parsed = VIDEO_EDITOR_OPS.generate.input.parse({
          ...built.input,
          projectId: '22222222-2222-4222-8222-222222222222',
        });
        expect(parsed.place).toEqual({ atSec: 1.5 });
        expect(parsed.refs.length).toBe(entry.slots.length);
      }
    }
  });

  test('a missing required slot or prompt names what is missing', () => {
    expect(
      generateRequest(card('restyle_image'), {
        refs: { source: 'a' },
        prompt: '',
        placeAtSec: null,
      }),
    ).toEqual({
      ok: false,
      reason: 'Pick the Style.',
    });
    expect(
      generateRequest(card('edit_image'), { refs: { source: 'a' }, prompt: ' ', placeAtSec: null }),
    ).toEqual({
      ok: false,
      reason: 'Say what to change.',
    });
    const loose = generateRequest(card('create_image'), { refs: {}, prompt: '', placeAtSec: null });
    expect(loose.ok).toBe(false);
  });

  test('music bed: mood required, ducked by default, length only when given', () => {
    const bed = card('music_bed');
    expect(generateRequest(bed, { refs: {}, prompt: ' ', placeAtSec: 0 })).toEqual({
      ok: false,
      reason: 'Pick a mood or describe one.',
    });
    expect(
      generateRequest(bed, { refs: {}, prompt: 'lo-fi', placeAtSec: 0, preset: 'tiktok' }),
    ).toEqual({
      ok: true,
      input: {
        quickStart: 'music_bed',
        prompt: 'lo-fi',
        refs: [],
        place: { atSec: 0 },
        duck: true,
      },
    });
    const sized = generateRequest(bed, {
      refs: {},
      prompt: 'lo-fi',
      placeAtSec: null,
      durationSec: 12.5,
      duck: false,
    });
    expect(sized.ok && sized.input).toMatchObject({ durationSec: 12.5, duck: false });
    expect(
      generateRequest(bed, { refs: {}, prompt: 'lo-fi', placeAtSec: 0, durationSec: 0.5 }).ok,
    ).toBe(false);
    expect(
      generateRequest(bed, { refs: {}, prompt: 'lo-fi', placeAtSec: 0, durationSec: Number.NaN })
        .ok,
    ).toBe(false);
  });

  test('voiceover: the script is the prompt, the voice rides only when written', () => {
    const vo = card('voiceover');
    expect(generateRequest(vo, { refs: {}, prompt: '', placeAtSec: 2 })).toEqual({
      ok: false,
      reason: 'Write the script.',
    });
    const plain = generateRequest(vo, {
      refs: {},
      prompt: 'Book tonight.',
      placeAtSec: 2,
      voice: ' ',
    });
    expect(plain.ok && plain.input).toEqual({
      quickStart: 'voiceover',
      prompt: 'Book tonight.',
      refs: [],
      place: { atSec: 2 },
    });
    const voiced = generateRequest(vo, {
      refs: {},
      prompt: 'Book tonight.',
      placeAtSec: 2,
      voice: 'Calm narrator',
      duck: false,
      concept: 'pov',
    });
    expect(voiced.ok && voiced.input).toEqual({
      quickStart: 'voiceover',
      prompt: 'Book tonight.',
      refs: [],
      place: { atSec: 2 },
      voice: 'Calm narrator',
    });
  });

  test('concept reel: a concept is required, the angle is optional, its cost is per beat', () => {
    const reel = card('headless_concept');
    expect(generateRequest(reel, { refs: {}, prompt: '', placeAtSec: 1 })).toEqual({
      ok: false,
      reason: 'Pick a concept.',
    });
    const built = generateRequest(reel, {
      refs: {},
      prompt: '',
      placeAtSec: 1,
      concept: 'street-interview',
    });
    expect(built.ok && built.input).toEqual({
      quickStart: 'headless_concept',
      prompt: '',
      refs: [],
      place: { atSec: 1 },
      concept: 'street-interview',
    });
    const concept = conceptById('offer-direct');
    expect(concept && conceptUpperUsd(concept)).toBe((concept?.beats.length ?? 0) * 2);
    expect(conceptById(undefined)).toBe(undefined);
  });

  test('without placement the result stays in the pool', () => {
    const built = generateRequest(card('create_image'), {
      refs: {},
      prompt: 'a gym',
      placeAtSec: null,
    });
    expect(built.ok && built.input.place).toBe(undefined);
  });

  test('the selected clip fills the first required slot when it plays a pool still', () => {
    const project: EditorProjectV2 = editorProjectV2Schema.parse({
      ...createEditorProjectV2({
        projectId: '22222222-2222-4222-8222-222222222222',
        title: 'Edit',
        width: 1080,
        height: 1920,
      }),
      durationSec: 3,
      tracks: [
        {
          id: 'overlay',
          name: 'Overlay',
          kind: 'overlay',
          order: 0,
          clips: [
            {
              id: 'still-clip',
              kind: 'overlay',
              mediaKind: 'image',
              timelineStartSec: 0,
              durationSec: 3,
              source: { sourceType: 'library_asset', assetId: 'still-1' },
            },
          ],
        },
      ],
    });
    const refs = refsFromSelection(
      card('storyboard_to_video'),
      project,
      { clipIds: ['still-clip'] },
      [still('still-1')],
    );
    expect(refs).toEqual({ first_frame: 'still-1' });
    expect(
      refsFromSelection(card('storyboard_to_video'), project, { clipIds: ['still-clip'] }, []),
    ).toEqual({});
  });
});
