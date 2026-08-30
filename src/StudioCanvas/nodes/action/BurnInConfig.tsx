'use client';

// The burn-in's own panel: a preview of the real image with the type block ON it, draggable,
// snapping to the nine anchor points.
//
// This op used to be drawn by the generic Zod panel, and to fit that panel's four renderable
// field kinds its schema exposed `typeSection` and `inkSection` as raw design-section enums —
// so the UI offered `motion`, `voice`, `radii` and `iconography` as the source of a TEXT
// COLOUR. That is a question with one right answer and eleven wrong ones. Type is typography,
// ink is the palette; both are resolved directly now, and what is left genuinely user-choosable
// about the ink — WHICH palette token — is picked as a swatch rather than typed as a name.
//
// Placement is direct manipulation because that is what placement is. `video.overlay`
// (OverlayConfig.tsx) and `video.subtitles` already take this escape hatch from the generic
// panel; this is the third, and the routing is the same one line in `ActionConfigFields`.
//
// THE PLAN STILL RUNS. The block chooses WHERE the measure sits; `planPlacement` still decides
// the line breaks, the sizes, the contrast and the treatment rung from the real pixels, and the
// ladder outranks the placement — a block dragged over a dark patch escalates the BACKGROUND
// rather than being moved somewhere friendlier. The panel says so instead of implying otherwise.

import {
  BRAND_TYPE_SOURCE_LABEL,
  BURN_IN_ANCHORS,
  type BurnInAnchor,
  type DesignToken,
  type HeadlineToken,
  type MeasureText,
  PRELOADED_TYPE_FACES,
  sectionForToken,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import { X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Label } from '@/components/ui/label';
import { SliderField } from '@/components/ui/slider-field';
import { Switch } from '@/components/ui/switch';
import { useBrandType } from '@/lib/brands/useBrandType.client';
import { useNodeConfigPatch } from '../../hooks/useNodeConfigPatch';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode } from '../../types';
import { parseActionConfig } from '../../utils/actions/actionConfig';
import {
  anchorOrigin,
  type BlockExtent,
  type BurnInPlacement,
  blockRect,
  headlineBlockExtent,
  type Point,
  snapToAnchor,
} from '../../utils/actions/burnInPlacement';
import {
  createMeasurer,
  describeHeadlineFaces,
  describeHeadlineInk,
  type HeadlineFaces,
  parseHeadline,
  parseHexColour,
  resolveCustomInk,
  resolveHeadlineFaces,
  resolveHeadlineInk,
} from '../../utils/actions/imageText';

/** Frame the preview assumes until the real image reports its own dimensions. */
const FALLBACK_ASPECT = 1080 / 1350;
/** A keyboard nudge, in frame fractions. Shift makes it four times coarser. */
const NUDGE = 0.005;

const ANCHOR_LABEL: Record<BurnInAnchor, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'center-left': 'Middle left',
  center: 'Centre',
  'center-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** An upstream node's picture, whichever field its type keeps it in. */
