// Presentation adapters shared by the tiles and the independent live-read bench.
import type { HomeCreativeSpotlightData, HomeCreativeVerdict } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';
import { formatFigure } from '@/lib/home/format';
import type { HomeDot } from './HomeDots';
import type { OvernightRow } from './modules/autopilot/overnightModel';
import type { ChecklistPortfolio } from './modules/checklist/checklistModel';
import type { CreativeSpotlight } from './modules/creative/creativeModel';
import {
  spotlightAgeLine,
  spotlightHookLine,
  spotlightName,
  spotlightSpendLine,
} from './modules/creative/spotlightRead';
import { STANDING_LABEL_KEYS } from './modules/creative/standingLabel';
import { type GoalTileView, goalDayLabel, goalWindowLabel } from './modules/goals/goalModel';
import type { DoctorCheck } from './modules/health/doctorModel';
import { type WaitingPortfolio, waitingLineIn } from './modules/opps/oppsModel';
import type { OrganicWeek } from './modules/organic/organicWeekModel';

type DashboardText = ReturnType<typeof useTranslations<'dashboard'>>;

/** The recorded verdicts in the plot's lane order, as catalog keys. */
export const SPOTLIGHT_VERDICT_KEYS = {
  winner: 'winner_105dc74',
  steady: 'steady_b3ee96c',
  new: 'new_18fdd54',
  fading: 'fading_371684b',
} as const satisfies Record<HomeCreativeVerdict, string>;

export function goalDotItems(
  view: Extract<GoalTileView, { state: 'ready' }>,
  uiText: DashboardText,
): HomeDot[] {
  const { headline, primary } = view;
  return headline.series
    .map(
      (value, index): HomeDot => ({
        id: headline.seriesDates?.[index] ?? String(index),
        label: headline.seriesDates?.[index]
          ? goalDayLabel(headline.seriesDates[index])
          : uiText('reported_observation_index_cc5bf87', { index: index + 1 }),
        value: formatFigure(value, primary.unit, headline.currency),
        number: value,
        x: headline.seriesDates?.[index]
          ? Date.parse(`${headline.seriesDates[index]}T00:00:00Z`)
          : undefined,
        period: goalWindowLabel(view.figureWindow),
        detail: `${primary.objective.label}${headline.currency ? ` · ${headline.currency}` : ''}`,
      }),
    )
    .slice(-7);
}

export function healthDotItems(checks: readonly DoctorCheck[], uiText: DashboardText): HomeDot[] {
  const order = { attention: 0, positive: 1, unknown: 2, neutral: 3 };
  return checks
    .map(
      (check): HomeDot => ({
        id: check.id,
        label: check.label,
        value:
          check.status === 'unreadable'
            ? uiText('not_read_63977a3')
            : check.status === 'loading'
              ? uiText('loading_dc38088')
              : check.status === 'pass'
                ? uiText('passing_83e6fba')
                : uiText('needs_attention_c1ebc78'),
        detail: check.detail,
        period: uiText('account_checks_71d9f14'),
        group:
          check.status === 'pass'
            ? uiText('passing_83e6fba')
            : check.status === 'fail'
              ? uiText('needs_attention_c1ebc78')
              : uiText('not_read_63977a3'),
        tone:
          check.status === 'pass' ? 'positive' : check.status === 'fail' ? 'attention' : 'unknown',
      }),
    )
    .sort((a, b) => order[a.tone ?? 'neutral'] - order[b.tone ?? 'neutral']);
}

export function spotlightDotItems(
  data: HomeCreativeSpotlightData,
  uiText: DashboardText,
): HomeDot[] {
  return data.ads.map((ad) => ({
    id: ad.adId,
    label: spotlightName(ad),
    value: uiText(SPOTLIGHT_VERDICT_KEYS[ad.verdict]),
    group: uiText(SPOTLIGHT_VERDICT_KEYS[ad.verdict]),
    x: ad.spendShare,
    period: uiText('window_reporting_window_9960783', { window: data.window }),
    freshness: spotlightAgeLine(data),
    detail: `${spotlightSpendLine(ad)} · ${spotlightHookLine(ad)} · ${ad.verdictWhy}`,
    tone: ad.verdict === 'fading' ? 'attention' : ad.verdict === 'winner' ? 'positive' : 'neutral',
  }));
}

