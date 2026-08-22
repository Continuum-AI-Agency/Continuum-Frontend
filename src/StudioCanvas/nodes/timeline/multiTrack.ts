import { v4 as uuidv4 } from 'uuid';
import type { TimelineItem, TimelineTrack } from '../../types';

// Multi-track helpers for the Video Editor. The base track is `data.items`
// (unchanged); overlay tracks float on top, each item placed at an absolute
// `startSec` and positioned via its transform (default: a corner PiP). Overlay
// items reuse the base TimelineItem mutations (remove/trim/effects), so only the
// placement + absolute-start pieces live here.

const DEFAULT_OVERLAY_TRACK_ID = 'overlay-1';

// New overlays default to a small top-right picture-in-picture so they don't
// cover the base; the user adjusts scale/position via the inspector transform.
const DEFAULT_OVERLAY_TRANSFORM = { scale: 0.4, offsetX: 0.28, offsetY: -0.28 };

/**
 * The overlay tracks on a timeline document (empty for legacy single-track data).
 * Structural, not node-shaped: the editor's document is a node's data on the
 * canvas and a draft row in the Library, and both carry the same overlay field.
 */
export function resolveOverlayTracks(
  data: { items?: TimelineItem[]; overlayTracks?: TimelineTrack[] } | undefined,
): TimelineTrack[] {
  return Array.isArray(data?.overlayTracks) ? data.overlayTracks : [];
}

/** Ensure there is at least one overlay track, returning the (possibly new) list. */
export function ensureOverlayTrack(tracks: TimelineTrack[]): TimelineTrack[] {
  if (tracks.length > 0) return tracks;
  return [{ id: DEFAULT_OVERLAY_TRACK_ID, kind: 'overlay', items: [] }];
}

/** Append a new empty overlay lane. Enables stacking multiple PiP/overlay layers. */
export function addOverlayTrack(tracks: TimelineTrack[]): TimelineTrack[] {
  const ensured = ensureOverlayTrack(tracks);
  return [...ensured, { id: `overlay-${uuidv4()}`, kind: 'overlay', items: [] }];
}

/** Drop one overlay lane and the items on it. An unknown id leaves the list as-is. */
export function removeOverlayTrack(tracks: TimelineTrack[], trackId: string): TimelineTrack[] {
  return tracks.filter((track) => track.id !== trackId);
}

/** Every overlay item across all overlay tracks, for rendering. */
export function allOverlayItems(tracks: TimelineTrack[]): TimelineItem[] {
  return tracks.flatMap((track) => track.items);
}

export function placeOverlayItem(
  tracks: TimelineTrack[],
  sourceNodeId: string,
  kind: 'video' | 'image',
  startSec: number,
  trackId?: string,
): TimelineTrack[] {
  const ensured = ensureOverlayTrack(tracks);
  const targetId =
    trackId && ensured.some((track) => track.id === trackId) ? trackId : ensured[0].id;
  return ensured.map((track) =>
    track.id === targetId
      ? {
          ...track,
          items: [
            ...track.items,
            {
              id: uuidv4(),
              order: track.items.length,
              sourceNodeId,
              kind,
              startSec: Math.max(0, startSec),
              // Overlays are muted on drop (visual PiP by default); the inspector's
              // overlay audio toggle opts a layer's sound back into the mixdown.
              muteAudio: true,
              effects: { transform: { ...DEFAULT_OVERLAY_TRANSFORM }, opacity: 1 },
            } satisfies TimelineItem,
          ],
        }
      : track,
  );
}

export function updateOverlayItem(
  tracks: TimelineTrack[],
  itemId: string,
  update: (item: TimelineItem) => TimelineItem,
): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    items: track.items.map((item) => (item.id === itemId ? update(item) : item)),
  }));
}

export function removeOverlayItem(tracks: TimelineTrack[], itemId: string): TimelineTrack[] {
  return tracks.map((track) => ({
    ...track,
    items: track.items.filter((item) => item.id !== itemId),
  }));
}

export function setOverlayStart(
  tracks: TimelineTrack[],
  itemId: string,
  startSec: number,
): TimelineTrack[] {
  return updateOverlayItem(tracks, itemId, (item) => ({
    ...item,
    startSec: Math.max(0, startSec),
  }));
}

export function findOverlayItem(
  tracks: TimelineTrack[],
  itemId: string | undefined,
): TimelineItem | undefined {
  if (!itemId) return undefined;
  for (const track of tracks) {
    const found = track.items.find((item) => item.id === itemId);
    if (found) return found;
  }
  return undefined;
}
