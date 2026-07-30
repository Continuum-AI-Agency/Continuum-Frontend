import { describe, expect, it } from 'bun:test';

import {
  type AdNamingSchemaConfig,
  adNamingSchemaConfigSchema,
  formatAdName,
  parseAdName,
  parsedAdNameSchema,
} from './adNaming';

const schema = adNamingSchemaConfigSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  brand_id: '22222222-2222-4222-8222-222222222222',
  platform: 'meta',
  delimiter: '|',
  fields: ['funnel', 'format', 'audience'],
  version: 3,
});

describe('parseAdName', () => {
  it('maps segments onto the ordered field labels when the name matches', () => {
    const parsed = parseAdName('PROSP | Video | LAL1%', schema);
    expect(parsed.matched).toBe(true);
    expect(parsed.segments).toEqual(['PROSP', 'Video', 'LAL1%']);
    expect(parsed.fields).toEqual({ funnel: 'PROSP', format: 'Video', audience: 'LAL1%' });
    expect(parsed.schema_id).toBe(schema.id);
    expect(parsed.schema_version).toBe(3);
    // the returned shape validates against the wire schema
    expect(parsedAdNameSchema.safeParse(parsed).success).toBe(true);
  });

  it('maps missing trailing segments to null and flags a mismatch', () => {
    const parsed = parseAdName('PROSP|Video', schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.fields).toEqual({ funnel: 'PROSP', format: 'Video', audience: null });
  });

  it('keeps extra segments visible but drops them from the label map', () => {
    const parsed = parseAdName('PROSP|Video|LAL1%|Extra', schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.segments).toEqual(['PROSP', 'Video', 'LAL1%', 'Extra']);
    expect(Object.keys(parsed.fields)).toEqual(['funnel', 'format', 'audience']);
  });

  it('treats an empty segment as null', () => {
    const parsed = parseAdName('PROSP||LAL1%', schema);
    expect(parsed.fields.format).toBeNull();
  });

  it('returns a single unmatched segment when the delimiter is absent', () => {
    const parsed = parseAdName('Just A Plain Name', schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.segments).toEqual(['Just A Plain Name']);
    expect(parsed.fields).toEqual({ funnel: 'Just A Plain Name', format: null, audience: null });
  });
});

