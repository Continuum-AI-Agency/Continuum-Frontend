import { describe, expect, it } from 'bun:test';
import type { CustomFieldFilter } from '@continuum/contracts';
import {
  type FieldValueSpec,
  isEmptyFieldValue,
  MAX_FIELD_TEXT_LENGTH,
  matchesFieldFilter,
  parseFieldFiltersParam,
  serializeFieldFilters,
  validateFieldValue,
} from './customFields';

const SINGLE: FieldValueSpec = {
  type: 'single_select',
  options: [
    { id: 'r1', label: '★' },
    { id: 'r2', label: '★★' },
  ],
};
const MULTI: FieldValueSpec = {
  type: 'multi_select',
  options: [
    { id: 'spring', label: 'Spring' },
    { id: 'summer', label: 'Summer' },
  ],
};
const TEXT: FieldValueSpec = { type: 'text', options: [] };
const DATE: FieldValueSpec = { type: 'date', options: [] };

function reason(field: FieldValueSpec, value: unknown): string {
  const check = validateFieldValue(field, value);
  if (check.ok) throw new Error(`expected ${JSON.stringify(value)} to be rejected`);
  return check.reason;
}

function accepted(field: FieldValueSpec, value: unknown) {
  const check = validateFieldValue(field, value);
  if (!check.ok)
    throw new Error(`expected ${JSON.stringify(value)} to be accepted: ${check.reason}`);
  return check.value;
}

describe('validateFieldValue — single_select', () => {
  it('accepts an option the field defines', () => {
    expect(accepted(SINGLE, 'r2')).toBe('r2');
  });

  it('rejects an option id the field does not define', () => {
    expect(reason(SINGLE, 'r9')).toContain('not an option');
  });

  it('rejects an array — a single_select holds one id, not a list', () => {
    expect(reason(SINGLE, ['r1'])).toContain('single option id');
  });

  it('rejects a non-string scalar', () => {
    expect(reason(SINGLE, 3)).toContain('single option id');
  });

  it('normalizes the empty string to a cleared value', () => {
    expect(accepted(SINGLE, '')).toBeNull();
  });
});

describe('validateFieldValue — multi_select', () => {
  it('accepts a list of defined option ids', () => {
    expect(accepted(MULTI, ['spring', 'summer'])).toEqual(['spring', 'summer']);
  });

  it('dedupes repeated ids', () => {
    expect(accepted(MULTI, ['spring', 'spring'])).toEqual(['spring']);
  });

  it('rejects the list when any id is undefined on the field', () => {
    expect(reason(MULTI, ['spring', 'winter'])).toContain('not an option');
  });

  it('rejects a bare string — even a valid option id — as the wrong shape', () => {
    expect(reason(MULTI, 'spring')).toContain('array of option ids');
  });

  it('rejects non-string entries', () => {
    expect(reason(MULTI, ['spring', 7])).toContain('strings');
  });

  it('normalizes an empty array to a cleared value', () => {
    expect(accepted(MULTI, [])).toBeNull();
  });
});

describe('validateFieldValue — text', () => {
  it('accepts and trims text', () => {
    expect(accepted(TEXT, '  shot in Lisbon  ')).toBe('shot in Lisbon');
  });

  it('rejects a non-string', () => {
    expect(reason(TEXT, ['a'])).toContain('text');
  });

  it('rejects text past the cap', () => {
    expect(reason(TEXT, 'x'.repeat(MAX_FIELD_TEXT_LENGTH + 1))).toContain('longer than');
  });

  it('normalizes whitespace-only text to a cleared value', () => {
    expect(accepted(TEXT, '   ')).toBeNull();
  });
});

