'use client';

import type {
  PresentationCommand,
  PresentationDocument,
  PresentationObject,
} from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PresentationEngine } from './presentationEngine';

export function PresentationCanvas({
  document,
  slideId,
  engine,
  selectedIds = [],
  onSelect,
  onCommand,
  disabled = false,
  thumbnail = false,
}: {
  document: PresentationDocument;
  slideId: string;
  engine: PresentationEngine | null;
  selectedIds?: string[];
  onSelect?: (id: string, extend: boolean) => void;
  onCommand?: (command: PresentationCommand) => void;
  disabled?: boolean;
  thumbnail?: boolean;
}) {
  const [visible, setVisible] = useState(!thumbnail);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [rendering, setRendering] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    object: PresentationObject;
    x: number;
    y: number;
    resize: boolean;
    element: HTMLElement;
    dx: number;
    dy: number;
  } | null>(null);
  const slide = document.slides.find((item) => item.id === slideId);
  const restoreOverlay = (element: HTMLElement, object: PresentationObject) => {
    Object.assign(element.style, {
      left: `${(object.bounds.x / document.size.width) * 100}%`,
      top: `${(object.bounds.y / document.size.height) * 100}%`,
      width: `${(object.bounds.width / document.size.width) * 100}%`,
      height: `${(object.bounds.height / document.size.height) * 100}%`,
    });
  };

  useEffect(() => {
    if (!thumbnail || !surface.current || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [thumbnail]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit retry must rerun the shared renderer.
  useEffect(() => {
    if (!visible || !engine) return;
    let cancelled = false;
    setRendering(true);
    setError(null);
    void engine
      .process({ operation: 'render', document, slideId, scale: thumbnail ? 0.2 : 1 })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.artifact || result.artifact.mimeType !== 'image/png')
          throw new Error('The engine did not produce a slide preview.');
        setImage(`data:image/png;base64,${result.artifact.bytesBase64}`);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'The slide could not be rendered.');
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [document, slideId, engine, thumbnail, refresh, visible]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Slide preview unavailable</AlertTitle>
        <AlertDescription>
          {error}
          <Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>
            Retry preview
          </Button>
        </AlertDescription>
      </Alert>
    );

  return (
    <div
      ref={surface}
      aria-busy={rendering}
      className="relative w-full overflow-hidden bg-muted ring-1 ring-border"
      style={{ aspectRatio: `${document.size.width}/${document.size.height}` }}
    >
      {image ? (
        // biome-ignore lint/performance/noImgElement: WASM produces the PNG locally; there is no remote image for Next to optimize.
        <img
          src={image}
          alt={thumbnail ? '' : slide?.title || 'Slide preview'}
          className="size-full object-contain"
          draggable={false}
        />
      ) : (
        <Skeleton className="size-full rounded-none" />
      )}
      {!thumbnail &&
        onSelect &&
        slide?.objects.map((object) => (
          <Button
            key={object.id}
            variant="ghost"
            size="icon"
            aria-label={`Select ${object.name || object.kind}`}
            aria-pressed={selectedIds.includes(object.id)}
            disabled={disabled || rendering}
            className={cn(
              'absolute m-0 h-auto min-h-0 w-auto rounded-none border border-transparent bg-transparent p-0 hover:bg-transparent',
              selectedIds.includes(object.id) && 'border-primary',
            )}
            style={{
              left: `${(object.bounds.x / document.size.width) * 100}%`,
              top: `${(object.bounds.y / document.size.height) * 100}%`,
              width: `${(object.bounds.width / document.size.width) * 100}%`,
              height: `${(object.bounds.height / document.size.height) * 100}%`,
              transform: `rotate(${object.bounds.rotation}deg)`,
            }}
            onClick={(event) => {
              if (event.detail === 0)
                onSelect?.(object.id, event.shiftKey || event.metaKey || event.ctrlKey);
            }}
            onPointerDown={(event) => {
              onSelect?.(object.id, event.shiftKey || event.metaKey || event.ctrlKey);
              if (
                !onCommand ||
                object.locked ||
                !surface.current ||
                document.fields.some(
                  (field) =>
                    field.slideId === slideId &&
                    field.objectId === object.id &&
                    field.locked &&
                    (!field.property || field.property === 'bounds'),
                )
              )
                return;
              const element = event.currentTarget;
              element.setPointerCapture(event.pointerId);
              gesture.current = {
                object,
                x: event.clientX,
                y: event.clientY,
                resize: Boolean((event.target as HTMLElement).closest('[data-resize]')),
                element,
                dx: 0,
                dy: 0,
              };
            }}
            onPointerMove={(event) => {
              const move = gesture.current;
              if (!move || !surface.current || move.object.id !== object.id) return;
              const rect = surface.current.getBoundingClientRect();
              move.dx = ((event.clientX - move.x) / rect.width) * document.size.width;
              move.dy = ((event.clientY - move.y) / rect.height) * document.size.height;
              if (move.resize) {
                move.element.style.width = `${(Math.max(1, object.bounds.width + move.dx) / document.size.width) * 100}%`;
                move.element.style.height = `${(Math.max(1, object.bounds.height + move.dy) / document.size.height) * 100}%`;
              } else {
                move.element.style.left = `${((object.bounds.x + move.dx) / document.size.width) * 100}%`;
                move.element.style.top = `${((object.bounds.y + move.dy) / document.size.height) * 100}%`;
              }
            }}
            onPointerUp={(event) => {
              const move = gesture.current;
              if (!move || move.object.id !== object.id) return;
              gesture.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
              restoreOverlay(move.element, object);
              if (Math.abs(move.dx) + Math.abs(move.dy) < 0.5) return;
              onCommand?.({
                type: 'object.transform',
                slideId,
                objectId: object.id,
                bounds: move.resize
                  ? {
                      ...object.bounds,
                      width: Math.max(1, object.bounds.width + move.dx),
                      height: Math.max(1, object.bounds.height + move.dy),
                    }
                  : {
                      ...object.bounds,
                      x: object.bounds.x + move.dx,
                      y: object.bounds.y + move.dy,
                    },
              });
            }}
            onPointerCancel={() => {
              if (gesture.current) restoreOverlay(gesture.current.element, gesture.current.object);
              gesture.current = null;
            }}
          >
            {selectedIds.includes(object.id) && !object.locked ? (
              <span
                data-resize
                className="absolute -right-1 -bottom-1 size-2 cursor-se-resize bg-primary"
              />
            ) : null}
          </Button>
        ))}
      {rendering && image && !thumbnail ? (
        <span
          role="status"
          className="absolute bottom-2 left-2 rounded bg-background px-2 py-1 text-xs"
        >
          Updating preview…
        </span>
      ) : null}
    </div>
  );
}
