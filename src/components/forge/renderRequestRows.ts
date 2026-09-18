import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderDeliveryTarget,
  type ApiRenderEncodeOverride,
  type ApiRenderFitReport,
  type ApiRenderInputValue,
  type ApiRenderPreflightResponse,
  type ApiRenderTemplateContract,
  type ApiRenderVariable,
  compactEncodeBlock,
  FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH,
  type ForgeRenderSetEncodeClear,
  type ForgeRenderSetRow,
  inheritEncodeBlock,
  type MediaAsset,
  type PinnedRenderAsset,
} from '@continuum/contracts';

// One row of the render-requests grid: the wire-shaped values for one render, plus what the
// browser knows about them that the wire must never carry.
//
// `values` is exactly what `records[].variables` sends — keyed by `variable.key`, pins as
// `{assetId, versionId}`. `media` is the local sidecar for those pins (pixel size for the fit
// check, a thumbnail for the cell); `pinnedRenderAssetSchema` is strict, so it lives beside
// the value rather than inside it. `check` is the server's last word on the row, or the lack
// of one.

/** The largest batch the server signs in one token (`apiRenderBatchPreflightRequestSchema`). */
export const MAX_BATCH_ROWS = 50;

/** How long an edit settles before it is dry-run again — a row's preflight, a review's re-check. */
export const PREFLIGHT_DEBOUNCE_MS = 600;

export const canImportRows = (existingRows: number, incomingRows: number): boolean =>
  existingRows + incomingRows <= MAX_BATCH_ROWS;

