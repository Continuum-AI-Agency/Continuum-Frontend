'use client';

// The still viewer, Frame.io-style: pinch or ⌘/Ctrl+scroll zooms at the cursor,
// + and − double and halve, 0 fits, "1:1" is 100%, Shift holds a 100% loupe
// under the cursor, Z+drag (or the marquee button) zooms to a box, Space+drag or
// a plain scroll pans, and a mini map appears once part of the image is off
// screen. Children receive the zoomed content rect, so the annotation overlay
// draws pins and marks on the same pixels at any zoom.
//
// The view is controllable: compare hands both panes one view to keep them on
// the same spot, and lets go of it when the reviewer unlinks them.

import { Minus, Plus, ScanSearch } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  type CssRect,
  fitContentRect,
  type NormalizedPoint,
  type Size,
} from '../annotationGeometry';
import {
  actualSizeScale,
  centerOn,
  FIT_VIEW,
  isCropped,
  panBy,
  visibleRegion,
  type ZoomView,
  zoomAround,
  zoomedRect,
  zoomPercent,
  zoomToBox,
} from './zoomMath';

export type ZoomGeometry = { contentRect: CssRect | null; containerSize: Size | null };

type Props = {
  src: string;
  alt: string;
  /** Controlled view; omit both to let the stage keep its own. */
  view?: ZoomView;
  onViewChange?: (view: ZoomView) => void;
  crossOrigin?: 'anonymous';
  imageRef?: (element: HTMLImageElement | null) => void;
  imageTestId?: string;
  onLoad?: () => void;
  onError?: () => void;
  /** Extra buttons at the end of the zoom bar. */
  controlsExtra?: ReactNode;
  children?: (geometry: ZoomGeometry) => ReactNode;
};

type Gesture = 'pan' | 'marquee';
const LOUPE_PX = 180;
const MINIMAP_MAX = { width: 160, height: 120 };

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function ZoomButton({
  label,
  testId,
  pressed,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-2xs font-medium tabular-nums transition-colors hover:bg-muted',
        pressed && 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
    >
      {children}
    </button>
  );
}

function MiniMap({
  src,
  natural,
  region,
  onCenter,
}: {
  src: string;
  natural: Size;
  region: { x: number; y: number; width: number; height: number };
  onCenter: (point: NormalizedPoint) => void;
}) {
  const scale = Math.min(MINIMAP_MAX.width / natural.width, MINIMAP_MAX.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const pointAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onCenter({
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    });
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the keyboard pans with the zoom bar and Space+drag
    <div
      data-testid="zoom-minimap"
      className="absolute bottom-3 left-3 z-20 cursor-pointer overflow-hidden rounded-md border border-border bg-background/90 shadow-lg"
      style={{ width, height }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointAt(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) pointAt(event);
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: the same signed URL the stage already loaded */}
      <img src={src} alt="" draggable={false} className="size-full select-none object-fill" />
      <div
        data-testid="zoom-minimap-viewport"
        className="pointer-events-none absolute border-2 border-primary bg-primary/10"
        style={{
          left: region.x * width,
          top: region.y * height,
          width: region.width * width,
          height: region.height * height,
        }}
      />
    </div>
  );
}

