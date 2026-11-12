import type { UiLocale } from '@/i18n/config';
export type MetricPresentationState = 'loading' | 'not_connected' | 'no_data' | 'ready' | 'error';

export type MetricPresentation = {
  state: MetricPresentationState;
  value: string;
  deltaPct?: number;
};

type ResolveMetricPresentationInput = {
  connected: boolean;
  loading?: boolean;
  failed?: boolean;
  total?: number;
  deltaPct?: number;
};

function formatCompact(value: number, locale: UiLocale): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function resolveMetricPresentation(
  { connected, loading = false, failed = false, total, deltaPct }: ResolveMetricPresentationInput,
  {
    locale = 'en',
    translateState,
  }: {
    locale?: UiLocale;
    translateState?: (state: Exclude<MetricPresentationState, 'ready'>) => string;
  } = {},
): MetricPresentation {
  if (!connected)
    return {
      state: 'not_connected',
      value: translateState ? translateState('not_connected') : 'Not connected',
    };
  if (loading)
    return { state: 'loading', value: translateState ? translateState('loading') : 'Loading' };
  if (failed)
    return { state: 'error', value: translateState ? translateState('error') : 'Unavailable' };
  if (total === undefined || !Number.isFinite(total)) {
    return { state: 'no_data', value: translateState ? translateState('no_data') : 'No data yet' };
  }
  return {
    state: 'ready',
    value: formatCompact(total, locale),
    ...(typeof deltaPct === 'number' && Number.isFinite(deltaPct) ? { deltaPct } : {}),
  };
}
