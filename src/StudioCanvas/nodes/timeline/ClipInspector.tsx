'use client';

import { actionDef } from '@continuum/contracts';
import { Image, Loader2, Plus, Scissors, Type, Video, X } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useMemo as useUiConfigMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberScrubField } from '@/components/ui/number-field';
import { Separator } from '@/components/ui/separator';
import { SliderField } from '@/components/ui/slider-field';
import { Switch } from '@/components/ui/switch';
import { formatDecimal } from '@/lib/format/decimal';
import { ShaderEffectControls } from '../../components/ShaderEffectControls';
import { useStudioMetadata } from '../../hooks/useStudioMetadata';
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

function useLocalTransitionOptionsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: { type: ClipTransitionType; label: string }[] = [
      { type: 'cut', label: translateConfig('none_dc937b59') },
      { type: 'fade', label: translateConfig('fade_9efb597c') },
      { type: 'dipWhite', label: translateConfig('dip_8f1da045') },
      { type: 'crossDissolve', label: translateConfig('dissolve_8bb135de') },
      { type: 'slideLeft', label: translateConfig('slide_3f54a9f2') },
      { type: 'slideRight', label: translateConfig('slide_f2a20888') },
      { type: 'slideUp', label: translateConfig('slide_40969613') },
      { type: 'slideDown', label: translateConfig('slide_de058aaa') },
      { type: 'wipeRight', label: translateConfig('wipe_95c7f658') },
      { type: 'wipeLeft', label: translateConfig('wipe_703e286f') },
      { type: 'zoomIn', label: translateConfig('zoom_509c517e') },
      { type: 'spin', label: translateConfig('spin_b9e96ae5') },
      { type: 'blur', label: translateConfig('blur_cd83e673') },
      { type: 'whipLeft', label: translateConfig('whip_0e8ca1b5') },
      { type: 'whipRight', label: translateConfig('whip_8f82c3df') },
      { type: 'whipUp', label: translateConfig('whip_8ae6e032') },
      { type: 'whipDown', label: translateConfig('whip_d61c9ef7') },
      { type: 'zoomBlur', label: translateConfig('zoom_through_8f81c0ae') },
      { type: 'flash', label: translateConfig('flash_f3577cb5') },
      { type: 'glitch', label: translateConfig('glitch_14980158') },
    ];
    return value;
  }, [translateConfig]);
}

// Right-rail inspector for the selected clip. Surfaces trim/duration/mute plus
// the per-clip effect controls (color, opacity, transform, Ken Burns, speed,
// text) that write into item.effects. Callbacks are pre-bound to the selected
// item by the dialog, so this component stays presentational.

