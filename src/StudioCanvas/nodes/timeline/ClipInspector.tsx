'use client';

import { Image, Plus, Type, Video, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberScrubField } from '@/components/ui/number-field';
import { Separator } from '@/components/ui/separator';
import { SliderField } from '@/components/ui/slider-field';
import { Switch } from '@/components/ui/switch';
import type { TimelineItem } from '../../types';
import {
  type BlendMode,
  type ClipEffectSpec,
  FILTER_PRESET_LABELS,
  type FilterPreset,
  type TextOverlay,
  unpreviewableEffects,
} from '../../utils/render/effectSpec';
import type { ClipTransition, ClipTransitionType } from '../../utils/render/transitions';
import type { ClipAudioPatch } from './useTimelineEditorModel';

const FILTER_PRESET_ORDER: FilterPreset[] = [
  'none',
  'bw',
  'vintage',
  'vivid',
  'cool',
  'warm',
  'noir',
  'dream',
];
const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'lighten',
  'darken',
  'difference',
];

const TRANSITION_OPTIONS: { type: ClipTransitionType; label: string }[] = [
  { type: 'cut', label: 'None' },
  { type: 'fade', label: 'Fade' },
  { type: 'dipWhite', label: 'Dip' },
  { type: 'crossDissolve', label: 'Dissolve' },
  { type: 'slideLeft', label: 'Slide ←' },
  { type: 'slideRight', label: 'Slide →' },
  { type: 'slideUp', label: 'Slide ↑' },
  { type: 'slideDown', label: 'Slide ↓' },
  { type: 'wipeRight', label: 'Wipe →' },
  { type: 'wipeLeft', label: 'Wipe ←' },
  { type: 'zoomIn', label: 'Zoom' },
  { type: 'spin', label: 'Spin' },
];

// Right-rail inspector for the selected clip. Surfaces trim/duration/mute plus
// the per-clip effect controls (color, opacity, transform, Ken Burns, speed,
// text) that write into item.effects. Callbacks are pre-bound to the selected
// item by the dialog, so this component stays presentational.

const KEN_BURNS_DEFAULT: NonNullable<ClipEffectSpec['kenBurns']> = {
  from: { scale: 1 },
  to: { scale: 1.2 },
};