describe('validateFieldValue — date', () => {
  it('accepts an ISO calendar date', () => {
    expect(accepted(DATE, '2026-07-12')).toBe('2026-07-12');
  });

  it('rejects a word', () => {
    expect(reason(DATE, 'banana')).toContain('not a valid ISO date');
  });

  it('rejects a day that is not on the calendar', () => {
    expect(reason(DATE, '2026-02-31')).toContain('not a valid ISO date');
  });

  it('rejects a month that does not exist', () => {
    expect(reason(DATE, '2026-13-01')).toContain('not a valid ISO date');
  });

  it('rejects a full timestamp — the column stores a day', () => {
    expect(reason(DATE, '2026-07-12T10:00:00Z')).toContain('not a valid ISO date');
  });

  it('rejects a number', () => {
    expect(reason(DATE, 20260712)).toContain('ISO date');
  });
});

describe('validateFieldValue — clearing', () => {
  it('null clears every type', () => {
    for (const field of [SINGLE, MULTI, TEXT, DATE]) {
      expect(accepted(field, null)).toBeNull();
    }
  });
});

describe('isEmptyFieldValue', () => {
  it('treats null, blank text, and the empty list as empty', () => {
    expect(isEmptyFieldValue(null)).toBe(true);
    expect(isEmptyFieldValue('  ')).toBe(true);
    expect(isEmptyFieldValue([])).toBe(true);
  });

  it('treats any held value as filled', () => {
    expect(isEmptyFieldValue('r1')).toBe(false);
    expect(isEmptyFieldValue(['spring'])).toBe(false);
  });
});

describe('matchesFieldFilter', () => {
  const anyOf = (values: string[]): CustomFieldFilter => ({
    fieldId: 'f1',
    operator: 'any_of',
    values,
  });

  it('any_of overlaps a single_select value', () => {
    expect(matchesFieldFilter('r1', anyOf(['r1', 'r2']))).toBe(true);
    expect(matchesFieldFilter('r3', anyOf(['r1', 'r2']))).toBe(false);
  });

  it('any_of overlaps a multi_select value', () => {
    expect(matchesFieldFilter(['winter', 'summer'], anyOf(['summer']))).toBe(true);
    expect(matchesFieldFilter(['winter'], anyOf(['summer']))).toBe(false);
  });

  it('any_of with no values matches nothing', () => {
    expect(matchesFieldFilter('r1', anyOf([]))).toBe(false);
  });

  it('is compares the scalar exactly', () => {
    const filter: CustomFieldFilter = { fieldId: 'f1', operator: 'is', values: ['2026-07-12'] };
    expect(matchesFieldFilter('2026-07-12', filter)).toBe(true);
    expect(matchesFieldFilter('2026-07-13', filter)).toBe(false);
    expect(matchesFieldFilter(['2026-07-12'], filter)).toBe(false);
  });

  it('is_empty matches a row that holds nothing', () => {
    const filter: CustomFieldFilter = { fieldId: 'f1', operator: 'is_empty', values: [] };
    expect(matchesFieldFilter(null, filter)).toBe(true);
    expect(matchesFieldFilter('r1', filter)).toBe(false);
  });
});

describe('parseFieldFiltersParam', () => {
  it('round-trips serialized filters', () => {
    const filters: CustomFieldFilter[] = [{ fieldId: 'f1', operator: 'any_of', values: ['r1'] }];
    const parsed = parseFieldFiltersParam(serializeFieldFilters(filters));
    expect(parsed).toEqual({ ok: true, filters });
  });

  it('defaults a missing values list to empty', () => {
    const parsed = parseFieldFiltersParam('[{"fieldId":"f1","operator":"is_empty"}]');
    expect(parsed.ok && parsed.filters[0]?.values).toEqual([]);
  });

  it('treats an absent param as no filters', () => {
    expect(parseFieldFiltersParam(null)).toEqual({ ok: true, filters: [] });
  });

  it('rejects malformed JSON rather than silently widening the result set', () => {
    expect(parseFieldFiltersParam('{not json').ok).toBe(false);
  });

  it('rejects an unknown operator', () => {
    expect(parseFieldFiltersParam('[{"fieldId":"f1","operator":"greater_than"}]').ok).toBe(false);
  });
});
