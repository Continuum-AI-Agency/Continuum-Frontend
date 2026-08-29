'use client';

// An animated numeric readout. Split out of `charts/chart-stat-flow.tsx` so the
// canvas config controls and the chart stat tiles share ONE custom-element gate
// rather than two copies that drift.

import NumberFlow from '@number-flow/react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow. */
export interface NumberFlowFormat {
  notation?: 'standard' | 'compact';
  compactDisplay?: 'short' | 'long';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  minimumIntegerDigits?: number;
  minimumSignificantDigits?: number;
  maximumSignificantDigits?: number;
  style?: 'decimal' | 'percent' | 'currency';
  currency?: string;
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  unit?: string;
  unitDisplay?: 'short' | 'long' | 'narrow';
}

export function formatNumberFlowValue(
  value: number,
  formatOptions: NumberFlowFormat,
  prefix?: string,
  suffix?: string,
): string {
  return `${prefix ?? ''}${new Intl.NumberFormat(undefined, formatOptions).format(value)}${suffix ?? ''}`;
}

/**
 * `number-flow-react` is registered as a custom element on the client only. Rendering
 * it before the definition lands yields an unsized, unstyled box, so callers show
 * formatted static text until `customElements` says it is ready. Same value either
 * way — only the animation waits.
 */
export function useNumberFlowElementReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof customElements !== 'undefined' && Boolean(customElements.get('number-flow-react')),
  );

  useEffect(() => {
    // `customElements` is absent in a non-DOM environment (SSR, the test runner), and
    // the initialiser above already resolved to false there — so bail before touching it.
    if (ready || typeof customElements === 'undefined') {
      return;
    }
    let cancelled = false;
    customElements.whenDefined('number-flow-react').then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

/** Decimals implied by a step, so a 0.05 step reads "0.85" and a 1 step reads "12". */
export function fractionDigitsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || Number.isInteger(step)) return 0;
  const decimals = String(step).split('.')[1];
  return decimals ? decimals.length : 0;
}

export function NumberFlowValue({
  value,
  format,
  prefix,
  suffix,
  className,
}: {
  value: number;
  format?: NumberFlowFormat;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const formatOptions = useMemo<NumberFlowFormat>(() => format ?? {}, [format]);
  const ready = useNumberFlowElementReady();
  const staticValue = useMemo(
    () => formatNumberFlowValue(value, formatOptions, prefix, suffix),
    [value, formatOptions, prefix, suffix],
  );

  return (
    <span className={cn('tabular-nums', className)} data-slot="number-flow-value">
      {ready ? (
        <NumberFlow
          format={formatOptions}
          isolate
          prefix={prefix}
          suffix={suffix}
          value={value}
          willChange
        />
      ) : (
        staticValue
      )}
    </span>
  );
}
