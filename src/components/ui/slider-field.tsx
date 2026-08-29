'use client';

// Label, animated readout, and a filled track you can grab anywhere.
//
// Replaces the three near-identical `SliderRow`/`LabeledSlider` helpers that were
// copy-pasted into OverlayConfig, BurnInConfig and ClipInspector. Same API those had
// (label/value/min/max/step/onChange), so those call sites are an import swap; the
// readout is the one thing that changed, from a static span to a NumberFlow value.
//
// Use it only for a range a drag can actually resolve. An unbounded number, or one
// whose range needs more steps than a track has pixels, belongs in NumberScrubField.

import { cn } from '@/lib/utils';
import { fractionDigitsForStep, type NumberFlowFormat, NumberFlowValue } from './number-flow-value';
import { Slider } from './slider';

/**
 * Restyles the shared Slider into a fader: a tall filled bar instead of a hairline.
 * Kept as one named constant rather than a 900-character inline class string, and
 * applied through `data-slot` so `slider.tsx` itself is untouched and its other
 * eleven call sites keep the hairline.
 *
 * Geometry only. The thumb's focus ring is deliberately NOT overridden — the fader
 * this pattern came from clears it, which leaves the control unusable by keyboard.
 */
const FADER = [
  '**:data-[slot=slider-track]:h-7',
  '**:data-[slot=slider-track]:rounded-md',
  '**:data-[slot=slider-track]:border',
  '**:data-[slot=slider-track]:border-input',
  '**:data-[slot=slider-track]:bg-muted',
  '**:data-[slot=slider-track]:shadow-xs',
  '**:data-[slot=slider-range]:rounded-[0.3rem]',
  '**:data-[slot=slider-thumb]:h-4',
  '**:data-[slot=slider-thumb]:w-[3px]',
  '**:data-[slot=slider-thumb]:border-0',
  '**:data-[slot=slider-thumb]:bg-background',
  '**:data-[slot=slider-thumb]:shadow-none',
  '**:data-[slot=slider-thumb]:cursor-ew-resize',
].join(' ');

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  prefix,
  suffix,
  disabled,
  className,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Intl options for the readout. Defaults to the decimals the step implies. */
  format?: NumberFlowFormat;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  const readoutFormat: NumberFlowFormat = format ?? {
    minimumFractionDigits: fractionDigitsForStep(step),
    maximumFractionDigits: fractionDigitsForStep(step),
  };

  return (
    <div className={cn('flex flex-col gap-1', className)} data-slot="slider-field">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-medium text-foreground">{label}</span>
        <NumberFlowValue
          className="text-2xs text-muted-foreground"
          format={readoutFormat}
          prefix={prefix}
          suffix={suffix}
          value={value}
        />
      </div>
      <Slider
        aria-label={label}
        className={FADER}
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={(next) => {
          const first = next[0];
          if (typeof first === 'number' && Number.isFinite(first)) onChange(first);
        }}
        {...(onCommit
          ? {
              onValueCommitted: (next: number[]) => {
                const first = next[0];
                if (typeof first === 'number' && Number.isFinite(first)) onCommit(first);
              },
            }
          : {})}
      />
    </div>
  );
}