export function duplicateMappedVariable(
  mappings: Record<string, string>,
  skip = '__skip__',
): string | null {
  const seen = new Set<string>();
  for (const key of Object.values(mappings)) {
    if (key === skip) continue;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

export type RequestRowCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | {
      state: 'ready';
      fit: ApiRenderFitReport | null;
      test: boolean;
      guardrails?: ApiRenderPreflightResponse['guardrails'];
    }
  | { state: 'error'; message: string; guardrails?: ApiRenderPreflightResponse['guardrails'] };

export type RequestRowMedia = {
  w?: number;
  h?: number;
  thumbnailUrl?: string | null;
  /** What the cell calls the picked asset. */
  name?: string;
};

/** What the grid keeps about a picked Library asset — none of it goes over the wire. */
export const rowMediaOf = (asset: MediaAsset): RequestRowMedia => ({
  ...(asset.width && asset.height ? { w: asset.width, h: asset.height } : {}),
  thumbnailUrl: asset.thumbnailUrl ?? asset.signedUrl ?? null,
  name: asset.title || asset.fileName,
});

/**
 * Where one row's render goes. A spreadsheet names a replace by ad id alone; pre-flight resolves
 * its account, campaign and ad set, so until then it is a pending replace the wire cannot carry.
 */
export type RequestRowDelivery = ApiRenderDeliveryTarget | { action: 'replace'; adId: string };

/** Resolved = every id the wire requires is filled; only those are saved or sent as-is. */
export const isResolvedDelivery = (
  delivery: RequestRowDelivery | undefined,
): delivery is ApiRenderDeliveryTarget =>
  delivery !== undefined &&
  'adAccountId' in delivery &&
  Boolean(delivery.adAccountId && delivery.campaignId && delivery.adsetId);

/**
 * What pre-flight is handed. A pending replace goes over with its account, campaign and ad set
 * blank — the dialog's `isUnresolvedTarget` — so the Deliver step resolves it by ad id.
 */
export function toPreflightDelivery(
  delivery: RequestRowDelivery | undefined,
): ApiRenderDeliveryTarget | undefined {
  if (!delivery || isResolvedDelivery(delivery)) return delivery;
  return { action: 'replace', adId: delivery.adId, adAccountId: '', campaignId: '', adsetId: '' };
}

export type RequestRow = {
  id: string;
  parentId: string | null;
  label: string;
  /** Only values authored on this row. Parent values are resolved at read/submit time. */
  values: Record<string, ApiRenderInputValue>;
  /** Explicitly blank inherited values. Removing both this key and an override resets to inherit. */
  clearedKeys: string[];
  /** Empty on a child means inherit the parent's formats. */
  outputIds: string[];
  /** Output settings authored on this row, by output id. Absent means inherit everything. */
  encode?: ApiRenderEncodeOverride;
  /** Inherited settings blanked back to the template. Reset removes the key from both. */
  clearedEncodeKeys?: ForgeRenderSetEncodeClear;
  /** This row's own delivery. Never inherited by forks, never copied by a duplicate. */
  delivery?: RequestRowDelivery;
  media: Record<string, RequestRowMedia>;
  check: RequestRowCheck;
  subRows?: RequestRow[];
};

export const newRowId = (): string => crypto.randomUUID();

type FormatSource = {
  template: Pick<ApiRenderTemplateContract['template'], 'ratios'>;
  outputs: Array<Pick<ApiRenderTemplateContract['outputs'][number], 'id' | 'label' | 'ratio'>>;
};

/**
 * The ratio of each file a row renders: its effective picks, else every published output. A
 * template that publishes no outputs (133's forge answers `outputs: []`) renders every ratio its
 * source ships, together — the server's rule, said before it is asked.
 */
export function renderedRatios(contract: FormatSource, outputIds: string[]): string[] {
  if (contract.outputs.length === 0) return contract.template.ratios;
  const picked = outputIds.length
    ? contract.outputs.filter((output) => outputIds.includes(output.id))
    : contract.outputs;
  return picked.map((output) => output.ratio ?? output.label);
}

/** A replace swaps one creative, so it renders one file whatever the row picked. */
export const rowFileCount = (
  contract: FormatSource,
  row: { outputIds: string[]; delivery?: { action: string } },
): number =>
  row.delivery?.action === 'replace'
    ? 1
    : Math.max(1, renderedRatios(contract, row.outputIds).length);

const isEditableScalar = (variable: ApiRenderVariable) =>
  !variable.reserved && variable.kind !== 'image' && variable.kind !== 'video';

/** A typed value from text, by the variable's kind. `undefined` means "nothing usable". */
function coerce(variable: ApiRenderVariable, raw: string): ApiRenderInputValue | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  switch (variable.kind) {
    case 'number': {
      const n = Number(text);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return /^(true|1|yes|on)$/i.test(text)
        ? true
        : /^(false|0|no|off)$/i.test(text)
          ? false
          : undefined;
    case 'enum':
      return variable.options.length === 0 || variable.options.includes(text) ? text : undefined;
    default:
      return text;
  }
}

/**
 * A row seeded from the designer's own values, so the first render is the design as authored
 * rather than a table of blanks. Media is never seeded — a pin is a Library coordinate the
 * parse cannot supply — and reserved slots are the server's to fill.
 */
export function seedRow(
  variables: ApiRenderVariable[],
  label = '',
  parentId: string | null = null,
): RequestRow {
  const values: Record<string, ApiRenderInputValue> = {};
  for (const variable of variables) {
    if (!isEditableScalar(variable) || variable.sample === null) continue;
    const value = coerce(variable, variable.sample);
    if (value !== undefined) values[variable.key] = value;
  }
  return {
    id: newRowId(),
    parentId,
    label,
    values,
    clearedKeys: [],
    outputIds: [],
    media: {},
    check: { state: 'idle' },
  };
}

export function rowDepth(rows: RequestRow[], id: string): number {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let depth = 0;
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row?.parentId) {
    if (seen.has(row.id)) return Number.POSITIVE_INFINITY;
    seen.add(row.id);
    depth += 1;
    row = byId.get(row.parentId);
  }
  return row ? depth : Number.POSITIVE_INFINITY;
}

export function rowBreadcrumb(rows: RequestRow[], id: string): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const labels: string[] = [];
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    labels.unshift(row.label || 'Untitled');
    row = row.parentId ? byId.get(row.parentId) : undefined;
  }
  return labels;
}

