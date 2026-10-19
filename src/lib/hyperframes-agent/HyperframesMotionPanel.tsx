'use client';

import {
  MOTION_SPRING_PRESETS,
  type MotionAnimation,
  type MotionDoc,
  type MotionEase,
  type MotionKeyframe,
  type MotionOpInput,
  motionAnimationWindow,
  staggerOffsets,
} from '@continuum/contracts';
import { ChevronRight } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useState } from 'react';
import { cn } from '@/lib/utils';
import { EasingCurveEditor } from '@/StudioCanvas/nodes/timeline/motion/EasingCurveEditor';
import { KeyframeDiamond } from '@/StudioCanvas/nodes/timeline/motion/KeyframeDiamond';
import { MotionGraph } from '@/StudioCanvas/nodes/timeline/motion/MotionGraph';

type DragMode = 'move' | 'duration' | 'stagger';
type Drag = { animationId: string; mode: DragMode; deltaSec: number };
type KeySelection = { animationId: string; property: string; keyId: string };

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const percent = (sec: number, durationSec: number) =>
  `${(Math.max(0, Math.min(durationSec, sec)) / durationSec) * 100}%`;

const keySpan = (animation: MotionAnimation) => {
  const times = animation.tracks.flatMap((track) => track.keyframes.map((key) => key.timeSec));
  return { first: Math.min(...times), last: Math.max(...times) };
};

const offsetsOf = (animation: MotionAnimation) =>
  animation.stagger
    ? staggerOffsets(animation.targets.length, animation.stagger.eachSec, animation.stagger.from)
    : animation.targets.map(() => 0);

/** Stagger steps between the first and last target, so a handle drag can set eachSec. */
const staggerSteps = (animation: MotionAnimation) =>
  Math.max(...staggerOffsets(animation.targets.length, 1, animation.stagger?.from ?? 'start'));

/** The op a finished drag commits, clamped so the animation still ends inside the film. */
export function dragOp(
  animation: MotionAnimation,
  mode: DragMode,
  deltaSec: number,
  durationSec: number,
): MotionOpInput | null {
  const timing = motionAnimationWindow(animation);
  const headroom = durationSec - timing.endSec;
  if (mode === 'move') {
    const startSec = round3(Math.max(0, animation.startSec + Math.min(deltaSec, headroom)));
    return startSec === animation.startSec
      ? null
      : { type: 'retime', animationId: animation.id, startSec };
  }
  if (mode === 'duration') {
    const { first, last } = keySpan(animation);
    const span = last - first;
    const next = round3(Math.max(0.05, span + Math.min(deltaSec, headroom)));
    return next === round3(span)
      ? null
      : { type: 'retime', animationId: animation.id, durationSec: next };
  }
  const steps = staggerSteps(animation);
  if (steps === 0) return null;
  const current = animation.stagger?.eachSec ?? 0;
  const eachSec = round3(Math.max(0, current + Math.min(deltaSec, headroom) / steps));
  return eachSec === current
    ? null
    : {
        type: 'stagger',
        animationId: animation.id,
        eachSec,
        from: animation.stagger?.from ?? 'start',
      };
}

/** The window a drag in progress would give, so the bar follows the pointer. */
function previewWindow(animation: MotionAnimation, drag: Drag | null) {
  const timing = motionAnimationWindow(animation);
  if (!drag || drag.animationId !== animation.id) return timing;
  if (drag.mode === 'move')
    return {
      startSec: timing.startSec + drag.deltaSec,
      endSec: timing.endSec + drag.deltaSec,
    };
  return { startSec: timing.startSec, endSec: timing.endSec + drag.deltaSec };
}

function easeFromPatch(patch: Pick<MotionKeyframe, 'interpolation' | 'easing' | 'spring'>) {
  if (patch.interpolation === 'bezier' && patch.easing) {
    const { x1, y1, x2, y2 } = patch.easing;
    return { bezier: [x1, y1, x2, y2] } satisfies MotionEase;
  }
  if (patch.interpolation === 'spring') {
    // ponytail: motion ops name springs, so a free bounce snaps to the nearest preset.
    const bounce = patch.spring?.bounce ?? MOTION_SPRING_PRESETS.gentle;
    const [name] = Object.entries(MOTION_SPRING_PRESETS).toSorted(
      ([, a], [, b]) => Math.abs(a - bounce) - Math.abs(b - bounce),
    )[0] ?? ['gentle'];
    return name as keyof typeof MOTION_SPRING_PRESETS;
  }
  return patch.interpolation === 'hold' ? 'hold' : 'linear';
}

