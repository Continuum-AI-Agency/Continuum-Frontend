'use client';

import {
  type ApiRenderInputValue,
  type ApiRenderTemplateContract,
  type ForgeRenderImportPreview,
  type MediaAsset,
  mediaAssetSchema,
} from '@continuum/contracts';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
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
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
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
  parseDelimited,
  pinnedAssetIds,
  type RequestRow,
  recordsFromTable,
  rowsFromMappedImport,
  variableColumnHeader,
} from './renderRequestRows';

type ImportContract = Pick<ApiRenderTemplateContract, 'variables' | 'outputs'>;

const PREVIEW_ROWS = 10;
const wait = () => new Promise((resolve) => setTimeout(resolve, 1_000));
const cellKey = (row: number, column: string) => `${row}:${column}`;

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

/** Builds the template CSV (buildTemplateCsv) and saves it client-side via Blob + a temporary <a download>. */
export function downloadTemplateCsv(contract: ImportContract, fileName: string): void {
  // The BOM is what makes Excel read the file as UTF-8 instead of mangling accented samples.
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', buildTemplateCsv(contract)], { type: 'text/csv;charset=utf-8' }),
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
  render_import_duplicate_headers: 'Two columns share a header. Rename one and upload again.',
  render_import_no_rows: 'This spreadsheet has no rows to import.',
  render_import_too_large: 'This spreadsheet is too large to import.',
  render_import_not_found: 'The uploaded spreadsheet was not found. Upload it again.',
  render_import_failed: 'Could not read this spreadsheet.',
};

/** The server refuses with a bare code; the person needs the sentence (and the row count). */
function importErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not read this spreadsheet.';
  const rowCount = error instanceof ApiError ? error.payload?.rowCount : undefined;
  if (error.message === 'render_import_too_many_rows' && typeof rowCount === 'number') {
    return `This sheet has ${rowCount} rows. A render set holds at most ${MAX_BATCH_ROWS}.`;
  }
  return IMPORT_ERROR_COPY[error.message] ?? error.message;
}

const article = (word: string) => (/^[aeiou]/.test(word) ? 'an' : 'a');

/** Delimited text — a CSV file or rows pasted onto the grid — as the preview the review reads. */
const previewOfText = (text: string, sourceName: string): ForgeRenderImportPreview => {
  const { headers, rows } = recordsFromTable(parseDelimited(text));
  return { sourceName, sheetName: null, headers, rows, rowCount: rows.length };
};

