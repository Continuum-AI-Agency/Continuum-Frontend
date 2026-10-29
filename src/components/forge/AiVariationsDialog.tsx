'use client';

import {
  API_RENDER_DRAFT_DOCUMENTS_MAX,
  API_RENDER_DRAFT_MEDIA_MAX,
  API_RENDER_SUGGEST_ROWS_MAX,
  type ApiRenderAssistGrid,
  type ApiRenderInputValue,
  type ApiRenderRowGate,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  classifyLibraryFile,
  decodeDelimitedBytes,
  parseDelimited,
  readableLayerName,
  readWorkbook,
  sheetTable,
} from '@continuum/contracts';
import { FolderOpen, Loader2, Paperclip, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import { ACCEPTED_DOCUMENT_EXTENSIONS, hasDocumentExtension } from '@/lib/documents/uploadLimits';
import { folderFilesFromDrop, folderFilesFromInput } from '@/lib/library/folderUpload';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// "Draft with AI": a brief becomes rows in the Render grid — new rows, each with variations if
// asked, or variations of one row that change only what the person ticks. The rows arrive
// PROPOSED: on screen and checked like any typed row, but not saved, reviewed or rendered until
// they are kept. The model chooses pictures from the brand's Library and colours from its palette;
// it never names an asset or a hex of its own.
//
// Called rows, not variants: a VARIANT is a sibling version of the template — a ratio, a language —
// and lives in the Variants tab. See template-forge docs/TEMPLATE_IDENTITY.md.
//
// The model checker is parked. Source evidence and deterministic checks are shown in the row
// fields; any older flagged gate result can still be reviewed before the rows enter the grid.
//
// With rows in the grid, or a spreadsheet attached, it is the grid's assistant instead: "odds on
// row 3 to 1.80", "red box on the higher odd for all of these", "build Card B from this sheet".
// The sheet is read here and never uploaded; the answer is applied as one undo step and the
// bubble stays open for the next ask. A sheet with nothing asked of it goes to Import, which maps
// it exactly instead of interpreting it.

type DraftedRow = ApiRenderSuggestRowsResponse['rows'][number];

/** A flagged row's failure in words a person can act on; null for every other row. */
function gateSentence(gate: ApiRenderRowGate, labels: Map<string, string>): string | null {
  if (gate.status !== 'flagged') return null;
  const rule = (check: ApiRenderRowGate['checks'][number]) => {
    switch (check.rule) {
      case 'names_offer':
        return 'does not name the product in its picture';
      case 'brand_language':
        return "is not in the brand's language";
      default:
        return `“${readableLayerName(labels.get(check.subject ?? '') ?? check.subject ?? '')}” is not the kind of text its slot holds`;
    }
  };
  const said = [...new Set(gate.checks.filter((check) => check.verdict === 'fail').map(rule))];
  return `Fails: ${said.join('; ')}${gate.regenerated ? ' (rewritten once)' : ''}`;
}

const flaggedRow = (row: DraftedRow) => row.gate?.status === 'flagged';

/** The rows a person kept: ticked, and every row above it ticked too — a variation needs its row. */
function keptRows(rows: DraftedRow[], ticked: ReadonlySet<string>): DraftedRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept = (row: DraftedRow): boolean =>
    ticked.has(row.id) &&
    (!row.parentId || !byId.has(row.parentId) || kept(byId.get(row.parentId) as DraftedRow));
  return rows.filter(kept);
}

export type AiDraftParent = {
  id: string;
  label: string;
  values: Record<string, ApiRenderInputValue>;
};

type DraftFile = {
  name: string;
  id: string;
  kind: 'document' | 'media';
  status: 'uploading' | 'processing' | 'ready' | 'error';
};
export type SelectedFile = { file: File; name: string };
type AttachedSheet = { name: string; file: File; tables: ApiRenderAssistGrid['tables'] };

const isSheetFile = (file: File) => /\.(xlsx|csv|tsv)$/i.test(file.name);

/**
 * What was dropped, folders walked. Call it inside the drop event: the browser empties
 * `dataTransfer` once the handler returns, so the entries are taken before the first await.
 */
