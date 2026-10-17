'use client';

import { useEffect, useMemo, useState } from 'react';
import { figureProps } from '@/components/paid-media/optimizer/format';
import { MetricStrip, type MetricStripItem } from '@/components/shared/MetricStrip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchPaidAccountOverview,
  type PaidAccountOverview,
} from '@/lib/paid-media/paid-overview.client';
import { buildPaidStatCards } from '@/lib/paid-media/paid-stat-cards';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'success'; overview: PaidAccountOverview };

// The headline KPIs for the paid dashboard — spend, ROAS, and CTR over the last 7
// complete days with deltas — rendered as a quiet inline strip under the Overview header.
// Sourced from the paid account-overview edge scope.
export function PaidMetricStrip({
  brandId,
  adAccountId,
  accountCurrency = null,
}: {
  brandId: string;
  adAccountId: string | null;
  /** The account record's currency (what the Optimizer knows); the payload's own wins. */
  accountCurrency?: string | null;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!adAccountId) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    // The seven complete days ending yesterday, as an explicit range: the edge's own `last_7d`
    // is eight days with today half-written (PP-L3-last-7d-asks-eight-days-including-today).
    fetchPaidAccountOverview({ brandId, adAccountId, platform: 'meta', range: lastCompleteDays(7) })
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

  // Money carries provenance (raw, currency, the 7-day window) on the node that prints it, the
  // way the Optimizer's figures do, so the L3 bench can grade the strip against its payload.
  // ROAS and CTR print to the decimals a reader needs and are not stamped: the figure contract
  // formats a percent to whole points.
  const items = useMemo<MetricStripItem[]>(() => {
    if (state.status !== 'success') return [];
    return buildPaidStatCards(state.overview, accountCurrency).map((card) => ({
      label: card.label,
      value: card.value,
      deltaPct: card.deltaPct,
      figure:
        card.unit === 'currency'
          ? figureProps(`home.strip.${card.id}`, card.raw, card.currency, 'd7', 'currency')
          : undefined,
    }));
  }, [state, accountCurrency]);

  if (state.status === 'idle' || state.status === 'error') return null;
  if (state.status === 'loading') return <Skeleton className="h-4 w-72" />;

  return <MetricStrip items={items} live />;
}