const isCsv = (file: File) => file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

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
}: {
  brandId: string;
  contract: ImportContract;
  existingRows: number;
  /** Rows pasted onto the grid, reviewed exactly as an uploaded sheet is. A new object is a new paste. */
  pasted?: { text: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: RequestRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ForgeRenderImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  // Keyed by brand + id so remapping a column never refetches, and a brand switch never reuses.
  const [assets, setAssets] = useState<Record<string, MediaAsset | null | 'failed'>>({});
  const { variables, outputs } = contract;
  const variableScope = variables.map((variable) => `${variable.key}:${variable.kind}`).join('|');

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
    setPreview(null);
    setMappings({});
    setBusy(false);
    return () => {
      scopeRef.current += 1;
    };
  }, [brandId, variableScope]);

  const review = useMemo(() => {
    if (!preview) return null;
    const duplicate = duplicateMappedVariable(mappings, IMPORT_SKIP);
    if (duplicate) return { duplicate, rows: [], errors: [] };
    return { duplicate: null, ...rowsFromMappedImport(preview.rows, mappings, variables, outputs) };
  }, [preview, mappings, variables, outputs]);

  const pending = useMemo(
    () =>
      review ? pinnedAssetIds(review.rows).filter((id) => !(`${brandId}:${id}` in assets)) : [],
    [review, assets, brandId],
  );

  // Once per id: a remap while a lookup is in flight must not start a second one. No scope guard —
  // the key already names the brand, so a late answer is still true for that key.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const id of pending) {
      const key = `${brandId}:${id}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void lookupLibraryAsset(brandId, id).then(
        (asset) => setAssets((current) => ({ ...current, [key]: asset })),
        () => {
          // Retryable, never from this effect: the next sheet load or remap asks again.
          requested.current.delete(key);
          setAssets((current) => ({ ...current, [key]: 'failed' }));
        },
      );
    }
  }, [pending, brandId]);

  const retryFailedLookups = () =>
    setAssets((current) =>
      Object.fromEntries(Object.entries(current).filter(([, asset]) => asset !== 'failed')),
    );

  const checked = useMemo(() => {
    if (!review) return null;
    const columnOf = new Map(Object.entries(mappings).map(([header, target]) => [target, header]));
    const kindOf = new Map(variables.map((variable) => [variable.key, variable.kind]));
    const errors: ImportCellError[] = [...review.errors];
    const rows = review.rows.map((row, index) => {
      const media: RequestRow['media'] = {};
      for (const [key, value] of Object.entries(row.values)) {
        const pins = pinsOf(value);
        if (pins.length === 0) continue;
        const lookups = pins.map((id) => assets[`${brandId}:${id}`]);
        const kind = kindOf.get(key);
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
        if (message) errors.push({ row: index, column: columnOf.get(key) ?? key, message });
        const first = lookups[0];
        if (!first || first === 'failed') continue;
        media[key] = {
          ...(first.width && first.height ? { w: first.width, h: first.height } : {}),
          thumbnailUrl: first.thumbnailUrl ?? first.signedUrl ?? null,
        };
      }
      return Object.keys(media).length ? { ...row, media: { ...row.media, ...media } } : row;
    });
    return { rows, errors };
  }, [review, mappings, variables, assets, brandId]);

  const showPreview = (next: ForgeRenderImportPreview) => {
    retryFailedLookups();
    setMappings(autoMapHeaders(next.headers, variables));
    setPreview(next);
  };

  // A paste replaces whatever sheet is under review, including an upload still on its way.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new paste is an event.
  useEffect(() => {
    if (!pasted) return;
    scopeRef.current += 1;
    setBusy(false);
    showPreview(previewOfText(pasted.text, 'Clipboard'));
  }, [pasted]);

  const loadFile = async (file: File) => {
    const scope = scopeRef.current;
    setBusy(true);
    try {
      let next: ForgeRenderImportPreview | null = null;
      if (isCsv(file)) {
        // Quoted cells parse the same here as in a paste; a CSV never needs the server.
        next = previewOfText(await file.text(), file.name);
        if (next.headers.length === 0) throw new Error('This CSV has no header row.');
      } else {
        const uploaded = await uploadBrandDocument({ brandId, file });
        if (scope !== scopeRef.current) return;
        for (let attempt = 0; attempt < 30 && !next; attempt += 1) {
          try {
            next = await apiRendersApi.previewImport({ brandId, documentId: uploaded.documentId });
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('render_import_extracting')) {
              throw error;
            }
            await wait();
          }
        }
        if (!next) throw new Error('The spreadsheet is still extracting. Try again shortly.');
      }
      if (scope !== scopeRef.current) return;
      showPreview(next);
    } catch (error) {
      if (scope !== scopeRef.current) return;
      toast.error(importErrorMessage(error));
    } finally {
      if (scope === scopeRef.current) setBusy(false);
    }
  };

  const overCap = preview !== null && !canImportRows(existingRows, preview.rowCount);
  const checking = pending.length > 0;
  const errors = checked?.errors ?? [];
  const errorByCell = new Map(
    errors.map((error) => [cellKey(error.row, error.column), error.message]),
  );
  const mappedHeaders = preview?.headers.filter((header) => mappings[header] !== IMPORT_SKIP) ?? [];
  const canImport =
    checked !== null && !busy && !checking && !overCap && !review?.duplicate && errors.length === 0;

  const importRows = () => {
    if (!checked || !canImport) return;
    onImport(checked.rows);
    onOpenChange(false);
    const n = checked.rows.length;
    toast.success(`${n} row${n === 1 ? '' : 's'} imported for review`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import render rows</DialogTitle>
          <DialogDescription>
            Upload CSV or XLSX, review the column mapping, then add the rows. Nothing renders
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Spreadsheet</FieldLabel>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
              Choose CSV or XLSX
            </Button>
            <FieldDescription>
              Name, Parent, Formats, Replace ad ID and variable columns map by key or label. Media
              columns take Library asset ids.
            </FieldDescription>
          </Field>

          {preview ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">
                {preview.sourceName} · {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'}
              </p>
              {preview.headers.map((header) => (
                <Field key={header} orientation="horizontal">
                  <FieldLabel className="min-w-32">{header}</FieldLabel>
                  <Select
                    value={mappings[header] ?? IMPORT_SKIP}
                    onValueChange={(value) => {
                      retryFailedLookups();
                      setMappings((current) => ({ ...current, [header]: value }));
                    }}
                  >
                    <SelectTrigger aria-label={`Map ${header}`}>
                      <SelectValue>{labelOf(mappings[header] ?? IMPORT_SKIP)}</SelectValue>
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
                </Field>
              ))}

              {overCap ? (
                <p role="alert" className="text-xs text-destructive">
                  This sheet has {preview.rowCount} rows. A render set holds at most{' '}
                  {MAX_BATCH_ROWS}
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
                  <Loader2 className="size-3 animate-spin" /> Checking Library ids…
                </p>
              ) : null}

              {mappedHeaders.length > 0 && checked && checked.rows.length > 0 ? (
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
                      {preview.rows.slice(0, PREVIEW_ROWS).map((source, index) => (
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
                                  message && 'text-destructive ring-1 ring-destructive ring-inset',
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
                  role="alert"
                  className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs text-destructive"
                >
                  {errors.map((error) => (
                    <li key={`${cellKey(error.row, error.column)}:${error.message}`}>
                      Row {error.row + 1} · {error.column}: {error.message}
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
              Fix these cells in the sheet, or map the column to Do not import.
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canImport} onClick={importRows}>
            Import reviewed rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