export function filesFromDrop(dataTransfer: DataTransfer): Promise<SelectedFile[]> {
  const loose = Array.from(dataTransfer.files);
  return folderFilesFromDrop(dataTransfer.items).then((entries) =>
    entries
      ? entries.map(({ file, folders }) => ({ file, name: [...folders, file.name].join('/') }))
      : loose.map((file) => ({ file, name: file.name })),
  );
}

/** Drop files on whatever opens the draft, and it opens with them attached. Text drags pass by. */
export function draftDropTarget(
  onDrop: ((dropped: Promise<SelectedFile[]>) => void) | null,
): Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDrop'> {
  if (!onDrop) return {};
  const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');
  return {
    onDragOver: (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      onDrop(filesFromDrop(event.dataTransfer));
    },
  };
}

/** Every tab of a spreadsheet, located (header, data block, notes, legend), as the assistant reads it. */
async function readAttachedSheet(file: File): Promise<AttachedSheet> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sheets = /\.xlsx$/i.test(file.name)
    ? readWorkbook(bytes)
    : [
        {
          name: file.name,
          cells: parseDelimited(decodeDelimitedBytes(bytes), { keepBlankRows: true }),
        },
      ];
  return {
    name: file.name,
    file,
    tables: sheets.slice(0, 8).flatMap(({ name, cells }) => {
      const table = sheetTable(cells);
      return table.rows.length
        ? [
            {
              name: name.trim() || file.name,
              headers: table.headers,
              rows: table.rows
                .slice(0, 200)
                .map((row) =>
                  Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [key, value.slice(0, 500)]),
                  ),
                ),
              notes: table.notes,
              legend: table.legend,
            },
          ]
        : [];
    }),
  };
}

