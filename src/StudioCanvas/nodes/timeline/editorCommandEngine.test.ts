import { describe, expect, test } from 'bun:test';
import type { TimelineDocument } from './adapter';
import {
  applyTimelineCommandBatch,
  commitTimelineCommands,
  createTimelineEditorState,
  fingerprintTimelineDocument,
  redoTimelineCommands,
  undoTimelineCommands,
} from './editorCommandEngine';

const document = (): TimelineDocument => ({
  items: [
    {
      id: 'base-a',
      order: 0,
      sourceNodeId: 'video-a',
      kind: 'video',
      trimStartSec: 0,
      trimEndSec: 6,
    },
  ],
  overlayTracks: [
    {
      id: 'overlay-1',
      kind: 'overlay',
      items: [
        {
          id: 'overlay-a',
          order: 0,
          sourceNodeId: 'image-a',
          kind: 'image',
          startSec: 1,
          durationSec: 2,
        },
      ],
    },
  ],
});

describe('editorCommandEngine', () => {
  test('fingerprints are stable across object key insertion order', () => {
    const a = document();
    const b = {
      overlayTracks: a.overlayTracks,
      items: a.items,
    } as TimelineDocument;
    expect(fingerprintTimelineDocument(b)).toBe(fingerprintTimelineDocument(a));
  });

  test('rejects an invalid batch atomically', () => {
    const state = createTimelineEditorState(document());
    const result = applyTimelineCommandBatch({
      document: state.document,
      revision: state.revision,
      expectedFingerprint: state.revision.fingerprint,
      commands: [
        {
          type: 'set_metadata',
          values: { exportPresetId: 'vertical-1080' },
        },
        {
          type: 'insert_item',
          location: { trackId: 'base', index: 1 },
          item: {
            ...state.document.items[0],
            order: 1,
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(fingerprintTimelineDocument(result.document)).toBe(state.revision.fingerprint);
    expect(result.document.exportPresetId).toBeUndefined();
  });

  test('produces exact inverse commands for undo and deterministic redo', () => {
    const initial = createTimelineEditorState(document());
    const edited = commitTimelineCommands(
      initial,
      [
        {
          type: 'replace_item',
          itemId: 'base-a',
          item: {
            ...initial.document.items[0],
            trimStartSec: 1,
            trimEndSec: 5,
            volume: 0.8,
          },
        },
        {
          type: 'move_item',
          itemId: 'overlay-a',
          location: { trackId: 'overlay-1', index: 0 },
          startSec: 3,
        },
        {
          type: 'set_metadata',
          values: { markers: [1, 3], exportPresetId: 'vertical-1080' },
        },
      ],
      'tighten opening',
    );

    expect(edited.revision.number).toBe(1);
    expect(edited.document.items[0].trimStartSec).toBe(1);
    expect(edited.document.overlayTracks?.[0].items[0].startSec).toBe(3);

    const undone = undoTimelineCommands(edited);
    expect(fingerprintTimelineDocument(undone.document)).toBe(initial.revision.fingerprint);
    expect(undone.undoStack).toHaveLength(0);
    expect(undone.redoStack).toHaveLength(1);

    const redone = redoTimelineCommands(undone);
    expect(fingerprintTimelineDocument(redone.document)).toBe(edited.revision.fingerprint);
    expect(redone.document.exportPresetId).toBe('vertical-1080');
  });

  test('guards revision conflicts', () => {
    const state = createTimelineEditorState(document());
    const result = applyTimelineCommandBatch({
      document: state.document,
      revision: state.revision,
      expectedFingerprint: 'stale',
      commands: [{ type: 'set_metadata', values: { markers: [1] } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('revision conflict');
  });

  test('restores removed tracks and explicitly identified inserted items', () => {
    const initial = createTimelineEditorState(document());
    const edited = commitTimelineCommands(initial, [
      { type: 'remove_overlay_track', trackId: 'overlay-1' },
      {
        type: 'insert_item',
        location: { trackId: 'base', index: 1 },
        item: {
          id: 'base-b',
          order: 1,
          sourceNodeId: 'video-b',
          kind: 'video',
          trimStartSec: 0,
          trimEndSec: 2,
        },
      },
    ]);
    expect(edited.document.overlayTracks).toEqual([]);
    expect(edited.document.items.map((item) => item.id)).toEqual(['base-a', 'base-b']);

    const undone = undoTimelineCommands(edited);
    expect(fingerprintTimelineDocument(undone.document)).toBe(initial.revision.fingerprint);
    expect(undone.document.overlayTracks?.[0].items[0].id).toBe('overlay-a');
  });
});
