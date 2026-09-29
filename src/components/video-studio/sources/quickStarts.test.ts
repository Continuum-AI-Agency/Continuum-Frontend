import { describe, expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  editorProjectV2Schema,
  VIDEO_EDITOR_OPS,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import { generateRequest, QUICK_START_CARDS, refsFromSelection } from './quickStarts';

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
      const built = generateRequest(entry, { refs, prompt: 'go', placeAtSec: 1.5 });
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
