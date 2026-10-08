import type {
  EditorProjectV2,
  VideoEditorOpInput,
  VideoEditorOpName,
  VideoEditorOpOutput,
  VideoEditorPoolAsset,
} from '@continuum/contracts';

export type VideoStudioSelection = { clipIds: string[]; rangeSec?: [number, number] };

export type RunVideoEditorOp = <N extends VideoEditorOpName>(
  op: N,
  input: Omit<VideoEditorOpInput<N>, 'projectId'>,
) => Promise<VideoEditorOpOutput<N>>;

/**
 * What the Video Studio workspace hands every panel mounted in it (agent, export, graph
 * pool, quick starts). The workspace owns the project state; panels read it here and
 * change it only through `runOp` or `addAssetToTimeline`, so every edit is a committed
 * revision the timeline, the agent and MCP all see.
 */
export type VideoStudioContext = {
  projectId: string;
  brandId: string;
  project: EditorProjectV2;
  selection: VideoStudioSelection;
  playheadSec: number;
  /** Runs an editor op; the workspace refetches the project after a committing op. */
  runOp: RunVideoEditorOp;
  refresh: () => Promise<void>;
  seek: (sec: number) => void;
  /** Places an asset on the timeline at `atSec` (default: the playhead). */
  addAssetToTimeline: (asset: VideoEditorPoolAsset, atSec?: number) => Promise<void>;
};

/** `dataTransfer` type for dragging an asset onto the timeline; payload is a JSON `VideoEditorPoolAsset`. */
export const VIDEO_STUDIO_ASSET_DRAG_TYPE = 'application/x-continuum-editor-asset';
