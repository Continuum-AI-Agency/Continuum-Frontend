// The one muted line under a portfolio's name when today's account finding is the pacing
// verdict. That candidate names EVERY flight on the account, so the row cannot print it as
// its own: three portfolios printed one "166 % over plan · purchases" between them, the
// account's drift and the account's noun on a lead portfolio and a 0-ad-set one alike
// (PP-L3-identical-pacing-block-on-every-portfolio, PP-L3-pacing-noun-from-window-kind).
// A pacing row reads its OWN latest run — the same `pacingVerdict` the portfolio page
// reads — and names the result ITS metric buys. No verdict, no line.

import type { CycleRunPacing, PortfolioListItem } from '@continuum/contracts';
import { ACCOUNT_DETECTOR_META, getOptimizationMetricDefinition } from '@continuum/contracts';
import { resultWords } from './account/overviewModel';
import { pacingVerdict } from './detail/heroModel';

export type PortfolioPacingLine = {
  /** The detector's own reading, the same words the Overview's card leads with. */
  label: string;
  /** Distance from plan in percent points, always positive; the side carries the sign. */
  pct: number;
  side: 'over' | 'under' | 'on';
  /** What this portfolio buys, plural — its own metric, never the account's. */
  noun: string;
};

export function portfolioPacingLine(
  portfolio: Pick<PortfolioListItem, 'objective' | 'target_metric'>,
  pacing: CycleRunPacing | null | undefined,
): PortfolioPacingLine | null {
  const verdict = pacingVerdict(pacing);
  if (!verdict.status || verdict.ratio == null) return null;
  const metric = getOptimizationMetricDefinition(portfolio.target_metric ?? portfolio.objective);
  const drift = Math.round((verdict.ratio - 1) * 100);
  return {
    label:
      verdict.status === 'on_track' ? 'On plan' : ACCOUNT_DETECTOR_META.account_pacing.label,
    pct: Math.abs(drift),
    side: drift > 0 ? 'over' : drift < 0 ? 'under' : 'on',
    noun: resultWords(metric.kpiField, metric.resultLabel).many,
  };
}

/** "20% over plan" / "10% under plan" / "on plan" — the words after the figure. */
export function pacingSideLabel(line: PortfolioPacingLine): string {
  return line.side === 'on' ? 'on plan' : `${line.side} plan`;
}
