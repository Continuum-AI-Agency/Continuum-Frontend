// Background removal for one selected clip, without the node graph.
//
// `runRemoveImageBackground` / `runRemoveVideoBackground` are plain exported functions:
// they take an already-resolved input, call the matte service, and read its SSE stream.
// The `action` node machinery around them (registry lookup, port resolution, output
// registration) is the CANVAS's way of reaching them, not a precondition — so the
// inspector calls them directly with a one-input arg object.
//
// The cutout comes back as a registered Library asset, which is the whole persistence
// story here: nothing new is stored, the clip is simply repointed at the derivative the
// service already recorded against its source.

import type { TimelineInputSource, TimelineItem } from '../../types';
import {
  type RemoveBackgroundDeps,
  runRemoveImageBackground,
  runRemoveVideoBackground,
} from '../../utils/actions/removeBackgroundOp';
import type { TimelineDocument } from './adapter';

export interface RemoveClipBackgroundParams {
  item: TimelineItem;
  /** `media.assets` id of the clip's bin source. The op refuses without one. */
  sourceAssetId: string;
  label: string;
  brandId: string | null;
  /** Carried onto the new bin source so the timeline does not have to re-probe it. */
  durationSec?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Test/bench seam — the same one the op itself exposes. */
  deps?: RemoveBackgroundDeps;
}

/**
 * Mattes the clip and returns the cutout as a media-bin source, ready to be added to
 * the pool and pointed at. Throws with the service's own message on failure.
 */
export async function removeClipBackground(
  params: RemoveClipBackgroundParams,
): Promise<TimelineInputSource> {
  const { item, sourceAssetId, label, brandId, durationSec, signal, onProgress, deps } = params;
  // Audio has no background; the inspector never offers the control for it, and a
  // still and a clip are the only two shapes the service takes.
  const kind = item.kind === 'image' ? 'image' : 'video';
  const run = kind === 'image' ? runRemoveImageBackground : runRemoveVideoBackground;

  const output = await run(
    {
      actionId: `${kind}.removeBackground`,
      inputs: [{ handle: 'in', assetId: sourceAssetId }],
      config: {},
      signal,
      onProgress,
    },
    // `remove` with no feather is the plain cutout. `replace` needs a colour or a wired
    // plate, neither of which a clip inspector has — that is an action node's job.
    { mode: 'remove', featherPx: 0 },
    { resolveBrandId: () => brandId, ...deps },
  );

  if (output.type !== 'image' && output.type !== 'video') {
    throw new Error('The background remover returned something the timeline cannot place');
  }
  if (!output.assetId || !output.url) {
    throw new Error('The cutout came back without a Library asset to place');
  }

  return {
    nodeId: output.assetId,
    kind,
    label,
    sourceAssetId: output.assetId,
    ...(output.assetVersionId ? { sourceVersionId: output.assetVersionId } : {}),
    previewUrl: output.url,
    ...(durationSec ? { durationSec } : {}),
  };
}

/**
 * Point one placement at a different bin source, on whichever track it lives on.
 *
 * Every other field survives — trim, effects and transition are properties of the EDIT,
 * not of the bytes, and a cutout is the same footage with its background gone.
 */
export function repointClipSource(
  document: TimelineDocument,
  itemId: string,
  sourceNodeId: string,
): TimelineDocument {
  const repoint = (item: TimelineItem): TimelineItem =>
    item.id === itemId ? { ...item, sourceNodeId } : item;
  return {
    ...document,
    items: document.items.map(repoint),
    ...(document.overlayTracks
      ? {
          overlayTracks: document.overlayTracks.map((track) => ({
            ...track,
            items: track.items.map(repoint),
          })),
        }
      : {}),
  };
}
