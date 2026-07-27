import { describe, expect, it, mock } from 'bun:test';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import type { StudioNode, TimelineEditorNodeData, TimelineItem } from '../../types';
import { placeOverlayItem } from './multiTrack';
import {
  applyDocumentPatch,
  patchNodeDocument,
  type TimelineCanvasWriter,
} from './useCanvasTimelineAdapter';
import { normalizeOrder, placeItem, toggleMarkerTime } from './useTimelineEditorModel';

// The break-point gate (`committed`) is what parks the workflow at the Video
// Editor until a human renders. Edits that can change the output must reset it;
// edits that cannot — dropping a ruler marker, toggling caption visibility — must
// not, or a glance at the timeline would force the whole downstream chain to be
// re-rendered. This locks that matrix, plus the autosave every patch owes the
// canvas session, through the same updaters the editor's call sites use.

const item = (id: string, order: number): TimelineItem => ({
  id,
  order,
  sourceNodeId: `src-${id}`,
  kind: 'video',
});

const committedData = (
  overrides: Partial<TimelineEditorNodeData> = {},
): TimelineEditorNodeData => ({
  items: [item('a', 0)],
  committed: true,
  ...overrides,
});

describe('applyDocumentPatch — the committed break-point matrix', () => {
  it('resets committed for an items write (the base-track model)', () => {
    const next = applyDocumentPatch(
      committedData({
        agentRenderRequest: {
          requestId: 'request-1',
          requestedFingerprint: 'old-fingerprint',
          requestedAt: '2026-07-26T00:00:00.000Z',
          status: 'completed',
        },
        renderContinuation: {
          jobId: 'f5f608a9-cbac-49d2-9572-72b0c6f4f80e',
          status: 'pending',
          downstreamLeafIds: ['leaf'],
        },
      }),
      (document) => ({
        ...document,
        items: normalizeOrder(placeItem(document.items, 'src-b', 'image')),
      }),
    );
    expect(next.items).toHaveLength(2);
    expect(next.committed).toBe(false);
    expect(next.renderContinuation).toBeUndefined();
    expect(next.agentRenderRequest).toBeUndefined();
  });

  it('resets committed for an overlay-tracks write (the overlay model)', () => {
    const next = applyDocumentPatch(committedData(), (document) => ({
      ...document,
      overlayTracks: placeOverlayItem(document.overlayTracks ?? [], 'src-b', 'video', 2),
    }));
    expect(next.overlayTracks?.[0].items).toHaveLength(1);
    expect(next.committed).toBe(false);
  });

  it('resets committed for an export-preset write', () => {
    const next = applyDocumentPatch(committedData(), (document) => ({
      ...document,
      exportPresetId: 'vertical-1080',
    }));
    expect(next.exportPresetId).toBe('vertical-1080');
    expect(next.committed).toBe(false);
  });

  it('resets committed when generated captions land on the document', () => {
    const next = applyDocumentPatch(committedData(), (document) => ({
      ...document,
      captionWords: [{ text: 'hi', startSec: 0, endSec: 0.4 }],
      captionsEnabled: true,
      captionStyle: document.captionStyle ?? DEFAULT_CAPTION_STYLE,
    }));
    expect(next.captionWords).toHaveLength(1);
    expect(next.captionStyle).toEqual(DEFAULT_CAPTION_STYLE);
    expect(next.committed).toBe(false);
  });

  it('leaves committed alone when a ruler marker is toggled', () => {
    const next = applyDocumentPatch(
      committedData({ markers: [1] }),
      (document) => ({ ...document, markers: toggleMarkerTime(document.markers ?? [], 3) }),
      { invalidatesRender: false },
    );
    expect(next.markers).toEqual([1, 3]);
    expect(next.committed).toBe(true);
  });

  it('leaves committed alone when caption visibility is toggled', () => {
    const next = applyDocumentPatch(
      committedData({ captionsEnabled: false, captionWords: [] }),
      (document) => ({ ...document, captionsEnabled: true }),
      { invalidatesRender: false },
    );
    expect(next.captionsEnabled).toBe(true);
    expect(next.committed).toBe(true);
  });

  it('preserves the host-owned fields the editor does not author', () => {
    const next = applyDocumentPatch(
      committedData({ progress: 0.5, generatedVideo: 'blob:x', isExecuting: true }),
      (document) => ({ ...document, items: [] }),
    );
    expect(next.progress).toBe(0.5);
    expect(next.generatedVideo).toBe('blob:x');
    expect(next.isExecuting).toBe(true);
  });
});

function createCanvasWriter(initial: TimelineEditorNodeData) {
  let node = { id: 'edit-1', type: 'timelineEditor', data: initial } as unknown as StudioNode;
  const takeSnapshot = mock(() => undefined);
  const triggerSave = mock(() => undefined);
  const updateNode = mock((_id: string, updater: (node: StudioNode) => StudioNode) => {
    node = updater(node);
  });
  const writer: TimelineCanvasWriter = { updateNode, takeSnapshot, triggerSave };
  return {
    writer,
    takeSnapshot,
    triggerSave,
    updateNode,
    data: () => node.data as TimelineEditorNodeData,
  };
}

describe('patchNodeDocument', () => {
  it('writes the patched document back onto the node and autosaves the session', () => {
    const host = createCanvasWriter(committedData());

    patchNodeDocument(host.writer, 'edit-1', (document) => ({
      ...document,
      items: [...document.items, item('b', 1)],
    }));

    expect(host.updateNode).toHaveBeenCalledTimes(1);
    expect(host.updateNode.mock.calls[0][0]).toBe('edit-1');
    expect(host.data().items).toHaveLength(2);
    expect(host.data().committed).toBe(false);
    expect(host.takeSnapshot).toHaveBeenCalledTimes(1);
    expect(host.triggerSave).toHaveBeenCalledTimes(1);
  });

  it('autosaves a non-invalidating patch too, without touching the render gate', () => {
    const host = createCanvasWriter(committedData());

    patchNodeDocument(host.writer, 'edit-1', (document) => ({ ...document, markers: [2] }), {
      invalidatesRender: false,
    });

    expect(host.data().markers).toEqual([2]);
    expect(host.data().committed).toBe(true);
    expect(host.takeSnapshot).toHaveBeenCalledTimes(1);
    expect(host.triggerSave).toHaveBeenCalledTimes(1);
  });

  it('hands the updater the node current document, never a stale snapshot', () => {
    const host = createCanvasWriter(committedData());

    patchNodeDocument(host.writer, 'edit-1', (document) => ({
      ...document,
      items: [...document.items, item('b', 1)],
    }));
    patchNodeDocument(host.writer, 'edit-1', (document) => ({
      ...document,
      items: [...document.items, item('c', 2)],
    }));

    expect(host.data().items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(host.takeSnapshot).toHaveBeenCalledTimes(2);
    expect(host.triggerSave).toHaveBeenCalledTimes(2);
  });
});
