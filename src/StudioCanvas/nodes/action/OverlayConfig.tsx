'use client';

import type { ActionId } from '@continuum/contracts';
import { createNodeData } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { ImageUp, Sparkles, Upload } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import { getCreativeAssetsBucket } from '@/lib/creative-assets/config';
import { createSignedAssetUrl } from '@/lib/creative-assets/storageClient';
import { useNodeConfigPatch } from '../../hooks/useNodeConfigPatch';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode } from '../../types';
import { parseActionConfig } from '../../utils/actions/actionConfig';
import {
  BRAND_LOGO_PRESET,
  isOverlayPosition,
  type OverlayPosition,
  overlayRect,
  resolveBrandLogoSource,
} from '../../utils/actions/overlayPresets';

// The burn-in's own panel. Every other op in the catalog is drawn by
// `ActionConfigPopover` straight from its zod schema, and for eight numeric knobs that
// is the right amount of UI. A burn-in is not eight knobs — `position` is a place on a
// frame, the window is a span, and the image is not a config field AT ALL: it arrives
// on the `overlay-in` port. A generic schema renderer can express none of that, so this
// op gets a panel and the other thirty keep the generic one.
//
// Note what this does NOT do: it never invents a config key. The op's schema is frozen
// in contracts, so "use the brand logo" and "upload a file" both resolve to the same
// thing an edge does — an image node wired to `overlay-in`. One input path, one runner.

const LOGO_URL_TTL_SEC = 60 * 60;

/** The 3x3 grid the position picker draws. `null` cells are not placements the engine
 *  can express — the transform is a corner or the centre, never an edge midpoint. */
const POSITION_GRID: (OverlayPosition | null)[] = [
  'top-left',
  null,
  'top-right',
  null,
  'center',
  null,
  'bottom-left',
  null,
  'bottom-right',
];

const POSITION_LABEL: Record<OverlayPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  center: 'Centre',
};

/**
 * The image node + edge that feed a burn-in's `overlay-in` port.
 *
 * Exported for its own test: this is the one place that decides an uploaded file or a
 * brand logo becomes a real node on the canvas rather than a hidden config value. A
 * hidden one would not survive a reload, would not be visible in the graph the agent
 * reads, and would have no second consumer.
 */
export function buildOverlayImageNode(args: {
  actionNodeId: string;
  actionPosition: { x: number; y: number };
  image: string;
  label: string;
  pathType?: string;
}): { node: StudioNode; edge: Edge } {
  const imageNodeId = uuidv4();
  const { data, style } = createNodeData('image', { label: args.label, image: args.image });
  return {
    node: {
      id: imageNodeId,
      type: 'image',
      // Above-left of the action, where its other input already comes from.
      position: { x: args.actionPosition.x - 240, y: args.actionPosition.y - 140 },
      data: data as StudioNode['data'],
      style,
    } as StudioNode,
    edge: {
      id: `e-${imageNodeId}-${args.actionNodeId}-overlay-in`,
      source: imageNodeId,
      sourceHandle: 'image',
      target: args.actionNodeId,
      targetHandle: 'overlay-in',
      type: 'dataType',
      className: 'studio-edge studio-edge--connected',
      data: { dataType: 'image', pathType: args.pathType },
    },
  };
}

