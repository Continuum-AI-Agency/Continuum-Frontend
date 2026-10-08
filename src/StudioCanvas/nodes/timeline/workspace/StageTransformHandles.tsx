'use client';

import type { EditorTransform } from '@continuum/contracts';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type CornerHandle, GROUP_HANDLES, handleCursor } from '../../../utils/layers/layerGizmo';
import type { Point } from '../../../utils/layers/layerTransform';
import { dragTransform, type StageGesture, type StageGuides } from './stageTransform';

type Gesture = {
  kind: StageGesture;
  timeSec: number;
  start: EditorTransform;
  /** Mirrors `draft` so pointerup never reads a render-stale closure. */
  latest: EditorTransform;
  startPointer: Point;
  frame: DOMRect;
  element: Element;
  pointerId: number;
};

const NO_GUIDES: StageGuides = { x: false, y: false };

const cornerStyle = (corner: CornerHandle, rotationDeg: number) => ({
  left: corner.endsWith('w') ? '0%' : '100%',
  top: corner.startsWith('n') ? '0%' : '100%',
  cursor: handleCursor(corner, rotationDeg),
});

/**
 * CapCut-style move / uniform-scale / rotate handles for the selected clip, drawn over
 * the rendered frame. Percent geometry, so the box tracks the frame without measuring;
 * the frame is measured only at drag start to turn pointer pixels into normalized units.
 */
export function StageTransformHandles({
  transform,
  baseSize,
  frameAspect,
  timeSec,
  onBegin,
  onCommit,
}: {
  transform: EditorTransform;
  /** Box size at scale 1 as a fraction of the frame: media clips {1,1}; a text clip passes its approximate text box. */
  baseSize: { width: number; height: number };
  frameAspect: number;
  timeSec: number;
  onBegin: () => void;
  onCommit: (transform: EditorTransform, gesture: StageGesture, timeSec: number) => void;
}): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<EditorTransform | null>(null);
  const [guides, setGuides] = useState<StageGuides>(NO_GUIDES);
  const dragging = draft !== null;

  const finish = useCallback(
    (commit: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      // Cleared before releasing capture: the release fires lostpointercapture, which
      // must find no live gesture.
      gestureRef.current = null;
      if (gesture.element.hasPointerCapture(gesture.pointerId)) {
        gesture.element.releasePointerCapture(gesture.pointerId);
      }
      if (commit && JSON.stringify(gesture.latest) !== JSON.stringify(gesture.start)) {
        onCommit(gesture.latest, gesture.kind, gesture.timeSec);
      }
      setDraft(null);
      setGuides(NO_GUIDES);
    },
    [onCommit],
  );

  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Capture phase + stopImmediatePropagation: the workspace dialog also dismisses on
      // Escape, and a cancelled drag must not close it.
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, finish]);

  const begin = (kind: StageGesture) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    const root = rootRef.current;
    if (event.button !== 0 || !root) return;
    // Without this the stage underneath would start its own gesture too.
    event.stopPropagation();
    event.preventDefault();
    onBegin();
    const frame = root.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind,
      timeSec,
      start: transform,
      latest: transform,
      startPointer: { x: event.clientX - frame.left, y: event.clientY - frame.top },
      frame,
      element: event.currentTarget,
      pointerId: event.pointerId,
    };
    setDraft(transform);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const next = dragTransform({
      gesture: gesture.kind,
      start: gesture.start,
      startPointer: gesture.startPointer,
      pointer: { x: event.clientX - gesture.frame.left, y: event.clientY - gesture.frame.top },
      frame: gesture.frame,
      shift: event.shiftKey,
    });
    gesture.latest = next.transform;
    setDraft(next.transform);
    setGuides(next.guides);
  };

  const shown = draft ?? transform;
  const angle = (shown.rotationDeg * Math.PI) / 180;
  const halfHeight = (Math.abs(shown.scaleY) * baseSize.height) / 2;
  const gripX = shown.position.x + (Math.sin(angle) * halfHeight) / frameAspect;
  const gripY = shown.position.y - Math.cos(angle) * halfHeight;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(true)}
    >
      {guides.x ? <div className="absolute inset-y-0 left-1/2 w-px bg-primary/60" /> : null}
      {guides.y ? <div className="absolute inset-x-0 top-1/2 h-px bg-primary/60" /> : null}
      {/* The selection box follows sampled geometry; pointer capture lives on the frame. */}
      <div
        data-testid="stage-transform-box"
        className="absolute border border-primary"
        style={{
          left: `${shown.position.x * 100}%`,
          top: `${shown.position.y * 100}%`,
          width: `${Math.abs(shown.scaleX) * baseSize.width * 100}%`,
          height: `${Math.abs(shown.scaleY) * baseSize.height * 100}%`,
          transform: `translate(-50%, -50%) rotate(${shown.rotationDeg}deg)`,
        }}
      >
        <button
          type="button"
          aria-label="Move selected clip"
          className="pointer-events-auto absolute inset-0 cursor-move touch-none"
          onPointerDown={begin('move')}
        />
        {GROUP_HANDLES.map((corner) => (
          <button
            key={corner}
            type="button"
            aria-label="Scale selected clip"
            className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 touch-none border border-primary bg-background"
            style={cornerStyle(corner, shown.rotationDeg)}
            onPointerDown={begin('scale')}
          />
        ))}
      </div>
      {/* Keep the grip reachable when the selected picture extends beyond the frame. */}
      <button
        type="button"
        aria-label="Rotate selected clip"
        className="pointer-events-auto absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border border-primary bg-background"
        style={{
          left: `clamp(12px, calc(${gripX * 100}% + ${Math.sin(angle) * 24}px), calc(100% - 12px))`,
          top: `clamp(12px, calc(${gripY * 100}% - ${Math.cos(angle) * 24}px), calc(100% - 12px))`,
        }}
        onPointerDown={begin('rotate')}
      />
    </div>
  );
}
