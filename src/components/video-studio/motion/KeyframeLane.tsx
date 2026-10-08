'use client';

import type { EditorKeyframe, EditorProjectV2 } from '@continuum/contracts';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import { cn } from '@/lib/utils';
import { EasingCurveEditor } from '@/StudioCanvas/nodes/timeline/motion/EasingCurveEditor';
import { KeyframeDiamond } from '@/StudioCanvas/nodes/timeline/motion/KeyframeDiamond';
import {
  type PlayheadStore,
  useSettledPlayhead,
} from '@/StudioCanvas/nodes/timeline/workspace/playheadStore';
import type { TimelineEdit } from '@/StudioCanvas/nodes/timeline/workspace/timelineEdits';
import {
  AT_PLAYHEAD_SEC,
  addKeyEdit,
  channelKeys,
  channelsFor,
  easeKeyEdit,
  type KeyedClip,
  keyNear,
  LANE_CHANNELS,
  type LaneChannelId,
  type LaneKey,
  moveKeyEdit,
  removeKeyEdit,
  valueKeyEdit,
} from './keyframeEdits';

type Build = (project: EditorProjectV2) => TimelineEdit | null;
type Selected = { channelId: LaneChannelId; timeSec: number };

const FRAME_SEC = 1 / 30;
const DRAG_THRESHOLD_PX = 3;

type KeyDrag = { startX: number; left: number; width: number; moved: boolean };

/** The clip-local time under a pointer on a lane row, to the hundredth. */
export function keyTimeAt(clientX: number, row: KeyDrag, durationSec: number): number {
  const sec = ((clientX - row.left) / row.width) * durationSec;
  return Math.round(Math.min(durationSec, Math.max(0, sec)) * 100) / 100;
}

const pct = (sec: number, durationSec: number) =>
  `${(Math.min(durationSec, Math.max(0, sec)) / Math.max(durationSec, 0.001)) * 100}%`;

function KeyButton({
  channelLabel,
  laneKey,
  durationSec,
  selected,
  onSelect,
  onMove,
  onDelete,
}: {
  channelLabel: string;
  laneKey: LaneKey;
  durationSec: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (toSec: number) => void;
  onDelete: () => void;
}) {
  const [dragSec, setDragSec] = useState<number | null>(null);
  const drag = useRef<KeyDrag | null>(null);
  const shown = dragSec ?? laneKey.timeSec;
  return (
    <button
      type="button"
      aria-label={`${channelLabel} keyframe at ${laneKey.timeSec.toFixed(2)} s`}
      aria-pressed={selected}
      data-keyframe-time={laneKey.timeSec.toFixed(3)}
      className={cn(
        'absolute top-1/2 z-10 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize border border-primary outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-primary' : 'bg-background hover:bg-primary/40',
      )}
      style={{ left: pct(shown, durationSec) }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const track = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!track) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          startX: event.clientX,
          left: track.left,
          width: track.width,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        if (!current.moved && Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return;
        current.moved = true;
        setDragSec(keyTimeAt(event.clientX, current, durationSec));
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        setDragSec(null);
        if (!current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (current.moved) onMove(keyTimeAt(event.clientX, current, durationSec));
        else onSelect();
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragSec(null);
      }}
      onKeyDown={(event) => {
        // The lane owns these keys while a keyframe has focus: Delete must not ripple the clip.
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          onMove(laneKey.timeSec + (event.key === 'ArrowLeft' ? -FRAME_SEC : FRAME_SEC));
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      }}
    />
  );
}

/** Value fields for the selected key; scrubs settle before they commit. */
function KeyValueFields({
  channelId,
  keyframes,
  onValue,
  onCommit,
}: {
  channelId: LaneChannelId;
  keyframes: EditorKeyframe[];
  onValue: (value: EditorKeyframe['value']) => void;
  onCommit: () => void;
}) {
  const stored = keyframes[0]?.value;
  const [draft, setDraft] = useState<EditorKeyframe['value'] | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new stored value is the trigger.
  useEffect(() => setDraft(undefined), [stored]);
  const value = draft ?? stored;
  const set = (next: EditorKeyframe['value']) => {
    setDraft(next);
    onValue(next);
  };
  if (channelId === 'position' && typeof value === 'object' && value && 'x' in value) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((axis) => (
          <NumberScrubField
            key={axis}
            label={axis.toUpperCase()}
            value={value[axis]}
            min={-1}
            max={2}
            step={0.01}
            onChange={(next) => set({ ...value, [axis]: next })}
            onCommit={onCommit}
          />
        ))}
      </div>
    );
  }
  const numeric = typeof value === 'number' ? value : 0;
  const range =
    channelId === 'rotation'
      ? { min: -720, max: 720, step: 1, suffix: '°' }
      : channelId === 'opacity'
        ? { min: 0, max: 1, step: 0.01 }
        : channelId === 'volume'
          ? { min: 0, max: 2, step: 0.01, suffix: '×' }
          : { min: 0, max: 10, step: 0.01, suffix: '×' };
  return (
    <NumberScrubField
      label={
        channelId === 'scale'
          ? 'Scale'
          : channelId === 'rotation'
            ? 'Rotation'
            : channelId === 'volume'
              ? 'Volume'
              : 'Opacity'
      }
      value={numeric}
      {...range}
      onChange={set}
      onCommit={onCommit}
    />
  );
}

/**
 * The selected clip's keyframe lane: position, scale, rotation and opacity against the
 * clip's own length. The diamond keys what the clip shows at the playhead; a key drags
 * along its row, nudges a frame with ← →, and leaves with ⌫. The selected key edits its
 * value and how it eases into the next one. Every change is a committed revision.
 */
