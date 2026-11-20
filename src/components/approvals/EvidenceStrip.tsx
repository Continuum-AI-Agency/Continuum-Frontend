'use client';
import { useLocale, useTranslations } from 'next-intl';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useApprovalFormatters } from './formatters';

const PRIMARY_ORDER = [
  'roas',
  'account_avg_roas',
  'spend',
  'impressions',
  'ctr',
  'cpc',
  'cpm',
  'clicks',
];

const getMETRIC_HINTS = (
  tUi: ReturnType<typeof useTranslations<'common'>>,
): Record<string, string> => ({
  roas: tUi('m_bb6795fa39'),
  account_avg_roas: tUi('m_4c8df4be05'),
  spend: tUi('m_d0f63db13b'),
  impressions: tUi('m_0a850913b5'),
  clicks: tUi('m_9588cf3b00'),
  ctr: tUi('m_314997e737'),
  cpc: tUi('m_5737c839fb'),
  cpm: tUi('m_27dfacc0a9'),
});

// Pairs of [actual, threshold] — for each pair we render a delta chip on the threshold tile
// so the reviewer can read "value vs benchmark" without doing math.
const DELTA_PAIRS: Array<[actual: string, benchmark: string]> = [['roas', 'account_avg_roas']];

type Props = {
  facts: Record<string, unknown> | null | undefined;
  className?: string;
};

export function EvidenceStrip({ facts, className }: Props) {
  const { formatMetric, metricLabel } = useApprovalFormatters();
  const tUi = useTranslations('common');
  const uiLocale = useLocale();
  const METRIC_HINTS = getMETRIC_HINTS(tUi);

  const numericFacts = toNumericFacts(facts);

  if (Object.keys(numericFacts).length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground',
          className,
        )}
      >
        {tUi('m_c3d9cc7646')}
      </div>
    );
  }

  const entries = orderEntries(numericFacts);
  const deltas = computeDeltas(numericFacts, tUi, uiLocale);

  return (
    <TooltipProvider delay={200}>
      <div
        className={cn(
          'grid grid-flow-col auto-cols-[minmax(7rem,1fr)] gap-px overflow-x-auto rounded-md border border-border bg-border',
          className,
        )}
      >
        {entries.map(([key, value]) => {
          const delta = deltas[key];
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <div className="flex flex-col items-start gap-1 bg-card px-3 py-2 transition-colors hover:bg-accent/40">
                    <span className="flex items-center justify-between gap-2 self-stretch text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                      <span className="truncate">{metricLabel(key)}</span>
                      {delta ? (
                        <span
                          className={cn(
                            'rounded-sm px-1 py-px font-data text-3xs tabular-nums',
                            delta.direction === 'down' && 'bg-destructive/10 text-destructive',
                            delta.direction === 'up' &&
                              'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                            delta.direction === 'flat' && 'text-muted-foreground',
                          )}
                        >
                          {delta.label}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-data text-base tabular-nums text-foreground">
                      {formatMetric(key, value)}
                    </span>
                  </div>
                }
              />
              {METRIC_HINTS[key] ? (
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {METRIC_HINTS[key]}
                </TooltipContent>
              ) : null}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function toNumericFacts(facts: Record<string, unknown> | null | undefined): Record<string, number> {
  if (!facts) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) out[key] = parsed;
    }
  }
  return out;
}

function orderEntries(facts: Record<string, number>): Array<[string, number]> {
  const known = PRIMARY_ORDER.filter((key) => key in facts).map(
    (key) => [key, facts[key]] as [string, number],
  );
  const extras = Object.entries(facts).filter(([key]) => !PRIMARY_ORDER.includes(key));
  return [...known, ...extras];
}

type Delta = { label: string; direction: 'up' | 'down' | 'flat' };

function computeDeltas(
  facts: Record<string, number>,
  t: ReturnType<typeof useTranslations<'common'>>,
  locale: string,
): Record<string, Delta> {
  const out: Record<string, Delta> = {};
  for (const [actualKey, benchmarkKey] of DELTA_PAIRS) {
    const actual = facts[actualKey];
    const benchmark = facts[benchmarkKey];
    if (!Number.isFinite(actual) || !Number.isFinite(benchmark) || benchmark === 0) continue;
    const ratio = (actual - benchmark) / Math.abs(benchmark);
    const pct = Math.round(ratio * 100);
    if (pct === 0) {
      // Annotate the actual tile so the reviewer sees the comparison immediately.
      out[actualKey] = { label: t('m_3d35c75467'), direction: 'flat' };
      continue;
    }
    out[actualKey] = {
      label: t('m_644defb39b', {
        value: new Intl.NumberFormat(locale, {
          style: 'percent',
          signDisplay: 'exceptZero',
          maximumFractionDigits: 0,
        }).format(ratio),
      }),
      direction: pct < 0 ? 'down' : 'up',
    };
  }
  return out;
}
