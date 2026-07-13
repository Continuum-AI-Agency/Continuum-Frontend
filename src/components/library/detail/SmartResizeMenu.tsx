'use client';

// Smart resize (WS7): competitor-reference resize UX for an image asset. A
// dialog lists placement presets grouped by platform (Instagram feed/story, X
// in-stream); each selected preset re-runs the AI Studio generate endpoint with
// the asset as reference plus an explicit aspect-ratio + reframe instruction
// (aspect_ratio is first-class in the request schema). Requests run through a
// small concurrency pool (2) to be kind to the backend; each result saves to
// the library as a new asset with a ratio-suffixed file name, carrying the id of
// the asset it was reframed from so the source asset can show what came out of it.

import type { MediaAsset } from '@continuum/contracts';
import { Check, Loader2, Scaling } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildResizeRequest,
  generateStudioImage,
  RESIZE_PRESETS,
  type ResizePreset,
  registerResizedAsset,
  runWithConcurrency,
  type StudioImageResult,
  studioResultToFile,
  suffixFileName,
} from '@/lib/library/quickLook';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

export type SmartResizeMenuProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

type PresetRun =
  | { status: 'generating' }
  | { status: 'done'; result: StudioImageResult; saving: boolean; saved: boolean }
  | { status: 'error'; message: string };

const GENERATION_CONCURRENCY = 2;

function previewUrlFor(result: StudioImageResult): string | undefined {
  if (result.signedUrl) return result.signedUrl;
  if (!result.base64) return undefined;
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:${result.mimeType};base64,${result.base64}`;
}

export function SmartResizeMenu({ brandId, asset, onAssetChanged }: SmartResizeMenuProps) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [runs, setRuns] = useState<Record<string, PresetRun>>({});
  const [generating, setGenerating] = useState(false);

  const presetsByPlatform = useMemo(() => {
    const groups = new Map<string, ResizePreset[]>();
    for (const preset of RESIZE_PRESETS) {
      const group = groups.get(preset.platform) ?? [];
      group.push(preset);
      groups.set(preset.platform, group);
    }
    return [...groups.entries()];
  }, []);

  const allSelected = selectedIds.size === RESIZE_PRESETS.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(RESIZE_PRESETS.map((preset) => preset.id)));
  }, [allSelected]);

  const togglePreset = useCallback((presetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) next.delete(presetId);
      else next.add(presetId);
      return next;
    });
  }, []);

  const updateRun = useCallback((presetId: string, run: PresetRun) => {
    setRuns((prev) => ({ ...prev, [presetId]: run }));
  }, []);

  const handleGenerate = useCallback(async () => {
    const selected = RESIZE_PRESETS.filter((preset) => selectedIds.has(preset.id));
    if (selected.length === 0) return;
    setGenerating(true);
    setRuns(Object.fromEntries(selected.map((preset) => [preset.id, { status: 'generating' }])));

    const tasks = selected.map((preset) => async () => {
      try {
        const result = await generateStudioImage(buildResizeRequest({ brandId, asset, preset }));
        updateRun(preset.id, { status: 'done', result, saving: false, saved: false });
      } catch (err) {
        updateRun(preset.id, {
          status: 'error',
          message: err instanceof Error ? err.message : 'Generation failed',
        });
      }
    });
    await runWithConcurrency(tasks, GENERATION_CONCURRENCY);
    setGenerating(false);
  }, [brandId, asset, selectedIds, updateRun]);

  // Preferred path: the backend already stored the reframed bytes, so the Library
  // registers that object in place and records the asset it came from. Only when the
  // generation came back as raw bytes (the backend's storage upload failed) do we
  // upload them ourselves — that asset is saved, but its lineage cannot be recorded,
  // because the upload route mints the row and does not take an origin ref.
  const handleSave = useCallback(
    async (preset: ResizePreset, run: Extract<PresetRun, { status: 'done' }>) => {
      updateRun(preset.id, { ...run, saving: true });
      try {
        if (run.result.bucket && run.result.path) {
          await registerResizedAsset({ brandId, asset, preset, result: run.result });
        } else {
          const file = await studioResultToFile(
            run.result,
            suffixFileName(asset.fileName, preset.fileSuffix),
          );
          await uploadMediaAsset({ file, brandId });
        }
        updateRun(preset.id, { ...run, saving: false, saved: true });
        onAssetChanged?.();
      } catch (err) {
        updateRun(preset.id, {
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not save the asset',
        });
      }
    },
    [brandId, asset, onAssetChanged, updateRun],
  );

  if (asset.kind !== 'image') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled className="pointer-events-none">
                <Scaling className="size-3.5" aria-hidden />
                Smart resize
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Smart resize supports images only for now.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const hasRuns = Object.keys(runs).length > 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Scaling className="size-3.5" aria-hidden />
        Smart resize
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Smart resize</DialogTitle>
            <DialogDescription>
              Reframe this image for platform placements. The subject stays centered; the scene is
              extended — never letterboxed or stretched.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Label className="flex items-center gap-2 text-xs font-medium">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              Select all
            </Label>
            <div className="grid grid-cols-2 gap-4">
              {presetsByPlatform.map(([platform, presets]) => (
                <fieldset key={platform} className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {platform}
                  </legend>
                  {presets.map((preset) => (
                    <Label key={preset.id} className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        checked={selectedIds.has(preset.id)}
                        onCheckedChange={() => togglePreset(preset.id)}
                        disabled={generating}
                      />
                      {preset.label}
                      <span className="text-xs text-muted-foreground">{preset.ratio}</span>
                    </Label>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>

          {hasRuns ? (
            <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {RESIZE_PRESETS.filter((preset) => runs[preset.id]).map((preset) => {
                const run = runs[preset.id];
                return (
                  <div
                    key={preset.id}
                    className="flex flex-col gap-1.5 rounded-md border border-border p-2"
                  >
                    <p className="text-xs font-medium">
                      {preset.label} <span className="text-muted-foreground">{preset.ratio}</span>
                    </p>
                    {run.status === 'generating' ? (
                      <div className="flex h-24 items-center justify-center">
                        <Loader2
                          className="size-4 animate-spin text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    ) : run.status === 'error' ? (
                      <p className="text-xs text-destructive">{run.message}</p>
                    ) : (
                      <>
                        {previewUrlFor(run.result) ? (
                          // biome-ignore lint/performance/noImgElement: transient signed URL preview
                          <img
                            src={previewUrlFor(run.result)}
                            alt={`${preset.label} ${preset.ratio} result`}
                            className="h-24 w-full rounded border border-border object-contain"
                          />
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void handleSave(preset, run)}
                          disabled={run.saving || run.saved}
                        >
                          {run.saving ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                          ) : run.saved ? (
                            <Check className="size-3" aria-hidden />
                          ) : null}
                          {run.saved ? 'Saved' : 'Save as new asset'}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating || selectedIds.size === 0}
            >
              {generating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {generating
                ? 'Generating…'
                : `Generate${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
