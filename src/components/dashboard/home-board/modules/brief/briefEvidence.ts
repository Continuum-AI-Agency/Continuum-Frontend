// What the numbered brief (R6) adds to H05: a sentence split at its citation markers, and where
// each figure was read from. The words and the figures are the read's own.

import type { HomeBriefFigure } from '@continuum/contracts';
import { goalDayLabel } from '../goals/goalModel';
import { portfolioDecisionsHref } from '../opps/oppsModel';
import { optimizerHref } from './briefModel';

export type SentencePart = { text: string } | { n: number };

/** Contracts home/reads/brief.ts: a figure is printed as `${display}[${n}]`. */
export function sentenceParts(text: string): SentencePart[] {
  const parts: SentencePart[] = [];
  let from = 0;
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    const before = text.slice(from, match.index);
    if (before) parts.push({ text: before });
    parts.push({ n: Number(match[1]) });
    from = match.index + match[0].length;
  }
  const rest = text.slice(from);
  if (rest) parts.push({ text: rest });
  return parts;
}

const SOURCE_WORDS: Record<string, string> = {
  'optimizer.account_daily_reads': 'The Optimizer’s daily read',
  'optimizer.portfolio_daily_briefs': 'The portfolio’s daily brief',
  'brand_profiles.reporting_cache': 'The account’s results, as last read from the platform',
  'brand_profiles.home_goal_targets': 'Your team’s goal target',
};

export function briefFigureSource(figure: Pick<HomeBriefFigure, 'source'>): string {
  return SOURCE_WORDS[figure.source.kind] ?? figure.source.kind;
}

/** The days a figure covers: "Nov 1 – Nov 3", "Nov 4", "Through Nov 4"; null when none is stated. */
export function briefFigureWindow(figure: Pick<HomeBriefFigure, 'source'>): string | null {
  const { since, until } = figure.source;
  if (!until) return null;
  if (!since) return `Through ${goalDayLabel(until)}`;
  return since === until ? goalDayLabel(until) : `${goalDayLabel(since)} – ${goalDayLabel(until)}`;
}

/** Where the figure can be seen in the product; null when the source has no page of its own. */
export function briefFigureHref(figure: Pick<HomeBriefFigure, 'source'>): string | null {
  const { kind, ref } = figure.source;
  if (!ref) return null;
  if (kind === 'optimizer.account_daily_reads') {
    const [adAccountId] = ref.split('|');
    return adAccountId ? optimizerHref(adAccountId) : null;
  }
  return kind === 'optimizer.portfolio_daily_briefs' ? portfolioDecisionsHref(ref) : null;
}
