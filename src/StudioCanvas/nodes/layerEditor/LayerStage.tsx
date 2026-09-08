'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { LayerEditorLayer } from '../../types';
import { clampZoom, type Frame, fitScale, panDeltaForZoom } from '../../utils/layers/frameModel';
import {
  type CornerHandle,
  GROUP_HANDLES,
  handleCursor,
  handlePoints,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeLayer,
  rotateGroup,
  rotateHandlePoint,
  rotateLayer,
  scaleGroup,
} from '../../utils/layers/layerGizmo';
import { duplicateLayer, nudgeLayers, setLayer } from '../../utils/layers/layerOps';
import {
  movingBounds,
  SNAP_THRESHOLD_PX,
  type SnapGuide,
  snapBounds,
  snapTargets,
} from '../../utils/layers/layerSnap';
import {
  layerAtPoint,
  layerBounds,
  layerCorners,
  layerTransformCss,
  type Point,
  type Rect,
  rectsIntersect,
  unionBounds,
} from '../../utils/layers/layerTransform';
import { isTextEntryTarget } from './useLayerEditorKeymap';

/**
 * The composition stage: the document as the user sees it, and the gizmo they grab.
 *
 * Layers are DOM `<img>`s carrying `layerTransformCss` — the SAME four ops
 * `compositeLayers` gives the canvas — so what is on screen is what exports. The
 * arithmetic behind the handles lives in `utils/layers/layerGizmo.ts`; this file is only
 * pointer plumbing, on the window-listener idiom `nodes/timeline/OverlayTrack.tsx` uses.
 */

/** Screen pixels the rotate grip floats above the top edge. */
const ROTATE_GRIP_OFFSET = 28;
/** Screen pixels a handle is across. Divided by the stage scale to stay constant. */
const HANDLE_SIZE = 9;
/** Shift while rotating snaps to this, the way every editor does. */
const ROTATE_SNAP_DEGREES = 15;
/**
 * Screen pixels the pointer must travel before a press becomes a drag.
 *
 * Measured on the SCREEN, not in composition pixels, so the threshold feels the same at
 * every zoom. Without it a plain selecting click opens a history entry that changes
 * nothing, and Cmd+Z after clicking around a few layers is a run of silent no-ops.
 */
const DRAG_THRESHOLD_PX = 3;
/** One wheel notch. Multiplicative, so zooming out then in returns to where it started. */
const ZOOM_STEP = 1.0015;
/** A ⌘+ / ⌘- step. Coarser than the wheel because it is one deliberate press. */
const ZOOM_KEY_STEP = 1.25;
/** The invisible grab target is this many times the drawn handle. */
const HANDLE_HIT_SCALE = 2.5;

export interface LayerStageProps {
  frame: Frame;
  layers: readonly LayerEditorLayer[];
  /** Layer id -> a displayable URL. */
  sources: ReadonlyMap<string, string>;
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  /** First movement: bank the pre-drag document so the whole drag is ONE undo step. */
  onBegin: () => void;
  /** Pointer-move: the in-flight document. */
  onPreview: (layers: LayerEditorLayer[]) => void;
  /** Escape or `pointercancel`: throw the in-flight gesture away, leaving no history. */
  onCancel: () => void;
  /** Alignment snapping to the frame and to the other layers' edges and centres. */
  snapEnabled: boolean;
}

