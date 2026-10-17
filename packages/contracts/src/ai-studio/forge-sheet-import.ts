import { unzipSync } from 'fflate';
import type { ForgeImportMapping } from './forge-render-imports';

/**
 * A spreadsheet as a person made it — title rows, notes, a colour legend under the data, several
 * sheets, odds typed as 1.4 — read into the one table a render set imports.
 *
 * XLSX is read here (fflate + a scan of the sheet XML) so the browser never uploads a sheet just
 * to read it, and the Backend bench parses the same bytes the same way. Cell values are what the
 * file stored: a formula is its cached result, a date its serial number (no sheet here has one;
 * read the number format when one does).
 */

export const SHEET_MAX_BYTES = 10 * 1024 * 1024;
export const SHEET_MAX_ROWS = 500;
const HEADER_SCAN_ROWS = 60;

export type WorkbookSheet = { name: string; cells: string[][] };

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

const decodeXml = (text: string): string =>
  text
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (whole, entity: string) => {
      if (entity[0] !== '#') return XML_ENTITIES[entity.toLowerCase()] ?? whole;
      const hex = entity[1] === 'x' || entity[1] === 'X';
      return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );

const attrOf = (attrs: string, name: string): string | undefined =>
  attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];

/** Every `<t>` run, phonetic guides (`<rPh>`) left out — a rich-text cell is its runs joined. */
const textOf = (xml: string): string =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ''))
    .join('');

const columnIndex = (letters: string): number =>
  [...letters.toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;

const numberText = (raw: string): string => {
  const value = Number(raw);
  // 214.99999999999997 is how a sheet stores 215; fifteen digits is all a double means.
  return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : raw;
};

/** Every visible sheet of an .xlsx, in tab order, as rows of cell text. Blank rows are kept. */
export function readWorkbook(bytes: Uint8Array): WorkbookSheet[] {
  if (bytes.byteLength > SHEET_MAX_BYTES) throw new Error('render_import_too_large');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => file.name.startsWith('xl/') && /\.(xml|rels)$/.test(file.name),
    });
  } catch (error) {
    throw new Error('render_import_failed', { cause: error });
  }
  const text = (path: string) => {
    const file = files[path];
    return file ? new TextDecoder().decode(file) : '';
  };
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new Error('render_import_failed');

  const targets = new Map(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)].map((match) => {
      const attrs = match[1] ?? '';
      const target = (attrOf(attrs, 'Target') ?? '').replace(/^\/?(xl\/)?/, 'xl/');
      return [attrOf(attrs, 'Id') ?? '', target] as const;
    }),
  );
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
    (match) => textOf(match[1] ?? ''),
  );

  const sheets: WorkbookSheet[] = [];
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = match[1] ?? '';
    if (/^(hidden|veryHidden)$/.test(attrOf(attrs, 'state') ?? '')) continue;
    const xml = text(targets.get(attrOf(attrs, 'r:id') ?? '') ?? '');
    if (!xml) continue;
    sheets.push({ name: decodeXml(attrOf(attrs, 'name') ?? ''), cells: sheetCells(xml, shared) });
  }
  return sheets;
}

function sheetCells(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attrOf(rowMatch[1] ?? '', 'r'));
    const rowIndex = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : nextRow;
    nextRow = rowIndex + 1;
    if (rowIndex >= SHEET_MAX_ROWS) break;
    const cells: string[] = [];
    let nextColumn = 0;
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? '';
      const inner = cellMatch[2] ?? '';
      const reference = attrOf(attrs, 'r')?.match(/^([A-Z]+)/i)?.[1];
      const column = reference ? columnIndex(reference) : nextColumn;
      nextColumn = column + 1;
      const stored = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const type = attrOf(attrs, 't');
      const value =
        type === 'inlineStr'
          ? textOf(inner)
          : stored === undefined
            ? ''
            : type === 's'
              ? (shared[Number(stored)] ?? '')
              : type === 'b'
                ? stored === '1'
                  ? 'TRUE'
                  : 'FALSE'
                : type === 'e'
                  ? ''
                  : type === 'str'
                    ? decodeXml(stored)
                    : numberText(decodeXml(stored));
      cells[column] = value;
    }
    rows[rowIndex] = Array.from(cells, (cell) => cell ?? '');
  }
  return Array.from(rows, (row) => row ?? []);
}

/** UTF-8 when the bytes are UTF-8, else Windows-1252 — what Excel on Windows writes a CSV as. */
export function decodeDelimitedBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * The separator a delimited file uses: tab when there is one (a paste out of Sheets or Excel),
 * else whichever of `;` and `,` appears more often outside quotes in its first lines — a
 * Spanish-locale Excel writes `;` because `,` is its decimal mark.
 */
