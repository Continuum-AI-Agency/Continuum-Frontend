// Contextual ways into Jaina from a portfolio: the analyses that apply to THIS
// portfolio, offered as the questions a person would ask rather than commands to
// memorise. Each label mirrors the first sentence of its prompt. Discovery
// through suggestion — a person learns what the product can do by seeing it offered
// where it is relevant.

import type { PortfolioListItem } from '@continuum/contracts';
import { humanize } from '../format';

export type JainaEntry = { key: string; label: string; prompt: string };

export function jainaEntryPrompts(
  portfolio: Pick<PortfolioListItem, 'name' | 'objective' | 'id'>,
): JainaEntry[] {
  const who = `the optimizer portfolio "${portfolio.name}" (objective: ${humanize(portfolio.objective)})`;
  return [
    {
      key: 'budget',
      label: 'Where is the money going?',
      prompt: `For ${who}: are we on pace, and where is the money going? Read the optimizer's latest cycle (pacing, moves, held items) and give me the scope line, a table by ad set, the context floor and the actions.`,
    },
    {
      key: 'creative',
      label: 'Which creatives are winning?',
      prompt: `For ${who}: which communication angles are winning and which are wearing out? Cluster the live ads into angles, show spend, CTR, CVR, CPA and the efficiency class per angle, then the scale / refresh / kill opportunities and up to three briefs.`,
    },
    {
      key: 'funnel',
      label: 'Where does the funnel leak?',
      prompt: `For ${who}: where does the funnel leak? Impressions to clicks to results by ad set over the last 14 days against the prior 14 and the 30-day baseline, with the drop-off named and sized.`,
    },
    {
      key: 'scaling',
      label: 'What could take more budget?',
      prompt: `For ${who}: what could take more budget without losing efficiency? Ad sets at or under the target cost with headroom, the velocity cap and floors that bound the last cycle, and the settings the optimizer recommends changing.`,
    },
    {
      key: 'risks',
      label: 'What is about to go wrong?',
      prompt: `For ${who}: what is about to go wrong? Ad sets under the event floor, tracking gaps, audience saturation, creative fatigue, delivery issues — each with its evidence and what to do this week.`,
    },
  ];
}
