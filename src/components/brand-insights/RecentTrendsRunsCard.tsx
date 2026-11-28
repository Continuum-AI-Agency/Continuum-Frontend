'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// Ops surface: recent Trends generations for a brand with grounding latency,
// so you can see at a glance that runs are happening and how fast grounding is.
// Reads GET /api/trends/runs/recent via fetchRecentTrendsRuns.

import type { TrendsRecentRun } from '@continuum/contracts';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fetchRecentTrendsRuns } from '@/lib/api/brandInsights.client';

type IndicatorTone = 'success' | 'error' | 'warning' | 'info';

function statusTone(status: string | null): IndicatorTone {
  switch (status) {
    case 'ok':
    case 'completed':
      return 'success';
    case 'timeout':
    case 'error':
    case 'failed':
      return 'error';
    case 'no_sources':
      return 'warning';
    default:
      return 'info';
  }
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function RecentTrendsRunsCard({ brandId, limit = 20 }: { brandId: string; limit?: number }) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('common');
  const [runs, setRuns] = useState<TrendsRecentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await fetchRecentTrendsRuns(brandId, limit));
    } catch (err) {
      setError(getUiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [brandId, limit, getUiErrorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{uiText('m_975c09676a')}</CardTitle>
        <CardDescription>{uiText('m_a4d3cd253a')}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {uiText('refresh_0e91610')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-secondary opacity-70">
            {loading ? uiText('loading_ba3bbbe') : uiText('m_af8ffa77fd')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b text-left text-secondary opacity-70">
                  <th className="py-2 pr-4 font-medium">{uiText('m_8d441fb5f6')}</th>
                  <th className="py-2 pr-4 font-medium">{uiText('status_920e413')}</th>
                  <th className="py-2 pr-4 font-medium">{uiText('total_c9b3c38')}</th>
                  <th className="py-2 pr-4 font-medium">{uiText('m_1953f23d54')}</th>
                  <th className="py-2 pr-4 font-medium">{uiText('sources_caf85b0')}</th>
                  <th className="py-2 pr-4 font-medium">{uiText('m_7ea014de7b')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.generation_id} className="border-border/50 border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">
                      {shortId(run.generation_id)}
                      {run.week_start_date ? (
                        <span className="ml-2 text-secondary opacity-60">
                          {run.week_start_date}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">
                      <Pill>
                        <PillIndicator variant={statusTone(run.grounding_status ?? run.status)} />
                        {run.grounding_status ?? run.status}
                      </Pill>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatMs(run.total_duration_ms)}</td>
                    <td className="py-2 pr-4 tabular-nums">{formatMs(run.grounding_ms)}</td>
                    <td className="py-2 pr-4 tabular-nums">{run.grounding_sources ?? '—'}</td>
                    <td className="py-2 pr-4">{run.evidence_mode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
