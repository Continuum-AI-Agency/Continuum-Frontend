import { describe, expect, it } from 'bun:test';
import {
  CUSTOM_FIELD_TYPES,
  createCustomFieldRequestSchema,
  customFieldChoiceOptions,
  customFieldFilterSchema,
  customFieldSchema,
  DEFAULT_CUSTOM_FIELDS,
  MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH,
  optionsSchemaFor,
  ratingOptionsSchema,
  setAssetFieldValueRequestSchema,
  smartQueryFieldFiltersSchema,
  statusOptionsSchema,
  valueSchemaFor,
} from './custom-fields';

const BRAND = '00000000-0000-4000-8000-0000000000b2';
const ASSET = '11111111-1111-4111-8111-111111111111';
const FIELD = '22222222-2222-4222-8222-222222222222';

describe('custom field types', () => {
  it('mirrors media.custom_fields.type exactly', () => {
    expect([...CUSTOM_FIELD_TYPES]).toEqual([
      'single_select',
      'multi_select',
      'text',
      'date',
      'number',
      'checkbox',
      'rating',
      'user',
      'url',
      'status',
      'user_multi',
      'long_text',
    ]);
  });

  it('rejects a type the DB does not know', () => {
    const result = createCustomFieldRequestSchema.safeParse({
      brandId: BRAND,
      name: 'Budget',
      type: 'currency',
    });
    expect(result.success).toBe(false);
  });
});

const STATUS_OPTIONS = [
  { id: 'todo', label: 'To do', color: '#9CA3AF' },
  { id: 'done', label: 'Done', color: '#10B981' },
];

