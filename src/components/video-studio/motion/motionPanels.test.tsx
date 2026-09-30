import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  lookEffectInstance,
  TEXT_TEMPLATE_IDS,
  type VideoEditorOpName,
} from '@continuum/contracts';
import { cleanup, createEvent, fireEvent, render, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { createPlayheadStore } from '@/StudioCanvas/nodes/timeline/workspace/playheadStore';
import {
  placeAssetEdit,
  simulate,
  type TimelineEdit,
} from '@/StudioCanvas/nodes/timeline/workspace/timelineEdits';
import type { RunVideoEditorOp } from '../types';
import { LookSection, lookStrength, MotionPresetsSection } from './ClipMotionSections';
import { KeyframeLane } from './KeyframeLane';
import { addKeyEdit, isKeyedClip, type KeyedClip } from './keyframeEdits';
import { TextAnimationPicker } from './TextAnimationPicker';
import { readTemplateDrag, TEXT_TEMPLATE_DRAG_TYPE, TextTemplateShelf } from './TextTemplateShelf';

afterEach(cleanup);

function withClip(): { project: EditorProjectV2; clip: KeyedClip } {
  const blank = createEditorProjectV2({
    projectId: 'p1',
    title: 'Edit',
    width: 1080,
    height: 1920,
  });
  const placed = placeAssetEdit(
    blank,
    { assetId: 'a', kind: 'video', title: 'Reel', durationSec: 4, origin: 'project' },
    { atSec: 0 },
  );
  const project = simulate(blank, placed.forward);
  const clip = project.tracks[0]?.clips[0];
  if (!clip || !isKeyedClip(clip)) throw new Error('no clip');
  return { project, clip };
}

function recordingRunOp() {
  const calls: Array<{ op: VideoEditorOpName; input: unknown }> = [];
  const runOp = (async (op: VideoEditorOpName, input: unknown) => {
    calls.push({ op, input });
    return {};
  }) as RunVideoEditorOp;
  return { calls, runOp };
}

function addKeyEditForTest(project: EditorProjectV2, clipId: string): TimelineEdit {
  const edit = addKeyEdit(project, clipId, 'position', 1);
  if (!edit) throw new Error('no edit');
  return edit;
}

class FakeTransfer {
  data = new Map<string, string>();
  effectAllowed = '';
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? '';
  }
}

describe('TextTemplateShelf', () => {
  it('shows every template; a click places it with the typed line', () => {
    const onPlace = mock(() => undefined);
    const view = render(<TextTemplateShelf aspect={9 / 16} onPlace={onPlace} />);
    expect(view.container.querySelectorAll('[data-text-template]')).toHaveLength(
      TEXT_TEMPLATE_IDS.length,
    );
    fireEvent.change(view.getByLabelText('Line'), { target: { value: 'Big news' } });
    fireEvent.click(view.getByRole('button', { name: 'Add Lower third' }));
    expect(onPlace).toHaveBeenCalledWith({
      template: 'lower_third',
      text: 'Big news',
      secondaryText: 'Head coach',
    });
  });

  it('a drag carries a placement the timeline reads back, and rejects junk', () => {
    const view = render(<TextTemplateShelf aspect={9 / 16} onPlace={() => undefined} />);
    const transfer = new FakeTransfer();
    const card = view.getByRole('button', { name: 'Add Hook title' });
    const dragStart = createEvent.dragStart(card);
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    fireEvent(card, dragStart);
    expect(readTemplateDrag(transfer as unknown as DataTransfer)).toEqual({
      template: 'hook_title',
      text: 'Stop scrolling',
    });
    const junk = new FakeTransfer();
    junk.setData(TEXT_TEMPLATE_DRAG_TYPE, JSON.stringify({ template: 'nope', text: 'x' }));
    expect(readTemplateDrag(junk as unknown as DataTransfer)).toBeNull();
  });
});