export function rootRowId(rows: RequestRow[], id: string): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row?.parentId && !seen.has(row.id)) {
    seen.add(row.id);
    row = byId.get(row.parentId);
  }
  return row?.id ?? id;
}

export function descendantsOf(rows: RequestRow[], ids: Iterable<string>): Set<string> {
  const found = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId && found.has(row.parentId) && !found.has(row.id)) {
        found.add(row.id);
        changed = true;
      }
    }
  }
  return found;
}

export function effectiveValues(
  rows: RequestRow[],
  id: string,
): Record<string, ApiRenderInputValue> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: RequestRow[] = [];
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    chain.unshift(row);
    row = row.parentId ? byId.get(row.parentId) : undefined;
  }
  const values: Record<string, ApiRenderInputValue> = {};
  for (const item of chain) {
    for (const key of item.clearedKeys) delete values[key];
    Object.assign(values, item.values);
  }
  return values;
}

export function effectiveMedia(rows: RequestRow[], id: string): Record<string, RequestRowMedia> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: RequestRow[] = [];
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    chain.unshift(row);
    row = row.parentId ? byId.get(row.parentId) : undefined;
  }
  const media: Record<string, RequestRowMedia> = {};
  for (const item of chain) {
    for (const key of item.clearedKeys) delete media[key];
    Object.assign(media, item.media);
  }
  return media;
}

export function effectiveOutputIds(rows: RequestRow[], id: string): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let row = byId.get(id);
  const seen = new Set<string>();
  while (row && !seen.has(row.id)) {
    if (row.outputIds.length > 0) return row.outputIds;
    seen.add(row.id);
    row = row.parentId ? byId.get(row.parentId) : undefined;
  }
  return [];
}

/** The settings a row renders with: its ancestry's, then its own clears and overrides. */
export function effectiveEncode(
  rows: RequestRow[],
  id: string,
): ApiRenderEncodeOverride | undefined {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: RequestRow[] = [];
  for (let row = byId.get(id); row && !chain.includes(row); ) {
    chain.unshift(row);
    row = row.parentId ? byId.get(row.parentId) : undefined;
  }
  return chain.reduce<ApiRenderEncodeOverride | undefined>(inheritEncodeBlock, undefined);
}

