'use client';

import { productSwapRecipeSchema, type WorkflowGraph } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { detectSceneCuts } from '../utils/actions/extractFrames';
import { splitAtCuts } from '../utils/actions/videoOps';
import { productSwapGraph } from '../utils/productSwapGraph';

interface Fields {
  sourceProduct: string;
  replacementProduct: string;
  visualChanges: string;
  cutsText: string;
  productRefNodeIds: string[];
}

export function ProductSwapPanel({
  sourceNodeId,
  sourceUrl,
  onClose,
}: {
  sourceNodeId: string;
  sourceUrl: string;
  onClose: () => void;
}) {
  const nodes = useStudioStore((state) => state.nodes);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { register, watch, setValue, handleSubmit } = useForm<Fields>({
    defaultValues: {
      sourceProduct: '',
      replacementProduct: '',
      visualChanges: '',
      cutsText: '',
      productRefNodeIds: [],
    },
  });
  const cutsText = watch('cutsText');
  const productRefNodeIds = watch('productRefNodeIds');
  const products = nodes.filter(
    (node) =>
      node.type === 'image' && (node.data.image || node.data.sourceUrl || node.data.sourcePath),
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(sourceUrl, { signal: controller.signal });
        if (!response.ok)
          throw new Error(
            'The source video could not be read. Reattach it from the Library and try again.',
          );
        const blob = await response.blob();
        // Duration unlocks manual cuts even if automatic scene analysis fails.
        const { Input: MediaInput, BlobSource, ALL_FORMATS } = await import('mediabunny');
        const input = new MediaInput({ source: new BlobSource(blob), formats: ALL_FORMATS });
        try {
          const track = await input.getPrimaryVideoTrack();
          if (!track) throw new Error('This file has no video track.');
          const duration = await track.computeDuration();
          if (!Number.isFinite(duration) || duration <= 0)
            throw new Error('This video has no readable duration.');
          controller.signal.throwIfAborted();
          setDurationSec(duration);
        } finally {
          input.dispose();
        }
        const analysis = await detectSceneCuts(blob, controller.signal);
        if (!controller.signal.aborted)
          setValue('cutsText', analysis.cutsSec.map((cut) => cut.toFixed(3)).join(', '));
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not analyze this video. Enter cut times manually.',
          );
      } finally {
        if (!controller.signal.aborted) setAnalyzing(false);
      }
    })();
    return () => controller.abort();
  }, [setValue, sourceUrl]);

  let ranges: { startSec: number; endSec: number }[] = [];
  let rangeError: string | null = null;
  if (durationSec !== null) {
    try {
      ranges = splitAtCuts(
        durationSec,
        cutsText.trim()
          ? cutsText
              .trim()
              .split(/[\s,]+/)
              .map(Number)
          : [],
      );
      if (ranges.length > 20) rangeError = 'Use at most 19 cut times (20 shots).';
    } catch (cause) {
      rangeError =
        cause instanceof Error ? cause.message : 'Enter cut times in seconds, separated by commas.';
    }
  }

  const addRecipe = handleSubmit((fields) => {
    if (durationSec === null || rangeError) return;
    const parsed = productSwapRecipeSchema.safeParse({
      recipe: 'product_swap',
      sourceVideoNodeId: sourceNodeId,
      sourceDurationSec: durationSec,
      sourceProduct: fields.sourceProduct,
      replacementProduct: fields.replacementProduct,
      visualChanges: fields.visualChanges,
      productRefNodeIds: fields.productRefNodeIds,
      shots: ranges.map((range, index) => ({ id: `shot-${index + 1}`, ...range })),
    });
    if (!parsed.success) {
      setError(
        !fields.productRefNodeIds.length
          ? 'Choose at least one replacement-product image.'
          : !fields.sourceProduct.trim() || !fields.replacementProduct.trim()
            ? 'Name both the source product and the replacement product.'
            : (parsed.error.issues[0]?.message ??
              'Check the shot ranges and product descriptions.'),
      );
      return;
    }
    try {
      const current = useStudioStore.getState();
      const graph = productSwapGraph(parsed.data, {
        nodes: current.nodes,
        edges: current.edges,
      } as WorkflowGraph);
      current.takeSnapshot();
      current.setNodes(graph.nodes as StudioNode[]);
      current.setEdges(graph.edges);
      current.triggerSave();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The recipe could not be added.');
    }
  });

  return (
    <Sheet
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Break out video</SheetTitle>
          <SheetDescription>
            Prepare source shots, first/last frames and product-replacement prompts.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={addRecipe} className="space-y-6 px-4 pb-6">
          {/* biome-ignore lint/a11y/useMediaCaption: uploaded source has no caption track; this preview reviews visual shot boundaries. */}
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            playsInline
            preload="metadata"
            className="max-h-56 w-full rounded-lg bg-muted"
            aria-label="Source video for shot review"
          />
          <div className="space-y-2">
            <Label htmlFor="product-swap-cuts">Cut times (seconds)</Label>
            <Input
              id="product-swap-cuts"
              {...register('cutsText')}
              disabled={analyzing}
              placeholder="2.5, 6.8"
              aria-describedby="product-swap-cuts-help"
            />
            <p id="product-swap-cuts-help" className="text-sm text-muted-foreground">
              {analyzing
                ? 'Finding suggested cuts locally…'
                : 'Review suggested cuts against the video. Edit or clear them to keep one shot.'}
            </p>
            {rangeError ? (
              <p role="alert" className="text-sm text-destructive">
                {rangeError}
              </p>
            ) : null}
            {ranges.length > 0 && !rangeError ? (
              <ol className="divide-y divide-border text-sm">
                {ranges.map((range, index) => (
                  <li key={range.startSec} className="flex items-center justify-between gap-3 py-2">
                    <span className="tabular-nums">
                      Shot {index + 1} · {range.startSec.toFixed(3)}–{range.endSec.toFixed(3)}s
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = range.startSec;
                      }}
                    >
                      Review shot {index + 1}
                    </Button>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-swap-source">Product to replace</Label>
              <Input
                id="product-swap-source"
                {...register('sourceProduct')}
                placeholder="Apple iPhone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-swap-target">Replacement product</Label>
              <Input
                id="product-swap-target"
                {...register('replacementProduct')}
                placeholder="Exact Samsung model and finish"
              />
            </div>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Replacement product images</legend>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add the exact product images to the canvas first, then reopen Break out video.
              </p>
            ) : (
              products.map((node) => (
                <div key={node.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`product-swap-ref-${node.id}`}
                    checked={productRefNodeIds.includes(node.id)}
                    disabled={!productRefNodeIds.includes(node.id) && productRefNodeIds.length >= 4}
                    onCheckedChange={(checked) =>
                      setValue(
                        'productRefNodeIds',
                        checked
                          ? [...productRefNodeIds, node.id]
                          : productRefNodeIds.filter((id) => id !== node.id),
                      )
                    }
                  />
                  <Label htmlFor={`product-swap-ref-${node.id}`}>
                    {String(node.data.label || node.data.fileName || 'Product image')}
                  </Label>
                </div>
              ))
            )}
            <p className="text-sm text-muted-foreground">
              Choose 1–4 images showing the actual product from useful angles.
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="product-swap-visual">Visual branding and copy changes</Label>
            <Textarea
              id="product-swap-visual"
              {...register('visualChanges')}
              placeholder="Explicit changes only, e.g. replace the iPhone title with Galaxy."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Run the added shot and frame nodes to prepare media. Review and edit the image prompts
            before generating replacement frames, then use the motion prompt for the next video
            step. Keep source audio and review spoken brand names separately.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={analyzing || durationSec === null || Boolean(rangeError)}>
            {analyzing ? <Loader2 className="size-4 animate-spin" /> : null}Add preparation recipe
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
