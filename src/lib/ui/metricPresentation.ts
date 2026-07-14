export type MetricPresentationState =
  | 'loading'
  | 'not_connected'
  | 'no_data'
  | 'ready'
  | 'error';

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

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function resolveMetricPresentation({
  connected,
  loading = false,
  failed = false,
  total,
  deltaPct,
}: ResolveMetricPresentationInput): MetricPresentation {
  if (!connected) return { state: 'not_connected', value: 'Not connected' };
  if (loading) return { state: 'loading', value: 'Loading' };
  if (failed) return { state: 'error', value: 'Unavailable' };
  if (total === undefined || !Number.isFinite(total)) {
    return { state: 'no_data', value: 'No data yet' };
  }
  return {
    state: 'ready',
    value: formatCompact(total),
    ...(typeof deltaPct === 'number' && Number.isFinite(deltaPct) ? { deltaPct } : {}),
  };
}
