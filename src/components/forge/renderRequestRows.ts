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

export type RequestRowMedia = { w?: number; h?: number; thumbnailUrl?: string | null };

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
    const isMedia = variable.kind === 'image' || variable.kind === 'video';
    if (isMedia) {
      const pins = pinCount(value);
      if (variable.required && pins === 0) errors[variable.key] = 'Pick something from the Library';
      else if (pins > (variable.multiple ? API_RENDER_MEDIA_LIST_MAX : 1))
        errors[variable.key] = variable.multiple
          ? `At most ${API_RENDER_MEDIA_LIST_MAX} items`
          : 'One item only';
      continue;
    }
    const empty = value === undefined || value === '';
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

/**
 * Rows pasted from a spreadsheet: a header line naming variables by label or key, then one
 * line per render. Tab-separated when the header has a tab, comma otherwise, quoted cells per
 * RFC 4180. A `label` column names the render. Media columns are ignored — a pasted id is not
 * verified, the import dialog's is — and headers nobody recognises are returned so the toast
 * can say which.
 */
export function parseClipboardRows(
  text: string,
  variables: ApiRenderVariable[],
): { rows: RequestRow[]; unmatched: string[] } {
  const table = parseDelimited(text);
  if (table.length < 2) return { rows: [], unmatched: [] };
  const headers = table[0]!.map((header) => header.trim());
  const byName = new Map<string, ApiRenderVariable>();
  for (const variable of variables) {
    if (!isEditableScalar(variable)) continue;
    byName.set(variable.key.toLowerCase(), variable);
    byName.set(variable.label.toLowerCase(), variable);
  }
  const columns = headers.map((header) => {
    const lower = header.toLowerCase();
    if (lower === 'label' || lower === 'name') return 'label' as const;
    return byName.get(lower) ?? null;
  });
  const unmatched = headers.filter((_, index) => columns[index] === null);
  const rows = table.slice(1).map((cells) => {
    const row = seedRow([]);
    columns.forEach((column, index) => {
      const cell = cells[index] ?? '';
      if (column === null) return;
      if (column === 'label') {
        row.label = cell.trim();
        return;
      }
      const value = coerce(column, cell);
      if (value !== undefined) row.values[column.key] = value;
    });
    return row;
  });
  return { rows, unmatched };
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

/** A variable's spreadsheet header: its label, or `Label (key)` where the label is not unique. */
export function variableColumnHeader(
  variable: ApiRenderVariable,
  variables: ApiRenderVariable[],
): string {
  const label = variable.label.trim().toLowerCase();
  const clashes =
    IMPORT_FIELDS.some((field) => (field.aliases as readonly string[]).includes(label)) ||
    importableVariables(variables).some(
      (other) => other.key !== variable.key && other.label.trim().toLowerCase() === label,
    );
  return clashes ? `${variable.label} (${variable.key})` : variable.label;
}

/** The downloadable spreadsheet for one template: its columns and the designer's own values. */
export function buildTemplateCsv(
  contract: Pick<ApiRenderTemplateContract, 'variables' | 'outputs'>,
): string {
  const variables = importableVariables(contract.variables);
  return toCsv([
    [
      'Name',
      'Parent',
      'Formats',
      ...variables.map((variable) => variableColumnHeader(variable, variables)),
      'Replace ad ID',
    ],
    [
      'Root',
      '',
      contract.outputs.map((output) => output.label).join(', '),
      ...variables.map((variable) => (isMediaVariable(variable) ? '' : (variable.sample ?? ''))),
      '',
    ],
  ]);
}

/** Header → target, by key or label, case-insensitive. Anything unrecognised is skipped. */
export function autoMapHeaders(
  headers: string[],
  variables: ApiRenderVariable[],
): Record<string, string> {
  const importable = importableVariables(variables);
  const byName = new Map<string, string>();
  for (const field of IMPORT_FIELDS)
    for (const alias of field.aliases) byName.set(alias, field.target);
  for (const variable of importable) {
    byName.set(variable.key.toLowerCase(), variable.key);
    byName.set(variableColumnHeader(variable, importable).toLowerCase(), variable.key);
    byName.set(`${variable.label} (${variable.key})`.toLowerCase(), variable.key);
  }
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

export type RowDrop = { rowId: string; position: 'before' | 'after' | 'inside' };
export type RowMove = { ok: true; rows: RequestRow[] } | { ok: false; reason: 'depth' | 'cycle' };

/**
 * Drag `dragId` (and everything under it) onto another row: before or after it as a sibling, or
 * inside it as its last child. Array order is sibling order, so the result is what a render set
 * saves. Refused rather than clamped: a drop under its own descendant is a loop, and a subtree
 * that would end deeper than the fork cap is not moved at all.
 */
export function moveRow(rows: RequestRow[], dragId: string, drop: RowDrop): RowMove {
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
  const block = rows
    .filter((row) => subtree.has(row.id))
    .map((row) =>
      !reparented
        ? row
        : { ...row, ...(row.id === dragId ? { parentId } : {}), check: { state: 'idle' } as const },
    );
  const rest = rows.filter((row) => !subtree.has(row.id));
  let index = rest.indexOf(target);
  if (drop.position !== 'before') {
    const targetTree = descendantsOf(rest, [target.id]);
    index = rest.findLastIndex((row) => targetTree.has(row.id)) + 1;
  }
  return { ok: true, rows: [...rest.slice(0, index), ...block, ...rest.slice(index)] };
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
