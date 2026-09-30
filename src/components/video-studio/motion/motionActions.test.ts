import { describe, expect, test } from 'bun:test';
import type { EditorClip, VideoEditorOpName } from '@continuum/contracts';
import type { RunVideoEditorOp } from '../types';
import { motionClipActions, motionPaletteGroups } from './motionActions';

const clip = (id: string, kind: EditorClip['kind'], start: number, duration: number) =>
  ({ id, kind, timelineStartSec: start, durationSec: duration }) as EditorClip;
const clips = [clip('v', 'video', 0, 4), clip('a', 'audio', 0, 4), clip('t', 'text', 5, 2)];

function harness(playheadSec: number) {
  const calls: Array<{ op: VideoEditorOpName; input: unknown }> = [];
  const runOp = (async (op: VideoEditorOpName, input: unknown) => {
    calls.push({ op, input });
    return {};
  }) as RunVideoEditorOp;
  const actions = motionClipActions({
    targetsFor: () => ['v', 'a', 't'],
    clipOf: (id) => clips.find((entry) => entry.id === id),
    getPlayheadSec: () => playheadSec,
    runOp,
    runQuiet: (_label, run) => run(),
  });
  return { calls, actions };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('motion clip actions', () => {
  test('animate widens to the selection, skips audio, holds an emphasis inside each clip', async () => {
    const { calls, actions } = harness(3);
    actions.animate('v', 'shake');
    await settle();
    expect(calls).toEqual([
      { op: 'animate_clip', input: { clipId: 'v', preset: 'shake', atSec: 3 } },
      { op: 'animate_clip', input: { clipId: 't', preset: 'shake', atSec: 5 } },
    ]);
  });

  test('a look lands only on picture clips; a transition names the clicked clip', async () => {
    const { calls, actions } = harness(0);
    actions.look('v', 'vhs');
    actions.transition('v', 'crossfade');
    await settle();
    expect(calls).toEqual([
      { op: 'apply_effect', input: { clipId: 'v', effect: 'vhs' } },
      { op: 'add_transition', input: { fromClipId: 'v', type: 'crossfade', durationSec: 0.5 } },
    ]);
  });
});

describe('motion palette groups', () => {
  test('clip actions are disabled until the right clip is selected', () => {
    const { actions } = harness(0);
    const base = { actions, placeTemplate: () => undefined, openTextTab: () => undefined };
    const flags = (groups: ReturnType<typeof motionPaletteGroups>, prefix: string) =>
      groups
        .flatMap((group) => group.actions)
        .filter((action) => action.id.startsWith(prefix))
        .every((action) => action.disabled);
    const none = motionPaletteGroups({
      ...base,
      selectedClip: undefined,
      transitionsToNext: false,
    });
    expect(flags(none, 'animate-')).toBe(true);
    expect(flags(none, 'text-')).toBe(false);
    const text = motionPaletteGroups({ ...base, selectedClip: clips[2], transitionsToNext: false });
    expect(flags(text, 'animate-')).toBe(false);
    expect(flags(text, 'look-')).toBe(true);
    expect(flags(text, 'transition-')).toBe(true);
  });
});