const KEN_BURNS_DEFAULT: NonNullable<ClipEffectSpec['kenBurns']> = {
  from: { scale: 1 },
  to: { scale: 1.2 },
};

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
  onCommit,
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
  onCommit?: () => void;
  onSetTransition: (transition: ClipTransition | undefined) => void;
  onClose: () => void;
}) {
  const TRANSITION_OPTIONS = useLocalTransitionOptionsMessages();

  const decimalLocale = useUiLocale();

  const translateUi = useUiTranslations('studio');
  const metadata = useStudioMetadata();

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-border/60 p-4 text-center text-2xs text-muted-foreground">
        {' '}
        {translateUi('select_a_clip_to_edit_its_trim_effe_ff63694c')}{' '}
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
          aria-label={translateUi('deselect_clip_5f2088ca')}
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="text-2xs text-muted-foreground">
        {' '}
        {translateUi('duration_4fc52a3c')}{' '}
        <span className="tabular-nums text-foreground">
          {formatDecimal(durationSec, 2, decimalLocale)}s
        </span>
        {isVideo && sourceDurationSec ? (
          <>
            {' '}
            {translateUi('source_7bb73e1f')}{' '}
            <span className="tabular-nums">
              {formatDecimal(sourceDurationSec, 2, decimalLocale)}s
            </span>
          </>
        ) : null}
      </div>

      {unpreviewable.length > 0 ? (
        <div
          className="w-fit rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground"
          title={translateUi('live_webgpu_preview_value0_export_u_64721fe0', {
            value0: String(unpreviewable.join(', ')),
          })}
        >
          {unpreviewable.length === 1
            ? translateUi('1_gpu_shader_effect_active_35319657')
            : translateUi('value0_gpu_shader_effects_active_41682fab', {
                count: Number(unpreviewable.length),
              })}
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
                label={translateUi('trim_in_c2df0232')}
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
                label={translateUi('trim_out_cbb61330')}
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
              {' '}
              {translateUi('mute_audio_1690e448')}{' '}
            </Label>
            <Switch
              id="clip-mute"
              checked={Boolean(item.muteAudio)}
              onCheckedChange={(checked) => onSetMute(checked)}
            />
          </div>

          {context === 'overlay' ? null : (
            <SliderField
              onCommit={onCommit}
              label={translateUi('speed_c372fee9')}
              value={effects.speed ?? 1}
              min={0.25}
              max={4}
              step={0.05}
              suffix="x"
              onChange={(v) => onSetEffects({ speed: v })}
            />
          )}

          {onSetAudio ? (
            <div className="flex flex-col gap-3">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {' '}
                {translateUi('audio_bc1b8890')}{' '}
              </span>
              <SliderField
                onCommit={onCommit}
                label={translateUi('volume_b10fb966')}
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
                    onCommit={onCommit}
                    label={translateUi('fade_in_2fd5d206')}
                    value={item.audioFadeInSec ?? 0}
                    min={0}
                    max={2}
                    step={0.1}
                    suffix="s"
                    onChange={(v) => onSetAudio?.({ audioFadeInSec: v })}
                  />
                  <SliderField
                    onCommit={onCommit}
                    label={translateUi('fade_out_2193021e')}
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
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <NumberScrubField
            key={`still-${item.id}-${durationSec}`}
            defaultValue={durationSec}
            label={translateUi('hold_duration_b881f208')}
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
          {' '}
          {translateUi('adjust_fd8a7d7b')}{' '}
        </span>
        <SliderField
          onCommit={onCommit}
          label={translateUi('opacity_6062652e')}
          value={effects.opacity ?? 1}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onSetEffects({ opacity: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('brightness_ec811d30')}
          value={adjustments.brightness ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ brightness: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('contrast_08795ba0')}
          value={adjustments.contrast ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ contrast: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('saturation_993f024b')}
          value={adjustments.saturation ?? 1}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => patchAdjustments({ saturation: v })}
        />
        {/* Warmth sits on the SPEC, not in `adjustments`: it compiles to a sepia +
            hue-rotate pair that the two sliders below must be able to override. */}
        <SliderField
          onCommit={onCommit}
          label={translateUi('warmth_f9bab887')}
          value={effects.warmth ?? 0}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) => onSetEffects({ warmth: v === 0 ? undefined : v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('hue_4d7056f0')}
          value={adjustments.hueRotate ?? 0}
          min={-180}
          max={180}
          step={5}
          suffix="°"
          onChange={(v) => patchAdjustments({ hueRotate: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('sepia_7464e26f')}
          value={adjustments.sepia ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ sepia: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('grayscale_93638ea9')}
          value={adjustments.grayscale ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ grayscale: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('invert_7e04f2ff')}
          value={adjustments.invert ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => patchAdjustments({ invert: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('blur_cd83e673')}
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
          {' '}
          {translateUi('transform_d2d68041')}{' '}
        </span>
        <SliderField
          onCommit={onCommit}
          label={translateUi('scale_f102986b')}
          value={transform.scale ?? 1}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => patchTransform({ scale: v })}
        />
        <SliderField
          onCommit={onCommit}
          label={translateUi('rotate_c3613b17')}
          value={transform.rotate ?? 0}
          min={-180}
          max={180}
          step={5}
          suffix="°"
          onChange={(v) => patchTransform({ rotate: v })}
        />
        <div className="flex items-center justify-between">
          <Label htmlFor="clip-kenburns" className="text-2xs">
            {' '}
            {translateUi('ken_burns_zoom_3915308a')}{' '}
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
              {' '}
              {translateUi('flip_h_6f20f10f')}{' '}
            </Label>
            <Switch
              id="clip-flip-h"
              checked={Boolean(effects.flipH)}
              onCheckedChange={(checked) => onSetEffects({ flipH: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="clip-flip-v" className="text-2xs">
              {' '}
              {translateUi('flip_v_06d50597')}{' '}
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
          {' '}
          {translateUi('look_a0de5719')}{' '}
        </span>
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-filter" className="text-2xs">
            {' '}
            {translateUi('filter_638e249f')}{' '}
          </Label>
          <select
            id="clip-filter"
            className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
            value={effects.filterPreset ?? 'none'}
            onChange={(event) => onSetEffects({ filterPreset: event.target.value as FilterPreset })}
          >
            {FILTER_PRESET_ORDER.map((preset) => (
              <option key={preset} value={preset}>
                {metadata(FILTER_PRESET_LABELS[preset])}
              </option>
            ))}
          </select>
        </div>
        {context === 'overlay' ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="clip-blend" className="text-2xs">
              {' '}
              {translateUi('blend_mode_15e98399')}{' '}
            </Label>
            <select
              id="clip-blend"
              className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              value={effects.blendMode ?? 'normal'}
              onChange={(event) => onSetEffects({ blendMode: event.target.value as BlendMode })}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {metadata(mode)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {' '}
          {translateUi('effects_358511c8')}{' '}
        </span>
        <ShaderEffectControls idPrefix="clip" effects={effects} onChange={onSetEffects} />
      </div>

      {backgroundRemoval ? (
        <>
          <Separator />

          {/* Background removal is NOT a draw-time effect: it hands the clip to the
              matte service and comes back as a new cutout in the media bin. */}
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {' '}
              {translateUi('background_ea2b8a87')}{' '}
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
                ? translateUi('removing_background_value0_9e4d8edb', {
                    value0: String(Math.round(backgroundRemoval.progress * 100)),
                  })
                : translateUi('remove_background_a8d1ab54')}
            </Button>
            {heldBack ? (
              <p className="text-2xs text-muted-foreground">{heldBack}</p>
            ) : sourceAssetId ? null : (
              <p className="text-2xs text-muted-foreground">
                {' '}
                {translateUi('save_this_clip_to_the_library_first_17b98854')}{' '}
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
              {' '}
              {translateUi('transition_in_06a440ca')}{' '}
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
                onCommit={onCommit}
                label={translateUi('duration_4fc52a3c')}
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
            {' '}
            {translateUi('text_71988c4d')}{' '}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-2xs"
            onClick={() =>
              updateText([...textOverlays, { id: uuidv4(), text: translateUi('text_71988c4d') }])
            }
          >
            <Plus className="h-3 w-3" /> {translateUi('add_9fd728c6')}{' '}
          </Button>
        </div>
        {textOverlays.length === 0 ? (
          <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Type className="h-3 w-3" /> {translateUi('no_text_overlays_54dac15e')}{' '}
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
                placeholder={translateUi('overlay_text_dda89fce')}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label={translateUi('remove_text_overlay_25da8864')}
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
