'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  FlipHorizontal,
  FlipVertical,
} from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { memo, useMemo as useUiConfigMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Label } from '@/components/ui/label';
import { NumberScrubField } from '@/components/ui/number-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStudioMetadata } from '@/StudioCanvas/hooks/useStudioMetadata';
import { ShaderEffectControls } from '../../components/ShaderEffectControls';
import type { LayerEditorLayer } from '../../types';
import {
  FRAME_MAX_SIZE,
  FRAME_MIN_SIZE,
  FRAME_PRESETS,
  type Frame,
} from '../../utils/layers/frameModel';
import { type AlignEdge, BLEND_MODES, type LayerMove } from '../../utils/layers/layerOps';

// The frame Select stores "WxH" but its menu shows the preset names — give the trigger
// the same names (D-06). A custom size falls back to its raw "WxH", which is honest.
const FRAME_PRESET_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  FRAME_PRESETS.map((preset) => [`${preset.frame.width}x${preset.frame.height}`, preset.label]),
);

/**
 * The numeric surface of the document: the frame, and the selected layer's §4.3 fields.
 *
 * Every field here writes the STORED model directly — composition pixels, source-pixel
 * anchor, per-axis scale multiplier, degrees, 0..1 opacity — so what the inspector shows
 * is what is saved. Scale is shown as a percentage for readability and converted at this
 * one boundary; the ×100 lives nowhere else (aep-interop §4.2.3).
 */

function useLocalAlignButtonsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: {
      edge: AlignEdge;
      label: string;
      Icon: typeof AlignStartVertical;
    }[] = [
      {
        edge: 'left',
        label: translateConfig('align_left_eac0f9c3'),
        Icon: AlignStartVertical,
      },
      {
        edge: 'center',
        label: translateConfig('align_horizontal_centres_fdcadcdd'),
        Icon: AlignCenterVertical,
      },
      {
        edge: 'right',
        label: translateConfig('align_right_8f4f8efc'),
        Icon: AlignEndVertical,
      },
      {
        edge: 'top',
        label: translateConfig('align_top_4868688f'),
        Icon: AlignStartHorizontal,
      },
      {
        edge: 'middle',
        label: translateConfig('align_vertical_centres_4a5319f9'),
        Icon: AlignCenterHorizontal,
      },
      {
        edge: 'bottom',
        label: translateConfig('align_bottom_7ba097da'),
        Icon: AlignEndHorizontal,
      },
    ];
    return value;
  }, [translateConfig]);
}

function useLocalOrderButtonsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: { move: LayerMove; label: string; Icon: typeof ChevronsUp }[] = [
      {
        move: 'top',
        label: translateConfig('bring_to_front_520cdb7e'),
        Icon: ChevronsUp,
      },
      {
        move: 'up',
        label: translateConfig('bring_forward_2a3d681d'),
        Icon: ChevronUp,
      },
      {
        move: 'down',
        label: translateConfig('send_backward_f6cfe26a'),
        Icon: ChevronDown,
      },
      {
        move: 'bottom',
        label: translateConfig('send_to_back_e3daa79e'),
        Icon: ChevronsDown,
      },
    ];
    return value;
  }, [translateConfig]);
}

export interface LayerInspectorProps {
  frame: Frame;
  onFrameChange: (width: number, height: number) => void;
  onFrameCommit: (width: number, height: number) => void;
  /** `#rrggbb`, or null for the transparent default. */
  background: string | null;
  onBackgroundChange: (background: string | null) => void;
  /**
   * The layer whose values are DISPLAYED — the first selected one, not necessarily the
   * only one. Edits go to the whole selection; `selectionCount` says how many that is.
   */
  layer: LayerEditorLayer | null;
  selectionCount: number;
  /**
   * In-flight value. A scrub or a typed digit fires this per sample.
   *
   * Paired with `onLayerCommit` for the same reason the stage has `onBegin`/`onPreview`:
   * a 40px scrub of X used to push 40 documents and evict the 50-entry history in one
   * gesture. `ClipInspector` splits them the same way.
   */
  onLayerChange: (patch: Partial<LayerEditorLayer>) => void;
  /** Pointer released, or the field blurred: settle the edit. */
  onLayerCommit: (patch: Partial<LayerEditorLayer>) => void;
  onAlign: (edge: AlignEdge) => void;
  onOrder: (move: LayerMove) => void;
  onFlip: (axis: 'x' | 'y') => void;
}

