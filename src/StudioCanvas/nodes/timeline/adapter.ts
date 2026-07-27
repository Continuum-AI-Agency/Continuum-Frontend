// The seam that lets the Video Editor run anywhere.
//
// The editor was born inside the canvas: its document was a React Flow node's
// data, its media bin was the node's incoming edges, every edit autosaved the
// whole canvas session, and rendering resumed the downstream workflow graph.
// None of that is intrinsic to editing video — it is how the canvas happens to
// store things. This interface is the only thing the editor components know
// about their host, so the same timeline can be opened from the Library on a
// media.assets row with no canvas anywhere in sight.
//
// Implementations: useCanvasTimelineAdapter (node data + canvas_sessions +
// workflow resume) and useLibraryTimelineAdapter (media.timeline_drafts + a
// Library media bin + save-as-version/new-asset).

import type { ReactNode } from 'react';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { StudioRenderOrigin } from '@/lib/studio-render/renderStore';
import type { TimelineInputSource, TimelineItem, TimelineTrack } from '../../types';
import type { CaptionCue, CaptionWord } from '../../utils/splice/captionCues';
import type {
  TimelineAudioRenderItem,
  TimelineOverlayRenderItem,
  TimelineRenderItem,
} from '../../utils/splice/composeTimeline';

// The editable, user-authored document. Deliberately narrower than
// TimelineEditorNodeData: render progress, the generated-video coordinates and
// the canvas break-point gate (`committed`) are the host's business, not the
// editor's.
export interface TimelineDocument {
  items: TimelineItem[];
  overlayTracks?: TimelineTrack[];
  audioTracks?: TimelineTrack[];
  exportPresetId?: string;
  markers?: number[];
  captionsEnabled?: boolean;
  // Caption cues are the editable authoring model. captionWords remains a
  // read-compatible fallback for older canvas sessions and Library drafts.
  captionCues?: CaptionCue[];
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
}

export interface TimelinePatchOptions {
  // Does this edit invalidate a render that already happened? Moving a clip
  // does; dropping a ruler marker or toggling caption visibility does not. On
  // the canvas this maps to the `committed` break-point flag, which must not be
  // reset by edits that cannot change the output.
  invalidatesRender?: boolean;
  // Host adapters record one undo boundary per user-authored patch by default.
  // Render/status plumbing can opt out because it is not an editor command.
  recordHistory?: boolean;
}

export interface TimelineUndoManager {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

// Where a finished render goes. The canvas has exactly one destination (the
// workflow it is parked in); the Library has two.
export type TimelineRenderSinkKind = 'canvas-workflow' | 'library-version' | 'library-new-asset';

export interface TimelineRenderSink {
  kind: TimelineRenderSinkKind;
  label: string;
  description?: string;
}

export interface TimelineRenderSnapshot {
  document: TimelineDocument;
  inputFingerprint: string;
  resolveSources(): Promise<TimelineRenderItem[]>;
  resolveOverlays(): Promise<TimelineOverlayRenderItem[]>;
  resolveAudioTracks(): Promise<TimelineAudioRenderItem[]>;
}

export interface TimelineRenderCompletionContext {
  jobId: string;
  inputFingerprint: string;
  signal: AbortSignal;
  result: {
    durationSec: number;
    width: number;
    height: number;
  };
}

export type TimelineRenderCompletion = {
  outcome: 'committed' | 'stale' | 'missing';
};

export interface TimelineEditorAdapter {
  scope: 'canvas' | 'library';
  brandId: string | null;
  /** Present only when an inline command can route back to the Canvas agent. */
  agentContext?: { roomId: string; nodeId: string };
  header: { title: string; description: string };

  // `document` is the reactive snapshot the editor renders from. `getDocument`
  // is a fresh read for the render path, which must never composite a stale
  // props closure (the canvas implementation reads straight from the store).
  document: TimelineDocument;
  getDocument(): TimelineDocument;
  patchDocument(
    updater: (document: TimelineDocument) => TimelineDocument,
    options?: TimelinePatchOptions,
  ): void;
  undoManager?: TimelineUndoManager;

  // The media bin. On the canvas it is derived from the node's incoming edges
  // and is therefore read-only — you add media by wiring a node. In the Library
  // it is part of the draft, so `addPoolSources` is present and the bin grows a
  // "Add from Library" affordance.
  pool: TimelineInputSource[];
  addPoolSources?(sources: TimelineInputSource[]): void;
  removePoolSource?(sourceId: string): void;
  // Rendered inside the media bin header (the Library's picker button).
  binAction?: ReactNode;

  // Render-time byte resolution. Both hosts end at the same mediabunny worker;
  // they differ only in how a source id becomes a Blob.
  resolveSources(items: TimelineItem[]): Promise<TimelineRenderItem[]>;
  resolveOverlays(tracks: TimelineTrack[]): Promise<TimelineOverlayRenderItem[]>;
  resolveAudioTracks(tracks: TimelineTrack[]): Promise<TimelineAudioRenderItem[]>;

  // The sink owns persistence AND the host's post-render side effects: the
  // canvas commits the break-point and resumes the workflow; the Library saves
  // a new version or a new asset and stamps the draft.
  renderSinks: TimelineRenderSink[];
  completeRender(
    blob: Blob,
    sink: TimelineRenderSinkKind,
    context?: TimelineRenderCompletionContext,
  ): Promise<TimelineRenderCompletion | void>;

  // Canvas renders opt into the app-level render runtime. The snapshot captures
  // the exact document + source graph at click time; the queued job resolves its
  // bytes later without reading a different room from the live Zustand store.
  renderOrigin?: StudioRenderOrigin;
  captureRenderSnapshot?(): TimelineRenderSnapshot;
  flushRenderSnapshot?(): Promise<void>;

  // Progress fan-out beyond the dialog. The canvas mirrors it onto the node so
  // the collapsed node card keeps showing its progress bar; the Library has no
  // second surface and no-ops.
  reportRenderProgress(progress: number): void;
  reportRenderState(state: { isExecuting: boolean; error?: string }): void;

  // Open/close lifecycle: the canvas claims the keyboard scope, the Library
  // flushes any pending draft save.
  onEditorOpenChange(open: boolean): void;
}
