import { afterEach, describe, expect, it } from 'bun:test';
import {
  ASSET_DRAG_MIME,
  assetDragInFlightIncludes,
  assetIdsToDrag,
  endAssetDrag,
  isAssetDrag,
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
