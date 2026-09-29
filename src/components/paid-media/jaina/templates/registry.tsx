// Template id → renderer. Every id the contract registers has an entry, so a templated block
// always renders. Each template's renderer lives in its own file, owned by that template's
// agent; this file only imports them and is not edited when a renderer ships.

import type { AnswerTemplateId } from '@continuum/contracts';
import { explainedRankingRenderer } from './ExplainedRanking';
import { spendResultsBalanceRenderer } from './SpendResultsBalance';
import { threeNumbersRenderer } from './ThreeNumbers';
import type { TemplateRenderer } from './types';
import { weeklyBridgeRenderer } from './WeeklyBridge';

export const TEMPLATE_RENDERERS: Readonly<Record<AnswerTemplateId, TemplateRenderer>> = {
  explained_ranking: explainedRankingRenderer,
  spend_results_balance: spendResultsBalanceRenderer,
  weekly_bridge: weeklyBridgeRenderer,
  three_numbers: threeNumbersRenderer,
};
