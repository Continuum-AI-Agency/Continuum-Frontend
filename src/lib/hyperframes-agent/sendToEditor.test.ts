import { expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  editorProjectV2Schema,
  hyperframesStoryboardSchema,
} from '@continuum/contracts';
import { buildHyperframesEditorTrack } from './sendToEditor';

test('pins one rendered film into editable scene clips at storyboard boundaries', () => {
  const storyboard = hyperframesStoryboardSchema.parse({
    title: 'Launch',
    angle: {
      title: 'From brief to film',
      premise: 'Show real editing.',
      viewerTakeaway: 'Ship a launch film.',
    },
    scenes: [
      {
        id: 'hook',
        role: 'hook',
        start_seconds: 0,
        duration_seconds: 8,
        on_screen: 'A brief',
        motion: 'push in',
      },
      {
        id: 'editor',
        role: 'development',
        start_seconds: 8,
        duration_seconds: 17,
        on_screen: 'Real editor',
        motion: 'pan',
      },
      {
        id: 'payoff',
        role: 'payoff',
        start_seconds: 25,
        duration_seconds: 9,
        on_screen: 'Ready to launch',
        motion: 'match cut',
      },
    ],
  });
  const track = buildHyperframesEditorTrack({
    assetId: 'film-asset',
    versionId: 'film-version',
    durationSeconds: 34,
    storyboard,
  });
  expect(track.kind).toBe('video');
  if (track.kind !== 'video') throw new Error('Expected a video track.');
  expect(track.clips.map((clip) => [clip.sourceInSec, clip.durationSec])).toEqual([
    [0, 8],
    [8, 17],
    [25, 9],
  ]);
  expect(
    track.clips.every(
      (clip) =>
        clip.source.sourceType === 'library_asset' && clip.source.renditionId === 'film-version',
    ),
  ).toBe(true);
  const empty = createEditorProjectV2({
    projectId: 'project-1',
    title: 'Film',
    width: 1920,
    height: 1080,
  });
  expect(() =>
    editorProjectV2Schema.parse({ ...empty, durationSec: 34, tracks: [track] }),
  ).not.toThrow();
});

test('stamps the film revision on every scene clip, so the editor edits its motion through it', () => {
  const hyperframes = { revisionId: 'revision-1', fingerprint: 'f'.repeat(64) };
  const linked = buildHyperframesEditorTrack({
    assetId: 'film-asset',
    versionId: 'film-version',
    durationSeconds: 6,
    hyperframes,
  });
  if (linked.kind !== 'video') throw new Error('Expected a video track.');
  expect(linked.clips.map((clip) => clip.hyperframes)).toEqual([hyperframes]);
  const plain = buildHyperframesEditorTrack({
    assetId: 'film-asset',
    versionId: 'film-version',
    durationSeconds: 6,
  });
  if (plain.kind !== 'video') throw new Error('Expected a video track.');
  expect(plain.clips.every((clip) => clip.hyperframes === undefined)).toBe(true);
  expect(() =>
    buildHyperframesEditorTrack({
      assetId: 'film-asset',
      versionId: 'film-version',
      durationSeconds: 6,
      hyperframes: { revisionId: 'revision-1', fingerprint: 'short' },
    }),
  ).toThrow();
});