export function ClipInspector({
  item,
  context = 'base',
  durationSec,
  sourceDurationSec,
  label,
  onTrim,
  onSetStill,
  onSetMute,
  onSetAudio,
  onSetEffects,
  onSetTransition,
  onClose,
}: {
  item: TimelineItem | undefined;
  // Overlay clips hide audio + transition controls (neither applies to a layer).
  context?: 'base' | 'overlay';
  durationSec: number;
  sourceDurationSec?: number;
  label: string;
  onTrim: (range: { startSec?: number; endSec?: number }) => void;
  onSetStill: (sec: number) => void;
  onSetMute: (mute: boolean) => void;
  onSetAudio?: (patch: ClipAudioPatch) => void;
  onSetEffects: (patch: Partial<ClipEffectSpec>) => void;
  onSetTransition: (transition: ClipTransition | undefined) => void;
  onClose: () => void;
}) {
  if (!item) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-border/60 p-4 text-center text-2xs text-muted-foreground">
        Select a clip to edit its trim, effects, and audio.
      </div>
    );
  }

  const isVideo = item.kind !== 'image';
  const effects = item.effects ?? {};
  const adjustments = effects.adjustments ?? {};
  const transform = effects.transform ?? {};
  const trimStart = Math.max(0, item.trimStartSec ?? 0);
  const trimEnd = item.trimEndSec ?? sourceDurationSec ?? trimStart + durationSec;
  const kenBurnsOn = Boolean(effects.kenBurns);
  const textOverlays = effects.text ?? [];
  const unpreviewable = unpreviewableEffects(item.effects);

  const patchAdjustments = (patch: Partial<NonNullable<ClipEffectSpec['adjustments']>>) =>
    onSetEffects({ adjustments: { ...adjustments, ...patch } });
  const patchTransform = (patch: Partial<NonNullable<ClipEffectSpec['transform']>>) =>
    onSetEffects({ transform: { ...transform, ...patch } });

  const updateText = (next: TextOverlay[]) => onSetEffects({ text: next });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {isVideo ? (
            <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs font-semibold">{label}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Deselect clip"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="text-2xs text-muted-foreground">
        Duration <span className="tabular-nums text-foreground">{durationSec.toFixed(2)}s</span>
        {isVideo && sourceDurationSec ? (
          <>
            {' '}
            · source <span className="tabular-nums">{sourceDurationSec.toFixed(2)}s</span>
          </>
        ) : null}
      </div>

      {unpreviewable.length > 0 ? (
        <div
          className="w-fit rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground"
          title={`No CSS preview for: ${unpreviewable.join(', ')}. The export renders them exactly.`}
        >
          {unpreviewable.length === 1
            ? '1 effect renders but can’t be previewed'
            : `${unpreviewable.length} effects render but can’t be previewed`}
        </div>
      ) : null}

      <Separator />

      {/* Trim / duration / mute */}
      {isVideo ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <NumberScrubField
                key={`start-${item.id}-${trimStart}`}
                defaultValue={trimStart}
                label="Trim in"
                min={0}
                step={0.1}
                suffix="s"
                onCommit={(next) => {
                  if (next !== null) onTrim({ startSec: next });
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <NumberScrubField
                key={`end-${item.id}-${trimEnd}`}
                defaultValue={trimEnd}
                label="Trim out"
                min={0}
                step={0.1}
                suffix="s"
                onCommit={(next) => {
                  if (next !== null) onTrim({ endSec: next });
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="clip-mute" className="text-2xs">
              Mute audio
            </Label>
            <Switch
              id="clip-mute"
              checked={Boolean(item.muteAudio)}
              onCheckedChange={(checked) => onSetMute(checked)}
            />
          </div>

          {context === 'overlay' ? null : (
            <SliderField
              label="Speed"
              value={effects.speed ?? 1}
              min={0.25}
              max={4}
              step={0.05}
              suffix="x"
              onChange={(v) => onSetEffects({ speed: v })}
            />
          )}

          <div className="flex flex-col gap-3">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Audio
            </span>
            <SliderField
              label="Volume"
              value={item.volume ?? 1}
              min={0}
              max={2}
              step={0.05}
              format={{ style: 'percent', maximumFractionDigits: 0 }}
              onChange={(v) => onSetAudio?.({ volume: v })}
            />
            {context === 'overlay' ? null : (
              <>
                <SliderField
                  label="Fade in"
                  value={item.audioFadeInSec ?? 0}
                  min={0}
                  max={2}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onSetAudio?.({ audioFadeInSec: v })}
                />
                <SliderField
                  label="Fade out"
                  value={item.audioFadeOutSec ?? 0}
                  min={0}
                  max={2}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onSetAudio?.({ audioFadeOutSec: v })}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <NumberScrubField
            key={`still-${item.id}-${durationSec}`}
            defaultValue={durationSec}
            label="Hold duration"
            min={0.1}
            step={0.1}
            suffix="s"
            onCommit={(next) => {
              if (next !== null) onSetStill(next);
            }}
          />
        </div>
      )}

      <Separator />

      {/* Color + opacity */}
      <div className="flex flex-col gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adjust
        </span>
        <SliderField
          label="Opacity"
          value={effects.opacity ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onSetEffects({ opacity: v })}
        />
        <SliderField
          label="Brightness"
          value={adjustments.brightness ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ brightness: v })}
        />
        <SliderField
          label="Contrast"
          value={adjustments.contrast ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ contrast: v })}
        />
        <SliderField
          label="Saturation"
          value={adjustments.saturation ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ saturation: v })}
        />
      </div>

      <Separator />

      {/* Transform + Ken Burns */}
      <div className="flex flex-col gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Transform
        </span>
        <SliderField
          label="Scale"
          value={transform.scale ?? 1}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => patchTransform({ scale: v })}
        />
        <SliderField
          label="Rotate"
          value={transform.rotate ?? 0}
          min={-180}
          max={180}
          step={5}
          suffix="°"
          onChange={(v) => patchTransform({ rotate: v })}
        />
        <div className="flex items-center justify-between">
          <Label htmlFor="clip-kenburns" className="text-2xs">
            Ken Burns (zoom)
          </Label>
          <Switch
            id="clip-kenburns"
            checked={kenBurnsOn}
            onCheckedChange={(checked) =>
              onSetEffects({ kenBurns: checked ? KEN_BURNS_DEFAULT : undefined })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="clip-flip-h" className="text-2xs">
              Flip H
            </Label>
            <Switch
              id="clip-flip-h"
              checked={Boolean(effects.flipH)}
              onCheckedChange={(checked) => onSetEffects({ flipH: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="clip-flip-v" className="text-2xs">
              Flip V
            </Label>
            <Switch
              id="clip-flip-v"
              checked={Boolean(effects.flipV)}
              onCheckedChange={(checked) => onSetEffects({ flipV: checked })}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Look: one-tap filter preset + (overlay) blend mode */}
      <div className="flex flex-col gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Look
        </span>
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-filter" className="text-2xs">
            Filter
          </Label>
          <select
            id="clip-filter"
            className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
            value={effects.filterPreset ?? 'none'}
            onChange={(event) => onSetEffects({ filterPreset: event.target.value as FilterPreset })}
          >
            {FILTER_PRESET_ORDER.map((preset) => (
              <option key={preset} value={preset}>
                {FILTER_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </div>
        {context === 'overlay' ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="clip-blend" className="text-2xs">
              Blend mode
            </Label>
            <select
              id="clip-blend"
              className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              value={effects.blendMode ?? 'normal'}
              onChange={(event) => onSetEffects({ blendMode: event.target.value as BlendMode })}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {context === 'overlay' ? null : (
        <>
          <Separator />

          {/* Transition into this clip */}
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transition (in)
            </span>
            <div className="grid grid-cols-4 gap-1">
              {TRANSITION_OPTIONS.map((option) => {
                const active = (item.transition?.type ?? 'cut') === option.type;
                return (
                  <Button
                    key={option.type}
                    variant={active ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 text-2xs"
                    onClick={() =>
                      onSetTransition(
                        option.type === 'cut'
                          ? undefined
                          : { type: option.type, durationSec: item.transition?.durationSec ?? 0.5 },
                      )
                    }
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
            {item.transition && item.transition.type !== 'cut' ? (
              <SliderField
                label="Duration"
                value={item.transition.durationSec}
                min={0.2}
                max={2}
                step={0.1}
                suffix="s"
                onChange={(v) =>
                  item.transition && onSetTransition({ type: item.transition.type, durationSec: v })
                }
              />
            ) : null}
          </div>
        </>
      )}

      <Separator />

      {/* Text overlays */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Text
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-2xs"
            onClick={() => updateText([...textOverlays, { id: uuidv4(), text: 'Text' }])}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
        {textOverlays.length === 0 ? (
          <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Type className="h-3 w-3" /> No text overlays.
          </div>
        ) : (
          textOverlays.map((overlay, index) => (
            <div key={overlay.id} className="flex items-center gap-1.5">
              <Input
                value={overlay.text}
                onChange={(event) => {
                  const next = [...textOverlays];
                  next[index] = { ...overlay, text: event.target.value };
                  updateText(next);
                }}
                className="h-8 flex-1 text-xs"
                placeholder="Overlay text"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label="Remove text overlay"
                onClick={() => updateText(textOverlays.filter((entry) => entry.id !== overlay.id))}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
