// Contextual ways into Jaina from a portfolio: the analyses that apply to THIS
// portfolio, offered as the questions a person would ask rather than commands to
// memorise. Each label mirrors the first sentence of its prompt. Discovery
// through suggestion — a person learns what the product can do by seeing it offered
// where it is relevant.

import type { PortfolioListItem } from '@continuum/contracts';
import { humanize } from '../format';
import type { PlatformTab } from './platforms/platformTabsModel';

export type JainaEntry = { key: string; label: string; prompt: string };

type JainaPortfolio = Pick<PortfolioListItem, 'name' | 'objective' | 'id'>;

/** The scope line every portfolio prompt opens with. */
function portfolioScope(portfolio: JainaPortfolio): string {
  return `the optimizer portfolio "${portfolio.name}" (objective: ${humanize(portfolio.objective)})`;
}

export function jainaEntryPrompts(portfolio: JainaPortfolio): JainaEntry[] {
  const who = portfolioScope(portfolio);
  return [
    {
      key: 'budget',
      label: 'Where is the budget going?',
      prompt: `For ${who}: are we on pace and where is the budget going? Read the optimizer's last cycle (pace, moves, held ad sets) and give me the scope line, one table per ad set, the context floor and the actions.`,
    },
    {
      key: 'creative',
      label: 'Which creatives are winning?',
      prompt: `For ${who}: which messaging angles are winning and which are wearing out? Group the active ads by angle, show spend, CTR, CVR, CPA and the efficiency class per angle, then the scale / refresh / switch-off opportunities and up to three briefs.`,
    },
    {
      key: 'funnel',
      label: 'Where does the funnel leak?',
      prompt: `For ${who}: where does the funnel leak? Impressions to clicks to results per ad set over the last 14 days against the 14 before and the 30-day baseline, with the drop named and measured.`,
    },
    {
      key: 'scaling',
      label: 'Which ad set can scale?',
      prompt: `For ${who}: which ad set can take more budget without losing efficiency? The ad sets at or under the target cost with headroom, the velocity cap and the floors that bounded the last cycle, and the settings the optimizer recommends changing.`,
    },
    {
      key: 'risks',
      label: 'Risks this week',
      prompt: `For ${who}: what is about to go wrong this week? Ad sets under the event floor, tracking gaps, audience saturation, creative fatigue and delivery problems, each with its evidence and what to do.`,
    },
  ];
}

/**
 * A question typed into the portfolio's own field, sent to Jaina with the portfolio as its
 * context — the same scope line the prepared questions open with, so the answer is about
 * THIS portfolio and not the account.
 */
export function jainaAskPrompt(portfolio: JainaPortfolio, question: string): string {
  return `For ${portfolioScope(portfolio)}: ${question.trim()}`;
}

// The account-level band. The Overview is read in Spanish, so its questions are Spanish
// too; each prompt names the account and every portfolio (name + objective) so Jaina has
// the whole scope in one line. Two questions are conditional: "why is X expensive" only
// exists when some portfolio is over its target, and "how is X doing" replaces the generic
// risks question when one portfolio is spending with nothing to show for it.

export type JainaAccountContext = {
  accountLabel: string | null;
  portfolios: Array<{ name: string; objective: string }>;
  /** the portfolio furthest over its target, if any */
  worstOverTarget: string | null;
  /** a portfolio spending with zero results, if any */
  noResults: string | null;
};

function accountScope(account: JainaAccountContext): string {
  const accountName = account.accountLabel
    ? `the account "${account.accountLabel}"`
    : 'the active account';
  const portfolioList =
    account.portfolios.length > 0
      ? account.portfolios
          .map((portfolio) => `"${portfolio.name}" (objective: ${humanize(portfolio.objective)})`)
          .join(', ')
      : 'none active';
  return `${accountName}, with the optimizer's portfolios: ${portfolioList}`;
}

export function jainaAccountEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const who = accountScope(account);
  const scopeAndActions =
    "Give me the reach line, one table per portfolio and this week's actions.";

  const expensive: JainaEntry[] = account.worstOverTarget
    ? [
        {
          key: 'expensive',
          label: `Why is ${account.worstOverTarget} expensive?`,
          prompt: `For ${who}: why is "${account.worstOverTarget}" expensive? It is the portfolio furthest above its target cost. Compare its cost per result over the last 7 days against the target and against the 14 days before, name the ad sets pushing the cost up with their evidence, and tell me what to change. ${scopeAndActions}`,
        },
      ]
    : [];

  const silentOrRisks: JainaEntry = account.noResults
    ? {
        key: 'silent',
        label: `How is ${account.noResults} doing?`,
        prompt: `For ${who}: how is "${account.noResults}" doing? It is spending with no results. Check the delivery, the tracking, the audience and the creatives of its ad sets, say whether the problem is measurement or performance, and what to do today. ${scopeAndActions}`,
      }
    : {
        key: 'risks',
        label: "What's about to go wrong?",
        prompt: `For ${who}: what's about to go wrong? In each portfolio: ad sets under the event floor, tracking gaps, audience saturation, creative fatigue and delivery problems, each with its evidence. ${scopeAndActions}`,
      };

  return [
    ...expensive,
    {
      key: 'pause',
      label: 'What to pause this week?',
      prompt: `For ${who}: what to pause this week? In each portfolio, point out the ad sets and ads spending with no results, with a cost far above target or with creative fatigue, with the spend each pause frees and the risk of making it. ${scopeAndActions}`,
    },
    silentOrRisks,
    {
      key: 'budget',
      label: "Where's the budget?",
      prompt: `For ${who}: where's the budget? Each portfolio's daily budget and actual spend, whether we are on pace, what the optimizer moved in its last cycle and what it held back. ${scopeAndActions}`,
    },
    {
      key: 'summary',
      label: 'Summary for the client',
      prompt: `For ${who}: write a summary for the client. What happened this week in each portfolio (spend, results and cost per result against the target), what was changed and why, and what comes next. Clear tone and no jargon, with one table per portfolio and three action points at the end.`,
    },
  ];
}