export function LayerStage({
  frame,
  layers,
  sources,
  selectedIds,
  onSelectionChange,
  onBegin,
  onPreview,
  onCancel,
  snapEnabled,
}: LayerStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Alignment lines for the gesture in flight. Empty whenever nothing is snapped. */
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  /**
   * What the gesture is doing, in numbers, shown beside the selection.
   *
   * Stage-local on purpose: a hover or a readout must not re-render the dialog, which
   * would put 20 sortable rows and a dozen tooltips on the path of every pointer sample.
   */
  const [readout, setReadout] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** The rubber-band rect while dragging from empty space, in composition pixels. */
  const [marquee, setMarquee] = useState<Rect | null>(null);

  const baseScale = fitScale(frame, viewport);
  const scale = baseScale * zoom;

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitToPane = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // A new frame is a new document to look at. Holding a deep zoom across the change
  // leaves the user staring at empty space somewhere off the new frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the frame's SIZE is the
  // signal; `fitToPane` is stable and re-running on its identity would say nothing.
  useLayoutEffect(fitToPane, [frame.width, frame.height, fitToPane]);

  /** Screen -> composition pixels. Every interaction below works in composition space. */
  const toComposition = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || scale <= 0) return { x: 0, y: 0 };
      return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    },
    [scale],
  );

  /** Zoom about a fixed composition point. The arithmetic is `panDeltaForZoom`. */
  const zoomAbout = useCallback(
    (nextZoom: number, focus: Point) => {
      setZoom((current) => {
        const clamped = clampZoom(nextZoom);
        const from = baseScale * current;
        const to = baseScale * clamped;
        if (from === to) return current;
        const delta = panDeltaForZoom({ frame, focus, from, to });
        setPan((currentPan) => ({ x: currentPan.x + delta.x, y: currentPan.y + delta.y }));
        return clamped;
      });
    },
    [baseScale, frame],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      // A trackpad pinch arrives as ctrlKey+wheel; everything else is a two-finger pan,
      // which is what a scroll means on a canvas this size.
      if (event.ctrlKey || event.metaKey) {
        zoomAbout(zoom * ZOOM_STEP ** -event.deltaY, toComposition(event));
        return;
      }
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    },
    [toComposition, zoom, zoomAbout],
  );

  /** Middle-drag, or left-drag with space held: the two ways every editor pans. */
  const startPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const { pointerId } = event;
    let last = { x: event.clientX, y: event.clientY };

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - last.x;
      const dy = moveEvent.clientY - last.y;
      last = { x: moveEvent.clientX, y: moveEvent.clientY };
      setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    };

    element.setPointerCapture(pointerId);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }, []);

  /**
   * Space-to-pan, and the zoom chords.
   *
   * Local to the stage rather than in `useLayerEditorKeymap` because zoom is view state
   * the stage owns; lifting it to the dialog would buy nothing but two more props.
   */
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key === '0') {
        event.preventDefault();
        fitToPane();
      } else if (event.key === '1') {
        event.preventDefault();
        // 1:1 — one composition pixel per screen pixel, which is the whole point of
        // having a zoom at all on a 2048px frame in a 900px pane.
        setPan({ x: 0, y: 0 });
        setZoom(clampZoom(1 / (baseScale || 1)));
      } else if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        zoomAbout(zoom * ZOOM_KEY_STEP, { x: frame.width / 2, y: frame.height / 2 });
      } else if (event.key === '-') {
        event.preventDefault();
        zoomAbout(zoom / ZOOM_KEY_STEP, { x: frame.width / 2, y: frame.height / 2 });
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    // Space-up can be missed while another window has focus, which would leave the stage
    // stuck in pan mode with no way back.
    const clear = () => setSpaceHeld(false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [baseScale, fitToPane, frame.height, frame.width, zoom, zoomAbout]);

  /**
   * One gesture, captured on the element that started it.
   *
   * `setPointerCapture` rather than window listeners: the browser then routes every
   * subsequent move to this element even when the pointer leaves the stage, and it ends
   * the gesture itself on focus loss via `pointercancel` / `lostpointercapture`. The
   * window-listener version needed a `blur` handler that dispatched a synthetic global
   * `pointerup`, which every other listener in the app — React Flow, dnd-kit, Base UI —
   * also received.
   *
   * `onBegin` fires on the FIRST MOVE past `DRAG_THRESHOLD_PX`, never on the press, so a
   * click that only selects leaves the history alone.
   */
  const runDrag = useCallback(
    <T extends Element & GlobalEventHandlers>(
      event: React.PointerEvent<T>,
      onMove: (point: Point, moveEvent: PointerEvent) => void,
      /** Runs however the gesture ends — released, cancelled or abandoned. */
      onEnd?: () => void,
    ) => {
      // Typed through GlobalEventHandlers rather than cast to HTMLElement: the gesture
      // starts on a <div> for a move and on an SVG <rect>/<circle> for a handle, and
      // only that intersection has the pointer events on both.
      const element = event.currentTarget;
      const { pointerId, clientX: startX, clientY: startY } = event;
      let began = false;
      let live = true;

      const teardown = () => {
        if (!live) return;
        live = false;
        onEnd?.();
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', teardown);
        element.removeEventListener('pointercancel', abort);
        element.removeEventListener('lostpointercapture', teardown);
        window.removeEventListener('keydown', onKeyDown, true);
        if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      };

      function abort() {
        const started = began;
        teardown();
        // Only a gesture that actually banked a document has something to throw away.
        if (started) onCancel();
      }

      function move(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        if (!began) {
          const travelled = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
          if (travelled < DRAG_THRESHOLD_PX) return;
          began = true;
          onBegin();
        }
        moveEvent.preventDefault();
        onMove(toComposition(moveEvent), moveEvent);
      }

      function onKeyDown(keyEvent: KeyboardEvent) {
        if (keyEvent.key !== 'Escape') return;
        // Capture phase and `stopImmediatePropagation` because Base UI's dialog dismiss
        // is also listening: without this, Escape mid-drag closes the whole editor.
        keyEvent.preventDefault();
        keyEvent.stopImmediatePropagation();
        abort();
      }

      element.setPointerCapture(pointerId);
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', teardown);
      element.addEventListener('pointercancel', abort);
      element.addEventListener('lostpointercapture', teardown);
      window.addEventListener('keydown', onKeyDown, true);
    },
    [onBegin, onCancel, toComposition],
  );

  /** Every gesture clears the same in-flight decoration when it ends. */
  const endGesture = useCallback(() => {
    setGuides([]);
    setReadout(null);
  }, []);

  const startMove = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      ids: string[],
      origin: Point,
      /** The document the drag starts from. Alt-drag passes one with the copy already in. */
      from: readonly LayerEditorLayer[] = layers,
    ) => {
      const startLayers = [...from];
      const base = movingBounds(startLayers, ids);
      if (!base) return;
      const targets = snapTargets({ layers: startLayers, movingIds: ids, frame });

      runDrag(
        event,
        (point, moveEvent) => {
          let dx = point.x - origin.x;
          let dy = point.y - origin.y;
          // Shift constrains to the dominant axis — every editor's spelling of "along
          // this line only" — and takes over from snapping while it is held.
          if (moveEvent.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }

          const moved = {
            left: base.left + dx,
            top: base.top + dy,
            right: base.right + dx,
            bottom: base.bottom + dy,
          };
          const snap =
            snapEnabled && !moveEvent.shiftKey
              ? snapBounds({ moved, targets, threshold: SNAP_THRESHOLD_PX / (scale || 1) })
              : { dx: 0, dy: 0, guides: [] };

          setGuides(snap.guides);
          setReadout(`X ${Math.round(moved.left + snap.dx)}  Y ${Math.round(moved.top + snap.dy)}`);
          onPreview(nudgeLayers(startLayers, ids, dx + snap.dx, dy + snap.dy));
        },
        endGesture,
      );
    },
    [endGesture, frame, layers, onPreview, runDrag, scale, snapEnabled],
  );

  /**
   * Only layers with pixels are grabbable.
   *
   * A layer whose upstream node was disconnected renders nothing (`sources` has no entry)
   * but its quad still hit-tests, so an invisible rectangle sits on the stage swallowing
   * clicks meant for the layers underneath it.
   */
  const hittableLayers = useMemo(
    () => layers.filter((layer) => sources.has(layer.id)),
    [layers, sources],
  );

  const selected = layers.filter((layer) => selectedIds.includes(layer.id));
  const only = selected.length === 1 && !selected[0].locked ? selected[0] : null;
  /** A multi-selection is transformed as one box rather than not at all. */
  const editable = selected.filter((layer) => !layer.locked);
  const groupBounds = editable.length > 1 ? unionBounds(editable.map(layerBounds)) : null;
  const groupIds = useMemo(() => editable.map((layer) => layer.id), [editable]);

  const onStagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const point = toComposition(event);
      const hit = layerAtPoint(hittableLayers, point);
      // Shift joins ctrl/meta as "add to the selection" — it is the reflex most people
      // arrive with, and it previously REPLACED the selection instead.
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;

      if (!hit) {
        // Empty space clears the selection — but not while adding, or a mis-click during
        // a multi-select would throw the whole selection away.
        if (!additive) onSelectionChange([]);
        const kept = additive ? [...selectedIds] : [];

        // ...and the same press rubber-bands, so a drag across empty canvas selects.
        runDrag(
          event,
          (moveTo) => {
            const box = {
              left: Math.min(point.x, moveTo.x),
              top: Math.min(point.y, moveTo.y),
              right: Math.max(point.x, moveTo.x),
              bottom: Math.max(point.y, moveTo.y),
            };
            setMarquee(box);
            const caught = hittableLayers
              .filter((layer) => rectsIntersect(layerBounds(layer), box))
              .map((layer) => layer.id);
            onSelectionChange([...kept, ...caught.filter((id) => !kept.includes(id))]);
          },
          () => setMarquee(null),
        );
        return;
      }

      if (additive) {
        onSelectionChange(
          selectedIds.includes(hit.id)
            ? selectedIds.filter((id) => id !== hit.id)
            : [...selectedIds, hit.id],
        );
        return;
      }

      // Alt-drag leaves the original behind and drags a copy — the fastest way to build a
      // repeated element, and `duplicateLayer` has been written and tested since the
      // first wave with no way to reach it. Offset 0 so the copy starts exactly on top;
      // the drag itself is what separates them.
      if (event.altKey) {
        const index = layers.findIndex((layer) => layer.id === hit.id);
        const withCopy = duplicateLayer(layers, hit.id, 0);
        const copy = withCopy[index + 1];
        onSelectionChange([copy.id]);
        // `onBegin` still banks the document WITHOUT the copy, so one undo takes back
        // both the duplicate and the move it made.
        onPreview([...withCopy]);
        startMove(event, [copy.id], point, withCopy);
        return;
      }

      const next = selectedIds.includes(hit.id) ? [...selectedIds] : [hit.id];
      // Put the grabbed layer first: it is the one snapping measures against.
      const ordered = [hit.id, ...next.filter((id) => id !== hit.id)];
      onSelectionChange(ordered);
      startMove(event, ordered, point);
    },
    [hittableLayers, layers, onPreview, onSelectionChange, selectedIds, startMove, toComposition],
  );

  const startResize = useCallback(
    (layer: LayerEditorLayer, handle: ResizeHandle) =>
      (event: React.PointerEvent<SVGRectElement>) => {
        event.stopPropagation();
        if (event.button !== 0) return;
        const startLayers = [...layers];
        runDrag(
          event,
          (point, moveEvent) => {
            const next = resizeLayer(layer, handle, point, moveEvent.shiftKey, moveEvent.altKey);
            const bounds = layerBounds(next);
            setReadout(
              `W ${Math.round(bounds.right - bounds.left)}  H ${Math.round(bounds.bottom - bounds.top)}`,
            );
            onPreview(setLayer(startLayers, layer.id, next));
          },
          endGesture,
        );
      },
    [endGesture, layers, onPreview, runDrag],
  );

  const startGroupScale = useCallback(
    (bounds: Rect, handle: CornerHandle) => (event: React.PointerEvent<SVGRectElement>) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const startLayers = [...layers];
      const ids = [...groupIds];
      runDrag(
        event,
        (point, moveEvent) => {
          const next = scaleGroup({
            layers: startLayers,
            ids,
            handle,
            pointer: point,
            bounds,
            fromCentre: moveEvent.altKey,
          });
          const after = unionBounds(
            next.filter((layer) => ids.includes(layer.id)).map(layerBounds),
          );
          setReadout(
            `W ${Math.round(after.right - after.left)}  H ${Math.round(after.bottom - after.top)}`,
          );
          onPreview(next);
        },
        endGesture,
      );
    },
    [endGesture, groupIds, layers, onPreview, runDrag],
  );

  const startGroupRotate = useCallback(
    (bounds: Rect) => (event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const startLayers = [...layers];
      const ids = [...groupIds];
      const origin = toComposition(event);
      runDrag(
        event,
        (point, moveEvent) => {
          const next = rotateGroup({
            layers: startLayers,
            ids,
            bounds,
            startPointer: origin,
            pointer: point,
            snapDegrees: moveEvent.shiftKey ? ROTATE_SNAP_DEGREES : 0,
          });
          const turned = next.find((layer) => layer.id === ids[0]);
          const before = startLayers.find((layer) => layer.id === ids[0]);
          if (turned && before) {
            setReadout(`${Math.round(turned.rotation - before.rotation)}°`);
          }
          onPreview(next);
        },
        endGesture,
      );
    },
    [endGesture, groupIds, layers, onPreview, runDrag, toComposition],
  );

  const startRotate = useCallback(
    (layer: LayerEditorLayer) => (event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      const startLayers = [...layers];
      const origin = toComposition(event);
      runDrag(
        event,
        (point, moveEvent) => {
          const next = rotateLayer(
            layer,
            origin,
            point,
            moveEvent.shiftKey ? ROTATE_SNAP_DEGREES : 0,
          );
          setReadout(`${Math.round(next.rotation)}°`);
          onPreview(setLayer(startLayers, layer.id, next));
        },
        endGesture,
      );
    },
    [endGesture, layers, onPreview, runDrag, toComposition],
  );

  const handleSize = HANDLE_SIZE / (scale || 1);
  const gripOffset = ROTATE_GRIP_OFFSET / (scale || 1);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-4"
      data-testid="layer-stage"
      style={{ cursor: spaceHeld ? 'grab' : undefined }}
      onWheel={onWheel}
      // Middle-drag always pans; left-drag pans only while space is held, so the plain
      // left-drag stays what it should be — moving a layer.
      onPointerDown={(event) => {
        if (event.button === 1 || (spaceHeld && event.button === 0)) {
          event.preventDefault();
          startPan(event);
        }
      }}
    >
      <div
        ref={frameRef}
        data-testid="layer-frame"
        className="relative shadow-sm ring-1 ring-border/60"
        // `touchAction: none` is what makes a touch drag a drag: without it the browser
        // claims the gesture as a scroll partway through, and the pointercancel that
        // follows leaves the layer stuck to a pointer that never reports up again.
        style={{
          width: frame.width * scale,
          height: frame.height * scale,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          touchAction: 'none',
          cursor: spaceHeld ? 'grab' : hoveredId ? 'move' : 'default',
        }}
        onPointerDown={spaceHeld ? undefined : onStagePointerDown}
        // Hover is what tells you a layer is grabbable BEFORE you grab it. Local state,
        // so moving the mouse across the stage never re-renders the panels.
        onPointerMove={(event) => {
          if (readout) return;
          setHoveredId(layerAtPoint(hittableLayers, toComposition(event))?.id ?? null);
        }}
        onPointerLeave={() => setHoveredId(null)}
      >
        {/* The checkerboard says "this frame is transparent", which it is. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          }}
        />
        {/*
          `isolation: isolate` is LOad-bearing, not cosmetic. The export composites onto a
          fully transparent frame, so a `multiply` layer must blend against the layers
          under it and nothing else. On the stage that only held because `transform` here
          happened to open a stacking context that fenced the checkerboard sibling out —
          accidental, and silently undone by any change to how the zoom transform is
          applied. Stated explicitly, every blend mode keeps matching the PNG.
        */}
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden"
          style={{
            width: frame.width,
            height: frame.height,
            transform: `scale(${scale})`,
            isolation: 'isolate',
          }}
        >
          {layers.map((layer) =>
            layer.visible && sources.has(layer.id) ? (
              <img
                key={layer.id}
                data-layer-id={layer.id}
                src={sources.get(layer.id)}
                alt={layer.name}
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                style={{
                  width: layer.sourceWidth,
                  height: layer.sourceHeight,
                  transformOrigin: '0 0',
                  transform: layerTransformCss(layer),
                  opacity: layer.opacity,
                  mixBlendMode: layer.blendMode === 'normal' ? undefined : layer.blendMode,
                }}
              />
            ) : null,
          )}

          {/* Gizmo. In composition coordinates, with non-scaling strokes so the outline
              is one screen pixel whatever the zoom. */}
          {/*
            Colours are `var(--primary)`, NOT `hsl(var(--primary))`. This app's tokens are
            hex (`--primary: #5a48f9`), so wrapping them in `hsl()` yields an invalid
            colour — and SVG's fallbacks for that are silent and different per property:
            `stroke` becomes none and `fill` becomes black. The selection outline was
            therefore never painting at all, and the handles were rendering as flat black
            squares instead of white chips with a violet border.
          */}
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={frame.width}
            height={frame.height}
            aria-hidden
          >
            <title>Selection</title>
            {/* The alignment the drag has locked onto. Drawn across the whole frame so it
                reads as a guide rather than as part of either layer. */}
            {guides.map((guide) => (
              <line
                key={`${guide.axis}-${guide.at}`}
                x1={guide.axis === 'x' ? guide.at : 0}
                y1={guide.axis === 'x' ? 0 : guide.at}
                x2={guide.axis === 'x' ? guide.at : frame.width}
                y2={guide.axis === 'x' ? frame.height : guide.at}
                stroke="var(--primary)"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                data-testid={`layer-guide-${guide.axis}`}
              />
            ))}
            {hoveredId && !selectedIds.includes(hoveredId)
              ? layers
                  .filter((layer) => layer.id === hoveredId)
                  .map((layer) => (
                    <polygon
                      key={`hover-${layer.id}`}
                      points={layerCorners(layer)
                        .map((corner) => `${corner.x},${corner.y}`)
                        .join(' ')}
                      fill="none"
                      stroke="var(--primary)"
                      strokeOpacity={0.45}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
              : null}
            {selected.map((layer) => (
              <polygon
                key={layer.id}
                points={layerCorners(layer)
                  .map((corner) => `${corner.x},${corner.y}`)
                  .join(' ')}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {marquee ? (
              <rect
                x={marquee.left}
                y={marquee.top}
                width={marquee.right - marquee.left}
                height={marquee.bottom - marquee.top}
                fill="var(--primary)"
                fillOpacity={0.08}
                stroke="var(--primary)"
                strokeWidth={1}
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
                data-testid="layer-marquee"
              />
            ) : null}

            {/* A multi-selection gets ONE box with four corner handles. Corners only —
                `scaleGroup` explains why an edge handle on a group would be a lie. */}
            {groupBounds ? (
              <>
                <rect
                  x={groupBounds.left}
                  y={groupBounds.top}
                  width={groupBounds.right - groupBounds.left}
                  height={groupBounds.bottom - groupBounds.top}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                  data-testid="layer-group-box"
                />
                <line
                  x1={(groupBounds.left + groupBounds.right) / 2}
                  y1={groupBounds.top}
                  x2={(groupBounds.left + groupBounds.right) / 2}
                  y2={groupBounds.top - gripOffset}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="pointer-events-auto cursor-grab"
                  cx={(groupBounds.left + groupBounds.right) / 2}
                  cy={groupBounds.top - gripOffset}
                  r={handleSize * 0.6}
                  fill="var(--background)"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={startGroupRotate(groupBounds)}
                  data-testid="layer-group-rotate-handle"
                />
                {GROUP_HANDLES.map((handle) => {
                  const x =
                    handle === 'nw' || handle === 'sw' ? groupBounds.left : groupBounds.right;
                  const y =
                    handle === 'nw' || handle === 'ne' ? groupBounds.top : groupBounds.bottom;
                  return (
                    <g key={handle}>
                      <rect
                        className="pointer-events-auto"
                        x={x - (handleSize * HANDLE_HIT_SCALE) / 2}
                        y={y - (handleSize * HANDLE_HIT_SCALE) / 2}
                        width={handleSize * HANDLE_HIT_SCALE}
                        height={handleSize * HANDLE_HIT_SCALE}
                        fill="transparent"
                        style={{ cursor: handleCursor(handle, 0) }}
                        onPointerDown={startGroupScale(groupBounds, handle)}
                        data-testid={`layer-group-resize-${handle}`}
                      />
                      <rect
                        className="pointer-events-none"
                        x={x - handleSize / 2}
                        y={y - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="var(--background)"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })}
              </>
            ) : null}

            {only ? (
              <>
                <line
                  x1={only.position.x}
                  y1={only.position.y}
                  x2={rotateHandlePoint(only, gripOffset).x}
                  y2={rotateHandlePoint(only, gripOffset).y}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="pointer-events-auto cursor-grab"
                  cx={rotateHandlePoint(only, gripOffset).x}
                  cy={rotateHandlePoint(only, gripOffset).y}
                  r={handleSize * 0.6}
                  fill="var(--background)"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={startRotate(only)}
                  data-testid="layer-rotate-handle"
                />
                {/* The anchor, drawn because it is the pivot everything turns on. */}
                <circle
                  cx={only.position.x}
                  cy={only.position.y}
                  r={handleSize * 0.35}
                  fill="var(--primary)"
                  data-testid="layer-anchor-marker"
                />
                {RESIZE_HANDLES.map((handle) => {
                  const point = handlePoints(only)[handle];
                  const cursor = handleCursor(handle, only.rotation);
                  return (
                    <g key={handle}>
                      {/* An invisible target around the visible 9px square. 9px is well
                          under the ~24px a pointer actually lands within, so the drawn
                          handle stays small and precise while the grabbable area is not. */}
                      <rect
                        className="pointer-events-auto"
                        x={point.x - (handleSize * HANDLE_HIT_SCALE) / 2}
                        y={point.y - (handleSize * HANDLE_HIT_SCALE) / 2}
                        width={handleSize * HANDLE_HIT_SCALE}
                        height={handleSize * HANDLE_HIT_SCALE}
                        fill="transparent"
                        style={{ cursor }}
                        onPointerDown={startResize(only, handle)}
                        data-testid={`layer-resize-${handle}`}
                      />
                      <rect
                        className="pointer-events-none"
                        x={point.x - handleSize / 2}
                        y={point.y - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        fill="var(--background)"
                        stroke="var(--primary)"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })}
              </>
            ) : null}
          </svg>
        </div>
      </div>

      {/* The numbers for the gesture in flight. Centred at the top of the pane rather
          than chasing the pointer: a badge that follows the cursor sits under the hand
          that is dragging, which is the one place it cannot be read. */}
      {readout ? (
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded',
            'bg-foreground/90 px-2 py-1 text-2xs tabular-nums text-background shadow-sm',
          )}
          data-testid="layer-readout"
        >
          {readout}
        </span>
      ) : null}

      <div className="absolute bottom-2 right-3 flex items-center gap-1">
        <span
          className={cn(
            'pointer-events-none rounded bg-background/80 px-1.5 py-0.5',
            'text-2xs tabular-nums text-muted-foreground',
          )}
        >
          {frame.width} × {frame.height}
        </span>
        <button
          type="button"
          // The percentage used to be a label for a control that did not exist. Clicking
          // it fits; the chords are ⌘0 fit, ⌘1 for 1:1, ⌘± to step.
          onClick={fitToPane}
          title="Fit to the pane (⌘0). ⌘1 for 100%."
          className={cn(
            'rounded bg-background/80 px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground',
            'transition-colors hover:bg-background hover:text-foreground',
          )}
          data-testid="layer-zoom-readout"
        >
          {Math.round(scale * 100)}%
        </button>
      </div>
    </div>
  );
}
