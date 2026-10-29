// What a Jaina progress line says, in words the person waiting can read.
//
// The Backend's `response.analysis.progress` rows carry a stable code — a layer id from
// `JAINA_LAYERS`, a hypothesis id from `JAINA_HYPOTHESES` — next to a `label` written for the
// engine: a layer's label is the read's internal trigger ("Entity explains >50% of account
// change.") and a hypothesis's is its id with spaces ("mix vs efficiency", "cpm", "settling").
// So the line is named here, by its code, and the Backend's label is only trusted where it was
// written for a person: the opening notice (in the question's language) and a drill round.

import {
  type JainaAnalysisProgress,
  type JainaHypothesis,
  type JainaLayer,
  jainaHypothesisSchema,
  jainaLayerSchema,
} from '@continuum/contracts';

const LAYER_LABEL: Record<JainaLayer, string> = {
  account_totals: 'Account totals',
  campaign_scoreboard: 'Campaign results',
  top_movers: 'What changed the most',
  adset_audience: 'Ad sets and audiences',
  placement_device_geo: 'Placements, devices and locations',
  creative_tier: 'Ads and creatives',
  waste: 'Spend without results',
  pacing: 'Budget pacing',
  change_history: 'Recent edits to the account',
  conversion_settling: 'Conversions still being reported',
};

/** Each hypothesis as the question it asks of the account. */
const HYPOTHESIS_LABEL: Record<JainaHypothesis, string> = {
  mix_vs_efficiency: 'Did spend move to weaker campaigns, or did the same ones get worse?',
  cpm: 'Did it get more expensive to reach people?',
  ctr: 'Are fewer people clicking?',
  cvr: 'Are fewer clicks turning into results?',
  settling: 'Are recent results still being reported?',
  recent_edit: 'Did a recent edit cause it?',
  fatigue: 'Are people tiring of the ads?',
};

/** The line a progress row prints. A code this build does not know yet reads as a generic
 *  step rather than leaking the engine's own label. */
export function analysisProgressLabel(row: JainaAnalysisProgress): string {
  switch (row.kind) {
    case 'layer': {
      const layer = jainaLayerSchema.safeParse(row.id);
      return layer.success
        ? `Reading ${LAYER_LABEL[layer.data].toLowerCase()}`
        : 'Reading the account';
    }
    case 'hypothesis': {
      const hypothesis = jainaHypothesisSchema.safeParse(row.id);
      return hypothesis.success ? HYPOTHESIS_LABEL[hypothesis.data] : 'Checking a possible cause';
    }
    case 'notice':
    case 'drill':
      return row.label;
  }
}
