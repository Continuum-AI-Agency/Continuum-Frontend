import { afterEach, describe, expect, it } from 'bun:test';
import {
  ASSET_DRAG_MIME,
  assetDragInFlight,
  assetDragInFlightIncludes,
  assetIdsToDrag,
  collectionDropMode,
  endAssetDrag,
  isAssetDrag,
  moveOrCopyIntoCollection,
  readAssetDrag,
  writeAssetDrag,
} from './assetDrag';

// Just enough of DataTransfer to round-trip: a typed string store and its type list.
function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    get types() {
      return [...store.keys()];
    },
    effectAllowed: 'none',
    dropEffect: 'none',
  } as unknown as DataTransfer;
}

afterEach(endAssetDrag);

describe('assetIdsToDrag', () => {
  it('drags the card alone when it is not in the selection', () => {
    expect(assetIdsToDrag('a', new Set(['b', 'c']))).toEqual(['a']);
  });

  it('drags the whole selection, grabbed card first, when the card is selected', () => {
    expect(assetIdsToDrag('b', new Set(['a', 'b', 'c']))).toEqual(['b', 'a', 'c']);
  });
});

describe('writeAssetDrag / readAssetDrag', () => {
  it('round-trips the brand and asset ids under the private MIME type', () => {
    const event = { dataTransfer: fakeDataTransfer() };
    writeAssetDrag(event, 'brand-1', ['a', 'b']);

    expect(isAssetDrag(event)).toBe(true);
    expect(event.dataTransfer.types).toEqual([ASSET_DRAG_MIME]);
    expect(readAssetDrag(event)).toEqual({ brandId: 'brand-1', assetIds: ['a', 'b'] });
  });

  it('remembers the ids in flight until the drag ends, so a card can refuse itself', () => {
    writeAssetDrag({ dataTransfer: fakeDataTransfer() }, 'brand-1', ['a']);
    expect(assetDragInFlightIncludes('a')).toBe(true);
    expect(assetDragInFlightIncludes('b')).toBe(false);
    endAssetDrag();
    expect(assetDragInFlightIncludes('a')).toBe(false);
  });

  it('is not an asset drag when only files are dragged', () => {
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData('Files', '');
    expect(isAssetDrag({ dataTransfer })).toBe(false);
    expect(readAssetDrag({ dataTransfer })).toBeNull();
  });

  it('rejects a malformed or empty payload', () => {
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData(ASSET_DRAG_MIME, '{not json');
    expect(readAssetDrag({ dataTransfer })).toBeNull();
    dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify({ brandId: 'b', assetIds: [] }));
    expect(readAssetDrag({ dataTransfer })).toBeNull();
    dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify({ assetIds: ['a'] }));
    expect(readAssetDrag({ dataTransfer })).toBeNull();
  });

  it('tolerates an event with no DataTransfer', () => {
    expect(isAssetDrag({ dataTransfer: null })).toBe(false);
    expect(readAssetDrag({ dataTransfer: null })).toBeNull();
  });
});

describe('collectionDropMode', () => {
  it('moves out of the collection being viewed, as Finder does between folders', () => {
    expect(
      collectionDropMode({ sourceCollectionId: 'A', targetCollectionId: 'B', altKey: false }),
    ).toBe('move');
  });

  it('copies with Alt/Option held, and from the unfiled grid', () => {
    expect(
      collectionDropMode({ sourceCollectionId: 'A', targetCollectionId: 'B', altKey: true }),
    ).toBe('copy');
    expect(
      collectionDropMode({ sourceCollectionId: null, targetCollectionId: 'B', altKey: false }),
    ).toBe('copy');
  });

  it('does nothing when dropped back onto the collection it came from', () => {
    expect(
      collectionDropMode({ sourceCollectionId: 'A', targetCollectionId: 'A', altKey: false }),
    ).toBe('none');
  });
});

describe('moveOrCopyIntoCollection', () => {
  const recorder = (failOn?: 'add' | 'remove') => {
    const calls: string[] = [];
    const mutate = async (input: { collectionId: string; mode: 'add' | 'remove' }) => {
      calls.push(`${input.mode}:${input.collectionId}`);
      if (input.mode === failOn) throw new Error(failOn);
    };
    return { calls, mutate };
  };
  const base = { brandId: 'b', assetIds: ['x'], targetCollectionId: 'B' };

  it('adds to B, THEN removes from A', async () => {
    const { calls, mutate } = recorder();
    expect(await moveOrCopyIntoCollection({ ...base, mutate, sourceCollectionId: 'A' })).toBe(
      'moved',
    );
    expect(calls).toEqual(['add:B', 'remove:A']);
  });

  it('a copy only adds', async () => {
    const { calls, mutate } = recorder();
    expect(await moveOrCopyIntoCollection({ ...base, mutate, sourceCollectionId: null })).toBe(
      'added',
    );
    expect(calls).toEqual(['add:B']);
  });

  it('a failed add removes nothing; a failed remove leaves it in both, never in neither', async () => {
    const failedAdd = recorder('add');
    expect(
      await moveOrCopyIntoCollection({
        ...base,
        mutate: failedAdd.mutate,
        sourceCollectionId: 'A',
      }),
    ).toBe('failed');
    expect(failedAdd.calls).toEqual(['add:B']);
    const failedRemove = recorder('remove');
    expect(
      await moveOrCopyIntoCollection({
        ...base,
        mutate: failedRemove.mutate,
        sourceCollectionId: 'A',
      }),
    ).toBe('added_not_removed');
  });
});

describe('assetDragInFlight', () => {
  it('is true from dragstart to dragend', () => {
    expect(assetDragInFlight()).toBe(false);
    writeAssetDrag({ dataTransfer: fakeDataTransfer() }, 'brand-1', ['a']);
    expect(assetDragInFlight()).toBe(true);
    endAssetDrag();
    expect(assetDragInFlight()).toBe(false);
  });
});
