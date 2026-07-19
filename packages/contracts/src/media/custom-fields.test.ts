import { describe, expect, it } from 'bun:test';
import {
  CUSTOM_FIELD_TYPES,
  createCustomFieldRequestSchema,
  customFieldFilterSchema,
  customFieldSchema,
  DEFAULT_CUSTOM_FIELDS,
  setAssetFieldValueRequestSchema,
  smartQueryFieldFiltersSchema,
} from './custom-fields';

const BRAND = '00000000-0000-4000-8000-0000000000b2';
const ASSET = '11111111-1111-4111-8111-111111111111';
const FIELD = '22222222-2222-4222-8222-222222222222';

describe('custom field types', () => {
  it('ships exactly four types — the set a filter UI can express honestly', () => {
    expect([...CUSTOM_FIELD_TYPES]).toEqual(['single_select', 'multi_select', 'text', 'date']);
  });

  it('rejects a number field — the type does not exist', () => {
    const result = createCustomFieldRequestSchema.safeParse({
      brandId: BRAND,
      name: 'Budget',
      type: 'number',
    });
    expect(result.success).toBe(false);
  });
});

describe('createCustomFieldRequestSchema', () => {
  it('accepts a select with options', () => {
    const parsed = createCustomFieldRequestSchema.parse({
      brandId: BRAND,
      name: 'Campaign',
      type: 'single_select',
      options: [{ id: 'spring', label: 'Spring Launch' }],
    });
    expect(parsed.options?.[0]?.id).toBe('spring');
  });

  it('rejects a select with NO options — an empty dropdown is a dead field', () => {
    const result = createCustomFieldRequestSchema.safeParse({
      brandId: BRAND,
      name: 'Campaign',
      type: 'single_select',
      options: [],
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual(['options']);
  });

  it('accepts a text field with no options', () => {
    const parsed = createCustomFieldRequestSchema.parse({
      brandId: BRAND,
      name: 'Notes',
      type: 'text',
    });
    expect(parsed.type).toBe('text');
  });
});

describe('setAssetFieldValueRequestSchema', () => {
  it('accepts a single-select option id', () => {
    const parsed = setAssetFieldValueRequestSchema.parse({
      brandId: BRAND,
      assetId: ASSET,
      fieldId: FIELD,
      value: 'r5',
    });
    expect(parsed.value).toBe('r5');
  });

  it('accepts a multi-select array', () => {
    const parsed = setAssetFieldValueRequestSchema.parse({
      brandId: BRAND,
      assetId: ASSET,
      fieldId: FIELD,
      value: ['a', 'b'],
    });
    expect(parsed.value).toEqual(['a', 'b']);
  });

  it('accepts null to clear a value', () => {
    const parsed = setAssetFieldValueRequestSchema.parse({
      brandId: BRAND,
      assetId: ASSET,
      fieldId: FIELD,
      value: null,
    });
    expect(parsed.value).toBeNull();
  });
});

describe('custom field filters', () => {
  it('supports the three operators the four types can express', () => {
    for (const operator of ['any_of', 'is', 'is_empty'] as const) {
      const parsed = customFieldFilterSchema.parse({ fieldId: FIELD, operator, values: [] });
      expect(parsed.operator).toBe(operator);
    }
  });

  it('rides on the existing smart-collection query rather than a second concept', () => {
    const parsed = smartQueryFieldFiltersSchema.parse({
      source: 'upload',
      fieldFilters: [{ fieldId: FIELD, operator: 'any_of', values: ['r5'] }],
    });
    expect(parsed.fieldFilters?.[0]?.values).toEqual(['r5']);
    // Pre-existing smart-query keys must survive — old smart collections keep working.
    expect((parsed as { source?: string }).source).toBe('upload');
  });
});

describe('default fields', () => {
  it('seeds rating, usage rights and an expiry date out of the box', () => {
    expect(DEFAULT_CUSTOM_FIELDS.map((f) => f.name)).toEqual([
      'Rating',
      'Usage rights',
      'Rights expiry',
    ]);
  });

  it('every seeded select carries options, so none is dead on arrival', () => {
    for (const field of DEFAULT_CUSTOM_FIELDS) {
      if (field.type === 'single_select' || field.type === 'multi_select') {
        expect(field.options.length).toBeGreaterThan(0);
      }
    }
  });

  it('does NOT seed a status field — review_status stays first-class and audited', () => {
    expect(DEFAULT_CUSTOM_FIELDS.some((f) => /status|approv/i.test(f.name))).toBe(false);
  });
});

describe('customFieldSchema', () => {
  it('round-trips a stored field', () => {
    const parsed = customFieldSchema.parse({
      id: FIELD,
      brandId: BRAND,
      name: 'Rating',
      type: 'single_select',
      options: [{ id: 'r5', label: '★★★★★', color: null }],
      position: 0,
      isDefault: true,
      createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z',
    });
    expect(parsed.isDefault).toBe(true);
  });
});
