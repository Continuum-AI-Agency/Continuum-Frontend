'use client';

import type { TemplatePreview } from '@continuum/contracts';
import { useRef, useState } from 'react';
import { wireframeFrames } from './TemplateWireframe';

export type TextMove = {
  compId: number;
  layerId: number;
  dx: number;
  dy: number;
  dw?: number;
  dh?: number;
  font?: string;
};
export const textMoveKey = (move: Pick<TextMove, 'compId' | 'layerId'>) =>
  `${move.compId}:${move.layerId}`;
export const TEXT_REPAIR_FONT_MIME = 'application/x-continuum-template-font';

export function TemplateTextRepairCanvas({
  parse,
  ratio,
  comp,
  backgroundUrl,
  moves,
  onMove,
  onSelect,
  selectedKey,
  availableFonts = [],
}: {
  parse: TemplatePreview;
  ratio: string | null;
  comp: string | null;
  backgroundUrl?: string;
  moves: Record<string, TextMove>;
  onMove: (move: TextMove) => void;
  onSelect?: (key: string) => void;
  selectedKey?: string;
  availableFonts?: string[];
}) {
  const frame =
    wireframeFrames(parse).find((item) => item.comp === comp) ??
    wireframeFrames(parse).find((item) => item.ratio === ratio);
  const drag = useRef<{
    key: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    kind: 'move' | 'resize';
  } | null>(null);
  const [fontTarget, setFontTarget] = useState<string | null>(null);
  if (!frame) return null;

  return (
    <fieldset className="size-full border-0 p-0" aria-label={`Repair text in ${frame.comp}`}>
      <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="size-full bg-background">
        <title>{`Text placement in ${frame.comp}`}</title>
        {backgroundUrl ? (
          <image
            href={backgroundUrl}
            width={frame.width}
            height={frame.height}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <rect width={frame.width} height={frame.height} className="fill-muted/40" />
        )}
        {frame.boxes.map(({ key, kind, label, box, instance }, index) => {
          if (kind !== 'text') return null;
          const id = instance ? textMoveKey(instance) : `${key}:${index}`;
          const move = instance ? moves[id] : undefined;
          const dx = move ? (move.dx * frame.width) / instance!.compSize[0] : 0;
          const dy = move ? (move.dy * frame.height) / instance!.compSize[1] : 0;
          const dw = move ? ((move.dw ?? 0) * frame.width) / instance!.compSize[0] : 0;
          const dh = move ? ((move.dh ?? 0) * frame.height) / instance!.compSize[1] : 0;
          const shift = (x: number, y: number) => {
            if (!instance) return;
            const frameDx = Math.min(frame.width - box[2] - dw, Math.max(-box[0], x));
            const frameDy = Math.min(frame.height - box[3] - dh, Math.max(-box[1], y));
            onMove({
              compId: instance.compId,
              layerId: instance.layerId,
              dx: Math.round(((frameDx * instance.compSize[0]) / frame.width) * 100) / 100,
              dy: Math.round(((frameDy * instance.compSize[1]) / frame.height) * 100) / 100,
              dw: move?.dw ?? 0,
              dh: move?.dh ?? 0,
              ...(move?.font ? { font: move.font } : {}),
            });
          };
          const resize = (width: number, height: number) => {
            if (!instance) return;
            const frameDw = Math.min(
              frame.width - box[2] - dx,
              Math.max(1 - (box[2] - box[0]), width),
            );
            const frameDh = Math.min(
              frame.height - box[3] - dy,
              Math.max(1 - (box[3] - box[1]), height),
            );
            onMove({
              compId: instance.compId,
              layerId: instance.layerId,
              dx: move?.dx ?? 0,
              dy: move?.dy ?? 0,
              dw: Math.round(((frameDw * instance.compSize[0]) / frame.width) * 100) / 100,
              dh: Math.round(((frameDh * instance.compSize[1]) / frame.height) * 100) / 100,
              ...(move?.font ? { font: move.font } : {}),
            });
          };
          return (
            <g key={id}>
              {/* biome-ignore lint/a11y/useSemanticElements: the measured SVG rectangle is the drag target; it also supports keyboard moves. */}
              <rect
                onDragOver={(event) => {
                  if (!instance || !event.dataTransfer.types.includes(TEXT_REPAIR_FONT_MIME))
                    return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                  setFontTarget(id);
                }}
                onDragLeave={() => setFontTarget((current) => (current === id ? null : current))}
                onDrop={(event) => {
                  setFontTarget(null);
                  if (!instance) return;
                  const font = event.dataTransfer.getData(TEXT_REPAIR_FONT_MIME);
                  if (!availableFonts.includes(font)) return;
                  event.preventDefault();
                  onSelect?.(id);
                  onMove({
                    compId: instance.compId,
                    layerId: instance.layerId,
                    dx: move?.dx ?? 0,
                    dy: move?.dy ?? 0,
                    dw: move?.dw ?? 0,
                    dh: move?.dh ?? 0,
                    font,
                  });
                }}
                x={box[0] + dx}
                y={box[1] + dy}
                width={Math.max(1, box[2] - box[0] + dw)}
                height={Math.max(1, box[3] - box[1] + dh)}
                className={
                  instance
                    ? `cursor-grab touch-none stroke-primary focus-visible:stroke-foreground active:cursor-grabbing ${fontTarget === id || selectedKey === id ? 'fill-primary/40' : 'fill-primary/20'}`
                    : 'fill-muted-foreground/10 stroke-muted-foreground/40'
                }
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                role="button"
                tabIndex={instance ? 0 : -1}
                aria-disabled={!instance}
                aria-label={instance ? `Move ${label}` : `${label} cannot be moved here`}
                onPointerDown={(event) => {
                  if (!instance) return;
                  onSelect?.(id);
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  drag.current = {
                    key: id,
                    x: event.clientX,
                    y: event.clientY,
                    dx: move?.dx ?? 0,
                    dy: move?.dy ?? 0,
                    dw: move?.dw ?? 0,
                    dh: move?.dh ?? 0,
                    kind: 'move',
                  };
                }}
                onPointerMove={(event) => {
                  if (!instance || drag.current?.key !== id || drag.current.kind !== 'move') return;
                  const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  if (!rect?.width || !rect.height) return;
                  const scale = Math.max(frame.width / rect.width, frame.height / rect.height);
                  shift(
                    (drag.current.dx * frame.width) / instance.compSize[0] +
                      (event.clientX - drag.current.x) * scale,
                    (drag.current.dy * frame.height) / instance.compSize[1] +
                      (event.clientY - drag.current.y) * scale,
                  );
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  if (drag.current?.key === id && instance) {
                    shift(
                      (drag.current.dx * frame.width) / instance.compSize[0],
                      (drag.current.dy * frame.height) / instance.compSize[1],
                    );
                  }
                  drag.current = null;
                }}
                onKeyDown={(event) => {
                  if (!instance) return;
                  const step = event.shiftKey ? 10 : 1;
                  const delta = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step],
                  }[event.key];
                  if (!delta) return;
                  event.preventDefault();
                  shift(dx + delta[0]!, dy + delta[1]!);
                }}
                onFocus={() => onSelect?.(id)}
              >
                <title>{label}</title>
              </rect>
              {instance ? (
                // biome-ignore lint/a11y/useSemanticElements: SVG rectangle is the resize handle with keyboard controls.
                <rect
                  x={box[2] + dx + dw - 16}
                  y={box[3] + dy + dh - 16}
                  width={32}
                  height={32}
                  role="button"
                  tabIndex={0}
                  aria-label={`Resize ${label}`}
                  className="cursor-se-resize touch-none fill-primary stroke-background focus-visible:stroke-foreground"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    drag.current = {
                      key: id,
                      x: event.clientX,
                      y: event.clientY,
                      dx: move?.dx ?? 0,
                      dy: move?.dy ?? 0,
                      dw: move?.dw ?? 0,
                      dh: move?.dh ?? 0,
                      kind: 'resize',
                    };
                  }}
                  onPointerMove={(event) => {
                    if (drag.current?.key !== id || drag.current.kind !== 'resize') return;
                    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                    if (!rect?.width || !rect.height) return;
                    const scale = Math.max(frame.width / rect.width, frame.height / rect.height);
                    resize(
                      (drag.current.dw * frame.width) / instance.compSize[0] +
                        (event.clientX - drag.current.x) * scale,
                      (drag.current.dh * frame.height) / instance.compSize[1] +
                        (event.clientY - drag.current.y) * scale,
                    );
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 10 : 1;
                    const delta = {
                      ArrowLeft: [-step, 0],
                      ArrowRight: [step, 0],
                      ArrowUp: [0, -step],
                      ArrowDown: [0, step],
                    }[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    resize(dw + delta[0]!, dh + delta[1]!);
                  }}
                />
              ) : null}
              <text
                x={box[0] + dx + 4}
                y={box[1] + dy + 14}
                className="fill-foreground text-[12px]"
                pointerEvents="none"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </fieldset>
  );
}