function sniffSeparator(source: string): string {
  const counts = { '\t': 0, ';': 0, ',': 0 };
  let quoted = false;
  let lines = 0;
  for (let index = 0; index < source.length && lines < 20; index += 1) {
    const char = source[index]!;
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === '\n') lines += 1;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  if (counts['\t'] > 0) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

/**
 * RFC 4180: quoted cells, `""` inside quotes, CRLF/LF/CR rows, newlines inside quotes kept. A
 * leading BOM (Excel's CSV export) is not a header character. Blank lines are dropped unless
 * `keepBlankRows` — a sheet's blank row is where its data ends, so the importer keeps them.
 */
export function parseDelimited(
  text: string,
  options: { keepBlankRows?: boolean } = {},
): string[][] {
  const source = text.replace(/^﻿/, '');
  const separator = sniffSeparator(source);
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
  return options.keepBlankRows
    ? table
    : table.filter((cells) => cells.some((value) => value.trim() !== ''));
}

// --- locating the data --------------------------------------------------------------------------

export type SheetTable = {
  /** Zero-based row the headers were read from. */
  headerRow: number;
  headers: string[];
  rows: Array<Record<string, string>>;
  /** Text above and below the data — "*las cuotas siempre llevan 2 decimales" is a rule. */
  notes: string[];
  /** Colour names the sheet itself defines (Rojo → #d72828), folded name → #rrggbb. */
  legend: Record<string, string>;
};

const clean = (value: string | undefined): string => (value ?? '').replace(/ /g, ' ').trim();

/** Lowercase, accents and punctuation gone — the form two spellings of one name share. */
export const foldName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const isNumeric = (value: string) => /\d/.test(value) && /^[-+]?[\d.,\s]+%?$/.test(value);

/** A cell that reads as a column name: short words, not a number, colour, link, note or formula. */
const isLabelLike = (value: string) =>
  value !== '' &&
  value.length <= 40 &&
  !value.includes('\n') &&
  !isNumeric(value) &&
  !HEX.test(value) &&
  !/^[*=]/.test(value) &&
  !/^https?:\/\//i.test(value);

/**
 * The header row: the one with the most label-like cells (at least two, and at least 80% of its
 * filled cells) with data directly under it. Title rows have one cell, note rows start with `*`,
 * data rows are mostly numbers, colours and links. Ties go to the earlier row.
 */
export function detectHeaderRow(cells: string[][]): number {
  let best = 0;
  let bestScore = 0;
  for (let index = 0; index < Math.min(cells.length, HEADER_SCAN_ROWS); index += 1) {
    const filled = (cells[index] ?? []).map(clean).filter(Boolean);
    if (filled.length < 2) continue;
    const labels = filled.filter(isLabelLike).length;
    if (labels / filled.length < 0.8 || labels <= bestScore) continue;
    if (!(cells[index + 1] ?? []).some((cell) => clean(cell) !== '')) continue;
    best = index;
    bestScore = labels;
  }
  return best;
}

const toHex = (value: string): string | null => {
  const match = value.match(HEX);
  if (!match) return null;
  const digits = match[1]!.toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`;
};

/**
 * The block under the header, to the first blank row: a legend or a note below the data is not
 * data. Blank header cells over data become `Column N`; a repeated header gets ` (2)`.
 */
export function sheetTable(cells: string[][], headerRow = detectHeaderRow(cells)): SheetTable {
  const headerCells = (cells[headerRow] ?? []).map(clean);
  const width = headerCells.reduce((last, cell, index) => (cell ? index + 1 : last), 0);
  let end = headerRow + 1;
  while (
    end < cells.length &&
    (cells[end] ?? []).slice(0, width).some((cell) => clean(cell) !== '')
  )
    end += 1;
  const body = cells.slice(headerRow + 1, end);

  const seen = new Map<string, number>();
  const columns: Array<{ index: number; header: string }> = [];
  for (let index = 0; index < width; index += 1) {
    const named = headerCells[index] ?? '';
    if (!named && body.every((row) => clean(row[index]) === '')) continue;
    const base = named || `Column ${index + 1}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    columns.push({ index, header: count === 1 ? base : `${base} (${count})` });
  }

  const notes: string[] = [];
  const legend: Record<string, string> = {};
  cells.forEach((row, index) => {
    if (index >= headerRow && index < end) return;
    const filled = row.map(clean).filter(Boolean);
    if (filled.length === 0) return;
    if (notes.length < 40) notes.push(filled.join(' · ').slice(0, 300));
    const hexAt = filled.findIndex((cell) => toHex(cell) !== null);
    const name = hexAt > 0 ? filled.slice(0, hexAt).find(isLabelLike) : undefined;
    if (name) legend[foldName(name)] = toHex(filled[hexAt]!)!;
  });

  return {
    headerRow,
    headers: columns.map((column) => column.header),
    rows: body.map((row) =>
      Object.fromEntries(columns.map((column) => [column.header, clean(row[column.index])])),
    ),
    notes,
    legend,
  };
}

