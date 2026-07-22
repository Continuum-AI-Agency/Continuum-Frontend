'use client';

import { useEffect, useMemo, useState } from 'react';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchPaidAccountOverview,
  type PaidAccountOverview,
} from '@/lib/paid-media/paid-overview.client';
import { buildPaidStatCards } from '@/lib/paid-media/paid-stat-cards';

const RANGE = { preset: 'last_7d' } as const;

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; overview: PaidAccountOverview };

// The headline KPIs for the paid dashboard — spend, ROAS, and CTR over the last 7
// days with deltas — rendered as a quiet inline strip under the Overview header.
// Sourced from the paid account-overview edge scope.
export function PaidMetricStrip({
  brandId,
  adAccountId,
}: {
  brandId: string;
  adAccountId: string | null;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    fetchPaidAccountOverview({ brandId, adAccountId, platform: 'meta', range: RANGE })
      .then((overview) => {
        if (!cancelled) setState({ status: 'success', overview });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, adAccountId]);

  const items = useMemo<MetricStripItem[]>(() => {
    if (state.status !== 'success') return [];
    return buildPaidStatCards(state.overview).map((card) => ({
      label: card.label,
      value: card.value,
      deltaPct: card.deltaPct,
    }));
  }, [state]);

  if (state.status === 'idle' || state.status === 'error') return null;
  if (state.status === 'loading') return <Skeleton className="h-4 w-72" />;

  return <MetricStrip items={items} live />;
}