export function nestRows(rows: RequestRow[]): RequestRow[] {
  const children = new Map<string | null, RequestRow[]>();
  for (const row of rows) {
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  const visit = (row: RequestRow): RequestRow => ({
    ...row,
    subRows: (children.get(row.id) ?? []).map(visit),
  });
  return (children.get(null) ?? []).map(visit);
}

const pinCount = (value: ApiRenderInputValue | undefined): number =>
  value === undefined ? 0 : Array.isArray(value) ? value.length : typeof value === 'object' ? 1 : 0;

/** Nothing filled in: no pin for a media slot, no text or number for the rest. */
export const isEmptyInput = (
  variable: ApiRenderVariable,
  value: ApiRenderInputValue | undefined,
): boolean =>
  variable.kind === 'image' || variable.kind === 'video'
    ? pinCount(value) === 0
    : value === undefined || value === '';

/** Required inputs a row leaves blank. Not wrong, only not filled in yet: "Needs input". */
export const missingInputs = (
  variables: ApiRenderVariable[],
  values: Record<string, ApiRenderInputValue>,
): string[] =>
  variables
    .filter(
      (variable) =>
        variable.required && !variable.reserved && isEmptyInput(variable, values[variable.key]),
    )
    .map((variable) => variable.key);

/**
 * What the server would refuse, said per cell before it is asked.
 *
 * The char budget is deliberately NOT here: past it the type shrinks or overflows, it does not
 * fail, and the counter in the cell already says so. Only things that cannot render are errors.
 */
export function validateRow(
  variables: ApiRenderVariable[],
  values: Record<string, ApiRenderInputValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.reserved) continue;
    const value = values[variable.key];
    const empty = isEmptyInput(variable, value);
    if (variable.kind === 'image' || variable.kind === 'video') {
      if (variable.required && empty) errors[variable.key] = 'Pick something from the Library';
      else if (pinCount(value) > (variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1))
        errors[variable.key] = variable.multiple
          ? `At most ${API_RENDER_MEDIA_LIST_MAX} items`
          : 'One item only';
      continue;
    }
    if (empty) {
      if (variable.required) errors[variable.key] = 'Required';
      continue;
    }
    if (variable.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
      errors[variable.key] = 'Not a number';
    else if (
      variable.kind === 'enum' &&
      variable.options.length > 0 &&
      !variable.options.includes(String(value))
    )
      errors[variable.key] = 'Not one of the options';
    else if (variable.kind === 'color' && !/^#?[0-9A-Fa-f]{6}$/.test(String(value)))
      errors[variable.key] = 'Not a hex colour';
  }
  return errors;
}

/** The values as the wire wants them: no blanks, no sidecar. */
export function toVariableMap(
  row: Pick<RequestRow, 'values'>,
): Record<string, ApiRenderInputValue> {
  return Object.fromEntries(
    Object.entries(row.values).filter(([, value]) => value !== undefined && value !== ''),
  );
}

// --- spreadsheets ------------------------------------------------------------------------------

/**
 * RFC 4180: quoted cells, `""` inside quotes, CRLF/LF/CR rows, newlines inside quotes kept.
 * Tab-separated when the first line has a tab — what a copy out of Sheets or Excel is. Blank
 * lines are dropped; a leading BOM (Excel's CSV export) is not a header character.
 */
export function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.slice(0, source.search(/[\r\n]|$/));
  const separator = firstLine.includes('\t') ? '\t' : ',';
  const table: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      table.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    table.push(row);
  }
  return table.filter((cells) => cells.some((value) => value.trim() !== ''));
}

