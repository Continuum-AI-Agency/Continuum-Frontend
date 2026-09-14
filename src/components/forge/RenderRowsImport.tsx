'use client';

import type {
  ApiRenderVariable,
  ForgeRenderDriveSnapshot,
  ForgeRenderImportPreview,
} from '@continuum/contracts';
import { FileSpreadsheet, FolderSearch, Loader2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  canImportRows,
  duplicateMappedVariable,
  MAX_BATCH_ROWS,
  type RequestRow,
  rowsFromMappedImport,
} from './renderRequestRows';

const SKIP = '__skip__';
const wait = () => new Promise((resolve) => setTimeout(resolve, 1_000));

export function RenderRowsImport({
  brandId,
  variables,
  existingRows,
  onImport,
}: {
  brandId: string;
  variables: ApiRenderVariable[];
  existingRows: number;
  onImport: (rows: RequestRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ForgeRenderImportPreview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [folderId, setFolderId] = useState('');
  const [snapshot, setSnapshot] = useState<ForgeRenderDriveSnapshot | null>(null);
  const scalarVariables = useMemo(
    () => variables.filter((variable) => variable.kind !== 'image' && variable.kind !== 'video'),
    [variables],
  );
  const variableScope = variables.map((variable) => `${variable.key}:${variable.kind}`).join('|');

  useEffect(() => {
    scopeRef.current += 1;
    setPreview(null);
    setMappings({});
    setSnapshot(null);
    setBusy(false);
    return () => {
      scopeRef.current += 1;
    };
  }, [brandId, variableScope]);

  const loadFile = async (file: File) => {
    const scope = scopeRef.current;
    setBusy(true);
    try {
      const uploaded = await uploadBrandDocument({ brandId, file });
      if (scope !== scopeRef.current) return;
      let next: ForgeRenderImportPreview | null = null;
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
      if (scope !== scopeRef.current) return;
      const byName = new Map<string, string>();
      for (const variable of scalarVariables) {
        byName.set(variable.key.toLowerCase(), variable.key);
        byName.set(variable.label.toLowerCase(), variable.key);
      }
      setMappings(
        Object.fromEntries(
          next.headers.map((header) => [header, byName.get(header.toLowerCase()) ?? SKIP]),
        ),
      );
      setPreview(next);
    } catch (error) {
      if (scope !== scopeRef.current) return;
      toast.error(error instanceof Error ? error.message : 'Could not read this spreadsheet.');
    } finally {
      if (scope === scopeRef.current) setBusy(false);
    }
  };

  const importRows = () => {
    if (!preview) return;
    const duplicate = duplicateMappedVariable(mappings, SKIP);
    if (duplicate) {
      const label =
        scalarVariables.find((variable) => variable.key === duplicate)?.label ?? duplicate;
      toast.error(`${label} is mapped more than once. Choose one source column.`);
      return;
    }
    if (!canImportRows(existingRows, preview.rowCount)) {
      toast.error(
        `Import rejected: ${existingRows} existing + ${preview.rowCount} imported exceeds ${MAX_BATCH_ROWS}.`,
      );
      return;
    }
    const rows = rowsFromMappedImport(preview.rows, mappings, scalarVariables);
    onImport(rows);
    setOpen(false);
    toast.success(`${rows.length} row${rows.length === 1 ? '' : 's'} imported for review`);
  };

  const inspectDrive = async () => {
    if (!folderId.trim()) return;
    const scope = scopeRef.current;
    setBusy(true);
    try {
      const next = await apiRendersApi.snapshotDriveFolder({ brandId, folderId: folderId.trim() });
      if (scope === scopeRef.current) setSnapshot(next);
    } catch (error) {
      if (scope !== scopeRef.current) return;
      const message = error instanceof Error ? error.message : '';
      toast.error(
        message.includes('drive_scope_required')
          ? 'Reconnect Google Workspace with Drive read access to snapshot this folder.'
          : 'Could not read this Drive folder.',
      );
    } finally {
      if (scope === scopeRef.current) setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <Upload data-icon="inline-start" /> Import
          </Button>
        }
      />
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
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
              XLSX uses the existing Library document extraction path. Original headers and cell
              text are preserved.
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
                    value={mappings[header] ?? SKIP}
                    onValueChange={(value) =>
                      setMappings((current) => ({ ...current, [header]: value }))
                    }
                  >
                    <SelectTrigger aria-label={`Map ${header}`}>
                      <SelectValue>
                        {scalarVariables.find((variable) => variable.key === mappings[header])
                          ?.label ?? 'Do not import'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={SKIP}>Do not import</SelectItem>
                        {scalarVariables.map((variable) => (
                          <SelectItem key={variable.key} value={variable.key}>
                            {variable.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
              <p className="text-2xs text-muted-foreground">
                Media URL columns require a separate confirmed Library ingest and are not mapped as
                text values.
              </p>
            </div>
          ) : null}

          <Field>
            <FieldLabel htmlFor="forge-drive-folder">Drive folder ID</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="forge-drive-folder"
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
                placeholder="Folder ID"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || !folderId.trim()}
                onClick={inspectDrive}
              >
                <FolderSearch data-icon="inline-start" /> Snapshot
              </Button>
            </div>
            <FieldDescription>
              This is a one-time review snapshot, never a continuous sync.
            </FieldDescription>
          </Field>
          {snapshot ? (
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs">
              {snapshot.files.map((file) => (
                <p key={file.id}>{file.name}</p>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!preview || busy} onClick={importRows}>
            Import reviewed rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
