import { describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import {
  builtInSortValue,
  listSortFromServer,
  nextListSort,
  serverSortFor,
  sortRows,
} from './listSort';

describe('server sort mapping', () => {
  it('sends a column the server can order by through the URL', () => {
    expect(serverSortFor({ key: 'name', direction: 'asc' })).toBe('name_asc');
    expect(serverSortFor({ key: 'size', direction: 'desc' })).toBe('size_desc');
    expect(serverSortFor({ key: 'created', direction: 'desc' })).toBe('created_desc');
  });

  it('sorts every server-ordered column both ways, technical ones included', () => {
    expect(serverSortFor({ key: 'size', direction: 'asc' })).toBe('size_asc');
    expect(serverSortFor({ key: 'duration', direction: 'asc' })).toBe('duration_asc');
    expect(serverSortFor({ key: 'kind', direction: 'asc' })).toBe('format_asc');
    expect(serverSortFor({ key: 'dimensions', direction: 'desc' })).toBe('resolution_desc');
    expect(serverSortFor({ key: 'frameRate', direction: 'asc' })).toBe('frame_rate_asc');
    expect(serverSortFor({ key: 'comments', direction: 'desc' })).toBe('comments_desc');
  });

  it('keeps a column the server cannot order on the client', () => {
    expect(serverSortFor({ key: 'field-id', direction: 'desc' })).toBeNull();
    expect(serverSortFor({ key: 'uploader', direction: 'asc' })).toBeNull();
  });

  it('reads the URL sort back as a column, and nothing for non-column sorts', () => {
    expect(listSortFromServer('updated_desc')).toEqual({ key: 'updated', direction: 'desc' });
    expect(listSortFromServer('name_desc')).toEqual({ key: 'name', direction: 'desc' });
    expect(listSortFromServer('frame_rate_asc')).toEqual({ key: 'frameRate', direction: 'asc' });
    expect(listSortFromServer('most_used')).toBeNull();
    expect(listSortFromServer('field_asc')).toBeNull();
  });
});

describe('nextListSort', () => {
  it('starts text ascending and numbers/dates descending', () => {
    expect(nextListSort(null, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextListSort(null, 'size')).toEqual({ key: 'size', direction: 'desc' });
  });

  it('flips direction on a second click of the same column', () => {
    expect(nextListSort({ key: 'size', direction: 'desc' }, 'size')).toEqual({
      key: 'size',
      direction: 'asc',
    });
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 'a', v: 3 as number | null },
    { id: 'b', v: null },
    { id: 'c', v: 10 },
    { id: 'd', v: 3 },
  ];

  it('orders numerically both ways, ties stable, empties last', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.id)).toEqual(['a', 'd', 'c', 'b']);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('orders text with numeric awareness', () => {
    const names = [{ n: 'cut 10' }, { n: 'cut 2' }, { n: '' }];
    expect(sortRows(names, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['cut 2', 'cut 10', '']);
  });
});

describe('builtInSortValue', () => {
  const asset = {
    title: null,
    fileName: 'Hero.PNG',
    kind: 'image',
    sizeBytes: 500,
    width: 10,
    height: 20,
    durationMs: null,
    reviewStatus: 'approved',
    createdAt: '2026-01-01',
    updatedAt: '2026-02-01',
  } as unknown as MediaAsset;

  it('reads each column from the asset', () => {
    expect(builtInSortValue(asset, 'name')).toBe('hero.png');
    expect(builtInSortValue(asset, 'dimensions')).toBe(200);
    expect(builtInSortValue(asset, 'duration')).toBeNull();
    expect(builtInSortValue(asset, 'review')).toBe('approved');
  });
});
