'use client';

import {
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  decodeDelimitedBytes,
  type ForgeImportMapping,
  foldName,
  IMPORT_SKIP_TARGET,
  isWebTemplateKey,
  kitColumns,
  type MediaAsset,
  matchAssetByName,
  mediaAssetSchema,
  parseDelimited,
  pickSheet,
  prepareImport,
  readWorkbook,
  type SheetTable,
  sheetTable,
} from '@continuum/contracts';
import { FileSpreadsheet, FolderOpen, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  autoMapHeaders,
  buildTemplateCsv,
  canImportRows,
  duplicateMappedVariable,
  IMPORT_FIELDS,
  IMPORT_SKIP,
  type ImportCellError,
  MAX_BATCH_ROWS,
  pinnedAssetIds,
  type RequestRow,
  rowMediaOf,
  rowsFromMappedImport,
  variableColumnHeader,
} from './renderRequestRows';

// Import a spreadsheet into the Render grid as rows. The sheet is read here, in the browser —
// every tab of an .xlsx, a CSV in any of the separators Excel writes — never uploaded to be read.
// Which tab, which row holds the headers, where the data stops (a colour legend under it is not
// data), how each column maps, how rows are named, which format a market picks, how many decimals
// an odd carries: all decided here, shown, overridable, and saved for the template so next
// week's sheet imports with nothing to map. A cell that cannot be used is imported empty and
// named, never a reason the other rows wait.

type ImportContract = Pick<ApiRenderTemplateContract, 'variables' | 'outputs'> & {
  /** Absent (a canvas node, a test): nothing is saved or suggested, the sheet still imports. */
  template?: Pick<
    ApiRenderTemplateContract['template'],
    'key' | 'bindingId' | 'name' | 'displayName' | 'contractHash'
  >;
};

type Workbook = { sourceName: string; tables: Array<{ name: string; cells: string[][] }> };
type Mapping = Pick<ForgeImportMapping, 'columns' | 'label' | 'outputs' | 'decimals' | 'kits'>;
type KitCandidate = { name: string; asset?: MediaAsset; file?: File };

const PREVIEW_ROWS = 10;
const LIBRARY_PAGES = 4;
const KIT_UPLOADS_AT_ONCE = 4;
const cellKey = (row: number, column: string) => `${row}:${column}`;
const emptyMapping = (): Mapping => ({
  columns: {},
  label: null,
  outputs: {},
  decimals: {},
  kits: {},
});

/** GET /api/library/assets by id; null when the brand has no such asset, throws when the lookup fails. */
export async function lookupLibraryAsset(
  brandId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  const query = new URLSearchParams({ brandId, assetId, limit: '1' });
  const response = await fetch(`/api/library/assets?${query}`);
  if (!response.ok) throw new Error(`library_lookup_${response.status}`);
  const payload = (await response.json()) as { items?: unknown[] };
  const item = payload.items?.[0];
  return item === undefined ? null : mediaAssetSchema.parse(item);
}

/** lookupLibraryAsset with a failed request read as missing. */
export async function fetchLibraryAsset(
  brandId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  return lookupLibraryAsset(brandId, assetId).catch(() => null);
}

/**
 * The brand's newest Library images — what a team's name is matched against.
 * ponytail: the newest 384; a server-side name search when a brand's kits are older than that.
 */
async function libraryImages(brandId: string): Promise<MediaAsset[]> {
  const images: MediaAsset[] = [];
  for (let page = 0; page < LIBRARY_PAGES; page += 1) {
    const query = new URLSearchParams({
      brandId,
      kind: 'image',
      limit: '96',
      offset: String(page * 96),
    });
    const response = await fetch(`/api/library/assets?${query}`);
    if (!response.ok) break;
    const items = ((await response.json()) as { items?: unknown[] }).items ?? [];
    for (const item of items) {
      const parsed = mediaAssetSchema.safeParse(item);
      if (parsed.success) images.push(parsed.data);
    }
    if (items.length < 96) break;
  }
  return images;
}

