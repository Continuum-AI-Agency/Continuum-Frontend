import { describe, expect, test } from 'bun:test';
import type { ApiRenderVariable } from '@continuum/contracts';
import {
  canImportRows,
  descendantsOf,
  duplicateMappedVariable,
  effectiveEncode,
  effectiveOutputIds,
  effectiveValues,
  parseClipboardRows,
  rowBreadcrumb,
  rowDepth,
  rowsFromMappedImport,
  seedRow,
  toVariableMap,
  validateRow,
} from './renderRequestRows';

const variable = (over: Partial<ApiRenderVariable>): ApiRenderVariable => ({
  key: 'headline',
  label: 'Headline',
  kind: 'text',
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  role: null,
  roleSource: null,
  charBudget: null,
  comps: [],
  sample: null,
  placement: null,
  ...over,
});

const headline = variable({ required: true, charBudget: 10, sample: 'Hola' });
const price = variable({ key: 'price', label: 'Price', kind: 'number', sample: '9.99' });
const onSale = variable({ key: 'on_sale', label: 'On sale', kind: 'boolean', sample: 'true' });
const size = variable({ key: 'size', label: 'Size', kind: 'enum', options: ['S', 'M'] });
const hero = variable({ key: 'hero', label: 'Hero', kind: 'image', required: true });
const logo = variable({
  key: 'logo',
  label: 'Logo',
  kind: 'image',
  reserved: true,
  required: true,
});
const all = [headline, price, onSale, size, hero, logo];

describe('seedRow', () => {
  test('takes the designer’s samples, typed, and never media or reserved slots', () => {
    const row = seedRow(all);
    expect(row.values).toEqual({ headline: 'Hola', price: 9.99, on_sale: true });
  });
});

describe('validateRow', () => {
  test('required text empty is an error, over budget is not', () => {
    expect(validateRow([headline], {})).toEqual({ headline: 'Required' });
    expect(validateRow([headline], { headline: 'far past the budget' })).toEqual({});
  });
  test('number, enum and colour must parse', () => {
    expect(validateRow([price], { price: 'abc' as never })).toHaveProperty('price');
    expect(validateRow([size], { size: 'XL' })).toHaveProperty('size');
    expect(validateRow([size], { size: 'M' })).toEqual({});
    const colour = variable({ key: 'c', kind: 'color' });
    expect(validateRow([colour], { c: 'magenta' })).toHaveProperty('c');
    expect(validateRow([colour], { c: '#FF00FF' })).toEqual({});
  });
  test('required media needs a pin; reserved slots are never the caller’s problem', () => {
    expect(validateRow([hero, logo], {})).toEqual({ hero: 'Pick something from the Library' });
    expect(validateRow([hero], { hero: { assetId: 'a' } })).toEqual({});
  });
});

describe('parseClipboardRows', () => {
  test('matches headers by label or key, types cells, reports the rest', () => {
    const text =
      'Label\tHeadline\tprice\tOn sale\tSize\tMystery\nA\tHi\t12.5\tyes\tM\tx\nB\t\tnope\tno\tXL\ty';
    const { rows, unmatched } = parseClipboardRows(text, all);
    expect(unmatched).toEqual(['Mystery']);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe('A');
    expect(rows[0]?.values).toEqual({ headline: 'Hi', price: 12.5, on_sale: true, size: 'M' });
    // A blank, an unparsable number and an unknown option are all "nothing", not garbage.
    expect(rows[1]?.values).toEqual({ on_sale: false });
  });
  test('comma-separated works when the header has no tab', () => {
    const { rows } = parseClipboardRows('headline,price\nHey,3', all);
    expect(rows[0]?.values).toEqual({ headline: 'Hey', price: 3 });
  });
  test('a header alone is no rows', () => {
    expect(parseClipboardRows('headline', all).rows).toEqual([]);
  });
});