describe('field options per type', () => {
  it('accepts a status field with hex-coloured options', () => {
    const parsed = createCustomFieldRequestSchema.parse({
      brandId: BRAND,
      name: 'Stage',
      type: 'status',
      options: STATUS_OPTIONS,
    });
    expect(parsed.type).toBe('status');
  });

  it('rejects status options with a duplicate id, a named colour, or none at all', () => {
    expect(statusOptionsSchema.safeParse([STATUS_OPTIONS[0], STATUS_OPTIONS[0]]).success).toBe(
      false,
    );
    expect(statusOptionsSchema.safeParse([{ id: 'a', label: 'A', color: 'red' }]).success).toBe(
      false,
    );
    expect(statusOptionsSchema.safeParse([]).success).toBe(false);
  });

  it('accepts rating options {} and {max: 7}, refuses arrays, a default key, and max 11', () => {
    expect(ratingOptionsSchema.safeParse({}).success).toBe(true);
    expect(ratingOptionsSchema.safeParse({ max: 7 }).success).toBe(true);
    expect(ratingOptionsSchema.safeParse([]).success).toBe(false);
    expect(ratingOptionsSchema.safeParse({ max: 5, default: 3 }).success).toBe(false);
    expect(ratingOptionsSchema.safeParse({ max: 11 }).success).toBe(false);
  });

  it('creates a rating field with no options and with a max', () => {
    for (const options of [undefined, { max: 10 }]) {
      expect(
        createCustomFieldRequestSchema.safeParse({
          brandId: BRAND,
          name: 'Score',
          type: 'rating',
          options,
        }).success,
      ).toBe(true);
    }
  });

  it('refuses options on a plain type', () => {
    const result = createCustomFieldRequestSchema.safeParse({
      brandId: BRAND,
      name: 'Budget',
      type: 'number',
      options: [{ id: 'x', label: 'X' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('valueSchemaFor', () => {
  const accepts = (schema: ReturnType<typeof valueSchemaFor>, value: unknown) =>
    schema.safeParse(value).success;

  it('number takes a JSON number, never a numeric string', () => {
    expect(accepts(valueSchemaFor('number', []), 12.5)).toBe(true);
    expect(accepts(valueSchemaFor('number', []), '12.5')).toBe(false);
  });

  it('checkbox takes a boolean only', () => {
    expect(accepts(valueSchemaFor('checkbox', []), true)).toBe(true);
    expect(accepts(valueSchemaFor('checkbox', []), 'true')).toBe(false);
    expect(accepts(valueSchemaFor('checkbox', []), 1)).toBe(false);
  });

  it('rating is an integer from 1 to options.max, 5 when max is absent', () => {
    expect(accepts(valueSchemaFor('rating', { max: 7 }), 7)).toBe(true);
    expect(accepts(valueSchemaFor('rating', { max: 7 }), 8)).toBe(false);
    expect(accepts(valueSchemaFor('rating', { max: 7 }), 0)).toBe(false);
    expect(accepts(valueSchemaFor('rating', { max: 7 }), 2.5)).toBe(false);
    expect(accepts(valueSchemaFor('rating', {}), 5)).toBe(true);
    expect(accepts(valueSchemaFor('rating', {}), 6)).toBe(false);
  });

  it('status and single_select take only an id the field defines', () => {
    expect(accepts(valueSchemaFor('status', STATUS_OPTIONS), 'done')).toBe(true);
    expect(accepts(valueSchemaFor('status', STATUS_OPTIONS), 'blocked')).toBe(false);
    expect(accepts(valueSchemaFor('single_select', STATUS_OPTIONS), 'todo')).toBe(true);
    expect(accepts(valueSchemaFor('single_select', STATUS_OPTIONS), 'nope')).toBe(false);
  });

  it('multi_select takes an array of defined ids', () => {
    expect(accepts(valueSchemaFor('multi_select', STATUS_OPTIONS), ['todo', 'done'])).toBe(true);
    expect(accepts(valueSchemaFor('multi_select', STATUS_OPTIONS), ['todo', 'nope'])).toBe(false);
    expect(accepts(valueSchemaFor('multi_select', STATUS_OPTIONS), 'todo')).toBe(false);
  });

  it('url must start with http(s):// and hold no whitespace', () => {
    expect(accepts(valueSchemaFor('url', []), 'https://example.com/a')).toBe(true);
    expect(accepts(valueSchemaFor('url', []), 'example.com')).toBe(false);
    expect(accepts(valueSchemaFor('url', []), 'ftp://example.com')).toBe(false);
    expect(accepts(valueSchemaFor('url', []), 'https://a b')).toBe(false);
    expect(accepts(valueSchemaFor('url', []), `https://${'a'.repeat(2048)}`)).toBe(false);
  });

  it('user takes a uuid, date a real calendar day, text at most 2000 chars', () => {
    expect(accepts(valueSchemaFor('user', []), ASSET)).toBe(true);
    expect(accepts(valueSchemaFor('user', []), 'ana')).toBe(false);
    expect(accepts(valueSchemaFor('date', []), '2026-02-28')).toBe(true);
    expect(accepts(valueSchemaFor('date', []), '2026-02-31')).toBe(false);
    expect(accepts(valueSchemaFor('text', []), 'x'.repeat(2000))).toBe(true);
    expect(accepts(valueSchemaFor('text', []), 'x'.repeat(2001))).toBe(false);
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
    expect(parsed.options).toEqual([{ id: 'spring', label: 'Spring Launch' }]);
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

  it('accepts number and checkbox values', () => {
    for (const value of [4, true]) {
      expect(
        setAssetFieldValueRequestSchema.parse({
          brandId: BRAND,
          assetId: ASSET,
          fieldId: FIELD,
          value,
        }).value,
      ).toBe(value);
    }
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
  it('supports the three filter operators', () => {
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

describe('customFieldChoiceOptions', () => {
  it('returns the option array for selects and status, [] for rating and plain types', () => {
    const options = [{ id: 'a', label: 'A' }];
    expect(customFieldChoiceOptions({ options })).toEqual(options);
    expect(customFieldChoiceOptions({ options: { max: 7 } })).toEqual([]);
    expect(customFieldChoiceOptions({ options: {} })).toEqual([]);
    expect(customFieldChoiceOptions({ options: [] })).toEqual([]);
  });
});

describe('user_multi and long_text', () => {
  const OTHER = '33333333-3333-4333-8333-333333333333';

  it('are creatable field types', () => {
    for (const type of ['user_multi', 'long_text'] as const) {
      expect(createCustomFieldRequestSchema.safeParse({ brandId: BRAND, name: 'N', type }).success).toBe(true);
    }
    expect(customFieldSchema.shape.type.safeParse('long_text').success).toBe(true);
  });

  it('carry no options, like the database requires', () => {
    for (const type of ['user_multi', 'long_text'] as const) {
      expect(optionsSchemaFor(type).safeParse([]).success).toBe(true);
      expect(optionsSchemaFor(type).safeParse([{ id: 'a', label: 'A' }]).success).toBe(false);
    }
  });

  it('user_multi holds distinct user ids, at most 50', () => {
    const schema = valueSchemaFor('user_multi', []);
    expect(schema.safeParse([ASSET, OTHER]).success).toBe(true);
    expect(schema.safeParse([]).success).toBe(true);
    expect(schema.safeParse([ASSET, ASSET]).success).toBe(false);
    expect(schema.safeParse(['ana']).success).toBe(false);
    expect(schema.safeParse(ASSET).success).toBe(false);
    const many = Array.from(
      { length: 51 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(schema.safeParse(many).success).toBe(false);
  });

  it('long_text holds up to 20 000 characters', () => {
    const schema = valueSchemaFor('long_text', []);
    expect(schema.safeParse('y'.repeat(MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH)).success).toBe(true);
    expect(schema.safeParse('y'.repeat(MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH + 1)).success).toBe(false);
    expect(valueSchemaFor('text', []).safeParse('y'.repeat(5000)).success).toBe(false);
  });
});