const imageOf = (node: StudioNode): string | undefined => {
  const data = node.data as Record<string, unknown>;
  for (const key of ['generatedImageUrl', 'generatedImage', 'image'] as const) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

const textOf = (node: StudioNode): string | undefined => {
  const value = (node.data as Record<string, unknown>).value;
  return typeof value === 'string' && value.trim() ? value : undefined;
};

/**
 * The real picture and the real words this node will run against.
 *
 * Read straight off the upstream nodes rather than through `buildNodePayload`'s resolver,
 * because the panel is looking at a graph that has NOT run: what it needs is whatever is
 * already sitting on the source node, and a generator that has not produced a frame yet
 * correctly resolves to nothing. Exported for its own test — a preview that silently
 * previews the wrong image is worse than one that says it has nothing to show.
 */
export function resolveBurnInPreviewSources(
  nodeId: string,
  nodes: readonly StudioNode[],
  edges: readonly Edge[],
): { imageUrl?: string; headline?: string } {
  const sourceOn = (handle: string): StudioNode | undefined => {
    const edge = edges.find((e) => e.target === nodeId && e.targetHandle === handle);
    return edge ? nodes.find((node) => node.id === edge.source) : undefined;
  };
  const image = sourceOn('in');
  const text = sourceOn('text-in');
  return {
    imageUrl: image ? imageOf(image) : undefined,
    headline: text ? textOf(text) : undefined,
  };
}

/**
 * The measurer the preview sizes the block with.
 *
 * SAME FACES AS THE RENDER, from the same chain: `resolveHeadlineFaces` is what both call, and
 * `useBrandType` registers a preloaded family on `document.fonts` before this measures — so a
 * brand on the fallback rung is previewed in Montserrat because that is what will be burned in.
 * A brand family the machine does not hold bytes for still resolves to the fallback stack in
 * BOTH paths, which keeps the preview's line count equal to the render's.
 *
 * Returns null where there is no canvas to measure with (a test renderer, an old browser);
 * the caller falls back to a nominal two-line block and labels the preview approximate rather
 * than refusing to draw a panel over it.
 */
function previewMeasurer(faces: HeadlineFaces): MeasureText | null {
  try {
    return createMeasurer(faces, 0);
  } catch {
    return null;
  }
}

function AnchorGrid({
  value,
  candidate,
  onPick,
}: {
  value: BurnInAnchor;
  candidate: BurnInAnchor | null;
  onPick: (anchor: BurnInAnchor) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {BURN_IN_ANCHORS.map((anchor) => {
        const isValue = anchor === value;
        const isCandidate = anchor === candidate;
        return (
          <button
            key={anchor}
            type="button"
            aria-label={ANCHOR_LABEL[anchor]}
            aria-pressed={isValue}
            data-snap-candidate={isCandidate ? 'true' : undefined}
            onClick={() => onPick(anchor)}
            className={`h-6 rounded border text-[10px] transition-colors ${
              isCandidate
                ? 'border-brand-primary bg-brand-primary/40 text-foreground'
                : isValue
                  ? 'border-brand-primary bg-brand-primary/15 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {anchor === 'center' ? '◎' : '▪'}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The stage: the real frame, the block on it, and the nine points it can land on.
 *
 * The block is positioned in PERCENTAGES of the stage, so the same numbers that describe the
 * placement describe the preview — no second geometry, and a stage of any size shows the same
 * placement. The pointer is converted to a fraction of the stage for the same reason.
 */
function PlacementStage({
  imageUrl,
  aspect,
  extent,
  placement,
  onDrag,
  onCommit,
  onNudge,
  onImageSize,
}: {
  imageUrl?: string;
  aspect: number;
  extent: BlockExtent;
  placement: BurnInPlacement;
  onDrag: (origin: Point) => void;
  onCommit: (origin: Point) => void;
  onNudge: (dx: number, dy: number) => void;
  onImageSize: (width: number, height: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<Point | null>(null);
  const rect = blockRect(placement, extent);

  const toFraction = (event: React.PointerEvent): Point | null => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  };

  const originFrom = (event: React.PointerEvent): Point | null => {
    const pointer = toFraction(event);
    const grab = grabRef.current;
    if (!pointer || !grab) return null;
    return { x: pointer.x - grab.x, y: pointer.y - grab.y };
  };

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden rounded border border-border/60 bg-black/80"
      style={{ aspectRatio: `${aspect}` }}
    >
      {imageUrl ? (
        // biome-ignore lint/performance/noImgElement: a data:/blob: canvas frame, not a route asset
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onLoad={(event) =>
            onImageSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
          }
        />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-2xs text-white/60">
          Wire a picture into this action to place the type on it.
        </p>
      )}

      {/* The nine points, always drawn: the target has to be visible before the drag starts. */}
      {BURN_IN_ANCHORS.map((anchor) => {
        const point = anchorOrigin(anchor, extent, placement.marginFrac);
        return (
          <span
            key={anchor}
            aria-hidden
            data-anchor-dot={anchor}
            className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50"
            style={{
              left: `${(point.x + extent.widthFrac / 2) * 100}%`,
              top: `${(point.y + extent.heightFrac / 2) * 100}%`,
            }}
          />
        );
      })}

      <button
        type="button"
        aria-label="Type block — drag to place, arrow keys to nudge"
        data-testid="burn-in-block"
        className="absolute cursor-grab rounded-[2px] border border-brand-primary bg-brand-primary/25 active:cursor-grabbing"
        style={{
          left: `${rect.x0 * 100}%`,
          top: `${rect.y0 * 100}%`,
          width: `${(rect.x1 - rect.x0) * 100}%`,
          height: `${Math.max(0.02, rect.y1 - rect.y0) * 100}%`,
        }}
        onPointerDown={(event) => {
          const pointer = toFraction(event);
          if (!pointer) return;
          grabRef.current = { x: pointer.x - rect.x0, y: pointer.y - rect.y0 };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const origin = originFrom(event);
          if (origin) onDrag(origin);
        }}
        onPointerUp={(event) => {
          const origin = originFrom(event);
          grabRef.current = null;
          if (origin) onCommit(origin);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? NUDGE * 4 : NUDGE;
          const delta =
            event.key === 'ArrowLeft'
              ? { x: -step, y: 0 }
              : event.key === 'ArrowRight'
                ? { x: step, y: 0 }
                : event.key === 'ArrowUp'
                  ? { x: 0, y: -step }
                  : event.key === 'ArrowDown'
                    ? { x: 0, y: step }
                    : null;
          if (!delta) return;
          event.preventDefault();
          // Deliberately NOT the snap path. A 0.5 % nudge is inside the snap radius by
          // construction, so re-snapping it would swallow every keypress and the block could
          // never leave an anchor from the keyboard. Arrow keys ARE the fine adjustment; the
          // anchor grid is how you get back onto a point.
          onNudge(delta.x, delta.y);
        }}
      />
    </div>
  );
}

export function BurnInConfig({
  nodeId,
  config,
}: {
  nodeId: string;
  config: Record<string, unknown>;
}) {
  const patch = useNodeConfigPatch();
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const brandId = useStudioStore((state) => state.brandId);
  const { inputs: brand, snapshot, facesReady } = useBrandType(brandId);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Point | null>(null);

  const current = parseActionConfig('image.text', config);
  const placement: BurnInPlacement = {
    anchor: (current.anchor as BurnInAnchor) ?? 'top-right',
    offsetX: num(current.offsetX, 0),
    offsetY: num(current.offsetY, 0),
    marginFrac: num(current.marginFrac, 0.075),
  };
  const measure = num(current.measure, 0.61);
  const minContrast = num(current.minContrast, 3.2);
  const escalate = current.escalate !== false;
  const fallbackType = current.fallbackType !== false;
  const fallbackInk = current.fallbackInk !== false;
  const inkToken = typeof current.inkToken === 'string' ? current.inkToken : '';
  // Mutually exclusive by construction: every write below sets one and clears the other, so
  // there is never a selected token AND a selected custom colour to disagree about.
  const inkHex = typeof current.inkHex === 'string' ? current.inkHex : null;

  const sources = useMemo(
    () => resolveBurnInPreviewSources(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );

  const frame = imageSize ?? { width: 1080, height: 1350 };
  const aspect = frame.width / Math.max(1, frame.height) || FALLBACK_ASPECT;

  // The palette's colour tokens that actually RESOLVE to a literal colour. One that does not
  // would throw inside `resolveInk` at run time, so offering it as a swatch would be offering
  // a choice that fails — and failing loudly there is deliberate, not something to route around.
  const inkTokens = useMemo<DesignToken[]>(
    () =>
      (snapshot?.tokens ?? []).filter(
        (token) =>
          token.kind === 'color' &&
          sectionForToken(token) === 'palette' &&
          parseHexColour(token.resolvedValue ?? token.value) !== null,
      ),
    [snapshot],
  );

  // THE SAME CHAIN THE RENDER WALKS, from the same reader — so a panel that names a face is
  // naming the one that will be burned in, on every rung including the fallback.
  const faces = useMemo(() => resolveHeadlineFaces(brand), [brand]);
  const ink = useMemo(
    () => resolveCustomInk(inkHex) ?? resolveHeadlineInk(brand, inkToken),
    [brand, inkHex, inkToken],
  );

  const extent = useMemo<BlockExtent>(() => {
    const tokens: HeadlineToken[] = sources.headline ? parseHeadline(sources.headline) : [];
    // `facesReady` gates the measure rather than decorating it: `createMeasurer` reads this
    // thread's font set at call time, so measuring before a preloaded face registers sizes the
    // block in Helvetica and hands the user a rectangle the render will not reproduce.
    const measureText = tokens.length > 0 && facesReady ? previewMeasurer(faces) : null;
    if (!measureText) {
      // Nominal two lines: enough of a block to grab and place before the words arrive.
      return { widthFrac: measure, heightFrac: (0.066 + 0.067) * aspect, lines: 0 };
    }
    return headlineBlockExtent({ tokens, frame, measureText, measureFraction: measure });
  }, [aspect, faces, facesReady, frame, measure, sources.headline]);

  const write = (patchIn: Record<string, unknown>) => {
    patch(nodeId, 'action', { config: { ...current, ...patchIn } });
  };

  // The live placement while a drag is in flight — resolved through the SAME snap the release
  // will use, so the block visibly lands on an anchor before the pointer comes up and the
  // highlighted dot is never a promise the commit breaks.
  const live = dragOrigin ? snapToAnchor(dragOrigin, extent, placement.marginFrac) : null;
  const shown = live ?? placement;

  const commit = (origin: Point) => {
    const snapped = snapToAnchor(origin, extent, placement.marginFrac);
    setDragOrigin(null);
    write({ anchor: snapped.anchor, offsetX: snapped.offsetX, offsetY: snapped.offsetY });
  };

  /** A keyboard nudge: the offset moves, the anchor does not, and nothing re-snaps. */
  const nudge = (dx: number, dy: number) => {
    const clamp = (value: number) => Number(Math.min(1, Math.max(-1, value)).toFixed(4));
    write({ offsetX: clamp(placement.offsetX + dx), offsetY: clamp(placement.offsetY + dy) });
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Placement</Label>
          <span className="text-2xs text-muted-foreground">
            {live?.snapped
              ? ANCHOR_LABEL[live.anchor]
              : placement.offsetX === 0 && placement.offsetY === 0
                ? ANCHOR_LABEL[placement.anchor]
                : `${ANCHOR_LABEL[placement.anchor]} + nudge`}
          </span>
        </div>
        <PlacementStage
          imageUrl={sources.imageUrl}
          aspect={aspect}
          extent={extent}
          placement={shown}
          onDrag={setDragOrigin}
          onCommit={commit}
          onNudge={nudge}
          onImageSize={(width, height) => setImageSize({ width, height })}
        />
        <AnchorGrid
          value={placement.anchor}
          candidate={live?.snapped ? live.anchor : null}
          onPick={(anchor) => write({ anchor, offsetX: 0, offsetY: 0 })}
        />
        <p className="text-2xs text-muted-foreground">
          Drag the block, or pick a point. Releasing on a point clears the nudge, so the placement
          holds at any output size.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Type</Label>
          <span
            className="text-2xs text-muted-foreground"
            data-testid="burn-in-type-source"
            data-type-source={faces.source}
          >
            {describeHeadlineFaces(faces)}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground">
          {faces.source === 'fallback'
            ? 'No typeface was found in this brand’s design system, brand book, kit or website, so the headline is set in a face Continuum ships. Add one and it is used the next time this runs.'
            : `Read from ${BRAND_TYPE_SOURCE_LABEL[faces.source]}. The headline is set in it, never in a face typed here.`}
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <Label className="text-xs">Ink</Label>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            aria-label="The palette's default ink"
            aria-pressed={inkHex === null && inkToken === ''}
            onClick={() => write({ inkToken: '', inkHex: null })}
            className={`h-6 rounded border px-2 text-2xs ${
              inkHex === null && inkToken === ''
                ? 'border-brand-primary bg-brand-primary/15'
                : 'border-border/60 text-muted-foreground hover:bg-muted/60'
            }`}
          >
            Default
          </button>
          {inkTokens.map((token) => (
            <button
              key={token.name}
              type="button"
              aria-label={token.name}
              aria-pressed={inkHex === null && inkToken === token.name}
              title={token.name}
              onClick={() => write({ inkToken: token.name, inkHex: null })}
              className={`size-6 rounded border ${
                inkHex === null && inkToken === token.name
                  ? 'border-brand-primary ring-1 ring-brand-primary'
                  : 'border-border/60'
              }`}
              style={{ background: token.resolvedValue ?? token.value }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1" data-testid="burn-in-ink-custom">
          <ColorField
            label="Custom ink"
            value={inkHex}
            onChange={(hex) => write({ inkHex: hex, inkToken: '' })}
          />
          {inkHex === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Clear the custom ink"
              title="Back to the palette"
              onClick={() => write({ inkHex: null })}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
        <p className="text-2xs text-muted-foreground" data-testid="burn-in-ink-source">
          {ink
            ? `${describeHeadlineInk(ink)}. ${
                inkHex
                  ? 'A hand-picked colour stays this colour — re-tinting the palette will not move it.'
                  : 'The token is a reference, so re-tinting the palette re-tints the headline.'
              }`
            : fallbackInk
              ? 'No brand colour anywhere — not in a design system, a brand book, a kit or a website. A legible black or white is MEASURED from the photo at render time, and the piece says which it used.'
              : 'No brand colour anywhere, and the fallback ink is switched off — this action will refuse rather than draw. Add a brand colour, or switch the fallback back on below.'}
        </p>
      </section>

      <SliderField
        label="Measure"
        value={measure}
        min={0.2}
        max={1}
        step={0.01}
        format={{ style: 'percent', maximumFractionDigits: 0 }}
        suffix=" of the width"
        onChange={(value) => write({ measure: value })}
      />
      <SliderField
        label="Edge margin"
        value={placement.marginFrac}
        min={0}
        max={0.25}
        step={0.005}
        format={{ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }}
        onChange={(value) => write({ marginFrac: value })}
      />
      <SliderField
        label="Minimum contrast"
        value={minContrast}
        min={1}
        max={7}
        step={0.1}
        suffix=":1"
        onChange={(value) => write({ minContrast: value })}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Label id={`burn-in-fallback-type-${nodeId}`} className="text-xs">
            Use a fallback typeface
          </Label>
          <p className="max-w-[15rem] text-2xs text-muted-foreground">
            OFF makes this action REFUSE TO RUN for a brand that names no typeface, instead of
            setting the headline in {PRELOADED_TYPE_FACES.display}. Turn it off for a piece where a
            substitute face is worse than no piece.
          </p>
        </div>
        <Switch
          aria-labelledby={`burn-in-fallback-type-${nodeId}`}
          checked={fallbackType}
          onCheckedChange={(checked) => write({ fallbackType: checked })}
        />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Label id={`burn-in-fallback-ink-${nodeId}`} className="text-xs">
            Measure a fallback ink
          </Label>
          <p className="max-w-[15rem] text-2xs text-muted-foreground">
            OFF makes this action REFUSE TO RUN for a brand with no colour, instead of measuring a
            legible black or white off the photo. Never a hard-coded hex either way — the two
            candidates are compared against the darkest and brightest of what is behind the type.
          </p>
        </div>
        <Switch
          aria-labelledby={`burn-in-fallback-ink-${nodeId}`}
          checked={fallbackInk}
          onCheckedChange={(checked) => write({ fallbackInk: checked })}
        />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Label id={`burn-in-escalate-${nodeId}`} className="text-xs">
            Treat the background
          </Label>
          <p className="max-w-[15rem] text-2xs text-muted-foreground">
            Contrast outranks placement: type dragged over a dark patch lifts the PHOTO to reach the
            bar. It is never moved somewhere friendlier. Off pins the photo and reports the ratio it
            actually reached.
          </p>
        </div>
        <Switch
          aria-labelledby={`burn-in-escalate-${nodeId}`}
          checked={escalate}
          onCheckedChange={(checked) => write({ escalate: checked })}
        />
      </div>
    </div>
  );
}
