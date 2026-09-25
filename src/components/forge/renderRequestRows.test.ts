import { describe, expect, test } from 'bun:test';
import type { ApiRenderVariable } from '@continuum/contracts';
import {
  addSibling,
  applyFormats,
  applyValue,
  autoMapHeaders,
  buildTemplateCsv,
  canImportRows,
  clearKey,
  clipShortBy,
  descendantsOf,
  discardProposed,
  duplicateLabel,
  duplicateMappedVariable,
  effectiveEncode,
  effectiveOutputIds,
  effectiveValues,
  emptyHistory,
  forkLabel,
  fromRenderSetRows,
  HISTORY_LIMIT,
  IMPORT_SKIP,
  keepProposed,
  mergeSetRows,
  missingInputs,
  moveRow,
  ownChangeCount,
  parseDelimited,
  pinnedAssetIds,
  pushHistory,
  type RequestRow,
  rebaseRows,
  recordsFromTable,
  renderedRatios,
  resetKey,
  restoreRows,
  reviewSignature,
  rowBreadcrumb,
  rowDepth,
  rowFileCount,
  rowMediaOf,
  rowsFromMappedImport,
  rowsFromSuggestion,
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

describe('a video slot’s clip length', () => {
  const clip = { fromSec: 4.6667, toSec: 10, playsSec: 5.3333 };

  test('a clip short of the last second the slot plays is short by the difference', () => {
    expect(clipShortBy(clip, 6)).toBe(4);
    // A frame of slack: 9.97s of a 10s slot is the same clip, rounded.
    expect(clipShortBy(clip, 9.97)).toBeNull();
    expect(clipShortBy(clip, 12)).toBeNull();
  });

  test('says nothing when either length is unknown', () => {
    expect(clipShortBy(null, 6)).toBeNull();
    expect(clipShortBy(clip, undefined)).toBeNull();
  });

  test('a picked video keeps its stored length, or its file when none was stored', () => {
    const video = {
      kind: 'video',
      fileName: 'bg.mp4',
      signedUrl: 'https://cdn.test/bg.mp4',
    } as Parameters<typeof rowMediaOf>[0];
    expect(rowMediaOf({ ...video, durationMs: 12_500 })).toMatchObject({ durationSec: 12.5 });
    expect(rowMediaOf({ ...video, durationMs: 12_500 }).clipUrl).toBeUndefined();
    expect(rowMediaOf({ ...video, durationMs: null }).clipUrl).toBe('https://cdn.test/bg.mp4');
  });
});

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

describe('missingInputs', () => {
  test('names the required inputs left blank, never a malformed or optional one', () => {
    expect(missingInputs(all, {})).toEqual(['headline', 'hero']);
    expect(missingInputs(all, { headline: '', hero: [] })).toEqual(['headline', 'hero']);
    // Malformed is Invalid, not missing: the value is there, it is only wrong.
    const colour = variable({ key: 'c', kind: 'color', required: true });
    expect(missingInputs([colour], { c: 'magenta' })).toEqual([]);
    expect(missingInputs(all, { headline: 'Hola', hero: { assetId: 'a' } })).toEqual([]);
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

  test('pasted text maps like a sheet: by key or label, tabs or commas, quoted commas kept', () => {
    const review = (text: string) => {
      const { headers, rows } = recordsFromTable(parseDelimited(text));
      return rowsFromMappedImport(rows, autoMapHeaders(headers, all), all);
    };
    const tabbed = review('Label\tHeadline\tprice\tOn sale\tSize\tMystery\nA\tHi\t12.5\tyes\tM\tx');
    expect(tabbed.errors).toEqual([]);
    expect(tabbed.rows[0]?.label).toBe('A');
    expect(tabbed.rows[0]?.values).toEqual({
      headline: 'Hi',
      price: 12.5,
      on_sale: true,
      size: 'M',
    });
    const quoted = review('label,headline\n"A, B","Hola, mundo"');
    expect(quoted.rows[0]?.label).toBe('A, B');
    expect(quoted.rows[0]?.values).toEqual({ headline: 'Hola, mundo' });
    // What cannot be used is named, never dropped silently.
    expect(review('Name,price\nB,nope').errors).toEqual([
      { row: 0, column: 'price', message: 'Not a number' },
    ]);
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
    expect(rows[0]?.label).toBe('Base');
    expect(rows[0]?.outputIds).toEqual(['sq', 'story']);
    expect(rows[0]?.values).toEqual({
      headline: 'Hola',
      price: 9.99,
      on_sale: true,
      name_text: 'Ana, "la" jefa',
    });
  });

  /** Download → parse → auto-map → import, the path a person takes with the template. */
  const roundTrip = (contract: {
    variables: ApiRenderVariable[];
    outputs: Array<{ id: string; label: string; ratio: string | null }>;
  }) => {
    const table = parseDelimited(buildTemplateCsv(contract));
    const { headers, rows: records } = recordsFromTable(table);
    const mappings = autoMapHeaders(headers, contract.variables);
    return {
      headers,
      mappings,
      ...rowsFromMappedImport(records, mappings, contract.variables, contract.outputs),
    };
  };

  test('a variable keyed like a field never takes over that field’s column', () => {
    const brand = variable({ key: 'name', label: 'Brand name', sample: 'Acme' });
    const formats = variable({ key: 'formats', label: 'Copy formats', sample: 'long' });
    const { headers, mappings, rows, errors } = roundTrip({
      variables: [brand, formats],
      outputs: [{ id: 'sq', label: 'Square', ratio: '1:1' }],
    });
    expect(headers).toEqual([
      'Name',
      'Parent',
      'Formats',
      'Brand name',
      'Copy formats',
      'Replace ad ID',
    ]);
    expect(mappings).toMatchObject({ Name: '@name', Formats: '@formats', 'Brand name': 'name' });
    expect(errors).toEqual([]);
    expect(rows[0]?.label).toBe('Base');
    expect(rows[0]?.outputIds).toEqual(['sq']);
    expect(rows[0]?.values).toEqual({ name: 'Acme', formats: 'long' });
  });

  test('a key that is another variable’s label is a clash, so neither column is swapped', () => {
    const title = variable({ key: 'title', label: 'Headline', sample: 'Big sale' });
    const headlineKey = variable({ key: 'headline', label: 'Title', sample: 'Subtitle' });
    const { headers, rows, errors } = roundTrip({ variables: [title, headlineKey], outputs: [] });
    expect(headers).toEqual([
      'Name',
      'Parent',
      'Formats',
      'Headline (title)',
      'Title (headline)',
      'Replace ad ID',
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]?.values).toEqual({ title: 'Big sale', headline: 'Subtitle' });
    // A hand-made sheet naming the bare key still reaches the variable with that key.
    expect(autoMapHeaders(['headline', 'title'], [title, headlineKey])).toEqual({
      headline: 'headline',
      title: 'title',
    });
  });

  test('a label padded with spaces still maps its own column', () => {
    const padded = variable({ key: 'cta', label: ' Call to action ', sample: 'Buy' });
    const { headers, rows, errors } = roundTrip({ variables: [padded], outputs: [] });
    expect(headers).toContain('Call to action');
    expect(errors).toEqual([]);
    expect(rows[0]?.values).toEqual({ cta: 'Buy' });
    expect(autoMapHeaders([' Call to action '], [padded])).toEqual({ ' Call to action ': 'cta' });
  });

  test('a media link column maps by detected type when it has one matching slot', () => {
    const image = variable({ key: 'hero', label: 'Hero asset', kind: 'image' });
    const video = variable({ key: 'clip', label: 'Motion asset', kind: 'video' });
    expect(
      autoMapHeaders(
        ['Creative URL'],
        [image, video],
        [{ 'Creative URL': 'https://cdn.example/ad.mov' }],
      ),
    ).toEqual({
      'Creative URL': 'clip',
    });
  });

  test('the Formats and variable samples are only what imports back cleanly', () => {
    const { rows, errors } = roundTrip({
      variables: [
        variable({ key: 'price', label: 'Price', kind: 'number', sample: '9,99 €' }),
        variable({ key: 'tint', label: 'Tint', kind: 'color', sample: '#abc' }),
        variable({ key: 'size', label: 'Size', kind: 'enum', options: ['S', 'M'], sample: 'XL' }),
        variable({ key: 'copy', label: 'Copy', sample: 'Hola' }),
      ],
      outputs: [
        { id: 'feed', label: 'Feed, square', ratio: '1:1' },
        { id: 'story_a', label: 'Story', ratio: '9:16' },
        { id: 'story_b', label: 'Story', ratio: '9:16' },
      ],
    });
    expect(errors).toEqual([]);
    expect(rows[0]?.outputIds).toEqual(['feed', 'story_a', 'story_b']);
    expect(rows[0]?.values).toEqual({ copy: 'Hola' });
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
    const moved = moveRow(rows, c.id, { rowId: a.id, position: 'before' }, []);
    if (!moved.ok) throw new Error(moved.reason);
    expect(labels(moved.rows)).toEqual(['C', 'C1', 'C2', 'C3', 'A', 'A1', 'A2', 'B']);
    expect(moved.rows.find((row) => row.id === c.id)?.parentId).toBeNull();
    const after = moveRow(rows, a.id, { rowId: b.id, position: 'after' }, []);
    if (!after.ok) throw new Error(after.reason);
    expect(labels(after.rows)).toEqual(['B', 'A', 'A1', 'A2', 'C', 'C1', 'C2', 'C3']);
  });

  test('drops inside a row as its last child and re-checks the moved rows', () => {
    const { a, b, rows } = tree();
    rows[3]!.check = { state: 'ready', fit: null, test: true };
    const moved = moveRow(rows, b.id, { rowId: a.id, position: 'inside' }, []);
    if (!moved.ok) throw new Error(moved.reason);
    expect(labels(moved.rows)).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1', 'C2', 'C3']);
    const movedB = moved.rows.find((row) => row.id === b.id)!;
    expect(movedB.parentId).toBe(a.id);
    expect(movedB.check.state).toBe('idle');
    expect(rowDepth(moved.rows, b.id)).toBe(1);
  });

  test('refuses a drop under its own descendant as a cycle', () => {
    const { a, a2, rows } = tree();
    expect(moveRow(rows, a.id, { rowId: a2.id, position: 'inside' }, [])).toEqual({
      ok: false,
      reason: 'cycle',
    });
    expect(moveRow(rows, a.id, { rowId: a2.id, position: 'after' }, [])).toEqual({
      ok: false,
      reason: 'cycle',
    });
    expect(moveRow(rows, a.id, { rowId: a.id, position: 'inside' }, [])).toEqual({
      ok: true,
      rows,
    });
  });

  test('refuses a drop that would end any row deeper than three levels', () => {
    const { a1, c, c3, b, rows } = tree();
    // C3 is already at depth 3; nothing may go inside it.
    expect(moveRow(rows, b.id, { rowId: c3.id, position: 'inside' }, [])).toEqual({
      ok: false,
      reason: 'depth',
    });
    // A1 carries a child, so under C (depth 1 → 2, child → 3) fits; under C3's parent it does not.
    expect(moveRow(rows, a1.id, { rowId: c.id, position: 'inside' }, []).ok).toBe(true);
    expect(moveRow(rows, a1.id, { rowId: c3.id, position: 'before' }, [])).toEqual({
      ok: false,
      reason: 'depth',
    });
  });

  test('formats follow the move: an every-format root inherits as a fork, an inheriting fork keeps its formats as a root', () => {
    const outputIds = ['sq', 'story'];
    const parent = { ...seedRow([], 'Parent'), outputIds: ['story'] };
    const everyFormat = { ...seedRow([], 'Every'), outputIds: ['story', 'sq'] };
    const picked = { ...seedRow([], 'Picked'), outputIds: ['sq'] };
    const fork = seedRow([], 'Fork', parent.id);
    const rows = [parent, everyFormat, picked, fork];
    const outputsOf = (moved: ReturnType<typeof moveRow>, id: string) => {
      if (!moved.ok) throw new Error(moved.reason);
      return {
        own: moved.rows.find((row) => row.id === id)?.outputIds,
        effective: effectiveOutputIds(moved.rows, id),
      };
    };

    expect(
      outputsOf(
        moveRow(rows, everyFormat.id, { rowId: parent.id, position: 'inside' }, outputIds),
        everyFormat.id,
      ),
    ).toEqual({ own: [], effective: ['story'] });
    // A deliberate subset is the row's own choice, and survives becoming a fork.
    expect(
      outputsOf(
        moveRow(rows, picked.id, { rowId: parent.id, position: 'inside' }, outputIds),
        picked.id,
      ),
    ).toEqual({ own: ['sq'], effective: ['sq'] });
    expect(
      outputsOf(
        moveRow(rows, fork.id, { rowId: parent.id, position: 'after' }, outputIds),
        fork.id,
      ),
    ).toEqual({ own: ['story'], effective: ['story'] });
  });

  test('order and parentage survive a render-set save and load', () => {
    const { a, b, rows } = tree();
    const moved = moveRow(rows, b.id, { rowId: a.id, position: 'inside' }, []);
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

describe('what a variation changes', () => {
  test('a fork counts the values it sets or blanks, and its own formats once', () => {
    const root = seedRow([headline, price], 'Root');
    const fork = seedRow([], 'Root · B', root.id);
    expect(ownChangeCount(fork)).toBe(0);

    fork.values = { headline: 'Hola', price: 5 };
    fork.clearedKeys = ['on_sale'];
    expect(ownChangeCount(fork)).toBe(3);

    fork.outputIds = ['square', 'story'];
    expect(ownChangeCount(fork)).toBe(4);

    // Its own output settings are one change, however many leaves they touch.
    fork.encode = { default: { fps: 25, audio: { channels: 1 } } };
    expect(ownChangeCount(fork)).toBe(5);
  });
});

describe('a row below', () => {
  const tree = () => {
    const a = { ...seedRow([], 'A'), outputIds: ['sq', 'story'] };
    const a1 = seedRow([], 'A1', a.id);
    const a2 = seedRow([], 'A2', a1.id);
    const b = seedRow([], 'B');
    return { a, a1, a2, b, rows: [a, a1, a2, b] };
  };

  test('beside a root: a new root after its whole subtree, seeded like a blank row', () => {
    const { a, rows } = tree();
    const { rows: next, added } = addSibling(rows, a.id, [headline, price], ['sq', 'story']);
    expect(next.map((row) => row.label)).toEqual(['A', 'A1', 'A2', 'Render 5', 'B']);
    expect(added).toMatchObject({
      parentId: null,
      values: { headline: 'Hola', price: 9.99 },
      outputIds: ['sq', 'story'],
    });
  });

  test('beside a variation: the same parent, after its own subtree, inheriting everything', () => {
    const { a, a1, rows } = tree();
    const { rows: next, added } = addSibling(rows, a1.id, [headline, price], ['sq', 'story']);
    expect(next.map((row) => row.label)).toEqual(['A', 'A1', 'A2', 'A · B', 'B']);
    expect(added).toMatchObject({ parentId: a.id, values: {}, clearedKeys: [], outputIds: [] });
    // The rows it was added to are untouched.
    expect(rows.map((row) => row.label)).toEqual(['A', 'A1', 'A2', 'B']);
  });
});

describe('when a review goes stale', () => {
  const reviewed = () => {
    const root = { ...seedRow([headline], 'Root'), outputIds: ['sq'] };
    const fork = seedRow([], 'Root · B', root.id);
    const solo = seedRow([headline], 'Solo');
    return { root, fork, solo, rows: [root, fork, solo] };
  };
  const signature = (rows: RequestRow[], selected: string[], revision: number | null = 3) =>
    reviewSignature(rows, selected, revision, ['sq', 'story']);

  test('picking a delivery, a check landing or a thumbnail loading leaves it current', () => {
    const { fork, rows } = reviewed();
    const before = signature(rows, [fork.id]);
    const after = rows.map((row) =>
      row.id === fork.id
        ? {
            ...row,
            delivery: {
              action: 'create' as const,
              adAccountId: 'act_1',
              campaignId: 'c1',
              adsetId: 's1',
            },
            check: { state: 'ready' as const, fit: null, test: true },
            media: { hero: { thumbnailUrl: 'https://cdn.test/hero.png' } },
          }
        : row,
    );
    expect(signature(after, [fork.id])).toBe(before);
  });

  test('any edit to any row, another selection or another set revision makes it stale', () => {
    const { root, fork, solo, rows } = reviewed();
    const before = signature(rows, [fork.id]);
    const edit = (patch: Partial<RequestRow>, id = root.id) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row));

    // The parent's edit changes what the selected fork renders.
    expect(signature(edit({ values: { headline: 'Adiós' } }), [fork.id])).not.toBe(before);
    expect(signature(edit({ label: 'Renamed' }, fork.id), [fork.id])).not.toBe(before);
    expect(signature(edit({ parentId: solo.id }, fork.id), [fork.id])).not.toBe(before);
    expect(signature(rows, [fork.id, solo.id])).not.toBe(before);
    expect(signature(rows, [fork.id], 4)).not.toBe(before);
  });
});

describe('how many files a row renders', () => {
  const output = (id: string, ratio: string | null) => ({ id, label: id, ratio });
  const threeOutputs = {
    template: { ratios: ['16:9', '1:1', '9:16'] },
    outputs: [output('wide', '16:9'), output('square', '1:1'), output('story', '9:16')],
  };
  // Template 133 publishes no outputs: its formats live only in the parse's ratios.
  const zeroOutputs = { template: { ratios: ['16:9', '1:1', '9:16'] }, outputs: [] };

  test('its picked formats, else every published one, else every ratio the template ships', () => {
    expect(renderedRatios(threeOutputs, [])).toEqual(['16:9', '1:1', '9:16']);
    expect(renderedRatios(threeOutputs, ['story', 'square'])).toEqual(['1:1', '9:16']);
    expect(renderedRatios(zeroOutputs, [])).toEqual(['16:9', '1:1', '9:16']);
    expect(rowFileCount(threeOutputs, { outputIds: ['square'] })).toBe(1);
    expect(rowFileCount(zeroOutputs, { outputIds: [] })).toBe(3);
    // A template that names no formats at all still renders one file.
    expect(rowFileCount({ template: { ratios: [] }, outputs: [] }, { outputIds: [] })).toBe(1);
  });

  test('an ad replacement swaps one creative, so it renders one file whatever it picked', () => {
    expect(
      rowFileCount(threeOutputs, { outputIds: [], delivery: { action: 'replace', adId: '1201' } }),
    ).toBe(1);
  });
});

describe('a set saved for an earlier template', () => {
  const output = (id: string) => ({ id, label: id, ratio: null, kind: 'image' as const });

  test('drops what the template no longer has, names it once, and keeps untouched rows', () => {
    const kept = { ...seedRow([headline], 'Kept'), outputIds: ['square'] };
    const stale: RequestRow = {
      ...seedRow([], 'Stale', kept.id),
      values: { headline: 'Hi', subtitle: 'Gone' },
      clearedKeys: ['subtitle'],
      outputIds: ['square', 'story'],
      encode: { outputs: { story: { fps: 30 }, square: { fps: 25 } } },
      media: { subtitle: { name: 'x' } },
      check: { state: 'ready', fit: null, test: true },
    };

    const { rows, dropped } = rebaseRows([kept, stale], {
      variables: [headline],
      outputs: [output('square')] as never,
    });

    expect(rows[0]).toBe(kept);
    expect(rows[1]).toMatchObject({
      values: { headline: 'Hi' },
      clearedKeys: [],
      outputIds: ['square'],
      encode: { outputs: { square: { fps: 25 } } },
      media: {},
      check: { state: 'idle' },
    });
    expect(dropped.sort()).toEqual(['story format', 'subtitle field']);
  });

  test('rows that still fit come back as they were, with nothing to report', () => {
    const rows = [seedRow([headline], 'Base')];
    const rebased = rebaseRows(rows, { variables: [headline], outputs: [] });
    expect(rebased.rows[0]).toBe(rows[0]);
    expect(rebased.dropped).toEqual([]);
  });
});

describe('editing many rows at once', () => {
  const root = (label: string, values: Record<string, string> = {}): RequestRow => ({
    ...seedRow([], label),
    values,
    check: { state: 'ready', fit: null, test: true },
  });

  test('applyValue copies one row’s value, leaves rows that already render it, and re-checks only changed rows', () => {
    const a = root('A', { headline: 'Summer' });
    const b = root('B', { headline: 'Winter' });
    const c = root('C', { headline: 'Summer' });
    const next = applyValue([a, b, c], 'headline', a.id, [b.id, c.id]);
    expect(next[1]).toMatchObject({ values: { headline: 'Summer' }, check: { state: 'idle' } });
    expect(next[0]).toBe(a);
    expect(next[2]).toBe(c);
  });

  test('a variation that inherits the value keeps inheriting; one that differs gets its own', () => {
    const parent = root('Parent', { headline: 'Summer' });
    const same: RequestRow = { ...seedRow([], 'Same', parent.id) };
    const other: RequestRow = { ...seedRow([], 'Other', parent.id), values: { headline: 'X' } };
    const source = root('Source', { headline: 'Summer' });
    const next = applyValue([parent, same, other, source], 'headline', source.id, [
      same.id,
      other.id,
    ]);
    expect(next[1]).toBe(same);
    // Back to inheriting the parent's equal value rather than pinning a copy of it.
    expect(next[2]).toMatchObject({ values: {}, clearedKeys: [] });
  });

  test('a blank source blanks a variation on purpose, and carries a picked image’s sidecar', () => {
    const parent = root('Parent', { headline: 'Summer' });
    const child = seedRow([], 'Child', parent.id);
    const blank = root('Blank');
    expect(applyValue([parent, child, blank], 'headline', blank.id, [child.id])[1]).toMatchObject({
      clearedKeys: ['headline'],
    });

    const pin = { assetId: '77777777-7777-4777-8777-777777777777' };
    const picked: RequestRow = {
      ...root('Picked'),
      values: { hero: pin },
      media: { hero: { name: 'hero.png' } },
    };
    const target = root('Target');
    const next = applyValue([picked, target], 'hero', picked.id, [target.id]);
    expect(next[1]).toMatchObject({ values: { hero: pin }, media: { hero: { name: 'hero.png' } } });
  });

  test('applyFormats spells out every format and skips rows already rendering them', () => {
    const a = { ...root('A'), outputIds: ['square'] };
    const b = root('B');
    const c = { ...root('C'), outputIds: ['square'] };
    const next = applyFormats([a, b, c], a.id, [b.id, c.id], ['square', 'story']);
    expect(next[1]?.outputIds).toEqual(['square']);
    expect(next[2]).toBe(c);
  });

  test('clearKey and resetKey: a root drops the value, a variation blanks it, then goes back to inheriting', () => {
    const parent = root('Parent', { headline: 'Summer' });
    const child: RequestRow = { ...seedRow([], 'Child', parent.id), values: { headline: 'Own' } };
    const cleared = clearKey([parent, child], 'headline', [parent.id, child.id]);
    expect(cleared[0]?.values).toEqual({});
    expect(cleared[1]).toMatchObject({ values: {}, clearedKeys: ['headline'] });
    const reset = resetKey(cleared, 'headline', [parent.id, child.id]);
    expect(reset[0]).toBe(cleared[0]);
    expect(reset[1]).toMatchObject({ values: {}, clearedKeys: [] });
  });
});

describe('undo history', () => {
  const rows = [seedRow([], 'A')];

  test('keystrokes in one cell within the window are one step; another cell or a gap is a new one', () => {
    let history = pushHistory(emptyHistory(), rows, 'value:a:headline', 1000);
    history = pushHistory(history, rows, 'value:a:headline', 1500);
    expect(history.past).toHaveLength(1);
    history = pushHistory(history, rows, 'value:a:price', 1600);
    expect(history.past).toHaveLength(2);
    history = pushHistory(history, rows, 'value:a:price', 3000);
    expect(history.past).toHaveLength(3);
    history = pushHistory(history, rows, null, 3001);
    history = pushHistory(history, rows, null, 3002);
    expect(history.past).toHaveLength(5);
  });

  test('keeps at most the newest HISTORY_LIMIT steps, and a new edit drops the redo stack', () => {
    let history = { ...emptyHistory(), future: [rows] };
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1)
      history = pushHistory(history, [seedRow([], String(index))], null, index);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.[0]?.label).toBe('5');
    expect(history.future).toEqual([]);
  });

  test('restoreRows keeps unchanged rows and their verdict; changed rows are checked again', () => {
    const kept: RequestRow = {
      ...seedRow([], 'Kept'),
      check: { state: 'ready', fit: null, test: true },
    };
    const edited: RequestRow = {
      ...seedRow([], 'Before'),
      check: { state: 'ready', fit: null, test: true },
    };
    const current = [{ ...kept }, { ...edited, label: 'After' }];
    const restored = restoreRows([kept, edited], current);
    expect(restored[0]).toBe(current[0]);
    expect(restored[1]).toMatchObject({ label: 'Before', check: { state: 'idle' } });
  });
});

describe('rows the AI proposed', () => {
  const kept = seedRow([], 'Kept');
  const proposed: RequestRow = { ...seedRow([], 'Proposed'), proposed: true };
  const child: RequestRow = seedRow([], 'Child', proposed.id);

  test('are never saved, and neither is anything under them', () => {
    expect(toRenderSetRows([kept, proposed, child], []).map((row) => row.label)).toEqual(['Kept']);
  });

  test('keeping a child keeps the proposed rows above it; discarding takes what is under it', () => {
    const next = keepProposed([kept, proposed, child], [child.id]);
    expect(next[1]?.proposed).toBeUndefined();
    expect(toRenderSetRows(next, []).map((row) => row.label)).toEqual([
      'Kept',
      'Proposed',
      'Child',
    ]);
    expect(discardProposed([kept, proposed, child], [proposed.id]).map((row) => row.label)).toEqual(
      ['Kept'],
    );
    // A kept row is not the AI's to take back.
    expect(discardProposed([kept], [kept.id])).toHaveLength(1);
  });
});

describe('merging two saves of one set', () => {
  const row = (id: string, label: string, parentId: string | null = null) => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    parentId: parentId ? `00000000-0000-4000-8000-00000000000${parentId}` : null,
    label,
    overrides: {},
    clearedKeys: [],
    outputIds: [],
  });
  const base = [row('1', 'A'), row('2', 'B')];

  test('edits to different rows both land, and rows added on either side are kept', () => {
    const mine = [row('1', 'A mine'), row('2', 'B'), row('3', 'C mine')];
    const theirs = [row('1', 'A'), row('2', 'B theirs'), row('4', 'D theirs')];
    expect(mergeSetRows(base, mine, theirs)?.map((item) => item.label)).toEqual([
      'A mine',
      'B theirs',
      'D theirs',
      'C mine',
    ]);
  });

  test('one row changed two ways, or a fork of a row the other side deleted, cannot merge', () => {
    expect(
      mergeSetRows(base, [row('1', 'X'), row('2', 'B')], [row('1', 'Y'), row('2', 'B')]),
    ).toBeNull();
    expect(mergeSetRows(base, [...base, row('3', 'Fork', '2')], [row('1', 'A')])).toBeNull();
  });
});

describe('a draft from the AI', () => {
  test('retains field evidence after Keep and save, and clears it with the value', () => {
    const id = '00000000-0000-4000-8000-000000000099';
    const evidence = { kind: 'document' as const,
      documentId: '33333333-3333-4333-8333-333333333333',
      name: 'offers.xlsx', excerpt: '$279', sheet: 'Offers' };
    const proposed = rowsFromSuggestion({ rows: [{ id, parentId: null, label: 'Offer',
      overrides: { headline: '$279' }, evidence: { headline: evidence } }], assets: [] }, ['square']);
    const saved = toRenderSetRows(keepProposed(proposed, [id]), ['square']);
    expect(saved[0]?.evidence?.headline).toEqual(evidence);
    expect(fromRenderSetRows(saved)[0]?.evidence?.headline).toEqual(evidence);
    expect(clearKey(fromRenderSetRows(saved), 'headline', [id])[0]?.evidence?.headline).toBeUndefined();
  });

  test('arrives proposed, roots in every format, with the picked picture’s thumbnail', () => {
    const root = '00000000-0000-4000-8000-000000000001';
    const hero = {
      id: '77777777-7777-4777-8777-777777777777',
      fileName: 'shoe.png',
      title: 'Shoe',
      width: 800,
      height: 600,
      thumbnailUrl: 'https://cdn.test/shoe.png',
    };
    const rows = rowsFromSuggestion(
      {
        rows: [
          {
            id: root,
            parentId: null,
            label: 'Base',
            overrides: { headline: 'Hi', hero: { assetId: hero.id } },
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            parentId: root,
            label: 'Coral',
            overrides: { accent: '#ff6f61' },
          },
        ],
        assets: [hero as never],
      },
      ['square', 'story'],
    );
    expect(rows[0]).toMatchObject({
      proposed: true,
      outputIds: ['square', 'story'],
      media: { hero: { w: 800, h: 600, thumbnailUrl: 'https://cdn.test/shoe.png', name: 'Shoe' } },
    });
    expect(rows[1]).toMatchObject({ proposed: true, parentId: root, outputIds: [] });
    expect(toRenderSetRows(rows, ['square', 'story'])).toEqual([]);
  });
});