const tokensOf = (value: string): string[] => foldName(value).split(' ').filter(Boolean);

/**
 * Which sheet a template reads: the one whose headers a saved mapping named, else the one whose
 * headers and name share the most words with the template's fields and name ("Card B" for
 * "Caliente Card B Halftime" — single letters count). A sheet with no data rows never wins.
 */
export function pickSheet(
  sheets: Array<{ name: string; table: SheetTable }>,
  context: {
    templateName: string;
    variables: Array<{ key: string; label: string }>;
    savedHeaders?: string[] | null;
  },
): number {
  const templateWords = new Set(tokensOf(context.templateName));
  const fieldWords = new Set(
    context.variables.flatMap((variable) =>
      tokensOf(`${variable.label} ${variable.key}`).filter((word) => word.length > 2),
    ),
  );
  const saved = context.savedHeaders?.map(foldName) ?? [];
  let best = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  sheets.forEach((sheet, index) => {
    const headers = new Set(sheet.table.headers.map(foldName));
    const score =
      (sheet.table.rows.length === 0 ? -1000 : 0) +
      (saved.length > 0 && saved.every((header) => headers.has(header)) ? 1000 : 0) +
      sheet.table.headers.filter((header) => tokensOf(header).some((word) => fieldWords.has(word)))
        .length +
      // A sheet named for the template is the strongest signal a workbook carries.
      10 * tokensOf(sheet.name).filter((word) => templateWords.has(word)).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

// --- values -------------------------------------------------------------------------------------

/** Colour words a sheet uses without defining them. A sheet's own legend wins over these. */
const COLOUR_NAMES: Record<string, string> = {
  blanco: '#ffffff',
  white: '#ffffff',
  negro: '#000000',
  black: '#000000',
  rojo: '#ff0000',
  red: '#ff0000',
  verde: '#008000',
  green: '#008000',
  azul: '#0000ff',
  blue: '#0000ff',
  amarillo: '#ffff00',
  yellow: '#ffff00',
  naranja: '#ffa500',
  orange: '#ffa500',
  gris: '#808080',
  gray: '#808080',
  grey: '#808080',
  morado: '#800080',
  purple: '#800080',
  rosa: '#ffc0cb',
  pink: '#ffc0cb',
};

/** `#d72828`, `D72828 `, `#fff`, `Blanco` or a legend name as `#rrggbb`; null when it is none. */
export function colourOf(raw: string, legend: Record<string, string> = {}): string | null {
  const text = clean(raw);
  const folded = foldName(text);
  return legend[folded] ?? COLOUR_NAMES[folded] ?? toHex(text);
}

/** A field that takes a colour: typed as one, or named as one where the template types it as text. */
export const isColourField = (variable: { kind: string; label: string }, header = ''): boolean =>
  variable.kind === 'color' || /colou?r/i.test(variable.label) || /colou?r/i.test(header);

/** `1.4` → `1.40`, `1,4` → `1.40` at two places; anything that is not a plain number is kept. */
export function withDecimals(raw: string, places: number): string {
  const text = clean(raw);
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return text;
  return Number(text.replace(',', '.')).toFixed(places);
}

/** One cell as the value its field takes: trimmed, colours as hex, numbers at their places. */
export function normalizeImportCell(
  raw: string,
  options: { colour?: boolean; decimals?: number | null; legend?: Record<string, string> } = {},
): string {
  const text = clean(raw);
  if (!text) return '';
  if (options.colour) return colourOf(text, options.legend) ?? text;
  if (typeof options.decimals === 'number') return withDecimals(text, options.decimals);
  return text;
}

/** `{Equipo A} vs. {Equipo B}` with each header's cell; header names compare folded. */
export function fillLabel(template: string, row: Record<string, string>): string {
  const byFolded = new Map(Object.entries(row).map(([header, value]) => [foldName(header), value]));
  return template
    .replace(/\{([^{}]+)\}/g, (_, header: string) => clean(byFolded.get(foldName(header))))
    .replace(/\s+/g, ' ')
    .trim();
}

export type PreparedImport = {
  /** Source rows with every mapped cell normalized, outputs as ids, plus the label column. */
  rows: Array<Record<string, string>>;
  headers: string[];
  /** header → target, with the label column added as `@name` when the mapping names a label. */
  columns: Record<string, string>;
};

/** The header the filled label lives under; never one the sheet already has. */
export const IMPORT_LABEL_HEADER = 'Row name';

/**
 * A located sheet run through a mapping, still as cells: what a review shows and what the
 * grid's own importer types and checks. Output cells resolve through the saved value map
 * ("Ambos equipos anotan" → the BTTS output) before the importer matches labels and ids.
 */
export function prepareImport(
  table: SheetTable,
  mapping: Pick<ForgeImportMapping, 'columns' | 'label' | 'outputs' | 'decimals'>,
  variables: Array<{ key: string; label: string; kind: string }>,
): PreparedImport {
  const byKey = new Map(variables.map((variable) => [variable.key, variable]));
  const labelHeader = table.headers.includes(IMPORT_LABEL_HEADER)
    ? `${IMPORT_LABEL_HEADER} (label)`
    : IMPORT_LABEL_HEADER;
  const columns: Record<string, string> = { ...mapping.columns };
  if (mapping.label) {
    for (const [header, target] of Object.entries(columns))
      if (target === '@name') columns[header] = IMPORT_SKIP_TARGET;
    columns[labelHeader] = '@name';
  }
  const rows = table.rows.map((source) => {
    const row: Record<string, string> = { ...source };
    for (const [header, target] of Object.entries(mapping.columns)) {
      const raw = source[header] ?? '';
      const variable = byKey.get(target);
      if (variable)
        row[header] = normalizeImportCell(raw, {
          colour: isColourField(variable, header),
          decimals: mapping.decimals[target] ?? null,
          legend: table.legend,
        });
      else if (target === '@formats') row[header] = mapping.outputs[foldName(raw)] ?? clean(raw);
      else row[header] = clean(raw);
    }
    if (mapping.label) row[labelHeader] = fillLabel(mapping.label, source);
    return row;
  });
  return {
    rows,
    headers: mapping.label ? [...table.headers, labelHeader] : table.headers,
    columns,
  };
}

/** The importer's "Do not import" target. */
export const IMPORT_SKIP_TARGET = '__skip__';

// --- media by name ------------------------------------------------------------------------------

const NAME_STOPWORDS = new Set([
  'fc',
  'cf',
  'cd',
  'club',
  'de',
  'del',
  'la',
  'el',
  'los',
  'the',
  'kit',
  'jersey',
  'camiseta',
  'shirt',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
]);

const nameKey = (value: string) =>
  tokensOf(value.replace(/\.[a-z0-9]{2,4}$/i, ''))
    .filter((word) => !NAME_STOPWORDS.has(word))
    .join(' ');

/**
 * The one candidate a name means — "FBC Melgar" → `melgar.png` — or null when none or several
 * do. An exact match on the significant words first, then one name inside the other (at least
 * four characters, so "UTC" cannot claim "utc cajamarca" and "u").
 */
export function matchAssetByName<T extends { name: string }>(
  name: string,
  candidates: readonly T[],
): T | null {
  const target = nameKey(name);
  if (!target) return null;
  const keyed = candidates.map((candidate) => ({ candidate, key: nameKey(candidate.name) }));
  const exact = keyed.filter((entry) => entry.key === target);
  if (exact.length === 1) return exact[0]!.candidate;
  if (exact.length > 1) return null;
  const contained = keyed.filter(
    (entry) =>
      entry.key.length >= 4 &&
      target.length >= 4 &&
      (` ${entry.key} `.includes(` ${target} `) || ` ${target} `.includes(` ${entry.key} `)),
  );
  return contained.length === 1 ? contained[0]!.candidate : null;
}

/**
 * Which column names what each picture shows: the text field on the picture's side named for a
 * team or a name (left_jersey ↔ left_team), read from the column mapped to it. Decided in code —
 * measured, a model named the Drive-link column as often as the team's.
 */
export function kitColumns(
  variables: ReadonlyArray<{ key: string; kind: string }>,
  columns: Record<string, string>,
): Record<string, string> {
  const headerOf = new Map(Object.entries(columns).map(([header, key]) => [key, header]));
  return Object.fromEntries(
    variables
      .filter((variable) => variable.kind === 'image' || variable.kind === 'video')
      .flatMap((picture) => {
        const side = picture.key.split('_')[0];
        const named = variables.filter(
          (variable) =>
            variable.kind === 'text' &&
            ['team', 'name', 'equipo', 'nombre'].some(
              (word) => variable.key === `${side}_${word}`,
            ) &&
            headerOf.has(variable.key),
        );
        return named.length === 1 ? [[picture.key, headerOf.get(named[0]!.key)!]] : [];
      }),
  );
}
