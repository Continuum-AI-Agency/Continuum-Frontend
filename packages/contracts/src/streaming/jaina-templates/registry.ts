/**
 * Every registered template's spec, by id. Imports each template file so no template agent
 * has to edit this file: adding a template to the MVP is adding its id to
 * `ANSWER_TEMPLATE_IDS` and its line here, once, by the foundation.
 */

import type { AnswerTemplateId, TemplateSpec } from './core';
import { explainedRankingSpec } from './explained_ranking';
import { spendResultsBalanceSpec } from './spend_results_balance';
import { threeNumbersSpec } from './three_numbers';
import { weeklyBridgeSpec } from './weekly_bridge';

export const TEMPLATE_SPECS: Readonly<Record<AnswerTemplateId, TemplateSpec>> = {
  explained_ranking: explainedRankingSpec,
  spend_results_balance: spendResultsBalanceSpec,
  weekly_bridge: weeklyBridgeSpec,
  three_numbers: threeNumbersSpec,
};