/**
 * The weekly report for one ad account: the last complete Monday–Sunday week (Period A)
 * against the month to date (Period B), a section per Optimizer objective and this week's
 * recommendations. The Backend routes this ask to the `weekly_report` template; the phrase
 * "Weekly report" is what it matches, so keep it at the head of the prompt.
 */
export function jainaWeeklyReportPrompt(adAccountId: string): string {
  return `Weekly report for the ad account "${adAccountId}": last complete Monday–Sunday week (Period A) against month to date (Period B), one section per Optimizer objective, and the recommendations for this week.`;
}

// The band changes with the Overview's platform tab (frontend.html §7, feature 22). "All" asks
// across platforms, "Meta" keeps the account questions above, and Google and TikTok ask what
// only that platform can answer. Each prompt names its platform, and the band's deep link
// carries it too, so the turn is scoped to the platform the person was looking at.

/** "All": questions that compare platforms, each in its own currency and attribution window. */
export function jainaCrossPlatformEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const who = `${accountScope(account)}, across Meta, Google Ads and TikTok`;
  const fairly =
    "Compare each platform in its own currency and attribution window, and say when two platforms' figures cannot be compared.";
  return [
    {
      key: 'cheapest',
      label: 'Which platform buys leads cheapest?',
      prompt: `For ${who}: which platform buys leads cheapest? Cost per lead on each platform over the last 7 days against the 14 days before, with spend and leads beside it. ${fairly}`,
    },
    {
      key: 'move',
      label: 'Where should budget move?',
      prompt: `For ${who}: where should budget move between platforms? Which platform has room to take more at the same cost per result, which one is spending above target, and the move you would make, with its evidence. ${fairly}`,
    },
    {
      key: 'risks',
      label: "What's going wrong on any platform?",
      prompt: `For ${who}: what's going wrong on any platform? Campaigns not serving, ads rejected, budgets running out, tracking gaps and creative fatigue, each with its platform, its evidence and what to do.`,
    },
    {
      key: 'summary',
      label: 'Summary for the client',
      prompt: `For ${who}: write a summary for the client. What happened this week on each platform (spend, results and cost per result), what was changed and why, and what comes next. Clear tone and no jargon, with one table per platform and three action points at the end.`,
    },
  ];
}

/** Google Ads: search terms, Search budget limits, Performance Max asset groups, delivery. */
export function jainaGoogleAdsEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const who = `the Google Ads account of the brand behind ${account.accountLabel ? `"${account.accountLabel}"` : 'the active account'}`;
  return [
    {
      key: 'search_terms',
      label: 'Which search terms bring leads?',
      prompt: `For ${who}: which search terms bring leads? The terms with conversions over the last 14 days, their cost per lead and the keyword each one comes in through, the converting terms that are not keywords yet, and the terms that spend without a lead.`,
    },
    {
      key: 'search_budget',
      label: 'Is Search limited by budget?',
      prompt: `For ${who}: is Search limited by budget? Each Search campaign's share of impressions lost to budget and to rank, its cost per result, and whether more budget is worth it at that price.`,
    },
    {
      key: 'asset_groups',
      label: 'Which asset group is missing assets?',
      prompt: `For ${who}: which asset group is missing assets? Each Performance Max asset group with its ad strength and what it lacks (images, videos, headlines), and which to fix first.`,
    },
    {
      key: 'delivery',
      label: 'Is any campaign not serving?',
      prompt: `For ${who}: is any campaign not serving? Google's own reasons for every campaign that is limited or dark, disapproved ads with their policy topics, and what to fix in Google Ads.`,
    },
  ];
}

/** TikTok: creative fatigue, the first two seconds, the learning budget, Spark Ads. */
export function jainaTikTokEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const who = `the TikTok Ads account of the brand behind ${account.accountLabel ? `"${account.accountLabel}"` : 'the active account'}`;
  return [
    {
      key: 'fatigue',
      label: 'Which video is fatiguing?',
      prompt: `For ${who}: which video is fatiguing? The videos whose CTR is falling while frequency rises, with CTR before and now, and the video that could replace each one.`,
    },
    {
      key: 'hook',
      label: 'Which opening loses viewers?',
      prompt: `For ${who}: which opening loses viewers? Each video's share of viewers who stay past 2 seconds against the account, and what to change in the first seconds.`,
    },
    {
      key: 'learning',
      label: 'Is any ad group stuck in learning?',
      prompt: `For ${who}: is any ad group stuck in learning? Each ad group's daily budget against the multiple of its cost per result TikTok documents for its goal, and the results it has so far.`,
    },
    {
      key: 'spark',
      label: 'Which post should be a Spark Ad?',
      prompt: `For ${who}: which organic post should be a Spark Ad? The posts with the most views and engagement that are not promoted, and the ad group each would run in.`,
    },
  ];
}

/** The band's questions for the Overview tab a person is on. */
export function jainaTabEntryPrompts(tab: PlatformTab, account: JainaAccountContext): JainaEntry[] {
  switch (tab) {
    case 'all':
      return jainaCrossPlatformEntryPrompts(account);
    case 'meta':
      return jainaAccountEntryPrompts(account);
    case 'google_ads':
      return jainaGoogleAdsEntryPrompts(account);
    case 'tiktok_ads':
      return jainaTikTokEntryPrompts(account);
  }
}
