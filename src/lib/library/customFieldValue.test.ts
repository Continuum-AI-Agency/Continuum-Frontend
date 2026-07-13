import { describe, expect, it } from 'bun:test';
import { type CustomField, type CustomFieldType, customFieldSchema } from '@continuum/contracts';
import { MAX_FIELD_TEXT_LENGTH } from './customFields';
import {
  formatCustomFieldValue,
  isGroupableField,
  isValueEmpty,
  multiSelectOptionIds,
  ORPHANED_OPTION_LABEL,
  singleSelectOptionId,
  validateCustomFieldValue,
  valuesByFieldId,
} from './customFieldValue';

function makeField(
  type: CustomFieldType,
  options: { id: string; label: string }[] = [],
): CustomField {
  return customFieldSchema.parse({
    id: `field-${type}`,
    brandId: 'brand-1',
    name: type === 'date' ? 'Shoot date' : 'Rating',
    type,
    options,
    position: 0,
    isDefault: false,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  });
}

const singleSelect = makeField('single_select', [
  { id: 'r1', label: '★' },
  { id: 'r2', label: '★★' },
]);
const multiSelect = makeField('multi_select', [
  { id: 'ig', label: 'Instagram' },
  { id: 'tt', label: 'TikTok' },
]);
const text = makeField('text');
const date = makeField('date');

describe('valuesByFieldId', () => {
  it('indexes an asset’s stored values by field id', () => {
    const map = valuesByFieldId([
      { fieldId: 'a', value: 'r1' },
      { fieldId: 'b', value: ['ig'] },
      { fieldId: 'c', value: null },
    ]);
    expect(map.get('a')).toBe('r1');
    expect(map.get('b')).toEqual(['ig']);
    expect(map.get('c')).toBeNull();
    expect(map.has('missing')).toBe(false);
  });
});

describe('value narrowing', () => {
  it('reads a single_select option id and rejects the wrong shape', () => {
    expect(singleSelectOptionId('r1')).toBe('r1');
    expect(singleSelectOptionId('')).toBeNull();
    expect(singleSelectOptionId(null)).toBeNull();
    expect(singleSelectOptionId(['r1'])).toBeNull();
  });

  it('reads multi_select ids, tolerating a bare string and dropping blanks', () => {
    expect(multiSelectOptionIds(['ig', 'tt'])).toEqual(['ig', 'tt']);
    expect(multiSelectOptionIds('ig')).toEqual(['ig']);
    expect(multiSelectOptionIds(['ig', ''])).toEqual(['ig']);
    expect(multiSelectOptionIds(null)).toEqual([]);
  });

  it('treats an unset, blank, or empty-list value as empty', () => {
    expect(isValueEmpty(null)).toBe(true);
    expect(isValueEmpty('   ')).toBe(true);
    expect(isValueEmpty([])).toBe(true);
    expect(isValueEmpty(['ig'])).toBe(false);
    expect(isValueEmpty('r1')).toBe(false);
  });
});

describe('formatCustomFieldValue', () => {
  it('formats a single_select as its option LABEL, resolved from the stored id', () => {
    expect(formatCustomFieldValue(singleSelect, 'r2')).toBe('★★');
  });

  it('renders an option id the field no longer defines as orphaned, not as a crash', () => {
    expect(formatCustomFieldValue(singleSelect, 'deleted-option')).toBe(ORPHANED_OPTION_LABEL);
  });

  it('joins multi_select labels in the order the value stores them', () => {
    expect(formatCustomFieldValue(multiSelect, ['tt', 'ig'])).toBe('TikTok, Instagram');
  });

  it('formats text as the trimmed literal', () => {
    expect(formatCustomFieldValue(text, '  Spring campaign ')).toBe('Spring campaign');
  });

  it('formats a date in UTC so the picked day is the day shown', () => {
    expect(formatCustomFieldValue(date, '2026-07-12')).toBe('Jul 12, 2026');
  });

  it('passes a malformed date literal through untouched', () => {
    expect(formatCustomFieldValue(date, 'someday')).toBe('someday');
  });

  it('formats an unset value as an empty string for every type', () => {
    for (const field of [singleSelect, multiSelect, text, date]) {
      expect(formatCustomFieldValue(field, null)).toBe('');
    }
  });
});

describe('validateCustomFieldValue', () => {
  it('accepts a known single_select option id', () => {
    expect(validateCustomFieldValue(singleSelect, 'r1')).toEqual({ ok: true, value: 'r1' });
  });

  it('rejects a single_select option the field does not define', () => {
    const result = validateCustomFieldValue(singleSelect, 'nope');
    expect(result.ok).toBe(false);
  });

  it('rejects a list for a single_select', () => {
    expect(validateCustomFieldValue(singleSelect, ['r1']).ok).toBe(false);
  });

  it('accepts known multi_select ids and dedupes them', () => {
    expect(validateCustomFieldValue(multiSelect, ['ig', 'tt', 'ig'])).toEqual({
      ok: true,
      value: ['ig', 'tt'],
    });
  });

  it('rejects an unknown id anywhere in a multi_select list', () => {
    expect(validateCustomFieldValue(multiSelect, ['ig', 'nope']).ok).toBe(false);
  });

  it('normalizes every empty edit to null so "unset" has one representation', () => {
    expect(validateCustomFieldValue(multiSelect, [])).toEqual({ ok: true, value: null });
    expect(validateCustomFieldValue(text, '   ')).toEqual({ ok: true, value: null });
    expect(validateCustomFieldValue(date, '')).toEqual({ ok: true, value: null });
    expect(validateCustomFieldValue(singleSelect, null)).toEqual({ ok: true, value: null });
  });

  it('trims a text value and rejects one past the length guard', () => {
    expect(validateCustomFieldValue(text, ' hello ')).toEqual({ ok: true, value: 'hello' });
    expect(validateCustomFieldValue(text, 'x'.repeat(MAX_FIELD_TEXT_LENGTH + 1)).ok).toBe(false);
  });

  it('names the field in the failure so a panel of several fields stays legible', () => {
    const result = validateCustomFieldValue(singleSelect, 'nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(singleSelect.name);
  });

  it('accepts an ISO calendar day and rejects a date that does not exist', () => {
    expect(validateCustomFieldValue(date, '2026-07-12')).toEqual({ ok: true, value: '2026-07-12' });
    expect(validateCustomFieldValue(date, '2026-02-31').ok).toBe(false);
    expect(validateCustomFieldValue(date, '07/12/2026').ok).toBe(false);
  });
});

describe('isGroupableField', () => {
  it('allows only single_select to drive board lanes', () => {
    expect(isGroupableField(singleSelect)).toBe(true);
    expect(isGroupableField(multiSelect)).toBe(false);
    expect(isGroupableField(text)).toBe(false);
    expect(isGroupableField(date)).toBe(false);
  });
});