/** Builds the template CSV (buildTemplateCsv) and saves it client-side via Blob + a temporary <a download>. */
export function downloadTemplateCsv(contract: ImportContract, fileName: string): void {
  // The BOM is what makes Excel read the file as UTF-8 instead of mangling accented samples.
  const url = URL.createObjectURL(
    new Blob(['﻿', buildTemplateCsv(contract)], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking in the same tick can cancel the download before the browser has read the Blob.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

const IMPORT_ERROR_COPY: Record<string, string> = {
  render_import_too_many_rows: `This sheet has too many rows. A render set holds at most ${MAX_BATCH_ROWS}.`,
  render_import_no_rows: 'This spreadsheet has no rows to import.',
  render_import_too_large: 'This spreadsheet is too large to import.',
  render_import_failed: 'Could not read this spreadsheet. Save it as .xlsx or .csv and try again.',
  media_url_unsafe: 'This media link is not a public HTTPS address.',
  media_url_unavailable: 'Could not download this media link.',
  media_url_wrong_type: 'This link does not contain the expected image or video.',
  media_url_too_large: 'This linked file is over 100 MB. Upload it directly to the Library.',
  media_url_empty: 'This media link returned an empty file.',
  media_url_redirects: 'This media link redirected too many times.',
  media_import_failed: 'Could not import this media link.',
};

/** The refusal's code as the sentence a person needs, row count included. */
function importErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not read this spreadsheet.';
  const rowCount = error instanceof ApiError ? error.payload?.rowCount : undefined;
  if (error.message === 'render_import_too_many_rows' && typeof rowCount === 'number') {
    return `This sheet has ${rowCount} rows. A render set holds at most ${MAX_BATCH_ROWS}.`;
  }
  return IMPORT_ERROR_COPY[error.message] ?? error.message;
}

const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');

/** A Drive folder is a page of files, never the one picture a cell asks for. */
const isFolderLink = (url: string) => /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//i.test(url);

const isWorkbook = (file: File, bytes: Uint8Array) =>
  /\.xlsx$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);

/** Every tab of a workbook, or the one table a CSV, TSV or paste is. */
async function readSheets(file: File): Promise<Workbook> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isWorkbook(file, bytes)) {
    const tables = readWorkbook(bytes);
    if (tables.length === 0) throw new Error('render_import_no_rows');
    return { sourceName: file.name, tables };
  }
  return {
    sourceName: file.name,
    tables: [
      {
        name: file.name,
        cells: parseDelimited(decodeDelimitedBytes(bytes), { keepBlankRows: true }),
      },
    ],
  };
}

const pinsOf = (value: ApiRenderInputValue): string[] =>
  (Array.isArray(value) ? value : [value]).flatMap((item) =>
    typeof item === 'object' && item !== null && 'assetId' in item ? [item.assetId] : [],
  );

