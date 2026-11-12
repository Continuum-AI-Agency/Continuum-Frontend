'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo as useUiConfigMemo } from 'react';
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
function useLocalAmountEffectsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value = [
      { field: 'vignette', label: translateConfig('vignette_f841c208') },
      { field: 'filmGrain', label: translateConfig('film_grain_3dea292f') },
      { field: 'dust', label: translateConfig('dust_75372bcd') },
      { field: 'lightLeaks', label: translateConfig('light_leaks_9e9dd88b') },
      {
        field: 'chromaticAberration',
        label: translateConfig('chromatic_aberration_07002d54'),
      },
      { field: 'vhs', label: 'VHS' },
    ] as const;
    return value;
  }, [translateConfig]);
}

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
  const AMOUNT_EFFECTS = useLocalAmountEffectsMessages();

  const translateUi = useUiTranslations('studio');

  const chromaKey = effects.chromaKey;
  const tint = effects.tint;
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-shader-effects`}>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-chroma`} className="text-2xs">
          {' '}
          {translateUi('chroma_key_34faa6ec')}{' '}
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
            label={translateUi('key_colour_a6371002')}
            value={chromaKey.color}
            onChange={(color) => onChange({ chromaKey: { ...chromaKey, color } })}
          />
          <SliderField
            label={translateUi('tolerance_f71041bb')}
            value={chromaKey.tolerance}
            min={0}
            max={1}
            step={0.01}
            onChange={(tolerance) => onChange({ chromaKey: { ...chromaKey, tolerance } })}
          />
          <SliderField
            label={translateUi('softness_64a30875')}
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
        label={translateUi('tint_colour_1dd899e8')}
        value={tint?.color ?? TINT_DEFAULT_COLOR}
        onChange={(color) => onChange({ tint: { color, amount: tint?.amount ?? 0.5 } })}
      />
      <SliderField
        label={translateUi('tint_6a822da0')}
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
        label={translateUi('pixelate_f4982f86')}
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
