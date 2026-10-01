'use client';

import {
  buildLibraryAssetHref,
  editorRenderBlockers,
  exportPresetWarnings,
  PLATFORM_EXPORT_PRESET_IDS,
  PLATFORM_EXPORT_PRESETS,
  type PlatformExportPresetId,
  platformExportPresetIdSchema,
  type VideoEditorOpOutput,
} from '@continuum/contracts';
import { Download, ExternalLink, RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { VideoStudioContext } from '../types';
import { exportRunning, useVariantExports, type VariantExport } from './variantExports';

type ExportStatus = VideoEditorOpOutput<'export_status'>;
type Fit = 'cover' | 'contain';
type Scope = 'one' | 'all';

const POLL_START_MS = 1_000;
const POLL_MAX_MS = 8_000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function VariantExportRow({ row, onRetry }: { row: VariantExport; onRetry: () => void }) {
  const progress = row.progress !== undefined ? Math.round(row.progress * 100) : null;
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md border p-2"
      data-variant={row.label}
      data-state={row.state}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="w-4 shrink-0 font-semibold">{row.label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.title}</span>
        {row.state === 'completed' ? (
          <>
            {row.downloadUrl ? (
              <a
                href={row.downloadUrl}
                download
                className={buttonVariants({ size: 'sm', className: 'h-7 text-xs' })}
              >
                <Download data-icon="inline-start" />
                Download {row.label}
              </a>
            ) : null}
            {row.assetId ? (
              <Link
                href={buildLibraryAssetHref({ assetId: row.assetId })}
                aria-label={`Open ${row.label} in Library`}
                className={buttonVariants({ size: 'sm', variant: 'outline', className: 'h-7' })}
              >
                <ExternalLink className="size-3.5" />
              </Link>
            ) : null}
          </>
        ) : row.state === 'failed' ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
            <RotateCcw data-icon="inline-start" />
            Retry {row.label}
          </Button>
        ) : null}
      </div>
      {exportRunning(row) ? (
        <div className="flex items-center gap-2">
          <Progress value={progress} className="flex-1" />
          <span className="w-24 shrink-0 text-right text-2xs text-muted-foreground">
            {row.state === 'running' ? 'Rendering' : row.state === 'queued' ? 'Queued' : 'Starting'}
            {progress !== null ? ` · ${progress}%` : '…'}
          </span>
        </div>
      ) : null}
      {row.state === 'failed' && row.error ? (
        <p className="flex items-start gap-1.5 text-2xs text-destructive">
          <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
          {row.error}
        </p>
      ) : null}
    </li>
  );
}