export function KeyframeLane({
  clip,
  store,
  onEdit,
  onSettle,
  audio = true,
}: {
  clip: KeyedClip;
  audio?: boolean;
  store: PlayheadStore;
  /** Applies at once, after anything still settling. */
  onEdit: (build: Build) => void;
  /** Applies once input settles; a newer build under the same key replaces the older. */
  onSettle: (key: string, build: Build) => void;
}) {
  const playheadSec = useSettledPlayhead(store);
  const [selected, setSelected] = useState<Selected | null>(null);
  const localSec = playheadSec - clip.timelineStartSec;
  const inside = localSec >= 0 && localSec <= clip.durationSec;
  const selectedKey = selected
    ? keyNear(channelKeys(clip, selected.channelId), selected.timeSec, 0.002)
    : undefined;
  const clipId = clip.id;

  const add = (channelId: LaneChannelId) => {
    const at = Math.round((store.getSec() - clip.timelineStartSec) * 1_000) / 1_000;
    onEdit((latest) => addKeyEdit(latest, clipId, channelId, at));
    setSelected({ channelId, timeSec: Math.min(clip.durationSec, Math.max(0, at)) });
  };
  const move = (channelId: LaneChannelId, fromSec: number, toSec: number) => {
    const target = Math.round(Math.min(clip.durationSec, Math.max(0, toSec)) * 1_000) / 1_000;
    onEdit((latest) => moveKeyEdit(latest, clipId, channelId, fromSec, target));
    setSelected({ channelId, timeSec: target });
  };
  const remove = (channelId: LaneChannelId, atSec: number) => {
    onEdit((latest) => removeKeyEdit(latest, clipId, channelId, atSec));
    setSelected(null);
  };

  return (
    <section
      aria-label="Keyframes"
      data-testid="keyframe-lane"
      className="flex shrink-0 flex-col gap-1.5 rounded-lg border border-border/60 p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Keyframes
        </span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {inside ? `${localSec.toFixed(2)} s` : 'playhead off clip'}
        </span>
      </div>
      {channelsFor(clip)
        .filter((channel) => audio || channel.id !== 'volume')
        .map((channel) => {
          const keys = channelKeys(clip, channel.id);
          const atPlayhead = inside ? keyNear(keys, localSec, AT_PLAYHEAD_SEC) : undefined;
          return (
            <div key={channel.id} className="flex items-center gap-1" data-channel={channel.id}>
              <span className="w-14 shrink-0 truncate text-2xs text-muted-foreground">
                {channel.label}
              </span>
              <KeyframeDiamond
                labeled={channel.label}
                keyed={Boolean(atPlayhead)}
                disabled={!inside}
                onToggle={() =>
                  atPlayhead
                    ? setSelected({ channelId: channel.id, timeSec: atPlayhead.timeSec })
                    : add(channel.id)
                }
              />
              <div
                className="relative mx-1.5 h-6 flex-1 rounded-sm bg-muted/60"
                data-keyframe-track={channel.id}
              >
                {inside ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-red-500"
                    style={{ left: pct(localSec, clip.durationSec) }}
                  />
                ) : null}
                {keys.map((key) => (
                  <KeyButton
                    key={key.keyframes[0]?.id ?? key.timeSec}
                    channelLabel={channel.label}
                    laneKey={key}
                    durationSec={clip.durationSec}
                    selected={
                      selected?.channelId === channel.id &&
                      Math.abs(selected.timeSec - key.timeSec) <= 0.002
                    }
                    onSelect={() => {
                      setSelected({ channelId: channel.id, timeSec: key.timeSec });
                      store.seek(clip.timelineStartSec + key.timeSec);
                    }}
                    onMove={(toSec) => move(channel.id, key.timeSec, toSec)}
                    onDelete={() => remove(channel.id, key.timeSec)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      {selected && selectedKey ? (
        <div
          className="mt-1 flex flex-col gap-2 border-t border-border/60 pt-2"
          data-testid="keyframe-editor"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium">
              {LANE_CHANNELS.find((channel) => channel.id === selected.channelId)?.label} ·{' '}
              <span className="font-mono tabular-nums">{selectedKey.timeSec.toFixed(2)} s</span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label="Delete keyframe"
              onClick={() => remove(selected.channelId, selectedKey.timeSec)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          <KeyValueFields
            key={`${selected.channelId}:${selectedKey.timeSec}`}
            channelId={selected.channelId}
            keyframes={selectedKey.keyframes}
            // A null build flushes pending values without adding a second value edit.
            onCommit={() => onEdit(() => null)}
            onValue={(value) =>
              onSettle(`keyframe-value:${selected.channelId}`, (latest) =>
                valueKeyEdit(latest, clipId, selected.channelId, selectedKey.timeSec, value),
              )
            }
          />
          {selectedKey.keyframes[0] ? (
            <div className="flex flex-col gap-1">
              <span className="text-2xs text-muted-foreground">Ease into the next key</span>
              <EasingCurveEditor
                keyframe={selectedKey.keyframes[0]}
                onChange={(patch) => {
                  const build: Build = (latest) =>
                    easeKeyEdit(latest, clipId, selected.channelId, selectedKey.timeSec, patch);
                  // The expression field reports every keystroke; curves are one click.
                  if ('expression' in patch) onSettle(`keyframe-ease:${selected.channelId}`, build);
                  else onEdit(build);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