function PositionPicker({
  value,
  onChange,
}: {
  value: OverlayPosition;
  onChange: (next: OverlayPosition) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {POSITION_GRID.map((position, index) =>
        position ? (
          <button
            key={position}
            type="button"
            aria-label={POSITION_LABEL[position]}
            aria-pressed={value === position}
            onClick={() => onChange(position)}
            className={`h-7 rounded border text-[10px] ${
              value === position
                ? 'border-brand-primary bg-brand-primary/15 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {position === 'center' ? '◎' : '▪'}
          </button>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length spacer grid
          <div key={`spacer-${index}`} className="h-7" />
        ),
      )}
    </div>
  );
}

/** Where the burn-in will land, drawn to scale. Assumes a 16:9 clip and a square logo —
 *  the real aspects are only known once the clip decodes, and the label says so. */
function PlacementPreview({
  position,
  scale,
  marginFrac,
  opacity,
}: {
  position: OverlayPosition;
  scale: number;
  marginFrac: number;
  opacity: number;
}) {
  const rect = overlayRect(
    { position, scale, marginFrac, sourceAspect: 1, targetAspect: 16 / 9 },
    160,
    90,
  );
  return (
    <div className="relative h-[90px] w-[160px] overflow-hidden rounded border border-border/60 bg-black/80">
      <div
        className="absolute rounded-[2px] bg-brand-primary"
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          opacity,
        }}
      />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-2xs tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next: number[]) => {
          const first = next[0];
          if (typeof first === 'number' && Number.isFinite(first)) onChange(first);
        }}
      />
    </div>
  );
}

export function OverlayConfig({
  nodeId,
  actionId,
  config,
}: {
  nodeId: string;
  actionId: ActionId;
  config: Record<string, unknown>;
}) {
  const patch = useNodeConfigPatch();
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const setNodes = useStudioStore((state) => state.setNodes);
  const setEdges = useStudioStore((state) => state.setEdges);
  const defaultEdgeType = useStudioStore((state) => state.defaultEdgeType);
  const brandId = useStudioStore((state) => state.brandId);
  const { brandTokens } = useBrandBook(brandId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const current = parseActionConfig(actionId, config);
  const position: OverlayPosition = isOverlayPosition(current.position)
    ? current.position
    : 'top-right';
  const scale = typeof current.scale === 'number' ? current.scale : 0.15;
  const marginFrac = typeof current.marginFrac === 'number' ? current.marginFrac : 0.04;
  const opacity = typeof current.opacity === 'number' ? current.opacity : 1;
  const startSec = typeof current.startSec === 'number' ? current.startSec : null;
  const endSec = typeof current.endSec === 'number' ? current.endSec : null;

  // A watermark is this op with the window opened all the way (`resolveOverlayWindow`).
  // The controls are inert on it, so they are not drawn — a knob that does nothing is
  // worse than no knob.
  const isWatermark = actionId === 'video.watermark';

  const connectedCount = edges.filter(
    (edge) => edge.target === nodeId && edge.targetHandle === 'overlay-in',
  ).length;

  const logo = useMemo(
    () => resolveBrandLogoSource(brandTokens, getCreativeAssetsBucket()),
    [brandTokens],
  );

  const write = (key: string, value: unknown) => {
    patch(nodeId, 'action', { config: { ...current, [key]: value } });
  };

  const attachImage = useCallback(
    (image: string, label: string) => {
      const actionNode = nodes.find((node) => node.id === nodeId);
      const built = buildOverlayImageNode({
        actionNodeId: nodeId,
        actionPosition: actionNode?.position ?? { x: 0, y: 0 },
        image,
        label,
        pathType: defaultEdgeType,
      });
      setNodes([...nodes, built.node]);
      setEdges([...edges, built.edge]);
    },
    [defaultEdgeType, edges, nodeId, nodes, setEdges, setNodes],
  );

  const useBrandLogo = useCallback(async () => {
    setLogoError(null);
    if (logo.status !== 'ready') {
      setLogoError(logo.reason);
      return;
    }
    try {
      const url =
        logo.source === 'url'
          ? logo.url
          : await createSignedAssetUrl(logo.storagePath, LOGO_URL_TTL_SEC, logo.bucket);
      attachImage(url, 'Brand logo');
      patch(nodeId, 'action', { config: { ...current, ...BRAND_LOGO_PRESET } });
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'Could not read the brand logo');
    }
  }, [attachImage, current, logo, nodeId, patch]);

  const onUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') attachImage(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1.5">
        <Label className="text-xs">Image</Label>
        <p className="text-2xs text-muted-foreground">
          {connectedCount > 0
            ? `${connectedCount} image${connectedCount > 1 ? 's' : ''} wired to this burn-in.`
            : 'Nothing wired yet — drag one in from the Library, or pick a source below.'}
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1 size-3" />
            Upload
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={logo.status !== 'ready'}
            title={logo.status === 'ready' ? undefined : logo.reason}
            onClick={() => void useBrandLogo()}
          >
            <Sparkles className="mr-1 size-3" />
            Brand logo
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="Upload an overlay image"
          className="hidden"
          onChange={(event) => onUpload(event.target.files?.[0])}
        />
        {/* The empty state is stated, never silent: a burn-in whose logo resolved to
            nothing renders a clip with no watermark and reports success. */}
        {logo.status === 'missing' ? (
          <p className="flex items-start gap-1 text-2xs text-muted-foreground">
            <ImageUp className="mt-0.5 size-3 shrink-0" />
            {logo.reason}
          </p>
        ) : null}
        {logoError ? <p className="text-2xs text-destructive">{logoError}</p> : null}
      </section>

      <section className="flex flex-col gap-1.5">
        <Label className="text-xs">Position</Label>
        <div className="flex items-start gap-2">
          <div className="w-20 shrink-0">
            <PositionPicker value={position} onChange={(next) => write('position', next)} />
          </div>
          <PlacementPreview
            position={position}
            scale={scale}
            marginFrac={marginFrac}
            opacity={opacity}
          />
        </div>
        <p className="text-2xs text-muted-foreground">
          Preview assumes a 16:9 clip and a square image.
        </p>
      </section>

      <SliderRow
        label="Size"
        value={scale}
        min={0.02}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}% of the frame`}
        onChange={(next) => write('scale', next)}
      />
      <SliderRow
        label="Edge margin"
        value={marginFrac}
        min={0}
        max={0.25}
        step={0.005}
        format={(value) => `${(value * 100).toFixed(1)}%`}
        onChange={(next) => write('marginFrac', next)}
      />
      <SliderRow
        label="Opacity"
        value={opacity}
        min={0}
        max={1}
        step={0.05}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(next) => write('opacity', next)}
      />

      {isWatermark ? (
        <p className="text-2xs text-muted-foreground">
          A watermark covers the whole clip. Use Burn In if you want a timed window.
        </p>
      ) : (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Visible from</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-2xs"
              onClick={() =>
                patch(nodeId, 'action', { config: { ...current, startSec: null, endSec: null } })
              }
            >
              Whole clip
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {/* null is "unset", which is NOT 0: an empty box means the start of the clip
                and the end of the clip, and `resolveOverlayWindow` reads it that way. */}
            <Input
              className="h-7 text-xs"
              type="number"
              min={0}
              step={0.1}
              placeholder="Start"
              aria-label="Burn-in start seconds"
              value={startSec === null ? '' : String(startSec)}
              onChange={(event) =>
                write('startSec', event.target.value === '' ? null : Number(event.target.value))
              }
            />
            <span className="text-2xs text-muted-foreground">to</span>
            <Input
              className="h-7 text-xs"
              type="number"
              min={0}
              step={0.1}
              placeholder="End"
              aria-label="Burn-in end seconds"
              value={endSec === null ? '' : String(endSec)}
              onChange={(event) =>
                write('endSec', event.target.value === '' ? null : Number(event.target.value))
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}
