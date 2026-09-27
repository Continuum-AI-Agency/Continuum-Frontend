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
  options: { id: string; label: string; color?: string }[] = [],
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
  it('allows the one-value choices — single_select, status, user — to drive board lanes', () => {
    expect(isGroupableField(singleSelect)).toBe(true);
    expect(isGroupableField(makeField('status', [{ id: 'a', label: 'A', color: '#000000' }]))).toBe(
      true,
    );
    expect(isGroupableField(makeField('user'))).toBe(true);
    expect(isGroupableField(multiSelect)).toBe(false);
    expect(isGroupableField(text)).toBe(false);
    expect(isGroupableField(date)).toBe(false);
    expect(isGroupableField(makeField('checkbox'))).toBe(false);
  });
});

describe('the six Wave-1 field types', () => {
  const status = makeField('status', [
    { id: 'todo', label: 'To do', color: '#999999' },
    { id: 'done', label: 'Done', color: '#10b981' },
  ]);
  const rating = customFieldSchema.parse({
    ...makeField('text'),
    type: 'rating',
    options: { max: 3 },
  });
  const member = '11111111-1111-4111-8111-111111111111';

  it('formats each new type for display', () => {
    expect(formatCustomFieldValue(status, 'done')).toBe('Done');
    expect(formatCustomFieldValue(makeField('number'), 1200)).toBe('1,200');
    expect(formatCustomFieldValue(makeField('checkbox'), false)).toBe('No');
    expect(formatCustomFieldValue(rating, 2)).toBe('★★ 2/3');
    expect(formatCustomFieldValue(makeField('url'), 'https://x.test/a')).toBe('https://x.test/a');
    expect(formatCustomFieldValue(makeField('user'), member, () => 'Ada')).toBe('Ada');
    expect(formatCustomFieldValue(makeField('user'), member)).toBe('Former member');
  });

  it('validates each new type against its declared shape', () => {
    expect(validateCustomFieldValue(status, 'done')).toEqual({ ok: true, value: 'done' });
    expect(validateCustomFieldValue(status, 'nope').ok).toBe(false);
    expect(validateCustomFieldValue(makeField('number'), 3.5)).toEqual({ ok: true, value: 3.5 });
    expect(validateCustomFieldValue(makeField('number'), '3').ok).toBe(false);
    expect(validateCustomFieldValue(makeField('checkbox'), false)).toEqual({
      ok: true,
      value: false,
    });
    expect(validateCustomFieldValue(rating, 3)).toEqual({ ok: true, value: 3 });
    expect(validateCustomFieldValue(rating, 4).ok).toBe(false);
    expect(validateCustomFieldValue(rating, 0)).toEqual({ ok: true, value: null });
    expect(validateCustomFieldValue(makeField('user'), member)).toEqual({
      ok: true,
      value: member,
    });
    expect(validateCustomFieldValue(makeField('user'), 'ada').ok).toBe(false);
    expect(validateCustomFieldValue(makeField('url'), ' https://x.test ')).toEqual({
      ok: true,
      value: 'https://x.test',
    });
    expect(validateCustomFieldValue(makeField('url'), 'ftp://x').ok).toBe(false);
  });
});
