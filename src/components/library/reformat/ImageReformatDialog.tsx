'use client';

import {
  IMAGE_REFORMAT_ASPECT_RATIOS,
  IMAGE_REFORMAT_PRESETS,
  type ImageReformatCompletedData,
  type ImageReformatEvent,
  type ImageReformatMode,
  type ImageReformatPreset,
  type MediaAsset,
} from '@continuum/contracts';
import { Check, Crop, Expand, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { runImageReformat } from '@/lib/library/reformatImage';
import { cn } from '@/lib/utils';

type RunState =
  | { status: 'running'; progress: number; stage: string }
  | { status: 'success'; data: ImageReformatCompletedData }
  | { status: 'error'; message: string; retryable: boolean };

const LABELS: Record<ImageReformatPreset, string> = {
  square: 'Square',
  portrait: 'Portrait',
  vertical: 'Vertical',
  landscape: 'Landscape',
};

const STAGE_LABELS: Record<string, string> = {
  loading_source: 'Loading source',
  cropping: 'Cropping',
  generating: 'Expanding scene',
  storing: 'Saving copy',
  registering: 'Adding to Library',
};

const GENERATION_CONCURRENCY = 2;

async function runPool(tasks: Array<() => Promise<void>>): Promise<void> {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(GENERATION_CONCURRENCY, tasks.length) }, async () => {
      while (index < tasks.length) {
        const task = tasks[index];
        index += 1;
        await task?.();
      }
    }),
  );
}

function currentAspectRatio(asset: Pick<MediaAsset, 'width' | 'height'>): number | null {
  return asset.width && asset.height ? asset.width / asset.height : null;
}

type ReformatSourceAsset = Pick<
  MediaAsset,
  'id' | 'kind' | 'signedUrl' | 'width' | 'height' | 'title' | 'fileName'
>;

export type ImageReformatDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  brandId: string;
  asset: ReformatSourceAsset;
  onCompleted?(data: ImageReformatCompletedData, preset: ImageReformatPreset): void;
};

