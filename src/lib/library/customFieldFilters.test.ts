import { describe, expect, it } from 'bun:test';
import { type CustomField, type CustomFieldType, customFieldSchema } from '@continuum/contracts';
import {
  activeFilterFor,
  clearFieldFilter,
  fieldFilterSummary,
  setLiteralFilter,
  toggleEmptyFilter,
  toggleSelectFilterValue,
} from './customFieldFilters';

function makeField(
  id: string,
  type: CustomFieldType,
  options: { id: string; label: string }[] = [],
): CustomField {
  return customFieldSchema.parse({
    id,
    brandId: 'brand-1',
    name: 'Usage rights',
    type,
    options,
    position: 0,
    isDefault: false,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  });
}

const rights = makeField('f1', 'single_select', [
  { id: 'unlimited', label: 'Unlimited' },
  { id: 'expired', label: 'Expired' },
]);
const expiry = makeField('f2', 'date');

describe('toggleSelectFilterValue', () => {
  it('adds an option, then a second, under one any_of filter', () => {
    const once = toggleSelectFilterValue([], 'f1', 'unlimited');
    expect(once).toEqual([{ fieldId: 'f1', operator: 'any_of', values: ['unlimited'] }]);
    const twice = toggleSelectFilterValue(once, 'f1', 'expired');
    expect(twice).toEqual([
      { fieldId: 'f1', operator: 'any_of', values: ['unlimited', 'expired'] },
    ]);
  });

  it('drops the filter entirely when its last option is toggled off', () => {
    const active = toggleSelectFilterValue([], 'f1', 'unlimited');
    expect(toggleSelectFilterValue(active, 'f1', 'unlimited')).toEqual([]);
  });

  it('replaces an is_empty filter on the same field rather than stacking with it', () => {
    const empty = toggleEmptyFilter([], 'f1');
    const next = toggleSelectFilterValue(empty, 'f1', 'unlimited');
    expect(next).toEqual([{ fieldId: 'f1', operator: 'any_of', values: ['unlimited'] }]);
  });

  it('leaves other fields’ filters alone and keeps chip order stable', () => {
    const filters = setLiteralFilter(
      toggleSelectFilterValue([], 'f1', 'unlimited'),
      'f2',
      '2026-07-12',
    );
    const next = toggleSelectFilterValue(filters, 'f1', 'expired');
    expect(next.map((filter) => filter.fieldId)).toEqual(['f1', 'f2']);
    expect(activeFilterFor(next, 'f2')).toEqual({
      fieldId: 'f2',
      operator: 'is',
      values: ['2026-07-12'],
    });
  });
});

describe('setLiteralFilter', () => {
  it('sets an exact-match filter and drops it on a blank literal', () => {
    const set = setLiteralFilter([], 'f2', ' 2026-07-12 ');
    expect(set).toEqual([{ fieldId: 'f2', operator: 'is', values: ['2026-07-12'] }]);
    expect(setLiteralFilter(set, 'f2', '   ')).toEqual([]);
    expect(setLiteralFilter(set, 'f2', null)).toEqual([]);
  });
});

describe('toggleEmptyFilter', () => {
  it('turns is_empty on and off', () => {
    const on = toggleEmptyFilter([], 'f1');
    expect(on).toEqual([{ fieldId: 'f1', operator: 'is_empty', values: [] }]);
    expect(toggleEmptyFilter(on, 'f1')).toEqual([]);
  });
});

describe('clearFieldFilter', () => {
  it('removes only the named field', () => {
    const filters = toggleEmptyFilter(toggleSelectFilterValue([], 'f1', 'expired'), 'f2');
    expect(clearFieldFilter(filters, 'f1')).toEqual([
      { fieldId: 'f2', operator: 'is_empty', values: [] },
    ]);
  });
});

describe('fieldFilterSummary', () => {
  it('summarizes by operator, resolving option ids to labels', () => {
    expect(fieldFilterSummary(rights, null)).toBe('');
    expect(
      fieldFilterSummary(rights, { fieldId: 'f1', operator: 'any_of', values: ['unlimited'] }),
    ).toBe('Unlimited');
    expect(
      fieldFilterSummary(rights, {
        fieldId: 'f1',
        operator: 'any_of',
        values: ['unlimited', 'expired'],
      }),
    ).toBe('2 selected');
    expect(fieldFilterSummary(rights, { fieldId: 'f1', operator: 'is_empty', values: [] })).toBe(
      'Empty',
    );
    expect(
      fieldFilterSummary(expiry, { fieldId: 'f2', operator: 'is', values: ['2026-07-12'] }),
    ).toBe('Jul 12, 2026');
  });
});