export function RenderRowsImport({
  brandId,
  contract,
  existingRows,
  open,
  onOpenChange,
  onImport,
  pasted,
  preloaded,
}: {
  brandId: string;
  contract: ImportContract;
  existingRows: number;
  /** Rows pasted onto the grid, reviewed exactly as an uploaded sheet is. A new object is a new paste. */
  pasted?: { text: string } | null;
  /** A sheet handed over from elsewhere (the AI button) — read as if it had been chosen here. */
  preloaded?: { file: File } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: RequestRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const kitsRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [fromSaved, setFromSaved] = useState(false);
  const [saved, setSaved] = useState<ForgeImportMapping | null>(null);
  // Keyed by brand + id so remapping a column never refetches, and a brand switch never reuses.
  const [assets, setAssets] = useState<Record<string, MediaAsset | null | 'failed'>>({});
  const [links, setLinks] = useState<
    Record<string, { assetId: string; versionId: string } | string>
  >({});
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  const [kitFiles, setKitFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const requestedLinks = useRef(new Set<string>());
  const { variables, outputs, template } = contract;
  const variableScope = variables.map((variable) => `${variable.key}:${variable.kind}`).join('|');
  const byKey = useMemo(
    () => new Map(variables.map((variable) => [variable.key, variable])),
    [variables],
  );

  const targets = useMemo(
    () => [
      ...IMPORT_FIELDS.map((field) => ({ value: field.target as string, label: field.header })),
      ...variables
        .filter((variable) => !variable.reserved)
        .map((variable) => ({
          value: variable.key,
          label: variableColumnHeader(variable, variables),
        })),
    ],
    [variables],
  );
  const labelOf = (target: string) =>
    targets.find((option) => option.value === target)?.label ?? 'Do not import';

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new brand or variable set invalidates the sheet.
  useEffect(() => {
    scopeRef.current += 1;
    setWorkbook(null);
    setMapping(emptyMapping());
    setBusy(false);
    return () => {
      scopeRef.current += 1;
    };
  }, [brandId, variableScope]);

  // The mapping saved for this template, read once the dialog opens. A sheet chosen before the
  // answer arrives waits for it: read without it, last week's mapping is silently mapped again.
  const savedRead = useRef<Promise<ForgeImportMapping | null>>(Promise.resolve(null));
  // ponytail: web templates don't remember a column mapping (the route is workspace-scoped); add when asked.
  const remembersMapping = Boolean(template && !isWebTemplateKey(template.key));
  useEffect(() => {
    if (!open || !template || !remembersMapping) return;
    let live = true;
    const read = apiRendersApi
      .getImportMapping({ brandId, bindingId: template.bindingId, templateKey: template.key })
      .catch(() => null);
    savedRead.current = read;
    void read.then((answer) => live && setSaved(answer));
    return () => {
      live = false;
    };
  }, [open, brandId, template?.bindingId, template?.key, template, remembersMapping]);

  const tables = useMemo(
    () =>
      workbook?.tables.map((entry) => ({ name: entry.name, table: sheetTable(entry.cells) })) ?? [],
    [workbook],
  );
  const table: SheetTable | null = useMemo(() => {
    const entry = workbook?.tables[sheetIndex];
    if (!entry) return null;
    return headerRow === null ? tables[sheetIndex]!.table : sheetTable(entry.cells, headerRow);
  }, [workbook, tables, sheetIndex, headerRow]);

  const prepared = useMemo(
    () => (table ? prepareImport(table, mapping, variables) : null),
    [table, mapping, variables],
  );
  const mappings = prepared?.columns ?? {};
  const rowCount = table?.rows.length ?? 0;

  /** The saved mapping when this sheet has every header it named, else what the headers say. */
  const mapSheet = (next: SheetTable, savedMapping: ForgeImportMapping | null) => {
    const reusable =
      savedMapping &&
      savedMapping.headers.length > 0 &&
      savedMapping.headers.every((header) => next.headers.includes(header));
    if (reusable) {
      setFromSaved(true);
      setMapping({
        columns: Object.fromEntries(
          next.headers.map((header) => [header, savedMapping.columns[header] ?? IMPORT_SKIP]),
        ),
        label: savedMapping.label,
        outputs: savedMapping.outputs,
        decimals: savedMapping.decimals,
        kits: savedMapping.kits,
      });
      return true;
    }
    setFromSaved(false);
    const columns = autoMapHeaders(next.headers, variables, next.rows);
    setMapping({ ...emptyMapping(), columns, kits: kitColumns(variables, columns) });
    return false;
  };

  /** Ask the AI button's mapper — a sheet in another language maps by meaning, not by name. */
  const suggestMapping = async (next: SheetTable, sheetName: string) => {
    if (!template) return;
    const scope = scopeRef.current;
    setSuggesting(true);
    try {
      const answer = await apiRendersApi.suggestRows({
        brandId,
        bindingId: template.bindingId,
        templateKey: template.key,
        contractHash: template.contractHash,
        prompt: '',
        count: 1,
        autoCount: false,
        documentIds: [],
        mediaAssetIds: [],
        forksPerRow: 0,
        grid: {
          rows: [],
          selection: [],
          setDescription: null,
          mapColumns: true,
          tables: [
            {
              name: sheetName,
              headers: next.headers,
              rows: next.rows.slice(0, 200),
              notes: next.notes,
              legend: next.legend,
            },
          ],
        },
      });
      if (scope !== scopeRef.current) return;
      const op = answer.ops?.find((item) => item.op === 'map');
      if (op?.op === 'map') {
        setMapping({
          ...op.mapping,
          columns: Object.fromEntries(
            next.headers.map((header) => [header, op.mapping.columns[header] ?? IMPORT_SKIP]),
          ),
        });
        setFromSaved(false);
      }
    } catch {
      if (scope === scopeRef.current)
        toast.error('Could not suggest a mapping right now. Map the columns below.');
    } finally {
      if (scope === scopeRef.current) setSuggesting(false);
    }
  };

  /** A freshly read workbook: pick its sheet, map it, and ask for a mapping when names say little. */
  const showWorkbook = (next: Workbook, savedMapping: ForgeImportMapping | null = saved) => {
    const located = next.tables.map((entry) => ({
      name: entry.name,
      table: sheetTable(entry.cells),
    }));
    const index = pickSheet(located, {
      templateName: template?.displayName ?? template?.name ?? '',
      variables,
      savedHeaders: savedMapping?.headers,
    });
    const picked = located[index]!.table;
    if (picked.rows.length === 0) throw new Error('render_import_no_rows');
    // A new sheet retries what failed on the last one: links and Library lookups alike.
    setAssets((current) =>
      Object.fromEntries(Object.entries(current).filter(([, asset]) => asset !== 'failed')),
    );
    for (const [key, value] of Object.entries(links))
      if (typeof value === 'string') requestedLinks.current.delete(key);
    setLinks((current) =>
      Object.fromEntries(Object.entries(current).filter(([, value]) => typeof value !== 'string')),
    );
    setWorkbook(next);
    setSheetIndex(index);
    setHeaderRow(null);
    const reused = mapSheet(picked, savedMapping);
    // A sheet whose headers name fewer than half its columns is in other words than the template.
    const named = Object.values(autoMapHeaders(picked.headers, variables, picked.rows)).filter(
      (target) => target !== IMPORT_SKIP,
    ).length;
    if (!reused && template && named * 2 < picked.headers.length)
      void suggestMapping(picked, located[index]!.name);
  };

  const changeSheet = (index: number) => {
    const next = tables[index];
    if (!next) return;
    setSheetIndex(index);
    setHeaderRow(null);
    mapSheet(next.table, saved);
  };

  const changeHeaderRow = (oneBased: number) => {
    const entry = workbook?.tables[sheetIndex];
    if (!entry || !Number.isInteger(oneBased) || oneBased < 1 || oneBased > entry.cells.length)
      return;
    setHeaderRow(oneBased - 1);
    mapSheet(sheetTable(entry.cells, oneBased - 1), null);
  };

  // A paste replaces whatever sheet is under review, including an upload still on its way.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new paste is an event.
  useEffect(() => {
    if (!pasted) return;
    scopeRef.current += 1;
    setBusy(false);
    try {
      showWorkbook({
        sourceName: 'Clipboard',
        tables: [
          { name: 'Clipboard', cells: parseDelimited(pasted.text, { keepBlankRows: true }) },
        ],
      });
    } catch (error) {
      toast.error(importErrorMessage(error));
    }
  }, [pasted]);

  const loadFile = async (file: File) => {
    const scope = scopeRef.current;
    setBusy(true);
    try {
      const [next, savedMapping] = await Promise.all([readSheets(file), savedRead.current]);
      if (scope !== scopeRef.current) return;
      showWorkbook(next, savedMapping);
    } catch (error) {
      if (scope !== scopeRef.current) return;
      toast.error(importErrorMessage(error));
    } finally {
      if (scope === scopeRef.current) setBusy(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new handover is an event.
  useEffect(() => {
    if (preloaded && open) void loadFile(preloaded.file);
  }, [preloaded]);

  // --- media -----------------------------------------------------------------------------

  const mediaLinks = useMemo(() => {
    if (!prepared) return [];
    const found = new Map<string, { url: string; kind: 'image' | 'video' }>();
    for (const row of prepared.rows)
      for (const [column, target] of Object.entries(mappings)) {
        const kind = byKey.get(target)?.kind;
        const url = row[column]?.trim();
        if (
          (kind === 'image' || kind === 'video') &&
          url &&
          /^https:\/\//i.test(url) &&
          !isFolderLink(url)
        )
          found.set(`${brandId}:${kind}:${url}`, { url, kind });
      }
    return [...found];
  }, [prepared, mappings, byKey, brandId]);

  useEffect(() => {
    for (const [key, value] of mediaLinks) {
      if (requestedLinks.current.has(key)) continue;
      requestedLinks.current.add(key);
      void apiRendersApi.importMedia({ brandId, ...value }).then(
        (asset) => setLinks((current) => ({ ...current, [key]: asset })),
        (error) => setLinks((current) => ({ ...current, [key]: importErrorMessage(error) })),
      );
    }
    // `links` re-runs this after a retry has forgotten the failed ones.
  }, [brandId, mediaLinks, links]);

  /** Picture fields filled from a team's name: which column names them, and the names to match. */
  const kitTargets = useMemo(
    () =>
      Object.entries(mapping.kits).filter(
        ([key, header]) => table?.headers.includes(header) && byKey.get(key)?.kind === 'image',
      ),
    [mapping.kits, table, byKey],
  );
  useEffect(() => {
    if (!open || kitTargets.length === 0 || library !== null) return;
    let live = true;
    void libraryImages(brandId)
      .catch(() => [] as MediaAsset[])
      .then((images) => live && setLibrary(images));
    return () => {
      live = false;
    };
  }, [open, kitTargets.length, library, brandId]);

  const kitMatches = useMemo(() => {
    const candidates: KitCandidate[] = [
      ...kitFiles.map((file) => ({ name: file.name, file })),
      ...(library ?? []).map((asset) => ({ name: asset.title || asset.fileName, asset })),
    ];
    const byName = new Map<string, KitCandidate | null>();
    for (const [, header] of kitTargets)
      for (const row of table?.rows ?? []) {
        const name = row[header]?.trim();
        if (name && !byName.has(foldName(name)))
          byName.set(foldName(name), matchAssetByName(name, candidates));
      }
    return byName;
  }, [kitTargets, table, kitFiles, library]);
  const unmatchedKits = [...kitMatches.entries()]
    .filter(([, match]) => !match)
    .map(([name]) => name);

  // --- review ----------------------------------------------------------------------------

  const review = useMemo(() => {
    if (!prepared) return null;
    const duplicate = duplicateMappedVariable(mappings, IMPORT_SKIP);
    if (duplicate) return { duplicate, rows: [], errors: [] };
    const errors: ImportCellError[] = [];
    const sourceRows = prepared.rows.map((source, row) => {
      const next = { ...source };
      for (const [column, target] of Object.entries(mappings)) {
        const kind = byKey.get(target)?.kind;
        const url = source[column]?.trim();
        if ((kind !== 'image' && kind !== 'video') || !url || !/^https:\/\//i.test(url)) continue;
        if (isFolderLink(url)) {
          next[column] = '';
          continue;
        }
        const asset = links[`${brandId}:${kind}:${url}`];
        next[column] = asset && typeof asset !== 'string' ? asset.assetId : '';
        if (typeof asset === 'string') errors.push({ row, column, message: asset });
      }
      return next;
    });
    const result = rowsFromMappedImport(sourceRows, mappings, variables, outputs);
    result.rows.forEach((row, index) => {
      for (const [column, target] of Object.entries(mappings)) {
        const kind = byKey.get(target)?.kind;
        const url = prepared.rows[index]?.[column]?.trim();
        if ((kind !== 'image' && kind !== 'video') || !url) continue;
        const asset = links[`${brandId}:${kind}:${url}`];
        if (
          asset &&
          typeof asset !== 'string' &&
          row.values[target] &&
          !Array.isArray(row.values[target])
        )
          row.values[target] = { assetId: asset.assetId, versionId: asset.versionId };
      }
    });
    return { duplicate: null, rows: result.rows, errors: [...result.errors, ...errors] };
  }, [prepared, mappings, variables, outputs, links, brandId, byKey]);

  const pending = useMemo(
    () =>
      review ? pinnedAssetIds(review.rows).filter((id) => !(`${brandId}:${id}` in assets)) : [],
    [review, assets, brandId],
  );

  // Once per id: a remap while a lookup is in flight must not start a second one.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const id of pending) {
      const key = `${brandId}:${id}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void lookupLibraryAsset(brandId, id).then(
        (asset) => setAssets((current) => ({ ...current, [key]: asset })),
        () => {
          requested.current.delete(key);
          setAssets((current) => ({ ...current, [key]: 'failed' }));
        },
      );
    }
  }, [pending, brandId]);

  const checked = useMemo(() => {
    if (!review) return null;
    const columnOf = new Map(Object.entries(mappings).map(([header, target]) => [target, header]));
    const errors: ImportCellError[] = [...review.errors];
    const rows = review.rows.map((row, index) => {
      const media: RequestRow['media'] = {};
      const values = { ...row.values };
      for (const [key, value] of Object.entries(row.values)) {
        const pins = pinsOf(value);
        if (pins.length === 0) continue;
        const lookups = pins.map((id) => assets[`${brandId}:${id}`]);
        const kind = byKey.get(key)?.kind;
        const mismatch = lookups.find(
          (asset): asset is MediaAsset =>
            typeof asset === 'object' && asset !== null && asset.kind !== kind,
        );
        const message = lookups.includes('failed')
          ? 'Could not check this id'
          : lookups.includes(null)
            ? 'No Library asset with this id'
            : mismatch && kind
              ? `This Library asset is ${article(mismatch.kind)} ${mismatch.kind}, not ${article(kind)} ${kind}`
              : null;
        if (message) {
          errors.push({ row: index, column: columnOf.get(key) ?? key, message });
          delete values[key];
          continue;
        }
        const first = lookups[0];
        if (first && first !== 'failed') media[key] = rowMediaOf(first);
      }
      // Kits from Library matches; dropped files are uploaded when the rows are imported.
      for (const [key, header] of kitTargets) {
        if (values[key] !== undefined) continue;
        const match = kitMatches.get(foldName(table?.rows[index]?.[header] ?? ''));
        if (match?.asset) {
          values[key] = { assetId: match.asset.id };
          media[key] = rowMediaOf(match.asset);
        }
      }
      return { ...row, values, media: { ...row.media, ...media } };
    });
    return { rows, errors };
  }, [review, mappings, assets, brandId, byKey, kitTargets, kitMatches, table]);

  const overCap = workbook !== null && !canImportRows(existingRows, rowCount);
  const failedLinks = mediaLinks.filter(([key]) => typeof links[key] === 'string');
  const retryFailedLinks = () => {
    for (const [key] of failedLinks) requestedLinks.current.delete(key);
    setLinks((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !failedLinks.some(([failed]) => failed === key)),
      ),
    );
  };
  const checking = pending.length > 0 || mediaLinks.some(([key]) => !links[key]);
  const errors = checked?.errors ?? [];
  const errorByCell = new Map(
    errors.map((error) => [cellKey(error.row, error.column), error.message]),
  );
  const folderColumns = table
    ? Object.entries(mappings).filter(
        ([header, target]) =>
          ['image', 'video'].includes(byKey.get(target)?.kind ?? '') &&
          table.rows.some((row) => isFolderLink(row[header] ?? '')),
      )
    : [];
  const mappedHeaders =
    prepared?.headers.filter((header) => mappings[header] !== IMPORT_SKIP) ?? [];
  const formatsColumn = Object.entries(mapping.columns).find(
    ([, target]) => target === '@formats',
  )?.[0];
  const formatValues = formatsColumn
    ? [
        ...new Set(table?.rows.map((row) => row[formatsColumn]?.trim() ?? '').filter(Boolean)),
      ].slice(0, 10)
    : [];
  const canImport =
    checked !== null &&
    rowCount > 0 &&
    !busy &&
    !suggesting &&
    !uploading &&
    !checking &&
    !overCap &&
    !review?.duplicate;

  const importRows = async () => {
    if (!checked || !canImport || !table || !workbook) return;
    let rows = checked.rows;
    // Kits matched to dropped files: upload each once, only now that they are wanted, a few at a
    // time — one by one, seventeen jerseys held the dialog for 45 s with nothing on screen.
    const files = [
      ...new Set([...kitMatches.values()].flatMap((match) => (match?.file ? [match.file] : []))),
    ];
    const wanted = new Map<File, { assetId: string; versionId: string; thumbnailUrl: string }>();
    if (files.length) {
      setUploading({ done: 0, total: files.length });
      try {
        const queue = [...files];
        await Promise.all(
          Array.from({ length: Math.min(KIT_UPLOADS_AT_ONCE, queue.length) }, async () => {
            for (let file = queue.shift(); file; file = queue.shift()) {
              const uploaded = await uploadMediaAsset({ brandId, file });
              wanted.set(file, {
                assetId: uploaded.assetId,
                versionId: uploaded.versionId,
                thumbnailUrl: uploaded.signedUrl,
              });
              setUploading({ done: wanted.size, total: files.length });
            }
          }),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'A picture could not be uploaded.');
        return;
      } finally {
        setUploading(null);
      }
    }
    if (wanted.size)
      rows = rows.map((row, index) => {
        const values = { ...row.values };
        const media = { ...row.media };
        for (const [key, header] of kitTargets) {
          if (values[key] !== undefined) continue;
          const match = kitMatches.get(foldName(table.rows[index]?.[header] ?? ''));
          const file = match?.file ? wanted.get(match.file) : undefined;
          if (!file || !match?.file) continue;
          values[key] = { assetId: file.assetId, versionId: file.versionId };
          media[key] = { thumbnailUrl: file.thumbnailUrl, name: match.file.name };
        }
        return { ...row, values, media };
      });
    onImport(rows);
    onOpenChange(false);
    if (template && remembersMapping)
      void apiRendersApi
        .saveImportMapping({
          brandId,
          bindingId: template.bindingId,
          templateKey: template.key,
          mapping: {
            sheet: workbook.tables[sheetIndex]?.name ?? null,
            headerRow: table.headerRow,
            headers: table.headers,
            ...mapping,
          },
        })
        .catch(() =>
          toast.error('The rows imported, but this mapping was not saved for next time.'),
        );
    const n = rows.length;
    toast.success(
      `${n} row${n === 1 ? '' : 's'} imported for review${errors.length ? ` · ${errors.length} cell${errors.length === 1 ? '' : 's'} left empty` : ''}`,
    );
  };

  const setColumn = (header: string, target: string) => {
    setMapping((current) => {
      const columns = { ...current.columns, [header]: target };
      return { ...current, columns, kits: { ...kitColumns(variables, columns), ...current.kits } };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import render rows</DialogTitle>
          <DialogDescription>
            Choose an .xlsx or .csv — every tab is read here, in your browser. Review the mapping,
            then add the rows. Nothing renders automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Spreadsheet</FieldLabel>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                // Choosing the same file again after fixing it must still fire a change.
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <FileSpreadsheet data-icon="inline-start" />
              )}
              Choose XLSX or CSV
            </Button>
            <FieldDescription>
              Title rows, notes and a colour legend around the data are fine. Colour names (Rojo,
              Blanco) and short hexes become full hex colours.
            </FieldDescription>
          </Field>

          {workbook && table ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3">
                {workbook.tables.length > 1 ? (
                  <Field className="w-56">
                    <FieldLabel>Sheet</FieldLabel>
                    <Select
                      value={String(sheetIndex)}
                      onValueChange={(value) => changeSheet(Number(value))}
                    >
                      <SelectTrigger aria-label="Sheet">
                        <SelectValue>
                          {workbook.tables[sheetIndex]?.name.trim() || `Sheet ${sheetIndex + 1}`}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {tables.map((entry, index) => (
                            <SelectItem key={`${entry.name}-${index}`} value={String(index)}>
                              {entry.name.trim() || `Sheet ${index + 1}`} ·{' '}
                              {entry.table.rows.length} rows
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <Field className="w-32">
                  <FieldLabel htmlFor="import-header-row">Header row</FieldLabel>
                  <Input
                    id="import-header-row"
                    type="number"
                    min={1}
                    value={table.headerRow + 1}
                    onChange={(event) => changeHeaderRow(Number(event.target.value))}
                  />
                </Field>
                <Field className="min-w-56 flex-1">
                  <FieldLabel htmlFor="import-row-names">Row names</FieldLabel>
                  <Input
                    id="import-row-names"
                    value={mapping.label ?? ''}
                    placeholder="{Equipo A} vs. {Equipo B}"
                    onChange={(event) =>
                      setMapping((current) => ({ ...current, label: event.target.value || null }))
                    }
                  />
                </Field>
                {template ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={suggesting}
                    onClick={() =>
                      void suggestMapping(table, workbook.tables[sheetIndex]?.name ?? '')
                    }
                  >
                    {suggesting ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Sparkles data-icon="inline-start" />
                    )}
                    {suggesting ? 'Mapping columns…' : 'Suggest mapping'}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs font-medium">
                {workbook.sourceName} · {rowCount} row{rowCount === 1 ? '' : 's'}
                {fromSaved ? ' · mapped as last time' : ''}
              </p>

              {table.headers.map((header) => {
                const target = mapping.columns[header] ?? IMPORT_SKIP;
                const kind = byKey.get(target)?.kind;
                return (
                  <Field key={header} orientation="horizontal">
                    <FieldLabel className="min-w-32">{header}</FieldLabel>
                    <Select value={target} onValueChange={(value) => setColumn(header, value)}>
                      <SelectTrigger aria-label={`Map ${header}`}>
                        <SelectValue>{labelOf(target)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={IMPORT_SKIP}>Do not import</SelectItem>
                          {targets.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {kind === 'text' || kind === 'number' ? (
                      <Select
                        value={String(mapping.decimals[target] ?? 'as-written')}
                        onValueChange={(value) =>
                          setMapping((current) => {
                            const { [target]: _old, ...decimals } = current.decimals;
                            return {
                              ...current,
                              decimals:
                                value === 'as-written'
                                  ? decimals
                                  : { ...decimals, [target]: Number(value) },
                            };
                          })
                        }
                      >
                        <SelectTrigger aria-label={`Decimals for ${header}`} className="w-36">
                          <SelectValue>
                            {mapping.decimals[target] === undefined
                              ? 'As written'
                              : `${mapping.decimals[target]} decimals`}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="as-written">As written</SelectItem>
                            {[0, 1, 2, 3].map((places) => (
                              <SelectItem key={places} value={String(places)}>
                                {places} decimals
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </Field>
                );
              })}

              {formatsColumn && outputs.length > 1 ? (
                <div className="flex flex-col gap-1.5 rounded-md border p-2">
                  <p className="text-xs font-medium">Which format each “{formatsColumn}” picks</p>
                  {formatValues.map((value) => {
                    const picked = mapping.outputs[foldName(value)];
                    return (
                      <Field key={value} orientation="horizontal">
                        <FieldLabel className="min-w-40 font-normal">{value}</FieldLabel>
                        <Select
                          value={picked ?? ''}
                          onValueChange={(next) =>
                            setMapping((current) => ({
                              ...current,
                              outputs: { ...current.outputs, [foldName(value)]: next },
                            }))
                          }
                        >
                          <SelectTrigger aria-label={`Format for ${value}`}>
                            <SelectValue>
                              {outputs.find((output) => output.id === picked)?.label ??
                                'Match by name'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {outputs.map((output) => (
                                <SelectItem key={output.id} value={output.id}>
                                  {output.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  })}
                </div>
              ) : null}

              {kitTargets.length ? (
                <div className="flex flex-col gap-1 rounded-md border p-2 text-xs">
                  <p className="font-medium">
                    Pictures by name:{' '}
                    {kitTargets
                      .map(([key, header]) => `${byKey.get(key)?.label ?? key} ← ${header}`)
                      .join(' · ')}
                  </p>
                  <p className="text-muted-foreground">
                    {library === null
                      ? 'Looking for each name in your Library…'
                      : `${kitMatches.size - unmatchedKits.length} of ${kitMatches.size} found${
                          unmatchedKits.length ? ` — not found: ${unmatchedKits.join(', ')}` : ''
                        }.`}
                  </p>
                  <input
                    ref={kitsRef}
                    type="file"
                    multiple
                    accept="image/*"
                    {...{ webkitdirectory: '' }}
                    className="sr-only"
                    aria-label="Choose a folder of pictures"
                    onChange={(event) => {
                      // Names only: the folder's structure says nothing about which team a picture is.
                      const files = Array.from(event.target.files ?? []).filter((file) =>
                        file.type.startsWith('image/'),
                      );
                      event.target.value = '';
                      setKitFiles((current) => [...current, ...files]);
                    }}
                  />
                  {unmatchedKits.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="w-fit"
                      onClick={() => kitsRef.current?.click()}
                    >
                      <FolderOpen data-icon="inline-start" />
                      Add a folder of pictures, named by team
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {folderColumns.length ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {folderColumns.map(([header]) => header).join(', ')} hold a Drive folder link, not
                  a picture — those cells are skipped.
                </p>
              ) : null}
              {overCap ? (
                <p role="alert" className="text-xs text-destructive">
                  This sheet has {rowCount} rows. A render set holds at most {MAX_BATCH_ROWS}
                  {existingRows > 0 ? ` (${existingRows} already here)` : ''}.
                </p>
              ) : null}
              {review?.duplicate ? (
                <p role="alert" className="text-xs text-destructive">
                  {labelOf(review.duplicate)} is mapped more than once. Choose one source column.
                </p>
              ) : null}
              {checking ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Importing links and checking Library
                  ids…
                </p>
              ) : null}
              {failedLinks.length > 0 ? (
                <Button type="button" variant="outline" size="xs" onClick={retryFailedLinks}>
                  Retry linked media
                </Button>
              ) : null}

              {mappedHeaders.length > 0 && checked && checked.rows.length > 0 && prepared ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-2 py-1 text-left font-medium">#</th>
                        {mappedHeaders.map((header) => (
                          <th key={header} className="px-2 py-1 text-left font-medium">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prepared.rows.slice(0, PREVIEW_ROWS).map((source, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: sheet rows have no id; order is the identity.
                        <tr key={index} className="border-b last:border-0">
                          <td className="px-2 py-1 text-muted-foreground">{index + 1}</td>
                          {mappedHeaders.map((header) => {
                            const message = errorByCell.get(cellKey(index, header));
                            const thumbnail =
                              checked.rows[index]?.media[mappings[header] ?? '']?.thumbnailUrl;
                            return (
                              <td
                                key={header}
                                title={message}
                                className={cn(
                                  'max-w-40 truncate px-2 py-1',
                                  message && 'text-amber-600 ring-1 ring-amber-500 ring-inset',
                                )}
                              >
                                <span className="flex items-center gap-1">
                                  {thumbnail ? (
                                    // biome-ignore lint/performance/noImgElement: a signed Library thumbnail, not a static asset.
                                    <img
                                      src={thumbnail}
                                      alt=""
                                      className="size-5 rounded object-cover"
                                    />
                                  ) : null}
                                  <span className="truncate">{source[header]}</span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {errors.length > 0 ? (
                <ul
                  role="status"
                  className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs text-amber-700 dark:text-amber-400"
                >
                  {errors.map((error) => (
                    <li key={`${cellKey(error.row, error.column)}:${error.message}`}>
                      Row {error.row + 1} · {error.column}: {error.message} — imported empty
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="items-center">
          {errors.length > 0 ? (
            <p className="mr-auto text-2xs text-muted-foreground">
              {errors.length} cell{errors.length === 1 ? '' : 's'} will be left empty for you to
              fill in the grid.
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canImport} onClick={() => void importRows()}>
            {uploading ? (
              <>
                <Loader2 className="animate-spin" data-icon="inline-start" />
                Uploading pictures {uploading.done}/{uploading.total}…
              </>
            ) : (
              `Import ${rowCount ? `${rowCount} ` : ''}rows`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
