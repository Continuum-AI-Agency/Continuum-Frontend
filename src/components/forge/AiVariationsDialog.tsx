'use client';

import {
  API_RENDER_SUGGEST_ROWS_MAX,
  type ApiRenderInputValue,
  type ApiRenderRowGate,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  classifyLibraryFile,
  readableLayerName,
} from '@continuum/contracts';
import { Loader2, Paperclip, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import { ACCEPTED_DOCUMENT_EXTENSIONS, hasDocumentExtension } from '@/lib/documents/uploadLimits';
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

type DraftFile = { name: string; id: string; kind: 'document' | 'media'; status: 'uploading' | 'processing' | 'ready' | 'error' };

export function AiDraftDialog({
  open,
  onOpenChange,
  brandId,
  bindingId,
  contract,
  parent,
  initialVaryKeys,
  maxRows = API_RENDER_SUGGEST_ROWS_MAX,
  anchor,
  onDrafted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** Named only when the brand has more than one render workspace. */
  bindingId: string | null;
  contract: ApiRenderTemplateContract;
  /** Set: draft variations of this row. Unset: draft new rows. */
  parent: AiDraftParent | null;
  /** What the path that opened this already decided may change — a cell ticks only its own key. */
  initialVaryKeys?: string[] | null;
  maxRows?: number;
  anchor?: Element | null;
  onDrafted: (response: ApiRenderSuggestRowsResponse) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
    setProblem(null);
  }, [open, parent?.id]);

  useEffect(() => {
    const pending = files.filter((file) => file.kind === 'document' && file.status === 'processing');
    if (!open || pending.length === 0) return;
    const timer = setTimeout(() => {
      void Promise.all(pending.map(async (file) => {
        try {
          const result = await apiRendersApi.draftSourcesStatus({ brandId, documentIds: [file.id] });
          setFiles((current) => current.map((item) => item.id === file.id ? { ...item, status: result.status } : item));
        } catch {
          setFiles((current) => current.map((item) => item.id === file.id ? { ...item, status: 'error' } : item));
        }
      }));
    }, 2_000);
    return () => clearTimeout(timer);
  }, [brandId, files, open]);

  const upload = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setUploading(true);
    setProblem(null);
    const next = [...files];
    try {
      for (const file of Array.from(selected)) {
        const format = classifyLibraryFile({ fileName: file.name, mimeType: file.type });
        if (
          format.accepted &&
          (format.originalKind === 'image' || format.originalKind === 'video')
        ) {
          if (next.filter((item) => item.kind === 'media').length >= 6)
            throw new Error('Add at most six images or videos per draft.');
          const pending = { name: file.name, id: crypto.randomUUID(), kind: 'media' as const, status: 'uploading' as const };
          setFiles((current) => [...current, pending]);
          try {
            const result = await uploadMediaAsset({ brandId, file });
            const ready: DraftFile = { ...pending, id: result.assetId, status: 'ready' };
            next.push(ready);
            setFiles((current) => current.map((item) => item.id === pending.id ? ready : item));
          } catch (error) {
            setFiles((current) => current.map((item) => item.id === pending.id ? { ...item, status: 'error' } : item));
            throw error;
          }
        } else if (hasDocumentExtension(file.name)) {
          if (next.filter((item) => item.kind === 'document').length >= 5)
            throw new Error('Add at most five documents per draft.');
          const pending = { name: file.name, id: crypto.randomUUID(), kind: 'document' as const, status: 'uploading' as const };
          setFiles((current) => [...current, pending]);
          try {
            const result = await uploadBrandDocument({ brandId, file });
            const processing: DraftFile = { ...pending, id: result.documentId, status: 'processing' };
            next.push(processing);
            setFiles((current) => current.map((item) => item.id === pending.id ? processing : item));
          } catch (error) {
            setFiles((current) => current.map((item) => item.id === pending.id ? { ...item, status: 'error' } : item));
            throw error;
          }
        } else throw new Error(`Unsupported file: ${file.name}`);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not upload this file.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
      setUploading(false);
    }
  };

  const draft = async () => {
    if ((!prompt.trim() && files.length === 0) || maxRows < 1 || files.some((file) => file.status === 'error' || file.status === 'uploading')) return;
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
      setPrompt('');
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
      >
        <h2 className="text-sm font-semibold">
          {parent ? `Vary “${parent.label}” with AI` : 'Draft rows with AI'}
        </h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Add a brief, files, or both. AI chooses the useful rows; review them in the grid before
          rendering.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-draft-prompt">
              Brief <span className="font-normal text-muted-foreground">(optional with files)</span>
            </Label>
            <Textarea
              id="ai-draft-prompt"
              value={prompt}
              maxLength={2000}
              rows={3}
              placeholder={
                parent
                  ? 'Punchier headlines, one per season'
                  : 'Five weekend offers for the summer range, each a different product and headline'
              }
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={`${ACCEPTED_DOCUMENT_EXTENSIONS},image/*,video/*`}
            className="sr-only"
            aria-label="Choose source files"
            onChange={(event) => void upload(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start gap-1.5"
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
          {files.length ? (
            <ul className="flex flex-col gap-1 text-xs">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                >
                  <span className="truncate">{file.name} · {file.status === 'error' ? 'Could not read; remove and add again' : file.status === 'ready' ? `Ready · ${file.id}` : file.status === 'processing' ? 'Reading file…' : 'Uploading…'}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={busy || uploading}
                    onClick={() =>
                      setFiles((current) => current.filter((item) => item.id !== file.id))
                    }
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            PDF, Word, PowerPoint, Excel, CSV, text, images, and video. Files stay in your brand
            files.
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
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={busy || uploading || maxRows < 1 || files.some((file) => file.status === 'error' || file.status === 'uploading') || (!prompt.trim() && files.length === 0)}
            onClick={() => void draft()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Draft
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