const keyValue = (key: MotionKeyframe) =>
  typeof key.value === 'number'
    ? key.value
    : typeof key.value === 'object' && key.value && 'x' in key.value && 'y' in key.value
      ? { x: Number(key.value.x), y: Number(key.value.y) }
      : null;

export function HyperframesMotionPanel({
  doc,
  durationSec,
  fps,
  playheadSec,
  selectedIds,
  onSelectedIdsChange,
  onOp,
  busy,
  status,
}: {
  doc: MotionDoc;
  durationSec: number;
  fps: number;
  playheadSec: number;
  selectedIds: readonly string[];
  onSelectedIdsChange: (ids: string[]) => void;
  onOp: (op: MotionOpInput) => void;
  busy: boolean;
  status: string | null;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<KeySelection | null>(null);
  const frame = 1 / fps;

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    animation: MotionAnimation,
    mode: DragMode,
  ) => {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.closest<HTMLElement>('[data-motion-lane]');
    if (!lane) return;
    const width = lane.getBoundingClientRect().width;
    const originX = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const deltaAt = (clientX: number) =>
      Math.round((((clientX - originX) / width) * durationSec) / frame) * frame;
    const move = (moveEvent: PointerEvent) =>
      setDrag({ animationId: animation.id, mode, deltaSec: deltaAt(moveEvent.clientX) });
    const end = (upEvent: PointerEvent) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setDrag(null);
      const op = dragOp(animation, mode, deltaAt(upEvent.clientX), durationSec);
      if (op && upEvent.type === 'pointerup') onOp(op);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  const nudge = (animation: MotionAnimation, key: string) => {
    const step = key === 'ArrowRight' ? frame : key === 'ArrowLeft' ? -frame : 0;
    if (!step || busy) return;
    const op = dragOp(animation, 'move', step, durationSec);
    if (op) onOp(op);
  };

  const toggle = (id: string) =>
    onSelectedIdsChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selected) => selected !== id)
        : [...selectedIds, id],
    );

  if (doc.animations.length === 0)
    return (
      <p className="px-3 py-2 text-2xs text-muted-foreground">
        This composition has no motion data yet.
      </p>
    );

  const seconds = Array.from({ length: Math.floor(durationSec) + 1 }, (_, index) => index);

  return (
    <section
      aria-label="Motion timeline"
      className="w-full space-y-1 bg-background px-2 py-2 text-2xs"
      data-testid="hyperframes-motion-panel"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-semibold">Motion</span>
        <span
          className="text-muted-foreground"
          role="status"
          aria-live="polite"
          data-testid="motion-status"
        >
          {busy ? 'Saving…' : (status ?? `${doc.animations.length} animations`)}
        </span>
      </header>
      <div className="grid grid-cols-[7.5rem_1fr] items-end gap-x-2">
        <span />
        <div className="relative h-3 text-muted-foreground" aria-hidden="true">
          {seconds.map((second) => (
            <span
              key={second}
              className="absolute -translate-x-1/2 font-mono tabular-nums"
              style={{ left: percent(second, durationSec) }}
            >
              {second}
            </span>
          ))}
        </div>
      </div>
      {doc.animations.map((animation) => {
        const timing = previewWindow(animation, drag);
        const base = motionAnimationWindow(animation);
        const offsets = offsetsOf(animation);
        const selected = selectedIds.includes(animation.id);
        const open = expanded === animation.id;
        return (
          <div key={animation.id} className="space-y-1">
            <div
              className="grid grid-cols-[7.5rem_1fr] items-center gap-x-2"
              data-testid={`motion-row-${animation.id}`}
            >
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`${open ? 'Collapse' : 'Expand'} ${animation.label}`}
                  aria-expanded={open}
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setExpanded(open ? null : animation.id)}
                >
                  <ChevronRight
                    className={cn('size-3 transition-transform', open && 'rotate-90')}
                  />
                </button>
                <input
                  type="checkbox"
                  checked={selected}
                  aria-label={`Select ${animation.label}`}
                  onChange={() => toggle(animation.id)}
                />
                <span className="truncate" title={animation.targets.join(', ')}>
                  {animation.label}
                </span>
              </div>
              <div className="relative h-5 rounded bg-muted/40" data-motion-lane>
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-primary/60"
                  style={{ left: percent(playheadSec, durationSec) }}
                />
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={`${animation.label} timing`}
                  aria-valuemin={0}
                  aria-valuemax={durationSec}
                  aria-valuenow={round3(timing.startSec)}
                  aria-valuetext={`${round3(timing.startSec)}s to ${round3(timing.endSec)}s`}
                  data-testid={`motion-bar-${animation.id}`}
                  className={cn(
                    'absolute inset-y-0.5 cursor-grab touch-none rounded-sm active:cursor-grabbing',
                    selected ? 'bg-primary' : 'bg-primary/60',
                  )}
                  style={{
                    left: percent(timing.startSec, durationSec),
                    width: `calc(${percent(timing.endSec, durationSec)} - ${percent(timing.startSec, durationSec)})`,
                    minWidth: 4,
                  }}
                  onPointerDown={(event) => startDrag(event, animation, 'move')}
                  onKeyDown={(event) => nudge(animation, event.key)}
                >
                  {offsets.length > 1
                    ? offsets.map((offset, index) => (
                        <span
                          key={animation.targets[index]}
                          className="pointer-events-none absolute inset-y-0 w-px bg-background/80"
                          style={{
                            left: `${(offset / Math.max(frame, base.endSec - base.startSec)) * 100}%`,
                          }}
                        />
                      ))
                    : null}
                  {offsets.length > 1 ? (
                    <span
                      role="presentation"
                      title="Drag to stagger"
                      data-testid={`motion-stagger-${animation.id}`}
                      className="absolute -top-1 right-2 size-2 cursor-ew-resize rounded-full border border-background bg-amber-400"
                      onPointerDown={(event) => startDrag(event, animation, 'stagger')}
                    />
                  ) : null}
                  <span
                    role="presentation"
                    title="Drag to change duration"
                    data-testid={`motion-edge-${animation.id}`}
                    className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r-sm bg-background/50"
                    onPointerDown={(event) => startDrag(event, animation, 'duration')}
                  />
                </div>
              </div>
            </div>
            {open ? (
              <KeyframeLanes
                animation={animation}
                durationSec={durationSec}
                playheadSec={playheadSec}
                selectedKey={selectedKey}
                onSelectKey={setSelectedKey}
                onOp={onOp}
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function KeyframeLanes({
  animation,
  durationSec,
  playheadSec,
  selectedKey,
  onSelectKey,
  onOp,
}: {
  animation: MotionAnimation;
  durationSec: number;
  playheadSec: number;
  selectedKey: KeySelection | null;
  onSelectKey: (key: KeySelection) => void;
  onOp: (op: MotionOpInput) => void;
}) {
  const active = animation.tracks.find(
    (track) => selectedKey?.animationId === animation.id && selectedKey.property === track.property,
  );
  const activeKey = active?.keyframes.find((key) => key.id === selectedKey?.keyId);
  return (
    <div className="space-y-1 rounded-md border border-border/60 p-1">
      {animation.tracks.map((track) => (
        <div key={track.property} className="grid grid-cols-[7.5rem_1fr] items-center gap-x-2">
          <span className="truncate pl-4 text-muted-foreground">
            {track.property.replace('transform.', '')}
          </span>
          <div className="relative h-7">
            {track.keyframes.map((key) => (
              <span
                key={key.id}
                className="absolute top-0 -translate-x-1/2"
                style={{ left: percent(animation.startSec + key.timeSec, durationSec) }}
              >
                <KeyframeDiamond
                  labeled={`${track.property} at ${round3(animation.startSec + key.timeSec)}s`}
                  keyed={activeKey?.id === key.id && active?.property === track.property}
                  onToggle={() =>
                    onSelectKey({
                      animationId: animation.id,
                      property: track.property,
                      keyId: key.id,
                    })
                  }
                />
              </span>
            ))}
          </div>
        </div>
      ))}
      {active && activeKey ? (
        <div className="flex flex-wrap items-start gap-2 pt-1">
          <EasingCurveEditor
            keyframe={activeKey}
            onChange={(patch) => {
              const value = keyValue(activeKey);
              if (value === null || patch.interpolation === undefined) return;
              onOp({
                type: 'upsert_keyframe',
                animationId: animation.id,
                property: active.property,
                key: { t: activeKey.timeSec, v: value, ease: easeFromPatch(patch) },
              });
            }}
          />
          <div className="min-w-48 flex-1">
            <MotionGraph
              keys={active.keyframes}
              durationSec={Math.max(0.1, ...active.keyframes.map((key) => key.timeSec))}
              fallback={0}
              playheadSec={playheadSec - animation.startSec}
              label={active.property.replace('transform.', '')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
