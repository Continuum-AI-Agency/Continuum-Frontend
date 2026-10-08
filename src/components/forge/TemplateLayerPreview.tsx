'use client';

import type {
  FontInventoryRow,
  TemplateEditableLayer,
  TemplateLayerEdit,
} from '@continuum/contracts';
import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { TemplateLayerInspector } from './TemplateLayerInspector';

/** A flattened precomp's child selects its containing layer in the composition being edited. */
export function previewTarget(
  target: Element,
  layers: readonly TemplateEditableLayer[],
  compId: number,
) {
  let group = target.closest('[data-layer-id]');
  const seen = new Set<number>();
  while (group) {
    const id = Number(group.getAttribute('data-layer-id'));
    if (seen.has(id)) return null;
    seen.add(id);
    const layer = layers.find((entry) => entry.layerId === id);
    if (layer?.compId === compId) return layer;
    const parent = group.getAttribute('data-in');
    group = parent
      ? (group.closest('svg')?.querySelector(`[data-layer-id="${Number(parent)}"]`) ?? null)
      : null;
  }
  return null;
}

type Drag = {
  pointerId: number;
  layer: TemplateEditableLayer;
  start: [number, number];
  position: [number, number];
  inverse: DOMMatrix;
  moved: boolean;
};

export function TemplateLayerPreview({
  markup,
  layers,
  compId,
  layer,
  edit,
  edits = {},
  fonts,
  disabled,
  onSelect,
  onEdit,
}: {
  markup: string;
  layers: readonly TemplateEditableLayer[];
  compId: number;
  layer?: TemplateEditableLayer;
  edit?: TemplateLayerEdit;
  edits?: Record<number, TemplateLayerEdit>;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onSelect: (id: number) => void;
  onEdit: (layer: TemplateEditableLayer, change: Partial<TemplateLayerEdit>) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<[number, number] | null>(null);
  const [open, setOpen] = useState(false);
  const flush = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (pending.current && drag.current) onEdit(drag.current.layer, { position: pending.current });
    pending.current = null;
  };
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // Read after the SVG changes; the selection follows the actual drawn marks, including letterboxing.
  useLayoutEffect(() => {
    const update = () => {
      if (!canvas.current || !outline.current) return;
      const groups = layer
        ? Array.from(
            canvas.current.querySelectorAll<SVGGraphicsElement>(
              `[data-layer-id="${layer.layerId}"]`,
            ),
          )
        : [];
      const rects = groups
        .map((group) => group.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      outline.current.hidden = rects.length === 0;
      if (!rects.length) return;
      const bounds = canvas.current.getBoundingClientRect();
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      Object.assign(outline.current.style, {
        left: `${left - bounds.left}px`,
        top: `${top - bounds.top}px`,
        width: `${Math.max(...rects.map((rect) => rect.right)) - left}px`,
        height: `${Math.max(...rects.map((rect) => rect.bottom)) - top}px`,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [markup, layer]);

  const selectable = (target: EventTarget | null) =>
    target instanceof Element ? previewTarget(target, layers, compId) : null;
  const movable = (target: TemplateEditableLayer) =>
    !disabled && target.position && !target.transformLocks.position && !target.parentId;
  const finish = (cancelled: boolean) => {
    const current = drag.current;
    if (!current) return;
    if (cancelled) {
      pending.current = current.position;
      flush();
    } else flush();
    drag.current = null;
    if (canvas.current?.hasPointerCapture(current.pointerId))
      canvas.current.releasePointerCapture(current.pointerId);
    setOpen(!cancelled);
  };

  return (
    <Popover open={open && !!layer} onOpenChange={setOpen}>
      <div
        ref={canvas}
        role="application"
        aria-roledescription="template canvas"
        aria-label="Interactive template preview"
        aria-describedby="template-preview-help"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas supports arrow-key movement and Enter opens the selected layer's controls.
        tabIndex={0}
        className="relative size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring [&_g[data-layer-id]]:cursor-pointer"
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) return;
          const target = selectable(event.target);
          if (!target) {
            setOpen(false);
            return;
          }
          event.preventDefault();
          canvas.current?.focus({ preventScroll: true });
          onSelect(target.layerId);
          setOpen(false);
          const matrix = canvas.current?.querySelector('svg')?.getScreenCTM();
          if (!movable(target) || !matrix || !target.position) {
            setOpen(true);
            return;
          }
          drag.current = {
            pointerId: event.pointerId,
            layer: target,
            start: [event.clientX, event.clientY],
            position: edits[target.layerId]?.position ?? (target.layerId === layer?.layerId ? edit?.position : undefined) ?? target.position,
            inverse: matrix.inverse(),
            moved: false,
          };
          canvas.current?.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || event.pointerId !== current.pointerId) return;
          const [x, y] = current.start;
          if (!current.moved && Math.hypot(event.clientX - x, event.clientY - y) < 3) return;
          current.moved = true;
          const matrix = current.inverse;
          const dx = event.clientX - x;
          const dy = event.clientY - y;
          pending.current = [
            Math.max(
              -100_000,
              Math.min(
                100_000,
                Math.round((current.position[0] + matrix.a * dx + matrix.c * dy) * 100) / 100,
              ),
            ),
            Math.max(
              -100_000,
              Math.min(
                100_000,
                Math.round((current.position[1] + matrix.b * dx + matrix.d * dy) * 100) / 100,
              ),
            ),
          ];
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        }}
        onPointerUp={() => finish(false)}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => {
          if (drag.current) finish(true);
        }}
        onContextMenu={(event) => {
          const target = selectable(event.target);
          if (!target) return;
          event.preventDefault();
          onSelect(target.layerId);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            finish(true);
            setOpen(false);
          } else if ((event.key === 'Enter' || event.key === ' ') && layer) {
            event.preventDefault();
            setOpen(true);
          } else if (layer && movable(layer) && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const direction: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const delta = direction[event.key];
            const position = edit?.position ?? layer.position;
            if (delta && position) {
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              onEdit(layer, {
                position: [position[0] + delta[0] * step, position[1] + delta[1] * step],
              });
            }
          }
        }}
      >
        <div
          role="img"
          aria-label="Layout preview of the template with these edits"
          className="size-full select-none"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rebuilt from an element and attribute allowlist in layerPreviewSvg.safeSvg.
          dangerouslySetInnerHTML={{ __html: markup }}
        />
        <PopoverAnchor
          ref={outline}
          aria-hidden
          className="pointer-events-none absolute border border-primary"
        />
      </div>
      <PopoverContent
        aria-label="Layer controls"
        side="right"
        align="start"
        collisionPadding={12}
        initialFocus={false}
        finalFocus={canvas}
        className="max-h-[70dvh] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-3"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Layer controls</span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Close layer controls"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
        {layer ? (
          <TemplateLayerInspector
            layer={layer}
            edit={edit}
            fonts={fonts}
            disabled={disabled}
            idPrefix="preview"
            onEdit={(change) => onEdit(layer, change)}
          />
        ) : null}
        {layer?.parentId ? (
          <p className="mt-3 text-2xs text-muted-foreground">
            Move this layer with X and Y in its parent’s coordinates.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
