import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderEncodeOverride,
  type ApiRenderFitReport,
  type ApiRenderInputValue,
  type ApiRenderVariable,
  type ApiRenderPreflightResponse,
  type ForgeRenderSetEncodeClear,
  inheritEncodeBlock,
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

export function rowsFromMappedImport(
  sourceRows: Array<Record<string, string>>,
  mappings: Record<string, string>,
  variables: ApiRenderVariable[],
): RequestRow[] {
  if (duplicateMappedVariable(mappings)) throw new Error('render_import_duplicate_mapping');
  const byKey = new Map(variables.map((variable) => [variable.key, variable]));
  return sourceRows.map((source, index) => {
    const row = seedRow([], source.Name?.trim() || source.Label?.trim() || `Imported ${index + 1}`);
    for (const [header, key] of Object.entries(mappings)) {
      const variable = byKey.get(key);
      if (!variable || variable.kind === 'image' || variable.kind === 'video') continue;
      const value = coerce(variable, source[header] ?? '');
      if (value !== undefined) row.values[key] = value;
    }
    return row;
  });
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
export function toVariableMap(row: RequestRow): Record<string, ApiRenderInputValue> {
  return Object.fromEntries(
    Object.entries(row.values).filter(([, value]) => value !== undefined && value !== ''),
  );
}

/**
 * Rows pasted from a spreadsheet: a header line naming variables by label or key, then one
 * line per render. Tab-separated when the header has a tab, comma otherwise. A `label` column
 * names the render. Media columns are ignored — a pin is picked, never typed — and headers
 * nobody recognises are returned so the toast can say which.
 */
export function parseClipboardRows(
  text: string,
  variables: ApiRenderVariable[],
): { rows: RequestRow[]; unmatched: string[] } {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '');
  if (lines.length < 2) return { rows: [], unmatched: [] };
  const delimiter = lines[0]!.includes('\t') ? '\t' : ',';
  const headers = lines[0]!.split(delimiter).map((header) => header.trim());
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
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delimiter);
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

export const draftStorageKey = (brandId: string, templateKey: string): string =>
  `forge:render-drafts:${brandId}:${templateKey}`;
