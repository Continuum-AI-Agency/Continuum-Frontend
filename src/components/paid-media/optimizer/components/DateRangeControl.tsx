'use client';

// The dashboard's range picker: trailing presets, the portfolio's flight, or a custom
// window. Writes a RangeSpec; the caller resolves it (rangeModel) and threads the
// resolved dates into every panel, so there is exactly one period on screen.

import { CalendarRangeIcon } from 'lucide-react';
import { DateRangeField } from '@/components/shared/DateRangeField';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  RANGE_PRESET_LABEL,
  RANGE_PRESETS,
  type RangePreset,
  type RangeSpec,
} from '../sections/detail/rangeModel';

type DateRangeControlProps = {
  value: RangeSpec;
  onChange: (next: RangeSpec) => void;
  /** Without a flight the Flight preset is hidden rather than offered and refused. */
  hasFlight: boolean;
  className?: string;
};

export function DateRangeControl({ value, onChange, hasFlight, className }: DateRangeControlProps) {
  const presets = RANGE_PRESETS.filter((preset) => preset !== 'flight' || hasFlight);
  const activePreset = value.kind === 'preset' ? value.preset : null;
  const custom = value.kind === 'custom' ? { from: value.from, to: value.to } : null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <ToggleGroup
        aria-label="Reporting range"
        onValueChange={(next) => {
          if (next) onChange({ kind: 'preset', preset: next as RangePreset });
        }}
        size="sm"
        type="single"
        value={activePreset ?? ''}
        variant="outline"
      >
        {presets.map((preset) => (
          <ToggleGroupItem className="h-7 px-2 text-2xs" key={preset} value={preset}>
            {RANGE_PRESET_LABEL[preset]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border border-border/70 px-1.5 text-2xs',
          custom ? 'border-primary/50 text-foreground' : 'text-muted-foreground',
        )}
      >
        <CalendarRangeIcon aria-hidden className="size-3.5" />
        <DateRangeField
          className="h-6 border-0 px-1 text-2xs shadow-none"
          clearable={false}
          id="optimizer-range-custom"
          onChange={(next) => {
            if (next.from && next.to) onChange({ kind: 'custom', from: next.from, to: next.to });
          }}
          placeholder="Custom"
          value={custom ?? { from: null, to: null }}
        />
      </div>
    </div>
  );
}
