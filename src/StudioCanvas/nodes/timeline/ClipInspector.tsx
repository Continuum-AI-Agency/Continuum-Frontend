'use client';

import { actionDef } from '@continuum/contracts';
import { Image, Loader2, Plus, Scissors, Type, Video, X } from 'lucide-react';
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

// Turning a keyer ON is not the same as setting its amount to zero: at tolerance 0 a
// chroma key still knocks out exact matches, so the toggle writes the whole object or
// removes it. Green because that is what a greenscreen is shot against.
const CHROMA_KEY_DEFAULT: NonNullable<ClipEffectSpec['chromaKey']> = {
  color: '#00ff00',
  tolerance: 0.35,
  softness: 0.1,
};

const TINT_DEFAULT_COLOR = '#ff8a3d';

// The draw-time presets, all of which are `{ amount }` on a 0..1 scale and all of which
// mean "off" at 0 — so one row shape drives every one of them, and a zero writes the
// field away rather than leaving a no-op object on the clip.
const EFFECT_AMOUNT_FIELDS = [
  { field: 'vignette', label: 'Vignette' },
  { field: 'filmGrain', label: 'Film grain' },
  { field: 'chromaticAberration', label: 'Chromatic aberration' },
  { field: 'vhs', label: 'VHS' },
] as const satisfies readonly { field: keyof ClipEffectSpec; label: string }[];