export function AiDraftDialog({
  open,
  onOpenChange,
  brandId,
  bindingId,
  contract,
  renderSetId,
  parent,
  initialVaryKeys,
  maxRows = API_RENDER_SUGGEST_ROWS_MAX,
  anchor,
  dropped,
  onDrafted,
  gridContext,
  onAssist,
  onSheet,
  onUndo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** Named only when the brand has more than one render workspace. */
  bindingId: string | null;
  contract: ApiRenderTemplateContract;
  /**
   * The saved set the rows will join. The server reads it — its name, brief and existing rows —
   * so the draft neither repeats a row nor drifts from the set's style.
   */
  renderSetId?: string | null;
  /** Set: draft variations of this row. Unset: draft new rows. */
  parent: AiDraftParent | null;
  /** What the path that opened this already decided may change — a cell ticks only its own key. */
  initialVaryKeys?: string[] | null;
  maxRows?: number;
  anchor?: Element | null;
  /** Files dropped on the button that opened this, still being read: attached on opening. */
  dropped?: Promise<SelectedFile[]> | null;
  onDrafted: (response: ApiRenderSuggestRowsResponse) => void;
  /** The grid as it stands when the person sends — rows, selection and the set's rules. */
  gridContext?: () => Omit<ApiRenderAssistGrid, 'tables' | 'mapColumns'>;
  /** Apply the assistant's answer to the grid. */
  onAssist?: (response: ApiRenderSuggestRowsResponse) => void;
  /** A spreadsheet sent with nothing asked: hand it to Import. */
  onSheet?: (file: File) => void;
  /** Take the grid's last step back — the answer just applied. */
  onUndo?: () => void;
}) {
  const [sheets, setSheets] = useState<AttachedSheet[]>([]);
  const [answer, setAnswer] = useState<Pick<
    ApiRenderSuggestRowsResponse,
    'reply' | 'assumptions' | 'cannot' | 'dropped'
  > | null>(null);
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<ApiRenderSuggestRowsResponse | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  // A new opening starts from what it is for: variations ask for a few, new rows for five.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only opening resets the form.
  useEffect(() => {
    if (!open) return;
    setDrafted(null);
    setFiles([]);
    setSheets([]);
    setAnswer(null);
    setProblem(null);
    if (dropped) attach(dropped, []);
  }, [open, parent?.id]);

  useEffect(() => {
    const pending = files.filter(
      (file) => file.kind === 'document' && file.status === 'processing',
    );
    if (!open || pending.length === 0) return;
    const timer = setTimeout(() => {
      void Promise.all(
        pending.map(async (file) => {
          try {
            const result = await apiRendersApi.draftSourcesStatus({
              brandId,
              documentIds: [file.id],
            });
            setFiles((current) =>
              current.map((item) =>
                item.id === file.id ? { ...item, status: result.status } : item,
              ),
            );
          } catch {
            setFiles((current) =>
              current.map((item) => (item.id === file.id ? { ...item, status: 'error' } : item)),
            );
          }
        }),
      );
    }, 2_000);
    return () => clearTimeout(timer);
  }, [brandId, files, open]);

  /** `attached`: the files counted against the limits — none yet when this opening just reset them. */
  const upload = async (all: SelectedFile[], attached = files) => {
    if (!all.length || uploading || busy) return;
    setProblem(null);
    // A spreadsheet is read here for the assistant, never uploaded — unless this drafts
    // variations of one row, which reads its sources the old way.
    const local = parent || !onAssist ? [] : all.filter(({ file }) => isSheetFile(file));
    const selected = all.filter((entry) => !local.includes(entry));
    if (local.length) {
      try {
        const read = await Promise.all(local.map(({ file }) => readAttachedSheet(file)));
        const empty = read.find((sheet) => sheet.tables.length === 0);
        if (empty) setProblem(`${empty.name} has no rows to read.`);
        setSheets((current) => [...current, ...read.filter((sheet) => sheet.tables.length)]);
      } catch {
        setProblem('Could not read that spreadsheet. Save it as .xlsx or .csv and try again.');
      }
    }
    if (!selected.length) return;
    const entries = selected.map(({ file, name }) => {
      const format = classifyLibraryFile({ fileName: file.name, mimeType: file.type });
      const kind =
        format.accepted && (format.originalKind === 'image' || format.originalKind === 'video')
          ? 'media'
          : hasDocumentExtension(file.name)
            ? 'document'
            : null;
      return {
        file,
        pending: { name, id: crypto.randomUUID(), kind, status: 'uploading' as const },
      };
    });
    const unsupported = entries.find(({ pending }) => !pending.kind);
    if (unsupported) {
      setProblem(`Unsupported file: ${unsupported.pending.name}`);
      return;
    }
    const active = attached.filter((file) => file.status !== 'error');
    if (
      active.filter((file) => file.kind === 'document').length +
        entries.filter(({ pending }) => pending.kind === 'document').length >
      API_RENDER_DRAFT_DOCUMENTS_MAX
    ) {
      setProblem(`Add at most ${API_RENDER_DRAFT_DOCUMENTS_MAX} documents per draft.`);
      return;
    }
    if (
      active.filter((file) => file.kind === 'media').length +
        entries.filter(({ pending }) => pending.kind === 'media').length >
      API_RENDER_DRAFT_MEDIA_MAX
    ) {
      setProblem(`Add at most ${API_RENDER_DRAFT_MEDIA_MAX} images or videos per draft.`);
      return;
    }
    setUploading(true);
    setFiles((current) => [...current, ...entries.map(({ pending }) => pending as DraftFile)]);
    try {
      const results = await Promise.allSettled(
        entries.map(async ({ file, pending }) => {
          const uploaded =
            pending.kind === 'media'
              ? {
                  id: (await uploadMediaAsset({ brandId, file })).assetId,
                  status: 'ready' as const,
                }
              : {
                  id: (await uploadBrandDocument({ brandId, file })).documentId,
                  status: 'processing' as const,
                };
          setFiles((current) =>
            current.map((item) => (item.id === pending.id ? { ...item, ...uploaded } : item)),
          );
        }),
      );
      const failed = results.flatMap((result, index) => {
        if (result.status === 'fulfilled') return [];
        const pending = entries[index].pending;
        setFiles((current) =>
          current.map((item) => (item.id === pending.id ? { ...item, status: 'error' } : item)),
        );
        return [
          `${pending.name}: ${result.reason instanceof Error ? result.reason.message : 'upload failed'}`,
        ];
      });
      if (failed.length) setProblem(failed.join(' '));
    } finally {
      setUploading(false);
    }
  };

  const uploadFolder = (selected: FileList | null) => {
    if (selected) {
      const entries = folderFilesFromInput(selected)
        .filter(({ folders }) => !folders.some((folder) => folder.startsWith('.')))
        .map(({ file, folders }) => ({
          file,
          name: [...folders, file.name].join('/'),
        }));
      if (entries.length) void upload(entries);
      else setProblem('This folder has no supported files.');
    }
  };

  const attach = (pending: Promise<SelectedFile[]>, attached?: DraftFile[]) => {
    void pending
      .then((entries) => upload(entries, attached))
      .catch((error: unknown) =>
        setProblem(error instanceof Error ? error.message : 'Could not read the folder.'),
      );
  };

  const dropFiles = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (uploading || busy) return;
    attach(filesFromDrop(event.dataTransfer));
  };

  const grid = gridContext?.();
  /** The assistant answers when there are rows to change or a sheet to read — never for a row's variations. */
  const assisting =
    !parent &&
    Boolean(onAssist) &&
    files.length === 0 &&
    (sheets.length > 0 || (grid?.rows.length ?? 0) > 0);

  const assist = async () => {
    const context = gridContext?.();
    if (!context || !onAssist) return;
    const ask = prompt.trim();
    if (!ask && sheets.length) {
      // Nothing asked of the sheet: Import maps it exactly, the model would only paraphrase it.
      onSheet?.(sheets[0]!.file);
      return;
    }
    if (!ask) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await apiRendersApi.suggestRows({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        prompt: ask,
        count: 1,
        autoCount: false,
        documentIds: [],
        mediaAssetIds: [],
        forksPerRow: 0,
        grid: {
          ...context,
          mapColumns: false,
          tables: sheets.flatMap((sheet) => sheet.tables).slice(0, 8),
        },
      });
      onAssist(response);
      setAnswer({
        reply: response.reply,
        assumptions: response.assumptions,
        cannot: response.cannot,
        dropped: response.dropped,
      });
      setPrompt('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setProblem(
        message.includes('suggest_unavailable')
          ? 'The assistant is unavailable right now. Try again in a minute, or edit the grid directly.'
          : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setBusy(false);
    }
  };

  const draft = () => (assisting ? assist() : draftRows());

  /** New rows from a brief and files, pictures chosen from the Library — proposed until kept. */
  const draftRows = async () => {
    if (
      (!prompt.trim() && files.length === 0) ||
      maxRows < 1 ||
      files.some((file) => file.status === 'error' || file.status === 'uploading')
    )
      return;
    setBusy(true);
    setProblem(null);
    try {
      const documentIds = files.filter((file) => file.kind === 'document').map((file) => file.id);
      if (documentIds.length) {
        let ready = false;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const source = await apiRendersApi.draftSourcesStatus({ brandId, documentIds });
          if (source.status === 'error')
            throw new Error('A source file could not be read. Remove it and try again.');
          if (source.status === 'ready') {
            ready = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (!ready) throw new Error('Files are still processing. Try Draft again shortly.');
      }
      const response = await apiRendersApi.suggestRows({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        prompt: prompt.trim(),
        count: Math.min(API_RENDER_SUGGEST_ROWS_MAX, maxRows),
        autoCount: true,
        documentIds,
        mediaAssetIds: files.filter((file) => file.kind === 'media').map((file) => file.id),
        forksPerRow: 0,
        ...(renderSetId ? { renderSetId } : {}),
        ...(parent
          ? { parent, ...(initialVaryKeys?.length ? { varyKeys: initialVaryKeys } : {}) }
          : {}),
      });
      if (response.rows.length === 0) {
        setProblem(
          [
            'Nothing usable came back. Try a more specific brief.',
            ...response.unfilled,
            ...response.dropped.slice(0, 3),
            ...(response.sourceWarnings ?? []),
          ].join(' '),
        );
        return;
      }
      // The brief stays: the next draft is usually this one, adjusted — "shorter", "more playful".
      // A source-backed draft is reviewed in the grid; only a legacy flagged gate adds a step.
      if (!response.rows.some(flaggedRow)) {
        onDrafted(response);
        onOpenChange(false);
        return;
      }
      setTicked(
        new Set(response.rows.filter((row) => row.gate?.status !== 'flagged').map((row) => row.id)),
      );
      setDrafted(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setProblem(
        message.includes('suggest_unavailable')
          ? 'The AI writer is unavailable right now. Try again in a few minutes, or add rows by hand.'
          : message.startsWith('A source file') || message.startsWith('Files are still processing')
            ? message
            : message.includes('render_draft_file_') || message.includes('render_draft_media_')
              ? 'A source file is unavailable. Remove it and try again.'
              : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setBusy(false);
    }
  };

  const addChecked = () => {
    if (!drafted) return;
    onDrafted({ ...drafted, rows: keptRows(drafted.rows, ticked) });
    setDrafted(null);
    onOpenChange(false);
  };

  if (drafted) {
    const labels = new Map(contract.variables.map((variable) => [variable.key, variable.label]));
    const byId = new Set(drafted.rows.map((row) => row.id));
    const kept = keptRows(drafted.rows, ticked).length;
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverContent
          anchor={anchor ?? undefined}
          align="start"
          className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
          aria-label="Review drafted rows"
        >
          <h2 className="text-sm font-semibold">Some rows failed your brand’s rules</h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            A failed row starts unticked. Keep it if you disagree.
          </p>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {drafted.rows.map((row) => {
              const sentence = row.gate ? gateSentence(row.gate, labels) : null;
              const nested = row.parentId !== null && byId.has(row.parentId);
              return (
                <li
                  key={row.id}
                  className={nested ? 'ml-6 flex items-start gap-2' : 'flex items-start gap-2'}
                >
                  <Checkbox
                    id={`ai-draft-keep-${row.id}`}
                    checked={ticked.has(row.id)}
                    onCheckedChange={(checked) =>
                      setTicked((current) => {
                        const next = new Set(current);
                        if (checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor={`ai-draft-keep-${row.id}`} className="text-sm font-normal">
                      {row.label}
                    </Label>
                    {sentence ? (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        {sentence}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDrafted(null)}>
              Back
            </Button>
            <Button type="button" disabled={kept === 0} onClick={addChecked}>
              Add {kept} {kept === 1 ? 'row' : 'rows'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => !busy && !uploading && onOpenChange(next)}>
      <PopoverContent
        anchor={anchor ?? undefined}
        align="start"
        className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
        aria-label={parent ? `Vary ${parent.label} with AI` : 'Draft rows with AI'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropFiles}
      >
        <h2 className="text-sm font-semibold">
          {parent ? `Vary “${parent.label}” with AI` : 'Draft rows with AI'}
        </h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          {assisting
            ? 'Say what to change — on the selected rows, a row by number, or all of them. Attach a sheet to build rows from it. Changes land in the grid as one undo step; nothing renders.'
            : 'Add a brief, files, or both. AI chooses the useful rows; review them in the grid before rendering.'}
        </p>
        <div className="flex flex-col gap-3">
          {answer ? (
            <div
              role="status"
              className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2 text-xs"
            >
              {answer.reply ? <p className="font-medium">{answer.reply}</p> : null}
              {answer.assumptions?.length ? (
                <ul className="list-disc pl-4 text-muted-foreground">
                  {answer.assumptions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {[...(answer.cannot ?? []), ...answer.dropped].map((line) => (
                <p key={line} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {line}
                </p>
              ))}
              {onUndo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="w-fit"
                  onClick={() => {
                    onUndo();
                    setAnswer(null);
                  }}
                >
                  Undo this change
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-draft-prompt">
              {assisting ? 'Ask' : 'Brief'}{' '}
              <span className="font-normal text-muted-foreground">
                {assisting ? '' : '(optional with files)'}
              </span>
            </Label>
            <Textarea
              id="ai-draft-prompt"
              value={prompt}
              maxLength={2000}
              rows={3}
              placeholder={
                parent
                  ? 'Punchier headlines, one per season'
                  : assisting
                    ? sheets.length
                      ? 'Build the Card B rows from this sheet'
                      : 'Odds on row 3 to 1.80 · red box on the higher odd for the selected rows'
                    : 'Five weekend offers for the summer range, each a different product and headline'
              }
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void draft();
              }}
            />
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={`${ACCEPTED_DOCUMENT_EXTENSIONS},image/*,video/*`}
            className="sr-only"
            aria-label="Choose source files"
            onChange={(event) => {
              const entries = Array.from(event.target.files ?? []).map((file) => ({
                file,
                name: file.name,
              }));
              event.target.value = '';
              void upload(entries);
            }}
          />
          <input
            ref={folderInput}
            type="file"
            {...{ webkitdirectory: '' }}
            multiple
            className="sr-only"
            aria-label="Choose source folder"
            onChange={(event) => {
              uploadFolder(event.target.files);
              event.target.value = '';
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploading || busy}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Paperclip className="size-3.5" aria-hidden />
              )}
              {uploading ? 'Uploading…' : 'Add files'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploading || busy}
              onClick={() => folderInput.current?.click()}
            >
              <FolderOpen className="size-3.5" aria-hidden />
              Add folder
            </Button>
          </div>
          {sheets.length ? (
            <ul className="flex flex-col gap-1 text-xs">
              {sheets.map((sheet) => (
                <li
                  key={sheet.name}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                >
                  <span className="truncate">
                    {sheet.name} · read here ·{' '}
                    {sheet.tables.map((table) => `${table.name} (${table.rows.length})`).join(', ')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${sheet.name}`}
                    disabled={busy}
                    onClick={() =>
                      setSheets((current) => current.filter((item) => item.name !== sheet.name))
                    }
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {files.length ? (
            <ul className="flex flex-col gap-1 text-xs">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                >
                  <span className="truncate">
                    {file.name} ·{' '}
                    {file.status === 'error'
                      ? 'Could not read; remove and add again'
                      : file.status === 'ready'
                        ? `Ready · ${file.id}`
                        : file.status === 'processing'
                          ? 'Reading file…'
                          : 'Uploading…'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${file.name}`}
                    disabled={busy || uploading}
                    onClick={() =>
                      setFiles((current) => current.filter((item) => item.id !== file.id))
                    }
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            PDF, Word, PowerPoint, Excel, CSV, text, images, and video. Files stay in your brand
            files. Drop files or a folder here. Up to {API_RENDER_DRAFT_DOCUMENTS_MAX} documents and{' '}
            {API_RENDER_DRAFT_MEDIA_MAX} images or videos.
          </p>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || uploading}
            onClick={() => onOpenChange(false)}
          >
            {answer ? 'Done' : 'Cancel'}
          </Button>
          {assisting && sheets.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || uploading || maxRows < 1 || !prompt.trim()}
              onClick={() => void draftRows()}
            >
              Draft new rows
            </Button>
          ) : null}
          <Button
            type="button"
            className="gap-2"
            disabled={
              busy ||
              uploading ||
              maxRows < 1 ||
              files.some((file) => file.status === 'error' || file.status === 'uploading') ||
              (!prompt.trim() && files.length === 0 && sheets.length === 0)
            }
            onClick={() => void draft()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {assisting ? (!prompt.trim() && sheets.length ? 'Import sheet' : 'Send') : 'Draft'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** On a template: go to Render with the draft dialog open, where the rows will land. */
export function DraftWithAiButton({
  templateKey,
  onOpenRender,
}: {
  /** Null until the template is published — there is no contract to draft against before that. */
  templateKey: string | null;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!templateKey}
        onClick={() => templateKey && onOpenRender?.({ templateKey, draftWithAi: true })}
        {...draftDropTarget(
          templateKey && onOpenRender
            ? (dropped) => onOpenRender({ templateKey, draftWithAi: true, draftDrop: dropped })
            : null,
        )}
      >
        <Sparkles className="size-3.5" aria-hidden />
        Draft rows with AI
      </Button>
      {templateKey ? null : (
        <span className="text-xs text-muted-foreground">
          Available once this template is published.
        </span>
      )}
    </>
  );
}