describe('adNamingSchemaConfigSchema', () => {
  it('rejects an empty fields array', () => {
    const result = adNamingSchemaConfigSchema.safeParse({ ...schema, fields: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an empty delimiter', () => {
    const result = adNamingSchemaConfigSchema.safeParse({ ...schema, delimiter: '' });
    expect(result.success).toBe(false);
  });
});

// Deterministic 32-bit PRNG (mulberry32). Property coverage has to be
// reproducible, so Math.random is deliberately not used.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, pool: readonly T[]): T {
  return pool[Math.floor(random() * pool.length)];
}

function withSchema(overrides: Partial<AdNamingSchemaConfig>): AdNamingSchemaConfig {
  return { ...schema, ...overrides };
}

const DELIMITERS = ['|', '_', '-', '::', ' / ', '~', '__'] as const;

const MESSY_VALUES: readonly (string | null | undefined)[] = [
  'PROSP',
  'Video',
  'LAL1%',
  'Q4-2026',
  'hello world',
  '  padded value  ',
  'double  space',
  'tab\tseparated',
  'a|b',
  'a::b',
  'a_b',
  'a-b',
  'a / b',
  'a~b',
  '|||',
  '::',
  '   ',
  '',
  'Ünïcødé',
  '日本語 テスト',
  '🚀 launch',
  null,
  undefined,
];

const CLEAN_VALUES = ['PROSP', 'Video', 'LAL1', 'US', 'Q4', 'evergreen', 'AOV3x', '2026'] as const;

describe('formatAdName', () => {
  it('round-trips through parseAdName for every generated delimiter and field list', () => {
    const random = createRandom(0x5eed);
    const failures: string[] = [];
    const iterations = 400;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const delimiter = pick(random, DELIMITERS);
      const fieldCount = 1 + Math.floor(random() * 6);
      const fields = Array.from({ length: fieldCount }, (_unused, index) => `field_${index}`);
      const generated = withSchema({ delimiter, fields });

      const values: Record<string, string | null | undefined> = {};
      for (const field of fields) {
        // 10% of fields are omitted entirely rather than supplied as undefined.
        if (random() < 0.1) continue;
        values[field] = pick(random, MESSY_VALUES);
      }

      const formatted = formatAdName(values, generated);
      const parsed = parseAdName(formatted.name, generated);
      const context = `delimiter=${JSON.stringify(delimiter)} name=${JSON.stringify(formatted.name)}`;

      if (!parsed.matched) failures.push(`not matched: ${context}`);
      if (parsed.segments.length !== fieldCount) {
        failures.push(`segment count ${parsed.segments.length} != ${fieldCount}: ${context}`);
      }
      for (const field of fields) {
        const rendered = parsed.fields[field];
        if (rendered === null || rendered === undefined) {
          failures.push(`field ${field} came back null: ${context}`);
          continue;
        }
        if (rendered.length === 0) failures.push(`field ${field} is empty: ${context}`);
        if (rendered !== rendered.trim()) failures.push(`field ${field} not trimmed: ${context}`);
        if (rendered.includes(delimiter)) {
          failures.push(`field ${field} still carries the delimiter: ${context}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('returns already-clean values byte-for-byte through the round trip', () => {
    const random = createRandom(0xc0ffee);
    const failures: string[] = [];

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const delimiter = pick(random, DELIMITERS);
      const fieldCount = 1 + Math.floor(random() * 5);
      const fields = Array.from({ length: fieldCount }, (_unused, index) => `field_${index}`);
      const generated = withSchema({ delimiter, fields });

      const values: Record<string, string> = {};
      for (const field of fields) values[field] = pick(random, CLEAN_VALUES);

      const formatted = formatAdName(values, generated);
      const parsed = parseAdName(formatted.name, generated);

      if (formatted.missing.length > 0 || formatted.sanitized.length > 0) {
        failures.push(`clean values reported degradation: ${formatted.name}`);
      }
      for (const field of fields) {
        if (parsed.fields[field] !== values[field]) {
          failures.push(`${field}: ${String(parsed.fields[field])} != ${values[field]}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('renders one segment per schema field, in order', () => {
    const result = formatAdName({ audience: 'LAL1%', funnel: 'PROSP', format: 'Video' }, schema);
    expect(result.name).toBe('PROSP|Video|LAL1%');
    expect(result.missing).toEqual([]);
    expect(result.sanitized).toEqual([]);
    expect(parseAdName(result.name, schema).matched).toBe(true);
  });

  it('rewrites a delimiter run inside a value and reports the field', () => {
    const result = formatAdName(
      { funnel: 'PROSP', format: 'Video||Reel', audience: 'LAL1%' },
      schema,
    );
    expect(result.name).toBe('PROSP|Video-Reel|LAL1%');
    expect(result.sanitized).toEqual(['format']);
    expect(result.missing).toEqual([]);

    const parsed = parseAdName(result.name, schema);
    expect(parsed.matched).toBe(true);
    expect(parsed.fields).toEqual({ funnel: 'PROSP', format: 'Video-Reel', audience: 'LAL1%' });
  });

  it('scrubs lone delimiter characters so a multi-character delimiter cannot re-split', () => {
    // Without character-level scrubbing 'PROSP:' + '::' + ':Video' would contain
    // two '::' occurrences and split into four segments instead of three.
    const colonSchema = withSchema({ delimiter: '::' });
    const result = formatAdName(
      { funnel: 'PROSP:', format: ':Video', audience: 'LAL1%' },
      colonSchema,
    );
    expect(result.name).toBe('PROSP-::-Video::LAL1%');
    expect(result.sanitized).toEqual(['funnel', 'format']);

    const parsed = parseAdName(result.name, colonSchema);
    expect(parsed.matched).toBe(true);
    expect(parsed.segments).toEqual(['PROSP-', '-Video', 'LAL1%']);
  });

  it('substitutes the placeholder for missing, null and blank values', () => {
    const result = formatAdName({ funnel: 'PROSP', format: null, audience: '   ' }, schema);
    expect(result.name).toBe('PROSP|na|na');
    expect(result.missing).toEqual(['format', 'audience']);

    const parsed = parseAdName(result.name, schema);
    expect(parsed.fields).toEqual({ funnel: 'PROSP', format: 'na', audience: 'na' });
  });

  it('treats an absent key and an explicit undefined identically', () => {
    const absent = formatAdName({}, schema);
    const explicit = formatAdName(
      { funnel: undefined, format: undefined, audience: undefined },
      schema,
    );
    expect(absent.name).toBe('na|na|na');
    expect(absent.missing).toEqual(['funnel', 'format', 'audience']);
    expect(explicit).toEqual(absent);
  });

  it('honours a custom placeholder and normalises it like any other value', () => {
    expect(formatAdName({}, schema, { placeholder: 'TBD' }).name).toBe('TBD|TBD|TBD');
    // a placeholder carrying the delimiter is scrubbed, not trusted
    expect(formatAdName({}, schema, { placeholder: 'to|do' }).name).toBe('to-do|to-do|to-do');
    // a placeholder that normalises away falls back to the default
    expect(formatAdName({}, schema, { placeholder: '   ' }).name).toBe('na|na|na');
  });

  it('never emits an empty segment', () => {
    const result = formatAdName({ funnel: '', format: '   ', audience: '' }, schema);
    const segments = result.name.split('|');
    expect(segments).toHaveLength(3);
    expect(segments.every((segment) => segment.length > 0)).toBe(true);
  });

  it('collapses internal whitespace runs to a single underscore', () => {
    const result = formatAdName(
      { funnel: '  Prospecting  ', format: 'Story   Video', audience: 'LAL\t1%' },
      schema,
    );
    expect(result.name).toBe('Prospecting|Story_Video|LAL_1%');
    expect(result.sanitized).toEqual([]);
    expect(parseAdName(result.name, schema).matched).toBe(true);
  });

  it('picks a non-delimiter separator when the delimiter is itself an underscore', () => {
    const underscoreSchema = withSchema({ delimiter: '_' });
    const result = formatAdName(
      { funnel: 'top funnel', format: 'Story Video', audience: 'LAL 1%' },
      underscoreSchema,
    );
    expect(result.name).toBe('top-funnel_Story-Video_LAL-1%');
    expect(result.sanitized).toEqual([]);
    expect(parseAdName(result.name, underscoreSchema).matched).toBe(true);
  });

  it('keeps a value made entirely of delimiter characters as one safe segment', () => {
    const result = formatAdName({ funnel: '|||', format: '|', audience: 'LAL1%' }, schema);
    expect(result.name).toBe('-|-|LAL1%');
    expect(result.sanitized).toEqual(['funnel', 'format']);
    expect(result.missing).toEqual([]);

    const parsed = parseAdName(result.name, schema);
    expect(parsed.matched).toBe(true);
    expect(parsed.fields).toEqual({ funnel: '-', format: '-', audience: 'LAL1%' });
  });

  it('avoids the delimiter when choosing the replacement for a delimiter-only value', () => {
    const dashSchema = withSchema({ delimiter: '-' });
    const result = formatAdName({ funnel: '---', format: 'Video', audience: 'LAL1%' }, dashSchema);
    expect(result.name).toBe('_-Video-LAL1%');
    expect(parseAdName(result.name, dashSchema).matched).toBe(true);
  });

  it('preserves unicode values without tearing a surrogate pair', () => {
    const result = formatAdName(
      { funnel: 'Ünïcødé', format: '日本語 テスト', audience: '🚀🎯' },
      schema,
    );
    expect(result.name).toBe('Ünïcødé|日本語_テスト|🚀🎯');
    expect(result.sanitized).toEqual([]);

    const parsed = parseAdName(result.name, schema);
    expect(parsed.matched).toBe(true);
    expect(parsed.fields).toEqual({ funnel: 'Ünïcødé', format: '日本語_テスト', audience: '🚀🎯' });
  });

  it('returns an empty name for a schema with no fields instead of throwing', () => {
    const fieldless = withSchema({ fields: [] });
    expect(formatAdName({ funnel: 'PROSP' }, fieldless)).toEqual({
      name: '',
      missing: [],
      sanitized: [],
    });
  });

  it('does not mutate the supplied values or schema', () => {
    const values = { funnel: 'a|b', format: '  spaced  ', audience: null };
    const before = JSON.stringify({ values, schema });
    formatAdName(values, schema);
    expect(JSON.stringify({ values, schema })).toBe(before);
  });
});
