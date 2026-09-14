'use client';

import type {
  EditorClip,
  EditorKeyframe,
  EditorProjectV2,
  MotionStyleId,
} from '@continuum/contracts';
import { ChevronDown, ChevronRight, Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { EasingCurveEditor } from './EasingCurveEditor';
import { KeyframeDiamond } from './KeyframeDiamond';
import { MotionGraph } from './MotionGraph';
import {
  formatMotionTime,
  MOTION_STYLE_TONE,
  type MotionTimeUnit,
  type PlaybackMode,
  parseMotionTime,
} from './motionChrome';
import {
  keyAtPlayhead,
  localPlayheadSec,
  type MotionLayerRow,
  type MotionPropertyName,
  motionLayersFromProject,
} from './motionLayers';

const STYLES: Array<{ id: MotionStyleId; label: string }> = [
  { id: 'fade', label: 'Fade' },
  { id: 'move', label: 'Move' },
  { id: 'scale', label: 'Scale' },
  { id: 'rotate', label: 'Rotate' },
];

export type MotionElementOption = { id: string; name: string };

function styleBarsFor(
  layer: MotionLayerRow,
): Array<{ id: string; label: string; startSec: number; endSec: number }> {
  const groups = new Map<string, { label: string; times: number[] }>();
  for (const row of layer.properties) {
    for (const key of row.keys) {
      const instance = key.id.includes(':') ? key.id.slice(0, key.id.indexOf(':')) : '';
      if (!instance) continue;
      const label = row.label;
      const group = groups.get(instance) ?? { label, times: [] };
      group.times.push(layer.startSec + key.timeSec);
      groups.set(instance, group);
    }
  }
  return [...groups.entries()].map(([id, group]) => ({
    id,
    label: group.label,
    startSec: Math.min(...group.times),
    endSec: Math.max(...group.times),
  }));
}

export function MotionTimeline({
  project,
  playheadSec,
  pxPerSec,
  autoKey,
  playbackMode,
  isPlaying,
  selectedClipId,
  canSaveElement,
  savingElement,
  motionElements,
  onSelectClip,
  onSeek,
  onToggleAutoKey,
  onTogglePlay,
  onCyclePlayback,
  onAddKeyframe,
  onApplyStyle,
  onPatchKeyframe,
  onTrimStyle,
  onSaveElement,
  onPlaceElement,
}: {
  project: EditorProjectV2;
  playheadSec: number;
  pxPerSec: number;
  autoKey: boolean;
  playbackMode: PlaybackMode;
  isPlaying: boolean;
  selectedClipId: string | null;
  canSaveElement: boolean;
  savingElement?: boolean;
  motionElements: readonly MotionElementOption[];
  onSelectClip: (clipId: string) => void;
  onSeek: (timeSec: number) => void;
  onToggleAutoKey: () => void;
  onTogglePlay: () => void;
  onCyclePlayback: () => void;
  onAddKeyframe: (input: {
    trackId: string;
    clipId: string;
    property: MotionPropertyName;
    timeSec: number;
  }) => void;
  onApplyStyle: (input: { trackId: string; clipId: string; styleId: MotionStyleId }) => void;
  onPatchKeyframe: (input: { trackId: string; clipId: string; keyframe: EditorKeyframe }) => void;
  onTrimStyle: (input: {
    trackId: string;
    clipId: string;
    instanceId: string;
    startSec: number;
    endSec: number;
  }) => void;
  onSaveElement: () => void;
  onPlaceElement: (elementId: string) => void;
}) {
  const layers = motionLayersFromProject(project);
  const [unit, setUnit] = useState<MotionTimeUnit>('s');
  const [collapsed, setCollapsed] = useState(false);
  const [showGraph, setShowGraph] = useState(true);
  const [easingKey, setEasingKey] = useState<{
    trackId: string;
    clipId: string;
    keyframe: EditorKeyframe;
  } | null>(null);
  const widthPx = Math.max(project.durationSec * pxPerSec, 240);
  const selected = layers.find((layer) => layer.clipId === selectedClipId);
  const selectedClip = project.tracks
    .flatMap((track): EditorClip[] => track.clips)
    .find((clip) => clip.id === selectedClipId);
  const graphRow =
    selected?.properties.find((row) => row.keys.length > 0) ?? selected?.properties[0];
  const graphKeys =
    selectedClip && graphRow && 'keyframes' in selectedClip
      ? selectedClip.keyframes.filter((keyframe) => keyframe.property === graphRow.property)
      : [];

  return (
    <section className="flex min-h-[220px] flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 active:scale-[0.96]"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <Pause className="size-3.5 fill-current" />
          ) : (
            <Play className="size-3.5 fill-current" />
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={autoKey ? 'default' : 'ghost'}
          className={cn(
            'h-7 text-2xs',
            autoKey && 'bg-destructive text-destructive-foreground hover:bg-destructive',
          )}
          aria-pressed={autoKey}
          onClick={onToggleAutoKey}
        >
          Autokey
        </Button>
        <label
          htmlFor="motion-current-time"
          className="flex items-center gap-1 text-2xs text-muted-foreground"
        >
          <span className="sr-only">Current time</span>
          <Input
            id="motion-current-time"
            aria-label="Current time"
            value={formatMotionTime(playheadSec, unit)}
            onChange={(event) => {
              const parsed = parseMotionTime(event.target.value, unit);
              if (parsed !== null) onSeek(parsed);
            }}
            className="h-7 w-[5.5rem] px-1.5 font-mono text-2xs tabular-nums"
          />
        </label>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {formatMotionTime(project.durationSec, unit)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 font-mono text-2xs"
          onClick={() => setUnit((current) => (current === 's' ? 'ms' : 's'))}
        >
          {unit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-2xs"
          onClick={onCyclePlayback}
        >
          {playbackMode === 'once' ? 'Once' : playbackMode === 'loop' ? 'Loop' : 'Ping-pong'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showGraph ? 'default' : 'ghost'}
          className="h-7 text-2xs"
          aria-pressed={showGraph}
          onClick={() => setShowGraph((current) => !current)}
        >
          Graph
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-2xs"
          disabled={!canSaveElement || savingElement}
          title={
            canSaveElement
              ? 'Save this overlay motion as an Element'
              : 'Select a keyed Library overlay to save'
          }
          onClick={onSaveElement}
        >
          Save Element
        </Button>
        <label className="flex items-center gap-1 text-2xs text-muted-foreground">
          <span className="sr-only">Place motion Element</span>
          <select
            aria-label="Place motion Element"
            className="h-7 rounded-md border border-input bg-background px-1.5 text-2xs"
            value=""
            disabled={!selected || motionElements.length === 0}
            onChange={(event) => {
              const id = event.target.value;
              if (id) onPlaceElement(id);
              event.currentTarget.value = '';
            }}
          >
            <option value="">Place</option>
            {motionElements.map((element) => (
              <option key={element.id} value={element.id}>
                {element.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-2xs"
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? 'Expand layers' : 'Collapse'}
        </Button>
      </header>
      {selected ? (
        <div className="flex flex-wrap gap-1 border-b border-border/60 px-3 py-1.5">
          {STYLES.map((style) => (
            <Button
              key={style.id}
              type="button"
              size="sm"
              variant="ghost"
              className={cn('h-6 px-2 text-2xs', MOTION_STYLE_TONE[style.id])}
              onClick={() =>
                onApplyStyle({
                  trackId: selected.trackId,
                  clipId: selected.clipId,
                  styleId: style.id,
                })
              }
            >
              {style.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div
          className="relative min-h-[9rem] text-left"
          style={{ width: widthPx }}
          role="slider"
          tabIndex={0}
          aria-label="Motion playhead"
          aria-valuemin={0}
          aria-valuemax={project.durationSec}
          aria-valuenow={playheadSec}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onSeek(
              Math.max(0, (event.clientX - rect.left + event.currentTarget.scrollLeft) / pxPerSec),
            );
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') onSeek(Math.max(0, playheadSec - 1 / pxPerSec));
            if (event.key === 'ArrowRight') onSeek(playheadSec + 1 / pxPerSec);
          }}
        >
          <div
            className={cn(
              'pointer-events-none absolute top-0 z-10 h-full w-px',
              autoKey ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ left: playheadSec * pxPerSec }}
          >
            <span
              className={cn(
                'absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rotate-45',
                autoKey ? 'bg-destructive' : 'bg-primary',
              )}
            />
          </div>
          {layers.length === 0 ? (
            <p className="px-3 py-6 text-center text-2xs text-muted-foreground">
              Place an overlay or text clip, then add keyframes.
            </p>
          ) : null}
          {layers.map((layer) => (
            <MotionLayerBlock
              key={layer.clipId}
              layer={layer}
              project={project}
              pxPerSec={pxPerSec}
              playheadSec={playheadSec}
              collapsed={collapsed}
              selected={selectedClipId === layer.clipId}
              easingKeyId={easingKey?.keyframe.id}
              onSelect={() => onSelectClip(layer.clipId)}
              onAddKeyframe={onAddKeyframe}
              onOpenEasing={(keyframe) =>
                setEasingKey({ trackId: layer.trackId, clipId: layer.clipId, keyframe })
              }
              onTrimStyle={(instanceId, startSec, endSec) =>
                onTrimStyle({
                  trackId: layer.trackId,
                  clipId: layer.clipId,
                  instanceId,
                  startSec,
                  endSec,
                })
              }
            />
          ))}
        </div>
      </div>
      {showGraph && selected && graphRow ? (
        <MotionGraph
          keys={graphKeys}
          durationSec={selected.durationSec}
          fallback={0}
          playheadSec={localPlayheadSec(selected, playheadSec)}
          label={graphRow.label}
        />
      ) : null}
      {easingKey ? (
        <div className="border-t border-border/60 px-3 py-2">
          <EasingCurveEditor
            keyframe={easingKey.keyframe}
            onChange={(patch) => {
              onPatchKeyframe({
                trackId: easingKey.trackId,
                clipId: easingKey.clipId,
                keyframe: { ...easingKey.keyframe, ...patch },
              });
              setEasingKey({
                ...easingKey,
                keyframe: { ...easingKey.keyframe, ...patch },
              });
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

function MotionLayerBlock({
  layer,
  project,
  pxPerSec,
  playheadSec,
  collapsed,
  selected,
  easingKeyId,
  onSelect,
  onAddKeyframe,
  onOpenEasing,
  onTrimStyle,
}: {
  layer: MotionLayerRow;
  project: EditorProjectV2;
  pxPerSec: number;
  playheadSec: number;
  collapsed: boolean;
  selected: boolean;
  easingKeyId?: string;
  onSelect: () => void;
  onAddKeyframe: (input: {
    trackId: string;
    clipId: string;
    property: MotionPropertyName;
    timeSec: number;
  }) => void;
  onOpenEasing: (keyframe: EditorKeyframe) => void;
  onTrimStyle: (instanceId: string, startSec: number, endSec: number) => void;
}) {
  const localSec = localPlayheadSec(layer, playheadSec);
  const bars = useMemo(() => styleBarsFor(layer), [layer]);
  const clip = project.tracks
    .flatMap((track) => track.clips.map((item) => ({ track, item })))
    .find((entry) => entry.item.id === layer.clipId);
  return (
    <div className={cn('border-b border-border/40', selected && 'bg-muted/30')}>
      <div className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          {collapsed ? (
            <ChevronRight className="size-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3 text-muted-foreground" />
          )}
          <span className="w-36 truncate text-left">{layer.name}</span>
        </button>
        <span className="relative h-5 flex-1">
          <span
            className="absolute top-0.5 h-4 rounded-sm bg-primary/20"
            style={{
              left: layer.startSec * pxPerSec,
              width: Math.max(8, layer.durationSec * pxPerSec),
            }}
          />
          {bars.map((bar) => (
            <StyleBar
              key={bar.id}
              bar={bar}
              pxPerSec={pxPerSec}
              layerStartSec={layer.startSec}
              onTrim={(startSec, endSec) => onTrimStyle(bar.id, startSec, endSec)}
            />
          ))}
        </span>
      </div>
      {collapsed
        ? null
        : layer.properties.map((row) => {
            const keyed = Boolean(keyAtPlayhead(row.keys, localSec));
            return (
              <div key={row.property} className="flex items-center gap-1 px-3 py-0.5 text-2xs">
                <span className="w-28 truncate text-muted-foreground">{row.label}</span>
                <KeyframeDiamond
                  labeled={row.label}
                  keyed={keyed}
                  onToggle={() =>
                    onAddKeyframe({
                      trackId: layer.trackId,
                      clipId: layer.clipId,
                      property: row.property,
                      timeSec: localSec,
                    })
                  }
                />
                <div className="relative h-5 flex-1">
                  {row.keys.map((key, index) => {
                    const next = row.keys[index + 1];
                    const stored =
                      clip && 'keyframes' in clip.item
                        ? clip.item.keyframes.find((item) => item.id === key.id)
                        : undefined;
                    return (
                      <span key={key.id}>
                        {next ? (
                          <button
                            type="button"
                            aria-label={`Edit ${row.label} easing`}
                            className={cn(
                              'absolute top-2 h-px bg-primary/50',
                              easingKeyId === key.id && 'bg-primary',
                            )}
                            style={{
                              left: (layer.startSec + key.timeSec) * pxPerSec,
                              width: Math.max(8, (next.timeSec - key.timeSec) * pxPerSec),
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (stored) onOpenEasing(stored);
                            }}
                          />
                        ) : null}
                        <span
                          className={cn(
                            'absolute top-1.5 size-2 rotate-45 border border-primary',
                            keyed && Math.abs(key.timeSec - localSec) <= 0.05
                              ? 'bg-primary'
                              : 'bg-background',
                          )}
                          style={{ left: (layer.startSec + key.timeSec) * pxPerSec }}
                        />
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
    </div>
  );
}

function StyleBar({
  bar,
  pxPerSec,
  layerStartSec,
  onTrim,
}: {
  bar: { id: string; label: string; startSec: number; endSec: number };
  pxPerSec: number;
  layerStartSec: number;
  onTrim: (startSec: number, endSec: number) => void;
}) {
  const [draft, setDraft] = useState<{ startSec: number; endSec: number } | null>(null);
  const display = draft ?? bar;
  const beginTrim = (edge: 'start' | 'end') => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const handle = event.currentTarget;
    const track = handle.parentElement?.parentElement;
    if (!track) return;
    handle.setPointerCapture(event.pointerId);
    const originLeft = track.getBoundingClientRect().left;
    const start = bar.startSec;
    const end = bar.endSec;
    const read = (clientX: number) => {
      const time = Math.max(0, (clientX - originLeft) / pxPerSec);
      return edge === 'start'
        ? {
            startSec: Math.min(end - 0.05, Math.max(layerStartSec, time)),
            endSec: end,
          }
        : {
            startSec: start,
            endSec: Math.max(start + 0.05, time),
          };
    };
    const move = (pointer: PointerEvent) => setDraft(read(pointer.clientX));
    const up = (pointer: PointerEvent) => {
      const next = read(pointer.clientX);
      setDraft(null);
      onTrim(next.startSec - layerStartSec, next.endSec - layerStartSec);
      handle.releasePointerCapture(pointer.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  return (
    <span
      className={cn(
        'absolute top-0.5 flex h-4 items-center overflow-hidden rounded-sm px-1 font-mono text-[0.625rem] tabular-nums',
        MOTION_STYLE_TONE[bar.label.toLowerCase()] ?? 'bg-primary/15 text-primary',
      )}
      style={{
        left: display.startSec * pxPerSec,
        width: Math.max(18, (display.endSec - display.startSec) * pxPerSec),
      }}
    >
      <button
        type="button"
        aria-label="Trim style start"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize bg-foreground/30"
        onPointerDown={beginTrim('start')}
        onClick={(event) => event.stopPropagation()}
      />
      <span className="pointer-events-none truncate px-1">{bar.label}</span>
      <button
        type="button"
        aria-label="Trim style end"
        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize bg-foreground/30"
        onPointerDown={beginTrim('end')}
        onClick={(event) => event.stopPropagation()}
      />
    </span>
  );
}
