'use client';

import { Label } from '@/components/ui/label';
import { SliderField } from '@/components/ui/slider-field';
import { Switch } from '@/components/ui/switch';
import type { ClipEffectSpec } from '../utils/render/effectSpec';

const CHROMA_KEY_DEFAULT: NonNullable<ClipEffectSpec['chromaKey']> = {
  color: '#00ff00',
  tolerance: 0.35,
  softness: 0.1,
};
const TINT_DEFAULT_COLOR = '#ff8a3d';
const AMOUNT_EFFECTS = [
  { field: 'vignette', label: 'Vignette' },
  { field: 'filmGrain', label: 'Film grain' },
  { field: 'chromaticAberration', label: 'Chromatic aberration' },
  { field: 'vhs', label: 'VHS' },
] as const;

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

export function ShaderEffectControls({
  idPrefix,
  effects,
  onChange,
}: {
  idPrefix: string;
  effects: ClipEffectSpec;
  onChange: (patch: Partial<ClipEffectSpec>) => void;
}) {
  const chromaKey = effects.chromaKey;
  const tint = effects.tint;
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-shader-effects`}>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-chroma`} className="text-2xs">
          Chroma key
        </Label>
        <Switch
          id={`${idPrefix}-chroma`}
          checked={Boolean(chromaKey)}
          onCheckedChange={(checked) =>
            onChange({ chromaKey: checked ? CHROMA_KEY_DEFAULT : undefined })
          }
        />
      </div>
      {chromaKey ? (
        <>
          <ColorRow
            id={`${idPrefix}-chroma-color`}
            label="Key colour"
            value={chromaKey.color}
            onChange={(color) => onChange({ chromaKey: { ...chromaKey, color } })}
          />
          <SliderField
            label="Tolerance"
            value={chromaKey.tolerance}
            min={0}
            max={1}
            step={0.01}
            onChange={(tolerance) => onChange({ chromaKey: { ...chromaKey, tolerance } })}
          />
          <SliderField
            label="Softness"
            value={chromaKey.softness}
            min={0}
            max={1}
            step={0.01}
            onChange={(softness) => onChange({ chromaKey: { ...chromaKey, softness } })}
          />
        </>
      ) : null}
      <ColorRow
        id={`${idPrefix}-tint-color`}
        label="Tint colour"
        value={tint?.color ?? TINT_DEFAULT_COLOR}
        onChange={(color) => onChange({ tint: { color, amount: tint?.amount ?? 0.5 } })}
      />
      <SliderField
        label="Tint"
        value={tint?.amount ?? 0}
        min={0}
        max={1}
        step={0.05}
        onChange={(amount) =>
          onChange({
            tint: amount > 0 ? { color: tint?.color ?? TINT_DEFAULT_COLOR, amount } : undefined,
          })
        }
      />
      {AMOUNT_EFFECTS.map(({ field, label }) => (
        <SliderField
          key={field}
          label={label}
          value={effects[field]?.amount ?? 0}
          min={0}
          max={1}
          step={0.05}
          onChange={(amount) => onChange({ [field]: amount > 0 ? { amount } : undefined })}
        />
      ))}
      <SliderField
        label="Pixelate"
        value={effects.pixelate?.blockPx ?? 0}
        min={0}
        max={64}
        step={2}
        suffix="px"
        onChange={(blockPx) => onChange({ pixelate: blockPx >= 2 ? { blockPx } : undefined })}
      />
    </div>
  );
}