const csvCell = (value: string) =>
  /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const toCsv = (table: string[][]): string =>
  `${table.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;

/** The first line as headers, every later line as a record keyed by them. */
export function recordsFromTable(table: string[][]): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const seen = new Map<string, number>();
  const headers = (table[0] ?? []).map((raw, index) => {
    const header = raw.trim() || `Column ${index + 1}`;
    const count = (seen.get(header.toLowerCase()) ?? 0) + 1;
    seen.set(header.toLowerCase(), count);
    return count === 1 ? header : `${header} (${count})`;
  });
  const rows = table
    .slice(1)
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
    );
  return { headers, rows };
}

/** Import targets that are not variables. `@` cannot start a variable key, so they never collide. */
export const IMPORT_FIELDS = [
  { target: '@name', header: 'Name', aliases: ['name', 'label'] },
  { target: '@parent', header: 'Parent', aliases: ['parent'] },
  { target: '@formats', header: 'Formats', aliases: ['formats', 'format'] },
  {
    target: '@replaceAdId',
    header: 'Replace ad ID',
    aliases: ['replace ad id', 'replace_ad_id', 'ad id', 'ad_id'],
  },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['target'];
export const IMPORT_SKIP = '__skip__';

const importableVariables = (variables: ApiRenderVariable[]) =>
  variables.filter((variable) => !variable.reserved);

/**
 * A variable's spreadsheet header: its label, or `Label (key)` where the bare label would also
 * name something else — a field, another variable's label, or another variable's key.
 */
export function variableColumnHeader(
  variable: ApiRenderVariable,
  variables: ApiRenderVariable[],
): string {
  const label = variable.label.trim();
  const lower = label.toLowerCase();
  const clashes =
    IMPORT_FIELDS.some((field) => (field.aliases as readonly string[]).includes(lower)) ||
    importableVariables(variables).some(
      (other) =>
        other.key !== variable.key &&
        (other.label.trim().toLowerCase() === lower || other.key.toLowerCase() === lower),
    );
  return clashes ? `${label} (${variable.key})` : label;
}

/** The sample only when importing it would succeed: a download that cannot re-import is a trap. */
const importableSample = (variable: ApiRenderVariable): string =>
  isMediaVariable(variable) ||
  variable.sample === null ||
  importCell(variable, variable.sample).error
    ? ''
    : variable.sample;

/**
 * Formats written so they read back as exactly these outputs: a label where it names its own
 * output and no other, the id where the label holds a separator or is shared.
 */
function formatsSample(outputs: ApiRenderTemplateContract['outputs']): string {
  const namesOnly = (output: (typeof outputs)[number]) =>
    !importFormats(output.label, [output]).error &&
    outputs.every((other) => other === output || importFormats(output.label, [other]).error);
  const cell = outputs.map((output) => (namesOnly(output) ? output.label : output.id)).join(', ');
  const { ids, error } = importFormats(cell, outputs);
  return !error && ids.length === outputs.length ? cell : '';
}

/** The downloadable spreadsheet for one template: its columns and the designer's own values. */
export function buildTemplateCsv(
  contract: Pick<ApiRenderTemplateContract, 'variables' | 'outputs'>,
): string {
  const variables = importableVariables(contract.variables);
  return toCsv([
    [
      ...IMPORT_FIELDS.slice(0, 3).map((field) => field.header),
      ...variables.map((variable) => variableColumnHeader(variable, variables)),
      IMPORT_FIELDS[3].header,
    ],
    ['Base', '', formatsSample(contract.outputs), ...variables.map(importableSample), ''],
  ]);
}

/**
 * Header → target, case-insensitive. The headers `buildTemplateCsv` writes are registered first
 * and nothing registered later replaces an entry, so a variable keyed `name`, or one whose key is
 * another's label, can never take over a column of the template it was downloaded from. Then
 * `Label (key)`, bare keys, and the fields' aliases. Anything unrecognised is skipped.
 */
export function autoMapHeaders(
  headers: string[],
  variables: ApiRenderVariable[],
): Record<string, string> {
  const importable = importableVariables(variables);
  const byName = new Map<string, string>();
  const register = (name: string, target: string) => {
    const lower = name.trim().toLowerCase();
    if (!byName.has(lower)) byName.set(lower, target);
  };
  for (const field of IMPORT_FIELDS) register(field.header, field.target);
  for (const variable of importable)
    register(variableColumnHeader(variable, importable), variable.key);
  for (const variable of importable)
    register(`${variable.label.trim()} (${variable.key})`, variable.key);
  for (const variable of importable) register(variable.key, variable.key);
  for (const field of IMPORT_FIELDS)
    for (const alias of field.aliases) register(alias, field.target);
  const used = new Set<string>();
  return Object.fromEntries(
    headers.map((header) => {
      const target = byName.get(header.trim().toLowerCase());
      if (!target || used.has(target)) return [header, IMPORT_SKIP];
      used.add(target);
      return [header, target];
    }),
  );
}

export type ImportCellError = { row: number; column: string; message: string };

const isMediaVariable = (variable: ApiRenderVariable) =>
  variable.kind === 'image' || variable.kind === 'video';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One spreadsheet cell as a variable value, or what is wrong with it. */
function importCell(
  variable: ApiRenderVariable,
  raw: string,
): { value?: ApiRenderInputValue; error?: string } {
  const text = raw.trim();
  if (text === '') return {};
  if (isMediaVariable(variable)) {
    const ids = text.split(/[\s,;]+/).filter(Boolean);
    if (ids.some((id) => !UUID.test(id))) return { error: 'Not a Library asset id' };
    const max = variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
    if (ids.length > max) return { error: max === 1 ? 'One asset id only' : `At most ${max} ids` };
    const pins: PinnedRenderAsset[] = ids.map((assetId) => ({ assetId }));
    return { value: variable.multiple ? pins : pins[0]! };
  }
  const value = coerce(variable, text);
  if (variable.kind === 'color' && !/^#?[0-9A-Fa-f]{6}$/.test(text))
    return { error: 'Not a hex colour' };
  if (value !== undefined) return { value };
  switch (variable.kind) {
    case 'number':
      return { error: 'Not a number' };
    case 'boolean':
      return { error: 'Use true or false' };
    default:
      return { error: `Not one of: ${variable.options.join(', ')}` };
  }
}

/** Output ids from a Formats cell — labels, ratios or ids, comma-separated. */
function importFormats(
  raw: string,
  outputs: ApiRenderTemplateContract['outputs'],
): { ids: string[]; error?: string } {
  const tokens = raw
    .split(/[,;|]/)
    .map((token) => token.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase().replace(/\s+/g, '');
    const output = outputs.find(
      (item) =>
        item.id.toLowerCase() === lower ||
        item.label.toLowerCase().replace(/\s+/g, '') === lower ||
        item.ratio?.replace(/\s+/g, '') === lower,
    );
    if (!output) return { ids: [], error: `Unknown format: ${token}` };
    if (!ids.includes(output.id)) ids.push(output.id);
  }
  return { ids };
}

/**
 * Reviewed spreadsheet rows as render rows, with every cell that could not be used named.
 *
 * Parents resolve by Name only after every row exists, so a fork may sit above its parent in
 * the sheet. Media cells carry Library asset ids — shape-checked here, looked up by the caller.
 */
export function rowsFromMappedImport(
  sourceRows: Array<Record<string, string>>,
  mappings: Record<string, string>,
  variables: ApiRenderVariable[],
  outputs: ApiRenderTemplateContract['outputs'] = [],
): { rows: RequestRow[]; errors: ImportCellError[] } {
  if (duplicateMappedVariable(mappings, IMPORT_SKIP))
    throw new Error('render_import_duplicate_mapping');
  const byKey = new Map(importableVariables(variables).map((variable) => [variable.key, variable]));
  const errors: ImportCellError[] = [];
  const columnOf = (target: string) =>
    Object.entries(mappings).find(([, mapped]) => mapped === target)?.[0];
  const nameColumn = columnOf('@name');
  const parentColumn = columnOf('@parent');
  const formatsColumn = columnOf('@formats');
  const adColumn = columnOf('@replaceAdId');

  const rows = sourceRows.map((source, index) => {
    const row = seedRow([], (nameColumn && source[nameColumn]?.trim()) || `Imported ${index + 1}`);
    for (const [column, key] of Object.entries(mappings)) {
      const variable = byKey.get(key);
      if (!variable) continue;
      const { value, error } = importCell(variable, source[column] ?? '');
      if (error) errors.push({ row: index, column, message: error });
      else if (value !== undefined) row.values[key] = value;
    }
    if (formatsColumn && source[formatsColumn]?.trim()) {
      const { ids, error } = importFormats(source[formatsColumn], outputs);
      if (error) errors.push({ row: index, column: formatsColumn, message: error });
      else row.outputIds = ids;
    }
    const adId = adColumn ? source[adColumn]?.trim() : '';
    if (adId) row.delivery = { action: 'replace', adId };
    return row;
  });

  if (parentColumn) {
    sourceRows.forEach((source, index) => {
      const parentName = source[parentColumn]?.trim().toLowerCase();
      if (!parentName) return;
      const matches = rows.filter((row) => row.label.trim().toLowerCase() === parentName);
      const fail = (message: string) => errors.push({ row: index, column: parentColumn, message });
      if (matches.length === 0) fail(`No row is named ${source[parentColumn]!.trim()}`);
      else if (matches.length > 1)
        fail(`More than one row is named ${source[parentColumn]!.trim()}`);
      else if (matches[0]!.id === rows[index]!.id) fail('A row cannot be its own parent');
      else rows[index]!.parentId = matches[0]!.id;
    });
    rows.forEach((row, index) => {
      if (!row.parentId) return;
      const depth = rowDepth(rows, row.id);
      if (depth <= FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH) return;
      errors.push({
        row: index,
        column: parentColumn,
        message: Number.isFinite(depth)
          ? `Forks go at most ${FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH} levels deep`
          : 'These parents form a loop',
      });
    });
  }
  return { rows, errors };
}

/** Every Library asset id the rows pin, once each — what an import has to look up. */
export function pinnedAssetIds(rows: RequestRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows)
    for (const value of Object.values(row.values))
      for (const item of Array.isArray(value) ? value : [value])
        if (typeof item === 'object' && item !== null && 'assetId' in item) ids.add(item.assetId);
  return [...ids];
}

// --- names, order and parentage ------------------------------------------------------------

const FORK_LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `{parent} · B`, then the next letter no sibling already uses. The parent is A. */
export function forkLabel(rows: RequestRow[], parentId: string): string {
  const base = rows.find((row) => row.id === parentId)?.label.trim() || 'Untitled';
  const taken = new Set(
    rows.filter((row) => row.parentId === parentId).map((row) => row.label.trim()),
  );
  for (const letter of FORK_LETTERS)
    if (!taken.has(`${base} · ${letter}`)) return `${base} · ${letter}`;
  let n = FORK_LETTERS.length + 2;
  while (taken.has(`${base} · ${n}`)) n += 1;
  return `${base} · ${n}`;
}

export const duplicateLabel = (label: string): string => `${label.trim() || 'Untitled'} copy`;

/**
 * How far a variation has moved from what it inherits: every value it sets or blanks, plus one
 * for its own formats and one for its own output settings.
 */
export const ownChangeCount = (row: RequestRow): number =>
  new Set([...Object.keys(row.values), ...row.clearedKeys]).size +
  (row.outputIds.length ? 1 : 0) +
  (compactEncodeBlock(row.encode) || row.clearedEncodeKeys ? 1 : 0);

export type RowDrop = { rowId: string; position: 'before' | 'after' | 'inside' };
export type RowMove = { ok: true; rows: RequestRow[] } | { ok: false; reason: 'depth' | 'cycle' };

/**
 * Drag `dragId` (and everything under it) onto another row: before or after it as a sibling, or
 * inside it as its last child. Array order is sibling order, so the result is what a render set
 * saves. Refused rather than clamped: a drop under its own descendant is a loop, and a subtree
 * that would end deeper than the fork cap is not moved at all.
 *
 * Formats follow what the row meant, not the field: a root saying "every format" is the default
 * a root has to spell out, so as a fork it inherits; a fork that inherited keeps, as a root, the
 * formats it was rendering rather than silently widening to all of them.
 */
export function moveRow(
  rows: RequestRow[],
  dragId: string,
  drop: RowDrop,
  allOutputIds: string[],
): RowMove {
  const dragged = rows.find((row) => row.id === dragId);
  const target = rows.find((row) => row.id === drop.rowId);
  if (!dragged || !target || dragged === target) return { ok: true, rows };
  const subtree = descendantsOf(rows, [dragId]);
  if (subtree.has(target.id)) return { ok: false, reason: 'cycle' };

  const parentId = drop.position === 'inside' ? target.id : target.parentId;
  const draggedDepth = rowDepth(rows, dragId);
  const height = Math.max(...[...subtree].map((id) => rowDepth(rows, id) - draggedDepth));
  const depth = parentId === null ? 0 : rowDepth(rows, parentId) + 1;
  if (depth + height > FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH) return { ok: false, reason: 'depth' };

  const reparented = parentId !== dragged.parentId;
  const outputIdsAfterMove = (): string[] => {
    const { outputIds } = dragged;
    if (dragged.parentId === null && parentId !== null) {
      const everyFormat =
        allOutputIds.length > 0 &&
        outputIds.length === allOutputIds.length &&
        allOutputIds.every((id) => outputIds.includes(id));
      return everyFormat ? [] : outputIds;
    }
    if (dragged.parentId !== null && parentId === null && outputIds.length === 0)
      return effectiveOutputIds(rows, dragId);
    return outputIds;
  };
  const block = rows
    .filter((row) => subtree.has(row.id))
    .map((row) =>
      !reparented
        ? row
        : {
            ...row,
            ...(row.id === dragId ? { parentId, outputIds: outputIdsAfterMove() } : {}),
            check: { state: 'idle' } as const,
          },
    );
  const rest = rows.filter((row) => !subtree.has(row.id));
  let index = rest.indexOf(target);
  if (drop.position !== 'before') {
    const targetTree = descendantsOf(rest, [target.id]);
    index = rest.findLastIndex((row) => targetTree.has(row.id)) + 1;
  }
  return { ok: true, rows: [...rest.slice(0, index), ...block, ...rest.slice(index)] };
}

/**
 * A new row straight after `rowId` and everything under it, under the same parent. Beside a root
 * it is seeded like a blank row — the designer's values, every format; beside a variation it
 * inherits everything from the parent they share.
 */
export function addSibling(
  rows: RequestRow[],
  rowId: string,
  variables: ApiRenderVariable[],
  allOutputIds: string[],
): { rows: RequestRow[]; added: RequestRow } {
  const parentId = rows.find((row) => row.id === rowId)?.parentId ?? null;
  const added =
    parentId === null
      ? { ...seedRow(variables, `Render ${rows.length + 1}`), outputIds: [...allOutputIds] }
      : seedRow([], forkLabel(rows, parentId), parentId);
  // Same parent, same depth: the move cannot be refused.
  const moved = moveRow([...rows, added], added.id, { rowId, position: 'after' }, allOutputIds);
  return { rows: moved.ok ? moved.rows : [...rows, added], added };
}

// --- render sets ----------------------------------------------------------------------------

/** Rows as a render set stores them. A root with no formats is every format, said explicitly. */
export function toRenderSetRows(rows: RequestRow[], allOutputIds: string[]): ForgeRenderSetRow[] {
  return rows.map((row) => {
    const encode = compactEncodeBlock(row.encode);
    return {
      id: row.id,
      parentId: row.parentId,
      label: row.label.trim() || 'Untitled',
      overrides: toVariableMap(row),
      clearedKeys: row.clearedKeys,
      outputIds: row.parentId === null && row.outputIds.length === 0 ? allOutputIds : row.outputIds,
      ...(encode ? { encode } : {}),
      ...(row.clearedEncodeKeys ? { clearedEncodeKeys: row.clearedEncodeKeys } : {}),
      ...(isResolvedDelivery(row.delivery) ? { delivery: row.delivery } : {}),
    };
  });
}

/**
 * What a review is a review OF: every row as the set stores it (a parent's edit changes what its
 * forks render), which rows render, and the set revision their records point at. Where a row
 * delivers is chosen during the review, and a check landing or a thumbnail loading is nothing
 * the server signs, so none of those make a review stale.
 */
export const reviewSignature = (
  rows: RequestRow[],
  selectedIds: string[],
  revision: number | null,
  allOutputIds: string[],
): string =>
  JSON.stringify([
    toRenderSetRows(
      rows.map(({ delivery: _delivery, ...row }) => row),
      allOutputIds,
    ),
    selectedIds,
    revision,
  ]);

export function fromRenderSetRows(rows: ForgeRenderSetRow[]): RequestRow[] {
  return rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    label: row.label,
    values: { ...row.overrides },
    clearedKeys: [...row.clearedKeys],
    outputIds: [...row.outputIds],
    encode: row.encode,
    clearedEncodeKeys: row.clearedEncodeKeys,
    ...(row.delivery ? { delivery: row.delivery } : {}),
    media: {},
    check: { state: 'idle' },
  }));
}

export const draftStorageKey = (brandId: string, templateKey: string): string =>
  `forge:render-drafts:${brandId}:${templateKey}`;
