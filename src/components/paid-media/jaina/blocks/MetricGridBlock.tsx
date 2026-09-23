'use client';

import { paidCurrencyCodeSchema } from '@continuum/contracts';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { formatValue, resolveMetricDisplayFormat } from '@/lib/jaina/formatValue';
import type { MetricGridBlockV2, MetricItemV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import {
  explicitSeverity,
  fallsAreGood,
  JUDGEMENT_LABEL,
  JUDGEMENT_TEXT,
  type Judgement,
  judgeValue,
} from '../reading';
import { EvidenceTooltip } from './EvidenceTooltip';

type MetricGridBlockProps = { block: MetricGridBlockV2; isStreaming: boolean };

// Maps a report metric's signed change onto a delta whose direction comes from the sign.
// A "down" change is rendered as a negative delta.
function resolveDeltaPct(metric: MetricItemV2): number | undefined {
  if (metric.change === null || metric.change === undefined) return undefined;
  return metric.change_direction === 'down' ? -Math.abs(metric.change) : Math.abs(metric.change);
}

type Figure = {
  label: string;
  value: string;
  deltaPct: number | undefined;
  goodWhenDown: boolean;
  judgement: Judgement;
};

function toFigure(metric: MetricItemV2, composed: boolean): Figure {
  const displayFormat = resolveMetricDisplayFormat({
    label: metric.label,
    format: metric.format,
    unit: metric.unit,
  });
  const currency = paidCurrencyCodeSchema.safeParse(metric.unit);
  return {
    label: metric.label,
    value:
      displayFormat === 'currency' && !currency.success
        ? `${formatValue(metric.value, 'number')} (currency unknown)`
        : formatValue(metric.value, displayFormat, {
            ...(currency.success ? { currency: currency.data } : {}),
            percentBasis: metric.percent_basis ?? null,
          }),
    deltaPct: resolveDeltaPct(metric),
    goodWhenDown: fallsAreGood(metric.label),
    // The contract has carried `severity` with four values all along and this block threw it
    // away. It is the model's own judgement of the figure; nothing downstream is entitled to
    // re-derive it — WHEN a model wrote it. On a composed grid nobody did: see `composed`.
    judgement: judgeValue(composed ? explicitSeverity(metric.severity) : metric.severity),
  };
}

/**
 * The headline figures of a report, as a grid a reader can scan down.
 *
 * This used to render through the app-wide `MetricStrip`: one inline row of
 * `LABEL value · LABEL value · …` that wrapped. That form is right for a dense status bar
 * over a live panel, and wrong here — the real reports this block receives carry four to
 * seven metrics with sentence-length labels ("Cañadas LKL Best Cost / Conv."), and wrapped
 * into a paragraph of interleaved words and digits they are exactly the undifferentiated
 * run of text the reader was complaining about. A grid gives every figure the same column
 * position, so the eye can fall down the values instead of hunting them out of prose.
 *
 * Colour is unchanged in meaning and still comes from `reading.ts` alone: the value carries
 * the model's `severity`, the delta carries `judgeDelta` through `DeltaBadge` with the
 * metric's polarity, and a figure nobody judged stays in the ink colour.
 */
export default function MetricGridBlock({ block }: MetricGridBlockProps) {
  // `dataset_id` is the witness that no model saw these figures.
  //
  // A grid carrying one was built by `materializeMetricGridBlock` from a registered
  // `scalar_group` dataset — values verbatim from tool output, which is deliberate and
  // right (model-typed grid values are how a "1-12 Julio" grid once carried 30-day totals).
  // But that same function writes `severity: 'neutral' as const` and `change: null` on EVERY
  // metric, and the Phase B instruction forbids the model from emitting this category at all
  // when the registry composes it. So `neutral` here is a literal in composer code, not a
  // reading — and by this module's own law, painting it in ink asserts "we looked and it is
  // normal" about a figure nobody looked at.
  //
  // Measured on a live strategy turn (2026-09-21, `jaina:report:blocks:e2e:bench`): seven
  // composed figures, seven `neutral`s, zero deltas — including a ROAS of 0.84 that the same
  // report's insight block called a `risk` two blocks below. Reading them as `unjudged`
  // (muted, "nobody judged this") is the only true statement available here.
  //
  // A MODEL-AUTHORED grid — `dataset_id` null, which is every turn whose registry holds no
  // scalar_group — is untouched: its `neutral` is a judgement and keeps the ink.
  //
  // The durable fix is upstream and outside this component: the composer should leave
  // `severity` unset, and `metricItemSchema.severity` should stop defaulting to `'neutral'`
  // so "unjudged" is expressible on the wire at all.
  const composed = typeof block.dataset_id === 'string' && block.dataset_id.length > 0;
  const figures = block.metrics.map((metric) => toFigure(metric, composed));
  if (figures.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
        <EvidenceTooltip
          provenance={block.provenance}
          datasetId={block.dataset_id}
          evidenceRefs={block.evidence_refs}
        />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-px overflow-hidden rounded-lg border border-border/60 bg-border/40">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col gap-1 bg-background px-3 py-2.5">
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
              {figure.label}
            </dt>
            <dd className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'font-mono text-lg font-semibold tabular-nums',
                  JUDGEMENT_TEXT[figure.judgement],
                )}
                // The colour is the judgement, and a screen reader cannot see it.
                title={`${figure.label}: ${JUDGEMENT_LABEL[figure.judgement]}`}
              >
                {figure.value}
              </span>
              {typeof figure.deltaPct === 'number' ? (
                <DeltaBadge goodWhenDown={figure.goodWhenDown} value={figure.deltaPct} />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
