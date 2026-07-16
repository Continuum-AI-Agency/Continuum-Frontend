import { describe, expect, it } from 'bun:test';
import type { MediaSource } from '@continuum/contracts';
import { mediaSourceSchema } from '@continuum/contracts';
import {
  buildLibraryQuery,
  CREATION_METHOD_GROUPS,
  getLibrarySortOrder,
  KIND_FILTERS,
  MEDIA_SOURCES,
  SOURCE_FILTERS,
  SOURCE_LABEL,
  toContractKind,
  toContractSource,
} from '../filters';

describe('canonical source vocabulary', () => {
  it('MEDIA_SOURCES covers every contract MediaSource value (no drift)', () => {
    const vocab = new Set(MEDIA_SOURCES.map((s) => s.value));
    for (const value of mediaSourceSchema.options as MediaSource[]) {
      expect(vocab.has(value)).toBe(true);
    }
  });

  it('includes the composited orphan-bucket sources', () => {
    const vocab = MEDIA_SOURCES.map((s) => s.value);
    expect(vocab).toContain('inspiration');
    expect(vocab).toContain('hyperframe');
    expect(vocab).toContain('chat_upload');
  });

  it("SOURCE_FILTERS leads with 'all' then the canonical sources", () => {
    expect(SOURCE_FILTERS[0]).toEqual({ value: 'all', label: 'All' });
    expect(SOURCE_FILTERS.slice(1)).toEqual(MEDIA_SOURCES);
  });

  it('SOURCE_LABEL has a label for every MediaSource', () => {
    for (const value of mediaSourceSchema.options as MediaSource[]) {
      expect(typeof SOURCE_LABEL[value]).toBe('string');
    }
  });
});

describe('browse taxonomy', () => {
  it('keeps media types as the small primary browse set', () => {
    expect(KIND_FILTERS).toEqual([
      { value: 'all', label: 'All' },
      { value: 'image', label: 'Images' },
      { value: 'video', label: 'Videos' },
      { value: 'file', label: 'Project files' },
    ]);
  });

  it('treats reels and HyperFrames as creation methods, not media types', () => {
    expect(CREATION_METHOD_GROUPS.find((group) => group.value === 'reel')?.label).toBe('Reel');
    expect(CREATION_METHOD_GROUPS.find((group) => group.value === 'hyperframe')?.label).toBe(
      'HyperFrame',
    );
    expect(KIND_FILTERS.map((option) => option.value)).not.toContain('reel');
    expect(KIND_FILTERS.map((option) => option.value)).not.toContain('hyperframe');
  });
});

describe('library sorting', () => {
  it('maps every public sort to a database column and direction', () => {
    expect(getLibrarySortOrder('created_desc')).toEqual({ column: 'created_at', ascending: false });
    expect(getLibrarySortOrder('updated_desc')).toEqual({ column: 'updated_at', ascending: false });
    expect(getLibrarySortOrder('name_asc')).toEqual({ column: 'file_name', ascending: true });
    expect(getLibrarySortOrder('name_desc')).toEqual({ column: 'file_name', ascending: false });
    expect(getLibrarySortOrder('size_desc')).toEqual({ column: 'size_bytes', ascending: false });
    expect(getLibrarySortOrder('duration_desc')).toEqual({
      column: 'duration_ms',
      ascending: false,
    });
  });
});

describe('buildLibraryQuery', () => {
  it('includes brandId always', () => {
    const sp = buildLibraryQuery({ brandId: 'brand-1' });
    expect(sp.get('brandId')).toBe('brand-1');
  });

  it("omits 'all' source and kind", () => {
    const sp = buildLibraryQuery({ brandId: 'b', source: 'all', kind: 'all' });
    expect(sp.has('source')).toBe(false);
    expect(sp.has('kind')).toBe(false);
  });

  it('sets concrete source and kind', () => {
    const sp = buildLibraryQuery({ brandId: 'b', source: 'ai_generated', kind: 'video' });
    expect(sp.get('source')).toBe('ai_generated');
    expect(sp.get('kind')).toBe('video');
  });

  it('includes collectionId, offset, and limit when provided', () => {
    const sp = buildLibraryQuery({ brandId: 'b', collectionId: 'c1', offset: 48, limit: 48 });
    expect(sp.get('collectionId')).toBe('c1');
    expect(sp.get('offset')).toBe('48');
    expect(sp.get('limit')).toBe('48');
  });

  it('omits null collectionId and undefined pagination', () => {
    const sp = buildLibraryQuery({ brandId: 'b', collectionId: null });
    expect(sp.has('collectionId')).toBe(false);
    expect(sp.has('offset')).toBe(false);
    expect(sp.has('limit')).toBe(false);
  });

  it('includes offset of 0 (number, not falsy-dropped)', () => {
    const sp = buildLibraryQuery({ brandId: 'b', offset: 0 });
    expect(sp.get('offset')).toBe('0');
  });

  it('includes a non-default sort and omits the default sort', () => {
    expect(buildLibraryQuery({ brandId: 'b', sort: 'name_asc' }).get('sort')).toBe('name_asc');
    expect(buildLibraryQuery({ brandId: 'b', sort: 'created_desc' }).has('sort')).toBe(false);
  });
});

describe('toContractSource / toContractKind', () => {
  it("drops 'all' to undefined", () => {
    expect(toContractSource('all')).toBeUndefined();
    expect(toContractKind('all')).toBeUndefined();
  });

  it('passes concrete values through', () => {
    expect(toContractSource('upload')).toBe('upload');
    expect(toContractKind('image')).toBe('image');
  });

  it('returns undefined for null/undefined', () => {
    expect(toContractSource(null)).toBeUndefined();
    expect(toContractKind(undefined)).toBeUndefined();
  });
});