function LayerInspectorImpl({
  frame,
  onFrameChange,
  onFrameCommit,
  background,
  onBackgroundChange,
  layer,
  selectionCount,
  onLayerChange,
  onLayerCommit,
  onAlign,
  onOrder,
  onFlip,
}: LayerInspectorProps) {
  const registryText = useStudioMetadata();

  const ALIGN_BUTTONS = useLocalAlignButtonsMessages();
  const ORDER_BUTTONS = useLocalOrderButtonsMessages();

  const translateUi = useUiTranslations('studio');

  return (
    <div className="flex flex-col gap-3 p-2" data-testid="layer-inspector">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {' '}
          {translateUi('frame_d0b50e06')}{' '}
        </h3>
        <Select
          value={`${frame.width}x${frame.height}`}
          onValueChange={(value) => {
            // A preset is one discrete choice, so it settles immediately — unlike the
            // W/H scrubs below, which stream through onChange and settle on release.
            const [width, height] = value.split('x').map(Number);
            onFrameCommit(width, height);
          }}
        >
          <SelectTrigger className="h-7 text-2xs" aria-label={translateUi('frame_preset_4cfb9e83')}>
            <SelectValue
              placeholder={translateUi('custom_494ca78f')}
              items={Object.fromEntries(
                FRAME_PRESETS.map((preset) => [
                  `${preset.frame.width}x${preset.frame.height}`,
                  registryText(preset.label),
                ]),
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {FRAME_PRESETS.map((preset) => (
              <SelectItem
                key={preset.label}
                value={`${preset.frame.width}x${preset.frame.height}`}
                className="text-2xs"
              >
                {registryText(preset.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberScrubField
            label={translateUi('width_3019947b')}
            value={frame.width}
            step={16}
            onChange={(width) => onFrameChange(width, frame.height)}
            onCommit={(width) => onFrameCommit(width, frame.height)}
          />
          <NumberScrubField
            label={translateUi('height_bfe2eca4')}
            value={frame.height}
            step={16}
            onChange={(height) => onFrameChange(frame.width, height)}
            onCommit={(height) => onFrameCommit(frame.width, height)}
          />
        </div>
        <p className="text-3xs text-muted-foreground">
          {FRAME_MIN_SIZE}–{FRAME_MAX_SIZE}{' '}
          {translateUi('px_resizing_the_frame_never_moves_a_2f5627a8')}{' '}
        </p>

        {/* Transparent stays the DEFAULT — the export owes downstream an alpha channel.
            This is for the ad that wants a flat brand colour behind its elements, which
            otherwise needs a whole generated full-frame image to stand in for a fill. */}
        <div className="flex items-center gap-1">
          <ColorField
            value={background}
            onChange={onBackgroundChange}
            label={translateUi('frame_background_44898c9d')}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-3xs"
            disabled={!background}
            onClick={() => onBackgroundChange(null)}
          >
            {' '}
            {translateUi('clear_83b12c22')}{' '}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {selectionCount > 1
            ? translateUi('align_value0_layers_f2f08d13', {
                count: Number(selectionCount),
              })
            : translateUi('align_to_frame_866cac55')}
        </h3>
        <div className="grid grid-cols-6 gap-1">
          {ALIGN_BUTTONS.map(({ edge, label, Icon }) => (
            <Tooltip key={edge}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-full"
                    aria-label={label}
                    disabled={selectionCount === 0}
                    onClick={() => onAlign(edge)}
                  >
                    <Icon className="h-3 w-3" />
                  </Button>
                }
              />
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </section>

      {layer && selectionCount === 1 ? (
        <>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {' '}
              {translateUi('transform_d2d68041')}{' '}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberScrubField
                label="X"
                value={layer.position.x}
                onChange={(x) => onLayerChange({ position: { ...layer.position, x } })}
                onCommit={(x) => onLayerCommit({ position: { ...layer.position, x } })}
              />
              <NumberScrubField
                label="Y"
                value={layer.position.y}
                onChange={(y) => onLayerChange({ position: { ...layer.position, y } })}
                onCommit={(y) => onLayerCommit({ position: { ...layer.position, y } })}
              />
              <NumberScrubField
                label={translateUi('scale_x_9e894f3e')}
                value={layer.scale.x * 100}
                suffix="%"
                onChange={(percent) =>
                  onLayerChange({ scale: { ...layer.scale, x: percent / 100 } })
                }
                onCommit={(percent) =>
                  onLayerCommit({ scale: { ...layer.scale, x: percent / 100 } })
                }
              />
              <NumberScrubField
                label={translateUi('scale_y_5001e575')}
                value={layer.scale.y * 100}
                suffix="%"
                onChange={(percent) =>
                  onLayerChange({ scale: { ...layer.scale, y: percent / 100 } })
                }
                onCommit={(percent) =>
                  onLayerCommit({ scale: { ...layer.scale, y: percent / 100 } })
                }
              />
              <NumberScrubField
                label={translateUi('rotation_57b5e2fc')}
                value={layer.rotation}
                suffix="°"
                onChange={(rotation) => onLayerChange({ rotation })}
                onCommit={(rotation) => onLayerCommit({ rotation })}
              />
              <div className="flex items-end gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-full"
                        aria-label={translateUi('flip_horizontally_7edc03ef')}
                        onClick={() => onFlip('x')}
                      >
                        <FlipHorizontal className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {translateUi('flip_horizontally_negates_scale_x_435a4a47')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-full"
                        aria-label={translateUi('flip_vertically_6282842c')}
                        onClick={() => onFlip('y')}
                      >
                        <FlipVertical className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    {translateUi('flip_vertically_negates_scale_y_c0f7a8c2')}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {' '}
              {translateUi('anchor_a4ae750b')}{' '}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberScrubField
                label={translateUi('anchor_x_25c5e8fd')}
                value={layer.anchor.x}
                onChange={(x) => onLayerChange({ anchor: { ...layer.anchor, x } })}
                onCommit={(x) => onLayerCommit({ anchor: { ...layer.anchor, x } })}
              />
              <NumberScrubField
                label={translateUi('anchor_y_ac55e610')}
                value={layer.anchor.y}
                onChange={(y) => onLayerChange({ anchor: { ...layer.anchor, y } })}
                onCommit={(y) => onLayerCommit({ anchor: { ...layer.anchor, y } })}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <p className="text-3xs text-muted-foreground">
                {' '}
                {translateUi('source_pixels_rotation_and_scale_pi_bab1b73a')}{' '}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 text-3xs"
                onClick={() =>
                  onLayerCommit({
                    anchor: {
                      x: layer.sourceWidth / 2,
                      y: layer.sourceHeight / 2,
                    },
                  })
                }
              >
                {' '}
                {translateUi('centre_45c19322')}{' '}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {' '}
              {translateUi('shader_effects_05531dd8')}{' '}
            </h3>
            <ShaderEffectControls
              idPrefix="layer"
              effects={layer.effects ?? {}}
              onChange={(patch) => onLayerCommit({ effects: { ...layer.effects, ...patch } })}
            />
          </section>
        </>
      ) : null}

      {layer ? (
        <>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {selectionCount > 1
                ? translateUi('appearance_value0_layers_6fba3d7f', {
                    count: Number(selectionCount),
                  })
                : translateUi('appearance_3907fa7f')}
            </h3>
            <div className="flex items-center gap-2">
              <Label className="w-14 shrink-0 text-3xs text-muted-foreground">
                {translateUi('opacity_6062652e')}
              </Label>
              <Slider
                aria-label={translateUi('opacity_6062652e')}
                min={0}
                max={100}
                step={1}
                value={[Math.round(layer.opacity * 100)]}
                onValueChange={([percent]) => onLayerChange({ opacity: percent / 100 })}
                onValueCommitted={([percent]) => onLayerCommit({ opacity: percent / 100 })}
              />
              <span className="w-9 shrink-0 text-right text-2xs tabular-nums">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
            <Select
              value={layer.blendMode}
              onValueChange={(value) =>
                onLayerChange({
                  blendMode: value as LayerEditorLayer['blendMode'],
                })
              }
            >
              <SelectTrigger
                className="h-7 text-2xs"
                aria-label={translateUi('blend_mode_15e98399')}
              >
                <SelectValue className="capitalize" />
              </SelectTrigger>
              <SelectContent>
                {BLEND_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode} className="text-2xs capitalize">
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {' '}
              {translateUi('order_6be09082')}{' '}
            </h3>
            <div className="grid grid-cols-4 gap-1">
              {ORDER_BUTTONS.map(({ move, label, Icon }) => (
                <Tooltip key={move}>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-full"
                        aria-label={label}
                        onClick={() => onOrder(move)}
                      >
                        <Icon className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="px-1 text-2xs text-muted-foreground">
          {translateUi('select_a_layer_to_edit_it_7dcdc450')}
        </p>
      )}
    </div>
  );
}

/**
 * Memoised because it sits on the drag path.
 *
 * Every pointer sample dispatches a `preview`, which re-renders the dialog. Unmemoised,
 * that re-rendered this whole panel sixty times a second — for LayerInspector, once per
 * `useSortable` row inside a `DndContext`, each carrying a ContextMenu and a Tooltip.
 * The layer objects themselves keep their identity through `mapIds`, so the props of an
 * untouched panel really are unchanged and the skip is real rather than nominal.
 */
export const LayerInspector = memo(LayerInspectorImpl);