describe('TextAnimationPicker', () => {
  it('marks the stored animation and picks per phase', () => {
    const onPick = mock(() => undefined);
    const view = render(
      <TextAnimationPicker animationIn="scaleIn" animationOut="fade" onPick={onPick} />,
    );
    expect(view.getByRole('button', { name: 'In: Scale in' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(view.getByRole('button', { name: 'In: Bounce' }));
    expect(onPick).toHaveBeenCalledWith('animationIn', 'bounce');
  });
});

describe('KeyframeLane', () => {
  it('keys at the playhead, and ⌫ on a key deletes it without reaching the timeline', () => {
    const { project, clip } = withClip();
    const store = createPlayheadStore();
    store.publish(1.5, false);
    const edits: Array<TimelineEdit | null> = [];
    // Builds run on the project as it stands when applied, as in the workspace.
    let current = project;
    const onEdit = (build: (latest: EditorProjectV2) => TimelineEdit | null) =>
      edits.push(build(current));
    const view = render(
      <KeyframeLane clip={clip} store={store} onEdit={onEdit} onSettle={() => undefined} />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Add Position keyframe' }));
    expect(edits[0]?.forward[0]).toMatchObject({
      commandType: 'upsert_keyframe',
      keyframe: { property: 'transform.position', timeSec: 1.5 },
    });

    const keyed = simulate(project, edits[0]?.forward ?? []);
    current = keyed;
    const keyedClip = keyed.tracks[0]?.clips[0];
    if (!keyedClip || !isKeyedClip(keyedClip)) throw new Error('no clip');
    view.rerender(
      <KeyframeLane clip={keyedClip} store={store} onEdit={onEdit} onSettle={() => undefined} />,
    );
    const onWindowKey = mock(() => undefined);
    window.addEventListener('keydown', onWindowKey);
    fireEvent.keyDown(view.getByRole('button', { name: 'Position keyframe at 1.50 s' }), {
      key: 'Delete',
    });
    window.removeEventListener('keydown', onWindowKey);
    expect(onWindowKey).not.toHaveBeenCalled();
    expect(edits.at(-1)?.forward[0]).toMatchObject({ commandType: 'remove_keyframes' });
  });
});

describe('motion and look sections', () => {
  it('a preset runs animate_clip; an emphasis lands at the playhead inside the clip', async () => {
    const { clip } = withClip();
    const { calls, runOp } = recordingRunOp();
    const view = render(
      <ToastProvider>
        <MotionPresetsSection clip={clip} getPlayheadSec={() => 9} runOp={runOp} />
      </ToastProvider>,
    );
    fireEvent.click(view.getByRole('button', { name: 'Pop' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(view.getByRole('button', { name: 'Shake' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual([
      { op: 'animate_clip', input: { clipId: clip.id, preset: 'pop' } },
      { op: 'animate_clip', input: { clipId: clip.id, preset: 'shake', atSec: 4 } },
    ]);
  });

  it('a look chip runs apply_effect, and strength reads back from the effect', async () => {
    const { clip } = withClip();
    if (clip.kind !== 'video') throw new Error('expected video');
    const { calls, runOp } = recordingRunOp();
    const view = render(
      <ToastProvider>
        <LookSection clip={clip} runOp={runOp} />
      </ToastProvider>,
    );
    fireEvent.click(view.getByRole('button', { name: 'VHS' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      op: 'apply_effect',
      input: { clipId: clip.id, effect: 'vhs', strength: 0.6 },
    });
    expect(lookStrength(lookEffectInstance('vhs', { id: 'v', strength: 0.35 }))).toBe(0.35);
    expect(lookStrength(lookEffectInstance('pixelate', { id: 'p', strength: 0.5 }))).toBe(0.5);
  });
});

describe('KeyButton drag', () => {
  it('a drag along the row moves the key to the time under the pointer', () => {
    const { project, clip } = withClip();
    const store = createPlayheadStore();
    const keyed = simulate(
      project,
      addKeyEditForTest(project, clip.id).forward,
    );
    const keyedClip = keyed.tracks[0]?.clips[0];
    if (!keyedClip || !isKeyedClip(keyedClip)) throw new Error('no clip');
    const edits: Array<TimelineEdit | null> = [];
    const view = render(
      <KeyframeLane
        clip={keyedClip}
        store={store}
        onEdit={(build) => edits.push(build(keyed))}
        onSettle={() => undefined}
      />,
    );
    const key = view.getByRole('button', { name: 'Position keyframe at 1.00 s' });
    const row = key.parentElement as HTMLElement;
    row.getBoundingClientRect = () => ({ left: 0, width: 400 }) as DOMRect;
    key.setPointerCapture = () => undefined;
    key.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(key, { button: 0, pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(key, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(key, { pointerId: 1, clientX: 250 });
    // 250 px of a 400 px row over a 4 s clip.
    expect(edits.at(-1)?.forward.at(-1)).toMatchObject({
      commandType: 'upsert_keyframe',
      keyframe: { property: 'transform.position', timeSec: 2.5 },
    });
  });
});
