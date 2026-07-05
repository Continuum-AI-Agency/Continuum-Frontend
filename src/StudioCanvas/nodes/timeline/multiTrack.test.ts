import { describe, expect, it } from 'bun:test';
import type { TimelineTrack } from '../../types';
import {
  addOverlayTrack,
  allOverlayItems,
  ensureOverlayTrack,
  findOverlayItem,
  placeOverlayItem,
  removeOverlayItem,
  resolveOverlayTracks,
  setOverlayStart,
} from './multiTrack';

describe('resolveOverlayTracks', () => {
  it('returns overlay tracks or an empty list for legacy data', () => {
    expect(resolveOverlayTracks(undefined)).toEqual([]);
    expect(resolveOverlayTracks({ items: [] })).toEqual([]);
    const tracks: TimelineTrack[] = [{ id: 'o', kind: 'overlay', items: [] }];
    expect(resolveOverlayTracks({ items: [], overlayTracks: tracks })).toBe(tracks);
  });
});

describe('placeOverlayItem', () => {
  it('creates an overlay track on demand and adds a PiP-defaulted item', () => {
    const tracks = placeOverlayItem([], 'src-1', 'video', 2);
    expect(tracks).toHaveLength(1);
    const [item] = tracks[0].items;
    expect(item.sourceNodeId).toBe('src-1');
    expect(item.startSec).toBe(2);
    expect(item.effects?.transform?.scale).toBe(0.4);
  });

  it('clamps a negative start to 0', () => {
    const tracks = placeOverlayItem([], 'src-1', 'image', -5);
    expect(tracks[0].items[0].startSec).toBe(0);
  });
});

describe('overlay mutations', () => {
  const seeded = placeOverlayItem([], 'src-1', 'video', 1);
  const id = seeded[0].items[0].id;

  it('sets start, finds, and removes overlay items', () => {
    const moved = setOverlayStart(seeded, id, 4);
    expect(findOverlayItem(moved, id)?.startSec).toBe(4);
    expect(allOverlayItems(moved)).toHaveLength(1);
    expect(allOverlayItems(removeOverlayItem(moved, id))).toHaveLength(0);
  });
});

describe('ensureOverlayTrack', () => {
  it('adds a track only when none exist', () => {
    expect(ensureOverlayTrack([])).toHaveLength(1);
    const existing: TimelineTrack[] = [{ id: 'x', kind: 'overlay', items: [] }];
    expect(ensureOverlayTrack(existing)).toBe(existing);
  });
});

describe('addOverlayTrack / multi-lane placement', () => {
  it('appends a new empty overlay lane', () => {
    const one = ensureOverlayTrack([]);
    const two = addOverlayTrack(one);
    expect(two).toHaveLength(2);
    expect(two[1].items).toEqual([]);
    expect(two[1].id).not.toBe(two[0].id);
  });

  it('places into the requested lane, not always the first', () => {
    const tracks = addOverlayTrack(ensureOverlayTrack([]));
    const secondId = tracks[1].id;
    const placed = placeOverlayItem(tracks, 'src-9', 'video', 3, secondId);
    expect(placed[0].items).toHaveLength(0);
    expect(placed[1].items).toHaveLength(1);
    expect(placed[1].items[0]).toMatchObject({ sourceNodeId: 'src-9', startSec: 3 });
  });

  it('falls back to the first lane for an unknown track id', () => {
    const tracks = addOverlayTrack(ensureOverlayTrack([]));
    const placed = placeOverlayItem(tracks, 'src-x', 'image', 0, 'nope');
    expect(placed[0].items).toHaveLength(1);
    expect(placed[1].items).toHaveLength(0);
  });
});