export function ImageReformatDialog({
  open,
  onOpenChange,
  brandId,
  asset,
  onCompleted,
}: ImageReformatDialogProps) {
  const [mode, setMode] = useState<ImageReformatMode>('smart_expand');
  const [selected, setSelected] = useState<ReadonlySet<ImageReformatPreset>>(new Set(['vertical']));
  const [focalPoint, setFocalPoint] = useState({ x: 0.5, y: 0.5 });
  const [runs, setRuns] = useState<Partial<Record<ImageReformatPreset, RunState>>>({});
  const [active, setActive] = useState(false);
  const abortControllers = useRef(new Map<ImageReformatPreset, AbortController>());
  const sourceRatio = useMemo(() => currentAspectRatio(asset), [asset]);

  const updateRun = useCallback((preset: ImageReformatPreset, run: RunState) => {
    setRuns((previous) => ({ ...previous, [preset]: run }));
  }, []);

  const isSameCropRatio = useCallback(
    (preset: ImageReformatPreset) => {
      if (mode !== 'crop' || sourceRatio === null) return false;
      const [width, height] = IMAGE_REFORMAT_ASPECT_RATIOS[preset].split(':').map(Number);
      return Math.abs(sourceRatio - width / height) < 0.01;
    },
    [mode, sourceRatio],
  );

  const togglePreset = useCallback(
    (preset: ImageReformatPreset) => {
      if (isSameCropRatio(preset)) return;
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(preset)) next.delete(preset);
        else next.add(preset);
        return next;
      });
    },
    [isSameCropRatio],
  );

  const runPreset = useCallback(
    async (preset: ImageReformatPreset) => {
      const controller = new AbortController();
      abortControllers.current.set(preset, controller);
      updateRun(preset, { status: 'running', progress: 0, stage: 'Starting' });
      try {
        const event = await runImageReformat({
          request: {
            brandId,
            sourceAssetId: asset.id,
            requestId: crypto.randomUUID(),
            mode,
            preset,
            ...(mode === 'crop' ? { focalPoint } : {}),
          },
          signal: controller.signal,
          onEvent: (nextEvent: ImageReformatEvent) => {
            if (nextEvent.type !== 'reformat.progress') return;
            updateRun(preset, {
              status: 'running',
              progress: nextEvent.data.progress,
              stage: STAGE_LABELS[nextEvent.data.stage] ?? nextEvent.data.stage,
            });
          },
        });
        updateRun(preset, { status: 'success', data: event.data });
        onCompleted?.(event.data, preset);
      } catch (error) {
        if (controller.signal.aborted) {
          updateRun(preset, { status: 'error', message: 'Cancelled', retryable: true });
        } else {
          updateRun(preset, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Reformat failed',
            retryable: true,
          });
        }
      } finally {
        abortControllers.current.delete(preset);
      }
    },
    [asset.id, brandId, focalPoint, mode, onCompleted, updateRun],
  );

  const start = useCallback(async () => {
    const presets = IMAGE_REFORMAT_PRESETS.filter(
      (preset) => selected.has(preset) && !isSameCropRatio(preset),
    );
    if (presets.length === 0) return;
    setActive(true);
    setRuns({});
    await runPool(presets.map((preset) => () => runPreset(preset)));
    setActive(false);
  }, [isSameCropRatio, runPreset, selected]);

  const cancel = useCallback(() => {
    for (const controller of abortControllers.current.values()) controller.abort();
  }, []);

  const setFocalFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setFocalPoint({
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    });
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && active) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(event) => active && event.preventDefault()}
        onInteractOutside={(event) => active && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Reformat image</DialogTitle>
          <DialogDescription>
            Create saved Library copies for the placements you need. The original stays unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Source and focal point</p>
            <div
              className={cn(
                'relative aspect-square overflow-hidden rounded-lg border bg-muted',
                mode === 'crop' && 'cursor-crosshair',
              )}
              onPointerDown={mode === 'crop' ? setFocalFromPointer : undefined}
            >
              {asset.signedUrl ? (
                // biome-ignore lint/performance/noImgElement: signed Library preview
                <img
                  src={asset.signedUrl}
                  alt={asset.title ?? asset.fileName}
                  className="size-full object-contain"
                />
              ) : null}
              {mode === 'crop' ? (
                <span
                  className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
                  style={{ left: `${focalPoint.x * 100}%`, top: `${focalPoint.y * 100}%` }}
                />
              ) : null}
            </div>
            {mode === 'crop' ? (
              <p className="text-xs text-muted-foreground">
                Click the subject to keep it in frame.
              </p>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Method</Label>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => value && setMode(value as ImageReformatMode)}
                variant="outline"
                disabled={active}
              >
                <ToggleGroupItem value="smart_expand">
                  <Expand className="size-3.5" /> Smart expand
                </ToggleGroupItem>
                <ToggleGroupItem value="crop">
                  <Crop className="size-3.5" /> Crop
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {mode === 'smart_expand'
                  ? 'AI extends the scene while preserving the creative.'
                  : 'Fast, deterministic crop. No AI generation.'}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Formats</legend>
              <div className="grid grid-cols-2 gap-2">
                {IMAGE_REFORMAT_PRESETS.map((preset) => {
                  const disabled = active || isSameCropRatio(preset);
                  return (
                    <Label
                      key={preset}
                      className={cn(
                        'flex items-center gap-2 rounded-md border p-2 text-sm font-normal',
                        disabled && 'opacity-50',
                      )}
                    >
                      <Checkbox
                        checked={selected.has(preset)}
                        disabled={disabled}
                        onCheckedChange={() => togglePreset(preset)}
                      />
                      <span>{LABELS[preset]}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                      </span>
                    </Label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>

        {Object.keys(runs).length > 0 ? (
          <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
            {IMAGE_REFORMAT_PRESETS.filter((preset) => runs[preset]).map((preset) => {
              const run = runs[preset];
              if (!run) return null;
              return (
                <div key={preset} className="rounded-md border p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                    {run.status === 'running' ? <Loader2 className="size-3 animate-spin" /> : null}
                    {run.status === 'success' ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : null}
                    <span>{LABELS[preset]}</span>
                    <span className="ml-auto text-muted-foreground">
                      {IMAGE_REFORMAT_ASPECT_RATIOS[preset]}
                    </span>
                  </div>
                  {run.status === 'running' ? (
                    <div className="space-y-1.5">
                      <Progress value={run.progress} className="h-1.5" />
                      <p className="text-2xs text-muted-foreground">{run.stage}</p>
                    </div>
                  ) : run.status === 'success' ? (
                    <p className="text-2xs text-muted-foreground">Saved to Library</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-2 text-2xs text-destructive">{run.message}</p>
                      {run.retryable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-2xs"
                          onClick={() => void runPreset(preset)}
                        >
                          <RefreshCw className="size-3" /> Retry
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <DialogFooter>
          {active ? (
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button onClick={() => void start()} disabled={active || selected.size === 0}>
            {active ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {active
              ? 'Reformatting…'
              : `Create ${selected.size || ''} format${selected.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