// A labelled native colour well. `<input type="color">` is the platform's own picker —
// no library, and it is the one control here whose value is not a number on a track.
function ColorRow({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-2xs">
        {label}
      </Label>
      <input
        id={id}
        type="color"
        className="nodrag h-7 w-12 shrink-0 cursor-pointer rounded-md border border-border/70 bg-background p-0.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export interface ClipBackgroundRemoval {
  /** Runs the matte. Absent host support hides the section entirely. */
  run: () => void;
  pending: boolean;
  /** 0..1, straight from the service's SSE progress. */
  progress: number;
  error?: string;
}

export function ClipInspector({
  item,
  context = 'base',
  durationSec,
  sourceDurationSec,
  label,
  sourceAssetId,
  backgroundRemoval,
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
  /**
   * `media.assets` id behind this clip's bin source, when it has one. The background
   * remover registers its cutout as a DERIVATIVE of this, so a clip without one has
   * nothing to derive from — the control says that instead of failing on click.
   */
  sourceAssetId?: string;
  backgroundRemoval?: ClipBackgroundRemoval;
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
  // The clip lane and the still lane are separate services, and only one of them can be
  // held back — so this asks the registry about THIS clip's lane, not about the feature.
  const heldBack = actionDef(
    isVideo ? 'video.removeBackground' : 'image.removeBackground',
  )?.comingSoon;
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

  const chromaKey = effects.chromaKey;
  const tint = effects.tint;
  const pixelate = effects.pixelate;

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
        {/* Warmth sits on the SPEC, not in `adjustments`: it compiles to a sepia +
            hue-rotate pair that the two sliders below must be able to override. */}
        <SliderField
          label="Warmth"
          value={effects.warmth ?? 0}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) => onSetEffects({ warmth: v === 0 ? undefined : v })}
        />
        <SliderField
          label="Hue"
          value={adjustments.hueRotate ?? 0}
          min={-180}
          max={180}
          step={5}
          suffix="°"
          onChange={(v) => patchAdjustments({ hueRotate: v })}
        />
        <SliderField
          label="Sepia"
          value={adjustments.sepia ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ sepia: v })}
        />
        <SliderField
          label="Grayscale"
          value={adjustments.grayscale ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ grayscale: v })}
        />
        <SliderField
          label="Invert"
          value={adjustments.invert ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ invert: v })}
        />
        <SliderField
          label="Blur"
          value={adjustments.blur ?? 0}
          min={0}
          max={20}
          step={0.5}
          suffix="px"
          onChange={(v) => patchAdjustments({ blur: v })}
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

      <Separator />

      {/* Draw-time effects. None of these has a CSS `filter` primitive, so the badge at
          the top of the panel is what tells the author the preview cannot show them —
          the export renders every one of them exactly. */}
      <div className="flex flex-col gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Effects
        </span>

        <div className="flex items-center justify-between">
          <Label htmlFor="clip-chroma" className="text-2xs">
            Chroma key
          </Label>
          <Switch
            id="clip-chroma"
            checked={Boolean(chromaKey)}
            onCheckedChange={(checked) =>
              onSetEffects({ chromaKey: checked ? CHROMA_KEY_DEFAULT : undefined })
            }
          />
        </div>
        {chromaKey ? (
          <>
            <ColorRow
              id="clip-chroma-color"
              label="Key colour"
              value={chromaKey.color}
              onChange={(color) => onSetEffects({ chromaKey: { ...chromaKey, color } })}
            />
            <SliderField
              label="Tolerance"
              value={chromaKey.tolerance}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onSetEffects({ chromaKey: { ...chromaKey, tolerance: v } })}
            />
            <SliderField
              label="Softness"
              value={chromaKey.softness}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onSetEffects({ chromaKey: { ...chromaKey, softness: v } })}
            />
          </>
        ) : null}

        <ColorRow
          id="clip-tint-color"
          label="Tint colour"
          value={tint?.color ?? TINT_DEFAULT_COLOR}
          onChange={(color) => onSetEffects({ tint: { color, amount: tint?.amount ?? 0.5 } })}
        />
        <SliderField
          label="Tint"
          value={tint?.amount ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) =>
            onSetEffects({
              tint: v > 0 ? { color: tint?.color ?? TINT_DEFAULT_COLOR, amount: v } : undefined,
            })
          }
        />

        {EFFECT_AMOUNT_FIELDS.map(({ field, label: fieldLabel }) => (
          <SliderField
            key={field}
            label={fieldLabel}
            value={(effects[field] as { amount: number } | undefined)?.amount ?? 0}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => onSetEffects({ [field]: v > 0 ? { amount: v } : undefined })}
          />
        ))}

        {/* Pixelate is the odd one out: its scale is SOURCE pixels per block, and
            anything under 2 is not a mosaic, so 0 on the track means off. The step is 2
            so that "off" and the smallest real mosaic are adjacent — a step of 1 leaves
            a value the field discards, and the track cannot then climb past it. */}
        <SliderField
          label="Pixelate"
          value={pixelate && pixelate.blockPx >= 2 ? pixelate.blockPx : 0}
          min={0}
          max={64}
          step={2}
          suffix="px"
          onChange={(v) => onSetEffects({ pixelate: v >= 2 ? { blockPx: v } : undefined })}
        />
      </div>

      {backgroundRemoval ? (
        <>
          <Separator />

          {/* Background removal is NOT a draw-time effect: it hands the clip to the
              matte service and comes back as a new cutout in the media bin. */}
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Background
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1.5 text-2xs"
              disabled={!sourceAssetId || backgroundRemoval.pending || Boolean(heldBack)}
              onClick={backgroundRemoval.run}
            >
              {backgroundRemoval.pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Scissors className="h-3 w-3" />
              )}
              {backgroundRemoval.pending
                ? `Removing background… ${Math.round(backgroundRemoval.progress * 100)}%`
                : 'Remove background'}
            </Button>
            {heldBack ? (
              <p className="text-2xs text-muted-foreground">{heldBack}</p>
            ) : sourceAssetId ? null : (
              <p className="text-2xs text-muted-foreground">
                Save this clip to the Library first — the background remover records the cutout
                against its source.
              </p>
            )}
            {backgroundRemoval.error ? (
              <p className="text-2xs text-destructive">{backgroundRemoval.error}</p>
            ) : null}
          </div>
        </>
      ) : null}

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