export function creativeDotItems(spotlight: CreativeSpotlight, uiText: DashboardText): HomeDot[] {
  return spotlight.cards.map((card) => ({
    id: card.adId,
    label: card.adName,
    value: uiText(STANDING_LABEL_KEYS[card.standing]),
    group: uiText(STANDING_LABEL_KEYS[card.standing]),
    period: uiText('stored_creative_report_2e58b0c'),
    detail: [card.reason, card.cost, card.vsCohort].filter(Boolean).join(' · '),
    tone:
      card.standing === 'losing' || card.standing === 'iterate'
        ? 'attention'
        : card.standing === 'early'
          ? 'unknown'
          : 'positive',
  }));
}

export function opportunityDotItems(
  portfolios: readonly WaitingPortfolio[],
  uiText: DashboardText,
): HomeDot[] {
  return portfolios.map((entry) => ({
    id: entry.id,
    label: entry.name,
    value: waitingLineIn(entry, uiText),
    tone: 'attention',
    detail: uiText('current_portfolio_decision_queue_9338c82'),
    period: uiText('current_queue_d6be95d'),
  }));
}

export function checklistDotItems(
  portfolios: readonly ChecklistPortfolio[],
  uiText: DashboardText,
): HomeDot[] {
  return portfolios.map((entry) => ({
    id: entry.id,
    label: entry.name,
    value: uiText('count_open_63e9013', { count: entry.open }),
    tone: entry.open > 0 ? 'attention' : 'positive',
    detail: uiText('current_portfolio_recommendations_for_the_cli_f75d0f3'),
    period: uiText('current_queue_d6be95d'),
  }));
}

export function overnightDotItems(rows: readonly OvernightRow[], uiText: DashboardText): HomeDot[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.change,
    value: row.outcome.label,
    detail: `${row.ts} · ${row.actor}${row.why ? ` · ${row.why}` : ''}`,
    period: uiText('last_24_hours_5c37cf8'),
    freshness: uiText('recorded_time_cfc8f6c', { time: row.ts }),
    tone:
      row.outcome.kind === 'applied'
        ? 'positive'
        : row.outcome.kind === 'failed' || row.outcome.kind === 'unconfirmed'
          ? 'attention'
          : row.outcome.kind === 'sent'
            ? 'unknown'
            : 'neutral',
  }));
}

export function organicDotItems(week: OrganicWeek, uiText: DashboardText): HomeDot[] {
  return week.days.flatMap((day, index) => [
    ...day.published.map(
      (post): HomeDot => ({
        id: `${day.dayId}:published:${post.id}`,
        label: `${day.dateLabel} · ${post.title}`,
        value: uiText('published_platform_time_db692d3', {
          platform: post.platform,
          time: post.timeLabel,
        }),
        tone: 'positive',
        column: index + 1,
        period: `${week.days[0]?.dateLabel} – ${week.days.at(-1)?.dateLabel}`,
      }),
    ),
    ...day.scheduled.map(
      (post): HomeDot => ({
        id: `${day.dayId}:scheduled:${post.id}`,
        label: `${day.dateLabel} · ${post.title}`,
        value: uiText('scheduled_platforms_time_a91852c', {
          platforms: post.platforms.join(', '),
          time: post.timeLabel,
        }),
        tone: 'neutral',
        column: index + 1,
        period: `${week.days[0]?.dateLabel} – ${week.days.at(-1)?.dateLabel}`,
      }),
    ),
    ...day.waiting.map(
      ({ card }): HomeDot => ({
        id: `${day.dayId}:waiting:${card.id}`,
        label: `${day.dateLabel} · ${card.title}`,
        value: uiText('waiting_for_approval_10c5739'),
        tone: 'attention',
        column: index + 1,
        period: `${week.days[0]?.dateLabel} – ${week.days.at(-1)?.dateLabel}`,
      }),
    ),
  ]);
}
