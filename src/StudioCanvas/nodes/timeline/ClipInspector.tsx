'use client';

import { Cross2Icon, ImageIcon, VideoIcon } from '@radix-ui/react-icons';
import { Plus, Type } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { TimelineItem } from '../../types';
import {
  type BlendMode,
  type ClipEffectSpec,
  FILTER_PRESET_LABELS,
  type FilterPreset,
  type TextOverlay,
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

function secInput(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-2xs">{label}</Label>
        <span className="text-2xs tabular-nums text-muted-foreground">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}

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
            <VideoIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
          <Cross2Icon className="h-3 w-3" />
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

      <Separator />

      {/* Trim / duration / mute */}
      {isVideo ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="clip-trim-start" className="text-2xs">
                Trim in (s)
              </Label>
              <Input
                id="clip-trim-start"
                type="number"
                min={0}
                step={0.1}
                defaultValue={secInput(trimStart)}
                key={`start-${item.id}-${trimStart}`}
                onBlur={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (Number.isFinite(next)) onTrim({ startSec: next });
                }}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="clip-trim-end" className="text-2xs">
                Trim out (s)
              </Label>
              <Input
                id="clip-trim-end"
                type="number"
                min={0}
                step={0.1}
                defaultValue={secInput(trimEnd)}
                key={`end-${item.id}-${trimEnd}`}
                onBlur={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (Number.isFinite(next)) onTrim({ endSec: next });
                }}
                className="h-8 text-xs tabular-nums"
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
            <LabeledSlider
              label="Speed"
              value={effects.speed ?? 1}
              min={0.25}
              max={4}
              step={0.05}
              format={(v) => `${v.toFixed(2)}x`}
              onChange={(v) => onSetEffects({ speed: v })}
            />
          )}

          <div className="flex flex-col gap-3">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Audio
            </span>
            <LabeledSlider
              label="Volume"
              value={item.volume ?? 1}
              min={0}
              max={2}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => onSetAudio?.({ volume: v })}
            />
            {context === 'overlay' ? null : (
              <>
                <LabeledSlider
                  label="Fade in"
                  value={item.audioFadeInSec ?? 0}
                  min={0}
                  max={2}
                  step={0.1}
                  format={(v) => `${v.toFixed(1)}s`}
                  onChange={(v) => onSetAudio?.({ audioFadeInSec: v })}
                />
                <LabeledSlider
                  label="Fade out"
                  value={item.audioFadeOutSec ?? 0}
                  min={0}
                  max={2}
                  step={0.1}
                  format={(v) => `${v.toFixed(1)}s`}
                  onChange={(v) => onSetAudio?.({ audioFadeOutSec: v })}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-still" className="text-2xs">
            Hold duration (s)
          </Label>
          <Input
            id="clip-still"
            type="number"
            min={0.1}
            step={0.1}
            defaultValue={secInput(durationSec)}
            key={`still-${item.id}-${durationSec}`}
            onBlur={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (Number.isFinite(next)) onSetStill(next);
            }}
            className="h-8 text-xs tabular-nums"
          />
        </div>
      )}

      <Separator />

      {/* Color + opacity */}
      <div className="flex flex-col gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adjust
        </span>
        <LabeledSlider
          label="Opacity"
          value={effects.opacity ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onSetEffects({ opacity: v })}
        />
        <LabeledSlider
          label="Brightness"
          value={adjustments.brightness ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ brightness: v })}
        />
        <LabeledSlider
          label="Contrast"
          value={adjustments.contrast ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ contrast: v })}
        />
        <LabeledSlider
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
        <LabeledSlider
          label="Scale"
          value={transform.scale ?? 1}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => patchTransform({ scale: v })}
        />
        <LabeledSlider
          label="Rotate"
          value={transform.rotate ?? 0}
          min={-180}
          max={180}
          step={5}
          format={(v) => `${Math.round(v)}°`}
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
              <LabeledSlider
                label="Duration"
                value={item.transition.durationSec}
                min={0.2}
                max={2}
                step={0.1}
                format={(v) => `${v.toFixed(1)}s`}
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
                <Cross2Icon className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
