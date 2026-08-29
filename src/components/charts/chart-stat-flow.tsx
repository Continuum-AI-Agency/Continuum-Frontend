'use client';

import type { ReactNode } from 'react';

import { type NumberFlowFormat, NumberFlowValue } from '@/components/ui/number-flow-value';
import { cn } from '@/lib/utils';

/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow */
export type ChartStatFlowFormat = NumberFlowFormat;

export const defaultChartStatFlowFormat: ChartStatFlowFormat = {
  notation: 'standard',
  maximumFractionDigits: 0,
};

export interface ChartStatFlowProps {
  value: number;
  label: string;
  formatOptions?: ChartStatFlowFormat;
  prefix?: string;
  suffix?: string;
  valueClassName?: string;
  labelClassName?: string;
  icon?: ReactNode;
}

/**
 * Shared value + label stack using NumberFlow (same layout as pie / ring centers).
 * Parent should provide flex alignment and sizing when needed.
 */
export function ChartStatFlow({
  value,
  label,
  formatOptions = defaultChartStatFlowFormat,
  prefix,
  suffix,
  valueClassName = 'text-2xl font-bold',
  labelClassName = 'text-xs',
  icon,
}: ChartStatFlowProps) {
  return (
    <>
      {icon ? (
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
      ) : null}
      <NumberFlowValue
        className={cn('text-foreground', valueClassName)}
        format={formatOptions}
        prefix={prefix}
        suffix={suffix}
        value={value}
      />
      <span className={cn('mt-0.5 text-chart-label', labelClassName)}>{label}</span>
    </>
  );
}

ChartStatFlow.displayName = 'ChartStatFlow';
