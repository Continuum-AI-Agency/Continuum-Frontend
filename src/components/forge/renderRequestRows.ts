import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderFitReport,
  type ApiRenderInputValue,
  type ApiRenderVariable,
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

export type RequestRowCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ready'; fit: ApiRenderFitReport | null; test: boolean }
  | { state: 'error'; message: string };

export type RequestRowMedia = { w?: number; h?: number; thumbnailUrl?: string | null };

export type RequestRow = {
  id: string;
  label: string;
  values: Record<string, ApiRenderInputValue>;
  media: Record<string, RequestRowMedia>;
  check: RequestRowCheck;
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
export function seedRow(variables: ApiRenderVariable[], label = ''): RequestRow {
  const values: Record<string, ApiRenderInputValue> = {};
  for (const variable of variables) {
    if (!isEditableScalar(variable) || variable.sample === null) continue;
    const value = coerce(variable, variable.sample);
    if (value !== undefined) values[variable.key] = value;
  }
  return { id: newRowId(), label, values, media: {}, check: { state: 'idle' } };
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
