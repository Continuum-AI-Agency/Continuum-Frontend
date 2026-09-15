import { describe, expect, test } from 'bun:test';
import type { ApiRenderVariable } from '@continuum/contracts';
import {
  autoMapHeaders,
  buildTemplateCsv,
  canImportRows,
  descendantsOf,
  duplicateLabel,
  duplicateMappedVariable,
  effectiveEncode,
  effectiveOutputIds,
  effectiveValues,
  forkLabel,
  fromRenderSetRows,
  IMPORT_SKIP,
  moveRow,
  parseClipboardRows,
  parseDelimited,
  pinnedAssetIds,
  type RequestRow,
  recordsFromTable,
  rowBreadcrumb,
  rowDepth,
  rowsFromMappedImport,
  seedRow,
  toCsv,
  toPreflightDelivery,
  toRenderSetRows,
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
  test('coerces mapped columns and rejects whole imports above the set cap', () => {
    const { rows, errors } = rowsFromMappedImport(
      [{ Name: 'Autumn offer', Headline: 'Hello', Price: '12.50' }],
      { Name: '@name', Headline: 'headline', Price: 'price' },
      all,
    );
    expect(errors).toEqual([]);
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

  test('Parent makes forks after every row exists, Formats take labels or ratios, ad ids replace', () => {
    const outputs = [
      { id: 'wide', label: 'Landscape', ratio: '16:9' },
      { id: 'story', label: 'Story', ratio: '9:16' },
    ];
    const assetId = '11111111-1111-4111-8111-111111111111';
    const source = [
      { Name: 'Spain', Parent: 'Campaign', Formats: '9:16', Hero: assetId, 'Ad id': '' },
      { Name: 'Campaign', Parent: '', Formats: 'Landscape, 9:16', Hero: '', 'Ad id': '' },
      { Name: 'Sale', Parent: 'spain', Formats: '', Hero: '', 'Ad id': ' 238500 ' },
    ];
    const mappings = autoMapHeaders(Object.keys(source[0]!), all);
    expect(mappings).toEqual({
      Name: '@name',
      Parent: '@parent',
      Formats: '@formats',
      Hero: 'hero',
      'Ad id': '@replaceAdId',
    });
    const { rows, errors } = rowsFromMappedImport(source, mappings, all, outputs);
    expect(errors).toEqual([]);
    const [spain, campaign, sale] = rows as [RequestRow, RequestRow, RequestRow];
    expect(spain.parentId).toBe(campaign.id);
    expect(sale.parentId).toBe(spain.id);
    expect(campaign.outputIds).toEqual(['wide', 'story']);
    expect(spain.outputIds).toEqual(['story']);
    expect(spain.values.hero).toEqual({ assetId });
    expect(sale.delivery).toEqual({ action: 'replace', adId: '238500' });
    expect(pinnedAssetIds(rows)).toEqual([assetId]);
  });

  test('every cell that cannot be used is named by row and column', () => {
    const { errors } = rowsFromMappedImport(
      [
        {
          Name: 'A',
          Parent: 'Nobody',
          Price: 'cheap',
          Size: 'XL',
          Hero: 'photo.jpg',
          Formats: '4:5',
        },
        { Name: 'B', Parent: 'B', Price: '', Size: '', Hero: '', Formats: '' },
      ],
      {
        Name: '@name',
        Parent: '@parent',
        Price: 'price',
        Size: 'size',
        Hero: 'hero',
        Formats: '@formats',
      },
      all,
      [{ id: 'sq', label: 'Square', ratio: '1:1' }],
    );
    expect(errors).toEqual([
      { row: 0, column: 'Price', message: 'Not a number' },
      { row: 0, column: 'Size', message: 'Not one of: S, M' },
      { row: 0, column: 'Hero', message: 'Not a Library asset id' },
      { row: 0, column: 'Formats', message: 'Unknown format: 4:5' },
      { row: 0, column: 'Parent', message: 'No row is named Nobody' },
      { row: 1, column: 'Parent', message: 'A row cannot be its own parent' },
    ]);
  });

  test('a fork chain past the depth cap is an error on the row that breaks it', () => {
    const names = ['L0', 'L1', 'L2', 'L3', 'L4'];
    const { errors } = rowsFromMappedImport(
      names.map((name, index) => ({ Name: name, Parent: index ? names[index - 1]! : '' })),
      { Name: '@name', Parent: '@parent' },
      all,
    );
    expect(errors).toEqual([
      { row: 4, column: 'Parent', message: 'Forks go at most 3 levels deep' },
    ]);
  });
});

describe('CSV', () => {
  test('parses quotes, escaped quotes, CRLF and newlines inside quotes', () => {
    expect(
      parseDelimited('\uFEFFName,Headline\r\n"Sale, big","Say ""hi""\nthere"\r\n\r\n'),
    ).toEqual([
      ['Name', 'Headline'],
      ['Sale, big', 'Say "hi"\nthere'],
    ]);
    expect(parseDelimited('a\tb\n1,5\t2')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
  });

  test('a pasted quoted cell keeps its comma', () => {
    const { rows } = parseClipboardRows('label,headline\n"A, B","Hola, mundo"', all);
    expect(rows[0]?.label).toBe('A, B');
    expect(rows[0]?.values).toEqual({ headline: 'Hola, mundo' });
  });

  test('the template spreadsheet round-trips into the rows it describes', () => {
    const clash = variable({ key: 'name_text', label: 'Name', sample: 'Ana, "la" jefa' });
    const contract = {
      variables: [...all, clash],
      outputs: [
        { id: 'sq', label: 'Square', ratio: '1:1' },
        { id: 'story', label: 'Story', ratio: '9:16' },
      ],
    };
    const csv = buildTemplateCsv(contract);
    const table = parseDelimited(csv);
    expect(table[0]).toEqual([
      'Name',
      'Parent',
      'Formats',
      'Headline',
      'Price',
      'On sale',
      'Size',
      'Hero',
      'Name (name_text)',
      'Replace ad ID',
    ]);
    expect(toCsv(table)).toBe(csv);
    const { headers, rows: records } = recordsFromTable(table);
    const mappings = autoMapHeaders(headers, contract.variables);
    expect(Object.values(mappings)).not.toContain(IMPORT_SKIP);
    const { rows, errors } = rowsFromMappedImport(
      records,
      mappings,
      contract.variables,
      contract.outputs,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('Root');
    expect(rows[0]?.outputIds).toEqual(['sq', 'story']);
    expect(rows[0]?.values).toEqual({
      headline: 'Hola',
      price: 9.99,
      on_sale: true,
      name_text: 'Ana, "la" jefa',
    });
  });
});

describe('names, order and parentage', () => {
  test('forks are named after their parent with the next free letter; duplicates say copy', () => {
    const root = seedRow([], 'Summer');
    const b = seedRow([], forkLabel([root], root.id), root.id);
    expect(b.label).toBe('Summer · B');
    const c = seedRow([], forkLabel([root, b], root.id), root.id);
    expect(c.label).toBe('Summer · C');
    b.label = 'Renamed';
    expect(forkLabel([root, b, c], root.id)).toBe('Summer · B');
    expect(duplicateLabel('Summer')).toBe('Summer copy');
  });

  const tree = () => {
    const a = seedRow([], 'A');
    const a1 = seedRow([], 'A1', a.id);
    const a2 = seedRow([], 'A2', a1.id);
    const b = seedRow([], 'B');
    const c = seedRow([], 'C');
    const c1 = seedRow([], 'C1', c.id);
    const c2 = seedRow([], 'C2', c1.id);
    const c3 = seedRow([], 'C3', c2.id);
    return { a, a1, a2, b, c, c1, c2, c3, rows: [a, a1, a2, b, c, c1, c2, c3] };
  };
  const labels = (rows: RequestRow[]) => rows.map((row) => row.label);

  test('reorders siblings, carrying the subtree', () => {
    const { a, b, c, rows } = tree();
    const moved = moveRow(rows, c.id, { rowId: a.id, position: 'before' });
    if (!moved.ok) throw new Error(moved.reason);
    expect(labels(moved.rows)).toEqual(['C', 'C1', 'C2', 'C3', 'A', 'A1', 'A2', 'B']);
    expect(moved.rows.find((row) => row.id === c.id)?.parentId).toBeNull();
    const after = moveRow(rows, a.id, { rowId: b.id, position: 'after' });
    if (!after.ok) throw new Error(after.reason);
    expect(labels(after.rows)).toEqual(['B', 'A', 'A1', 'A2', 'C', 'C1', 'C2', 'C3']);
  });

  test('drops inside a row as its last child and re-checks the moved rows', () => {
    const { a, b, rows } = tree();
    rows[3]!.check = { state: 'ready', fit: null, test: true };
    const moved = moveRow(rows, b.id, { rowId: a.id, position: 'inside' });
    if (!moved.ok) throw new Error(moved.reason);
    expect(labels(moved.rows)).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1', 'C2', 'C3']);
    const movedB = moved.rows.find((row) => row.id === b.id)!;
    expect(movedB.parentId).toBe(a.id);
    expect(movedB.check.state).toBe('idle');
    expect(rowDepth(moved.rows, b.id)).toBe(1);
  });

  test('refuses a drop under its own descendant as a cycle', () => {
    const { a, a2, rows } = tree();
    expect(moveRow(rows, a.id, { rowId: a2.id, position: 'inside' })).toEqual({
      ok: false,
      reason: 'cycle',
    });
    expect(moveRow(rows, a.id, { rowId: a2.id, position: 'after' })).toEqual({
      ok: false,
      reason: 'cycle',
    });
    expect(moveRow(rows, a.id, { rowId: a.id, position: 'inside' })).toEqual({ ok: true, rows });
  });

  test('refuses a drop that would end any row deeper than three levels', () => {
    const { a1, c, c3, b, rows } = tree();
    // C3 is already at depth 3; nothing may go inside it.
    expect(moveRow(rows, b.id, { rowId: c3.id, position: 'inside' })).toEqual({
      ok: false,
      reason: 'depth',
    });
    // A1 carries a child, so under C (depth 1 → 2, child → 3) fits; under C3's parent it does not.
    expect(moveRow(rows, a1.id, { rowId: c.id, position: 'inside' }).ok).toBe(true);
    expect(moveRow(rows, a1.id, { rowId: c3.id, position: 'before' })).toEqual({
      ok: false,
      reason: 'depth',
    });
  });

  test('order and parentage survive a render-set save and load', () => {
    const { a, b, rows } = tree();
    const moved = moveRow(rows, b.id, { rowId: a.id, position: 'inside' });
    if (!moved.ok) throw new Error(moved.reason);
    moved.rows[0]!.delivery = { action: 'replace', adId: 'pending' };
    const saved = toRenderSetRows(moved.rows, ['sq']);
    expect(saved[0]?.outputIds).toEqual(['sq']);
    expect(saved[0]).not.toHaveProperty('delivery');
    expect(toPreflightDelivery(moved.rows[0]!.delivery)).toEqual({
      action: 'replace',
      adId: 'pending',
      adAccountId: '',
      campaignId: '',
      adsetId: '',
    });
    const loaded = fromRenderSetRows(saved);
    expect(labels(loaded)).toEqual(labels(moved.rows));
    expect(loaded.map((row) => row.parentId)).toEqual(moved.rows.map((row) => row.parentId));
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
    expect(effectiveEncode(rows, market.id)?.default).toEqual({
      fps: 25,
      audio: { sampleRate: 48000 },
    });

    // Reset: removing both the clear and the override inherits the parent again.
    offer.clearedEncodeKeys = undefined;
    offer.encode = undefined;
    expect(effectiveEncode(rows, offer.id)).toEqual(effectiveEncode(rows, market.id));
    expect(effectiveEncode([seedRow([], 'Bare')], 'missing')).toBeUndefined();
  });
});
