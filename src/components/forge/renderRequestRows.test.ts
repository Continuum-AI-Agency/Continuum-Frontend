import { describe, expect, test } from 'bun:test';
import type { ApiRenderVariable } from '@continuum/contracts';
import { parseClipboardRows, seedRow, toVariableMap, validateRow } from './renderRequestRows';

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

describe('toVariableMap', () => {
  test('drops blanks and keeps typed values', () => {
    const row = seedRow([]);
    row.values = { headline: '', price: 0, on_sale: false, hero: { assetId: 'a' } };
    expect(toVariableMap(row)).toEqual({ price: 0, on_sale: false, hero: { assetId: 'a' } });
  });
});
