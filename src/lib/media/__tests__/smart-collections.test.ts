import { describe, expect, it } from 'bun:test';
import { resolveSmartQueryFilter } from '../smart-collections';

describe('resolveSmartQueryFilter — the pre-existing format', () => {
  it('still resolves a smart_query that only carries source and kind', () => {
    expect(resolveSmartQueryFilter({ source: 'ai_generated', kind: 'video' })).toEqual({
      source: 'ai_generated',
      kind: 'video',
    });
  });

  it('ignores unknown keys and junk values', () => {
    expect(resolveSmartQueryFilter({ source: 'nonsense', kind: 'image', whatever: 1 })).toEqual({
      kind: 'image',
    });
  });

  it('treats a null or non-object smart_query as no filter', () => {
    expect(resolveSmartQueryFilter(null)).toEqual({});
    expect(resolveSmartQueryFilter(undefined)).toEqual({});
  });
});

describe('resolveSmartQueryFilter — saved field filters', () => {
  it('carries fieldFilters through', () => {
    const smartQuery = {
      kind: 'image',
      fieldFilters: [{ fieldId: 'field-1', operator: 'any_of', values: ['r5'] }],
    };
    expect(resolveSmartQueryFilter(smartQuery)).toEqual({
      kind: 'image',
      fieldFilters: [{ fieldId: 'field-1', operator: 'any_of', values: ['r5'] }],
    });
  });

  it('defaults an omitted values list, so is_empty needs no values', () => {
    const resolved = resolveSmartQueryFilter({
      fieldFilters: [{ fieldId: 'field-1', operator: 'is_empty' }],
    });
    expect(resolved.fieldFilters).toEqual([
      { fieldId: 'field-1', operator: 'is_empty', values: [] },
    ]);
  });

  it('drops a malformed saved filter rather than failing the whole collection', () => {
    const resolved = resolveSmartQueryFilter({
      source: 'upload',
      fieldFilters: [{ fieldId: 'field-1', operator: 'greater_than', values: [] }],
    });
    expect(resolved).toEqual({ source: 'upload' });
  });

  it('omits fieldFilters entirely when the saved list is empty', () => {
    expect(resolveSmartQueryFilter({ source: 'upload', fieldFilters: [] })).toEqual({
      source: 'upload',
    });
  });
});
