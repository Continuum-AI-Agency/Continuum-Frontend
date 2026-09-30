/**
 * `weekly_report` — the Prism weekly report as one answer template: "reporte semanal",
 * "weekly report". Period A is the last complete Monday–Sunday week, Period B the month to date
 * through the end of Period A; the tiles read Period A against the week before; one section per
 * Optimizer objective the brand has portfolios for; recommendation cards from the Optimizer's
 * pending recommendations.
 *
 * What the schema holds beyond the shared shape: the `weekly_report` body is present; the
 * thesis prints at least one figure; the windows are what they claim to be (a Monday-to-Sunday
 * week, the month to its end, the week before it); every figure a period row, tile or card
 * points at was read over the window it is shown under; an objective without active campaigns
 * says so instead of carrying rows; the money is in the header's currency.
 */

import type { z } from 'zod';
import { normalizeCurrencyCode } from '../../optimization/money';
import { type AnswerTemplatePayload, type TemplateSpec, templatePayloadSchemaFor } from './core';
import { figureRefsIn, type TemplateFigure } from './figure';
import type { WeeklyReportPeriod, WeeklyReportPeriodRow } from './weekly_report_shape';

/** "Qué medimos": the reads, the windows and the timezone, stated once. */
export const WEEKLY_REPORT_SECTION_KINDS = ['measured'] as const;

const base = templatePayloadSchemaFor({
  id: 'weekly_report',
  requiredSections: WEEKLY_REPORT_SECTION_KINDS,
  heroChartKinds: null,
});

const DAY_MS = 86_400_000;
const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The problems with a Period A / Period B / prior trio, in words; empty when it holds. */
export function weeklyReportWindowProblems(windows: {
  period_a: WeeklyReportPeriod;
  period_b: WeeklyReportPeriod;
  prior_a: WeeklyReportPeriod;
}): string[] {
  const { period_a: a, period_b: b, prior_a: prior } = windows;
  const problems: string[] = [];
  const aSince = dayOf(a.since);
  if (new Date(aSince).getUTCDay() !== 1) problems.push(`period_a starts ${a.since}, not a Monday`);
  if (a.until !== isoOf(aSince + 6 * DAY_MS)) {
    problems.push(`period_a ends ${a.until}, not the Sunday after ${a.since}`);
  }
  if (b.until !== a.until) problems.push(`period_b ends ${b.until}, not where period_a ends`);
  if (b.since !== `${a.until.slice(0, 7)}-01`) {
    problems.push(`period_b starts ${b.since}, not the first of ${a.until.slice(0, 7)}`);
  }
  if (prior.since !== isoOf(aSince - 7 * DAY_MS) || prior.until !== isoOf(aSince - DAY_MS)) {
    problems.push(`prior_a is ${prior.since}..${prior.until}, not the week before period_a`);
  }
  return problems;
}

const sameWindow = (figure: TemplateFigure | undefined, period: WeeklyReportPeriod): boolean =>
  figure !== undefined &&
  figure.window.since === period.since &&
  figure.window.until === period.until;

export const weeklyReportPayloadSchema: z.ZodType<AnswerTemplatePayload> = base.superRefine(
  (payload, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });

    if (figureRefsIn(payload.executive.sentence).length === 0) {
      issue(['executive', 'sentence'], 'the weekly thesis prints at least one figure');
    }
    const body = payload.weekly_report;
    if (body === null) {
      issue(['weekly_report'], 'weekly_report needs its body');
      return;
    }
    const { header } = body;
    for (const problem of weeklyReportWindowProblems(header))
      issue(['weekly_report', 'header'], problem);

    const byId = new Map(payload.figures.map((figure) => [figure.id, figure]));

    const headerCurrency = normalizeCurrencyCode(header.currency);
    for (const figure of payload.figures) {
      if (figure.unit === 'money' && normalizeCurrencyCode(figure.currency) !== headerCurrency) {
        issue(['figures'], `figure "${figure.id}" is not in the header's currency`);
      }
    }

    body.tiles.forEach((tile, index) => {
      if (!sameWindow(byId.get(tile.figure_id), header.period_a)) {
        issue(['weekly_report', 'tiles', index], `tile "${tile.id}" is not read over period_a`);
      }
      if (tile.prior_figure_id === null) {
        if (tile.read !== 'sin_comparacion') {
          issue(['weekly_report', 'tiles', index], `tile "${tile.id}" reads without a prior`);
        }
      } else if (!sameWindow(byId.get(tile.prior_figure_id), header.prior_a)) {
        issue(
          ['weekly_report', 'tiles', index],
          `tile "${tile.id}" prior is not read over prior_a`,
        );
      }
    });

    const rowWindowProblems = (row: WeeklyReportPeriodRow, period: WeeklyReportPeriod): string[] =>
      [row.spend, row.results, row.cost_per_result, row.delta_vs_target]
        .filter((ref): ref is string => ref !== null)
        .filter((ref) => !sameWindow(byId.get(ref), period))
        .map((ref) => `"${ref}" is not read over ${period.since}..${period.until}`);

    const objectives = new Set<string>();
    body.objectives.forEach((section, index) => {
      const path = ['weekly_report', 'objectives', index];
      if (objectives.has(section.objective)) issue(path, `objective "${section.objective}" twice`);
      objectives.add(section.objective);
      if (section.active) {
        if (section.period_a === null || section.period_b === null) {
          issue(path, `active objective "${section.objective}" needs both period rows`);
          return;
        }
        for (const problem of [
          ...rowWindowProblems(section.period_a, header.period_a),
          ...rowWindowProblems(section.period_b, header.period_b),
        ]) {
          issue(path, problem);
        }
      } else {
        if (section.no_active_note === null) {
          issue(path, `objective "${section.objective}" has no active campaigns and must say so`);
        }
        if (section.period_a !== null || section.period_b !== null) {
          issue(path, `objective "${section.objective}" has no active campaigns but carries rows`);
        }
      }
    });

    const cards = new Set<string>();
    body.recommendations.forEach((card, index) => {
      const path = ['weekly_report', 'recommendations', index];
      if (cards.has(card.id)) issue(path, `recommendation "${card.id}" twice`);
      cards.add(card.id);
      const first = byId.get(card.why.figure_ids[0]);
      if (
        first &&
        (first.source.tool !== card.why.source.tool ||
          first.window.since !== card.why.source.window.since ||
          first.window.until !== card.why.source.window.until)
      ) {
        issue(path, `recommendation "${card.id}" states a source its figure was not read from`);
      }
    });
  },
);

export const weeklyReportSpec: TemplateSpec = {
  id: 'weekly_report',
  title: 'Reporte semanal',
  requiredSections: WEEKLY_REPORT_SECTION_KINDS,
  heroChartKinds: null,
  payloadSchema: weeklyReportPayloadSchema,
};
