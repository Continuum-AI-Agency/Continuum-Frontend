'use client';

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
  const [runs, setRuns] = useState<TrendsRecentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRuns(await fetchRecentTrendsRuns(brandId, limit));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recent runs.');
    } finally {
      setLoading(false);
    }
  }, [brandId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Trends runs</CardTitle>
        <CardDescription>Grounding latency and evidence status per generation.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-secondary opacity-70">
            {loading ? 'Loading…' : 'No recent runs.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b text-left text-secondary opacity-70">
                  <th className="py-2 pr-4 font-medium">Generation</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Grounding</th>
                  <th className="py-2 pr-4 font-medium">Sources</th>
                  <th className="py-2 pr-4 font-medium">Evidence</th>
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