export function ZoomStage({
  src,
  alt,
  view: controlledView,
  onViewChange,
  crossOrigin,
  imageRef,
  imageTestId,
  onLoad,
  onError,
  controlsExtra,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [ownView, setOwnView] = useState<ZoomView>(FIT_VIEW);
  const view = controlledView ?? ownView;
  const [keyGesture, setKeyGesture] = useState<Gesture | null>(null);
  const [marqueeArmed, setMarqueeArmed] = useState(false);
  const [loupe, setLoupe] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<CssRect | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRef = useRef(false);
  const gesture: Gesture | null = marqueeArmed ? 'marquee' : keyGesture;

  const fit = useMemo(
    () => (containerSize && natural ? fitContentRect(containerSize, natural) : null),
    [containerSize, natural],
  );
  const rect = fit && containerSize ? zoomedRect(fit, containerSize, view) : null;
  const region = fit && containerSize ? visibleRegion(fit, containerSize, view) : null;
  const percent = fit && natural ? zoomPercent(view, fit, natural) : null;

  const setView = useCallback(
    (next: ZoomView) => (onViewChange ? onViewChange(next) : setOwnView(next)),
    [onViewChange],
  );

  // Listeners registered once read the latest geometry here.
  const latest = useRef({ view, fit, containerSize, natural, setView });
  latest.current = { view, fit, containerSize, natural, setView };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const stepZoom = useCallback((factor: number) => {
    const { view: current, fit: fitted, containerSize: size, setView: apply } = latest.current;
    if (!fitted || !size) return;
    apply(
      zoomAround(
        current,
        current.scale * factor,
        { x: size.width / 2, y: size.height / 2 },
        fitted,
        size,
      ),
    );
  }, []);

  const toFit = useCallback(() => latest.current.setView(FIT_VIEW), []);

  const toActualSize = useCallback(() => {
    const {
      view: current,
      fit: fitted,
      containerSize: size,
      natural: bytes,
      setView: apply,
    } = latest.current;
    if (!fitted || !size || !bytes) return;
    const anchor = pointerRef.current ?? { x: size.width / 2, y: size.height / 2 };
    apply(zoomAround(current, actualSizeScale(fitted, bytes), anchor, fitted, size));
  }, []);

  // Non-passive, so ⌘/Ctrl+scroll (and a trackpad pinch, which arrives as a
  // Ctrl+wheel) zooms the image instead of the page.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const { view: current, fit: fitted, containerSize: size, setView: apply } = latest.current;
      if (!fitted || !size) return;
      const bounds = element.getBoundingClientRect();
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = Math.min(2, Math.max(0.5, Math.exp(-event.deltaY * 0.01)));
        apply(zoomAround(current, current.scale * factor, anchor, fitted, size));
        return;
      }
      if (isCropped(visibleRegion(fitted, size, current))) {
        event.preventDefault();
        apply(panBy(current, -event.deltaX, -event.deltaY, fitted, size));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Keys act only while the pointer is over this stage, so two panes in compare
  // (and the comment composer) never fight over them. The browser's own :hover covers a
  // stage that mounted under a still pointer (the detail view re-keys the stage when the
  // version list arrives), which never sees a pointerenter until the mouse moves.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hovered = hoveredRef.current || (containerRef.current?.matches(':hover') ?? false);
      if (!hovered || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case 'Shift':
          setPointer(pointerRef.current);
          setLoupe(true);
          return;
        case '+':
        case '=':
          stepZoom(2);
          break;
        case '-':
        case '_':
          stepZoom(0.5);
          break;
        case '0':
          toFit();
          break;
        case 'z':
        case 'Z':
          setKeyGesture('marquee');
          break;
        case ' ':
          setKeyGesture('pan');
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setLoupe(false);
      if (event.key === 'z' || event.key === 'Z' || event.key === ' ') setKeyGesture(null);
    };
    const reset = () => {
      setLoupe(false);
      setKeyGesture(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', reset);
    };
  }, [stepZoom, toFit]);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null;
  };

  // Pan and marquee drag from where they started, so a move that lands between
  // renders never compounds a stale view.
  const drag = useRef<{ start: { x: number; y: number }; view: ZoomView } | null>(null);
  const onGestureDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = localPoint(event);
    if (!start || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start, view };
    if (gesture === 'marquee') setMarquee({ left: start.x, top: start.y, width: 0, height: 0 });
  };
  const onGestureMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = drag.current;
    const at = localPoint(event);
    if (!origin || !at || !fit || !containerSize) return;
    if (gesture === 'pan') {
      setView(panBy(origin.view, at.x - origin.start.x, at.y - origin.start.y, fit, containerSize));
      return;
    }
    setMarquee({
      left: Math.min(origin.start.x, at.x),
      top: Math.min(origin.start.y, at.y),
      width: Math.abs(at.x - origin.start.x),
      height: Math.abs(at.y - origin.start.y),
    });
  };
  const onGestureUp = () => {
    const origin = drag.current;
    drag.current = null;
    if (gesture === 'marquee' && origin && marquee && fit && containerSize) {
      setView(zoomToBox(origin.view, marquee, fit, containerSize));
      setMarqueeArmed(false);
    }
    setMarquee(null);
  };

  const loupeAt = loupe && pointer && rect && natural ? pointer : null;
  const loupeInside =
    loupeAt &&
    rect &&
    loupeAt.x >= rect.left &&
    loupeAt.x <= rect.left + rect.width &&
    loupeAt.y >= rect.top &&
    loupeAt.y <= rect.top + rect.height;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer tracking for the loupe; zoom has keyboard and button paths
    <div
      ref={containerRef}
      data-testid="zoom-stage"
      data-zoom-scale={view.scale.toFixed(4)}
      data-zoom-percent={percent ?? undefined}
      data-zoom-cx={view.cx.toFixed(4)}
      data-zoom-cy={view.cy.toFixed(4)}
      className="absolute inset-0 overflow-hidden"
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        pointerRef.current = null;
        setPointer(null);
      }}
      onPointerMove={(event) => {
        hoveredRef.current = true;
        pointerRef.current = localPoint(event);
        if (loupe) setPointer(pointerRef.current);
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: annotation math needs the untransformed intrinsic frame */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        crossOrigin={crossOrigin}
        draggable={false}
        data-testid={imageTestId}
        className={cn(
          'pointer-events-none absolute max-w-none select-none',
          !rect && 'inset-0 size-full object-contain',
        )}
        style={
          rect
            ? {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                imageRendering: (percent ?? 0) >= 200 ? 'pixelated' : undefined,
              }
            : undefined
        }
        onLoad={(event) => {
          const element = event.currentTarget;
          setNatural({ width: element.naturalWidth, height: element.naturalHeight });
          onLoad?.();
        }}
        onError={onError}
      />

      {children?.({ contentRect: rect, containerSize })}

      {gesture ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: pan/marquee drag surface, armed by Space, Z or the marquee button
        <div
          data-testid="zoom-gesture-layer"
          data-gesture={gesture}
          className="absolute inset-0 z-30"
          style={{ cursor: gesture === 'pan' ? 'grab' : 'zoom-in' }}
          onPointerDown={onGestureDown}
          onPointerMove={onGestureMove}
          onPointerUp={onGestureUp}
        >
          {marquee ? (
            <div
              data-testid="zoom-marquee-box"
              className="pointer-events-none absolute border border-dashed border-primary bg-primary/10"
              style={marquee}
            />
          ) : null}
        </div>
      ) : null}

      {loupeInside && loupeAt && rect && natural ? (
        <div
          data-testid="zoom-loupe"
          data-loupe-percent={100}
          className="pointer-events-none absolute z-40 rounded-full border-2 border-background shadow-xl ring-1 ring-border"
          style={{
            left: loupeAt.x - LOUPE_PX / 2,
            top: loupeAt.y - LOUPE_PX / 2,
            width: LOUPE_PX,
            height: LOUPE_PX,
            backgroundImage: `url("${src}")`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${natural.width}px ${natural.height}px`,
            backgroundPosition: `${LOUPE_PX / 2 - ((loupeAt.x - rect.left) / rect.width) * natural.width}px ${
              LOUPE_PX / 2 - ((loupeAt.y - rect.top) / rect.height) * natural.height
            }px`,
            imageRendering: 'pixelated',
          }}
        />
      ) : null}

      {region && natural && fit && containerSize && isCropped(region) ? (
        <MiniMap
          src={src}
          natural={natural}
          region={region}
          onCenter={(point) => setView(centerOn(view, point, fit, containerSize))}
        />
      ) : null}

      <div className="absolute right-3 top-3 z-20 flex items-center gap-0.5 rounded-full border border-border bg-background/85 p-0.5 text-foreground shadow-sm backdrop-blur">
        <ZoomButton label="Zoom out (−)" testId="zoom-out" onClick={() => stepZoom(0.5)}>
          <Minus className="size-3.5" />
        </ZoomButton>
        <ZoomButton label="Fit (0)" testId="zoom-fit" onClick={toFit}>
          {percent === null ? '—' : `${percent}%`}
        </ZoomButton>
        <ZoomButton label="Zoom in (+)" testId="zoom-in" onClick={() => stepZoom(2)}>
          <Plus className="size-3.5" />
        </ZoomButton>
        <ZoomButton label="Actual size (100%)" testId="zoom-actual" onClick={toActualSize}>
          1:1
        </ZoomButton>
        <ZoomButton
          label="Marquee zoom (Z + drag)"
          testId="zoom-marquee"
          pressed={marqueeArmed}
          onClick={() => setMarqueeArmed((armed) => !armed)}
        >
          <ScanSearch className="size-3.5" />
        </ZoomButton>
        {controlsExtra}
      </div>
    </div>
  );
}
