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
import { Button } from '@/components/ui/button';
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

const ALIGN_BUTTONS: { edge: AlignEdge; label: string; Icon: typeof AlignStartVertical }[] = [
  { edge: 'left', label: 'Align left', Icon: AlignStartVertical },
  { edge: 'center', label: 'Align horizontal centres', Icon: AlignCenterVertical },
  { edge: 'right', label: 'Align right', Icon: AlignEndVertical },
  { edge: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { edge: 'middle', label: 'Align vertical centres', Icon: AlignCenterHorizontal },
  { edge: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

const ORDER_BUTTONS: { move: LayerMove; label: string; Icon: typeof ChevronsUp }[] = [
  { move: 'top', label: 'Bring to front', Icon: ChevronsUp },
  { move: 'up', label: 'Bring forward', Icon: ChevronUp },
  { move: 'down', label: 'Send backward', Icon: ChevronDown },
  { move: 'bottom', label: 'Send to back', Icon: ChevronsDown },
];

export interface LayerInspectorProps {
  frame: Frame;
  onFrameChange: (width: number, height: number) => void;
  /** The single selected layer, or null when zero or many are selected. */
  layer: LayerEditorLayer | null;
  selectionCount: number;
  onLayerChange: (patch: Partial<LayerEditorLayer>) => void;
  onAlign: (edge: AlignEdge) => void;
  onOrder: (move: LayerMove) => void;
  onFlip: (axis: 'x' | 'y') => void;
}

export function LayerInspector({
  frame,
  onFrameChange,
  layer,
  selectionCount,
  onLayerChange,
  onAlign,
  onOrder,
  onFlip,
}: LayerInspectorProps) {
  return (
    <div className="flex flex-col gap-3 p-2" data-testid="layer-inspector">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          Frame
        </h3>
        <Select
          value={`${frame.width}x${frame.height}`}
          onValueChange={(value) => {
            const [width, height] = value.split('x').map(Number);
            onFrameChange(width, height);
          }}
        >
          <SelectTrigger className="h-7 text-2xs" aria-label="Frame preset">
            <SelectValue placeholder="Custom" items={FRAME_PRESET_LABELS} />
          </SelectTrigger>
          <SelectContent>
            {FRAME_PRESETS.map((preset) => (
              <SelectItem
                key={preset.label}
                value={`${preset.frame.width}x${preset.frame.height}`}
                className="text-2xs"
              >
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberScrubField
            label="Width"
            value={frame.width}
            step={16}
            onChange={(width) => onFrameChange(width, frame.height)}
          />
          <NumberScrubField
            label="Height"
            value={frame.height}
            step={16}
            onChange={(height) => onFrameChange(frame.width, height)}
          />
        </div>
        <p className="text-3xs text-muted-foreground">
          {FRAME_MIN_SIZE}–{FRAME_MAX_SIZE} px. Resizing the frame never moves a layer.
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {selectionCount > 1 ? `Align ${selectionCount} layers` : 'Align to frame'}
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

      {layer ? (
        <>
          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              Transform
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberScrubField
                label="X"
                value={layer.position.x}
                onChange={(x) => onLayerChange({ position: { ...layer.position, x } })}
              />
              <NumberScrubField
                label="Y"
                value={layer.position.y}
                onChange={(y) => onLayerChange({ position: { ...layer.position, y } })}
              />
              <NumberScrubField
                label="Scale X"
                value={layer.scale.x * 100}
                suffix="%"
                onChange={(percent) =>
                  onLayerChange({ scale: { ...layer.scale, x: percent / 100 } })
                }
              />
              <NumberScrubField
                label="Scale Y"
                value={layer.scale.y * 100}
                suffix="%"
                onChange={(percent) =>
                  onLayerChange({ scale: { ...layer.scale, y: percent / 100 } })
                }
              />
              <NumberScrubField
                label="Rotation"
                value={layer.rotation}
                suffix="°"
                onChange={(rotation) => onLayerChange({ rotation })}
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
                        aria-label="Flip horizontally"
                        onClick={() => onFlip('x')}
                      >
                        <FlipHorizontal className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>Flip horizontally (negates Scale X)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-full"
                        aria-label="Flip vertically"
                        onClick={() => onFlip('y')}
                      >
                        <FlipVertical className="h-3 w-3" />
                      </Button>
                    }
                  />
                  <TooltipContent>Flip vertically (negates Scale Y)</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              Anchor
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberScrubField
                label="Anchor X"
                value={layer.anchor.x}
                onChange={(x) => onLayerChange({ anchor: { ...layer.anchor, x } })}
              />
              <NumberScrubField
                label="Anchor Y"
                value={layer.anchor.y}
                onChange={(y) => onLayerChange({ anchor: { ...layer.anchor, y } })}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <p className="text-3xs text-muted-foreground">
                Source pixels. Rotation and scale pivot here.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 shrink-0 text-3xs"
                onClick={() =>
                  onLayerChange({
                    anchor: { x: layer.sourceWidth / 2, y: layer.sourceHeight / 2 },
                  })
                }
              >
                Centre
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              Appearance
            </h3>
            <div className="flex items-center gap-2">
              <Label className="w-14 shrink-0 text-3xs text-muted-foreground">Opacity</Label>
              <Slider
                aria-label="Opacity"
                min={0}
                max={100}
                step={1}
                value={[Math.round(layer.opacity * 100)]}
                onValueChange={([percent]) => onLayerChange({ opacity: percent / 100 })}
              />
              <span className="w-9 shrink-0 text-right text-2xs tabular-nums">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
            <Select
              value={layer.blendMode}
              onValueChange={(value) =>
                onLayerChange({ blendMode: value as LayerEditorLayer['blendMode'] })
              }
            >
              <SelectTrigger className="h-7 text-2xs" aria-label="Blend mode">
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
              Order
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
          {selectionCount > 1
            ? `${selectionCount} layers selected — alignment and ordering apply to all of them.`
            : 'Select a layer to edit its transform.'}
        </p>
      )}
    </div>
  );
}