describe('reviewed spreadsheet import', () => {
  test('coerces mapped scalar columns and rejects whole imports above the set cap', () => {
    const rows = rowsFromMappedImport(
      [
        {
          Name: 'Autumn offer',
          Headline: 'Hello',
          Price: '12.50',
          Hero: 'https://example.test/a.jpg',
        },
      ],
      { Headline: 'headline', Price: 'price', Hero: 'hero' },
      all,
    );
    expect(rows[0]?.label).toBe('Autumn offer');
    expect(rows[0]?.values).toEqual({ headline: 'Hello', price: 12.5 });
    expect(canImportRows(49, 1)).toBe(true);
    expect(canImportRows(49, 2)).toBe(false);
    expect(duplicateMappedVariable({ Headline: 'headline', Copy: 'headline' })).toBe('headline');
    expect(() =>
      rowsFromMappedImport(
        [{ Headline: 'A', Copy: 'B' }],
        { Headline: 'headline', Copy: 'headline' },
        all,
      ),
    ).toThrow('render_import_duplicate_mapping');
  });
});

describe('toVariableMap', () => {
  test('drops blanks and keeps typed values', () => {
    const row = seedRow([]);
    row.values = { headline: '', price: 0, on_sale: false, hero: { assetId: 'a' } };
    expect(toVariableMap(row)).toEqual({ price: 0, on_sale: false, hero: { assetId: 'a' } });
  });
});

describe('fork rows', () => {
  test('inherits through three levels, then applies clear and override in ancestry order', () => {
    const root = seedRow([], 'Campaign');
    root.values = { headline: 'Root', price: 10 };
    root.outputIds = ['square', 'story'];
    const market = seedRow([], 'Spain', root.id);
    market.values = { headline: 'Hola' };
    const offer = seedRow([], 'Sale', market.id);
    offer.clearedKeys = ['price'];
    offer.values = { on_sale: true };
    const rows = [root, market, offer];

    expect(effectiveValues(rows, offer.id)).toEqual({ headline: 'Hola', on_sale: true });
    expect(effectiveOutputIds(rows, offer.id)).toEqual(['square', 'story']);
    expect(rowDepth(rows, offer.id)).toBe(2);
    expect(rowBreadcrumb(rows, offer.id)).toEqual(['Campaign', 'Spain', 'Sale']);
  });

  test('finds every descendant without selecting unrelated branches', () => {
    const root = seedRow([], 'Root');
    const a = seedRow([], 'A', root.id);
    const a1 = seedRow([], 'A1', a.id);
    const b = seedRow([], 'B', root.id);
    expect(descendantsOf([root, a, a1, b], [a.id])).toEqual(new Set([a.id, a1.id]));
  });
});

describe('effectiveEncode', () => {
  test('a child inherits settings, overrides per leaf, clears to the template, and resets', () => {
    const root = seedRow([], 'Campaign');
    root.encode = { default: { fps: 25, audio: { sampleRate: 48000 } } };
    const market = seedRow([], 'Spain', root.id);
    market.encode = { outputs: { story: { audio: { channels: 1 } } } };
    const offer = seedRow([], 'Sale', market.id);
    const rows = [root, market, offer];

    expect(effectiveEncode(rows, offer.id)).toEqual({
      default: { fps: 25, audio: { sampleRate: 48000 } },
      outputs: { story: { audio: { channels: 1 } } },
    });

    // Clear: the inherited frame rate is blanked, so the template's applies again.
    offer.clearedEncodeKeys = { default: ['fps'] };
    offer.encode = { default: { audio: { sampleRate: 44100 } } };
    expect(effectiveEncode(rows, offer.id)).toEqual({
      default: { audio: { sampleRate: 44100 } },
      outputs: { story: { audio: { channels: 1 } } },
    });
    // The parent is untouched by the child's clear.
    expect(effectiveEncode(rows, market.id)?.default).toEqual({ fps: 25, audio: { sampleRate: 48000 } });

    // Reset: removing both the clear and the override inherits the parent again.
    offer.clearedEncodeKeys = undefined;
    offer.encode = undefined;
    expect(effectiveEncode(rows, offer.id)).toEqual(effectiveEncode(rows, market.id));
    expect(effectiveEncode([seedRow([], 'Bare')], 'missing')).toBeUndefined();
  });
});