// Platform-preset export (top bar): set_format reframes to the preset, export renders it
// on the render service into the Library, export_status reports until it lands. A project
// drafted from a brief can export every variant at once (see variantExports).
export function ExportDialog({
  studio,
  open,
  onOpenChange,
  allVariants = false,
}: {
  studio: VideoStudioContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens on every variant of the brief family instead of this cut alone. */
  allVariants?: boolean;
}): React.ReactNode {
  const family = Boolean(studio.project.brief);
  const [scope, setScope] = useState<Scope>(allVariants ? 'all' : 'one');
  const all = family && scope === 'all';
  const variants = useVariantExports(studio, open && all);
  const current = platformExportPresetIdSchema.safeParse(studio.project.exportSettings.presetId);
  const [preset, setPreset] = useState<PlatformExportPresetId>(
    current.success ? current.data : 'tiktok',
  );
  const [fit, setFit] = useState<Fit>('cover');
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runOpRef = useRef(studio.runOp);
  useEffect(() => {
    runOpRef.current = studio.runOp;
  }, [studio.runOp]);

  // Poll with backoff while the dialog is open; a closed dialog resumes on reopen.
  useEffect(() => {
    if (!jobId || !open) return;
    let cancelled = false;
    let delay = POLL_START_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await runOpRef.current('export_status', { jobId });
        if (cancelled) return;
        setStatus(next);
        if (next.state === 'completed' || next.state === 'failed') return;
      } catch (pollError) {
        if (cancelled) return;
        setError(errorText(pollError));
      }
      delay = Math.min(delay * 1.5, POLL_MAX_MS);
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, open]);

  const blockers = editorRenderBlockers(studio.project);
  const warnings = exportPresetWarnings(preset, studio.project.durationSec);
  const variantsBusy = variants.rows.some(exportRunning);
  const busy =
    starting ||
    variantsBusy ||
    (jobId !== null && status?.state !== 'completed' && status?.state !== 'failed');

  const startExport = async () => {
    setStarting(true);
    setError(null);
    setStatus(null);
    setJobId(null);
    try {
      await studio.runOp('set_format', { preset, fit });
      const started = await studio.runOp('export', { preset });
      setJobId(started.jobId);
    } catch (startError) {
      setError(errorText(startError));
    } finally {
      setStarting(false);
    }
  };

  const progress = status?.progress !== undefined ? Math.round(status.progress * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="video-studio-export-dialog">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Pick where it's going. The timeline is reframed to the platform's format, rendered as an
            H.264 MP4 and saved to the Library.
          </DialogDescription>
        </DialogHeader>

        {family ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="What to export"
            value={scope}
            onValueChange={(value) => {
              const next: string = value;
              if (next === 'one' || next === 'all') setScope(next);
            }}
          >
            <ToggleGroupItem value="one" disabled={busy}>
              This cut
            </ToggleGroupItem>
            <ToggleGroupItem value="all" disabled={busy}>
              All variants
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLATFORM_EXPORT_PRESET_IDS.map((id) => {
            const card = PLATFORM_EXPORT_PRESETS[id];
            const selected = id === preset;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => setPreset(id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60',
                  selected && 'border-primary ring-1 ring-primary',
                )}
                data-testid={`export-preset-${id}`}
              >
                <span
                  aria-hidden
                  className="w-6 shrink-0 rounded-sm border-2 border-current opacity-60"
                  style={{ aspectRatio: `${card.width} / ${card.height}` }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{card.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {card.width}×{card.height}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Framing</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={fit}
            onValueChange={(value) => {
              const next: string = value;
              if (next === 'cover' || next === 'contain') setFit(next);
            }}
          >
            <ToggleGroupItem value="cover" disabled={busy}>
              Fill (crop)
            </ToggleGroupItem>
            <ToggleGroupItem value="contain" disabled={busy}>
              Fit (letterbox)
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {warnings.map((warning) => (
          <p key={warning} className="text-xs text-amber-600 dark:text-amber-500">
            {warning}
          </p>
        ))}

        {blockers.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {blockers.map((blocker) => (
              <li key={blocker} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}

        {all ? (
          <ul className="flex flex-col gap-1.5" data-testid="export-variants">
            {variants.rows.map((row) => (
              <VariantExportRow
                key={row.projectId}
                row={row}
                onRetry={() => void variants.exportOne(row.projectId, preset, fit)}
              />
            ))}
            {variants.listError ? (
              <li className="text-xs text-destructive">{variants.listError}</li>
            ) : null}
          </ul>
        ) : null}

        {!all && jobId && status?.state !== 'completed' && status?.state !== 'failed' ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={progress} />
            <span className="text-xs text-muted-foreground">
              {status?.state === 'running' ? 'Rendering' : 'Queued'}
              {progress !== null ? ` · ${progress}%` : '…'}
            </span>
          </div>
        ) : null}

        {!all && status?.state === 'completed' ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="export-complete">
            {status.downloadUrl ? (
              <a href={status.downloadUrl} download className={buttonVariants()}>
                <Download data-icon="inline-start" />
                Download MP4
              </a>
            ) : null}
            {status.assetId ? (
              <Link
                href={buildLibraryAssetHref({ assetId: status.assetId })}
                className={buttonVariants({ variant: 'outline' })}
              >
                <ExternalLink data-icon="inline-start" />
                Open in Library
              </Link>
            ) : null}
          </div>
        ) : null}

        {!all && (status?.state === 'failed' || error) ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {status?.error ?? error}
          </p>
        ) : null}

        <DialogFooter>
          {all ? (
            <Button
              onClick={() => variants.exportAll(preset, fit)}
              disabled={busy || variants.rows.length === 0}
              data-testid="export-all-start"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {`Export ${variants.rows.length} variants for ${PLATFORM_EXPORT_PRESETS[preset].label}`}
            </Button>
          ) : (
            <Button
              onClick={() => void startExport()}
              disabled={busy || blockers.length > 0}
              data-testid="export-start"
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              {status?.state === 'completed'
                ? 'Export again'
                : `Export for ${PLATFORM_EXPORT_PRESETS[preset].label}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
