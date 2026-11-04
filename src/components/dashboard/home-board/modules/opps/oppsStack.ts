// What the Opportunity read (R1) adds to H04: each opportunity's impact in the words the read
// priced it. A figure is in the goal's units only where the read says so, and otherwise in the
// account's own money with the read's reason; nothing here converts anything.

import {
  HOME_OBJECTIVE_METRICS,
  type HomeOpportunitiesData,
  type HomeOpportunityCard,
  type HomeOpportunityGoal,
} from '@continuum/contracts';
import { formatMoney } from '@/lib/home/format';

const twoPlaces = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function goalWordsFor(card: HomeOpportunityCard, goal: HomeOpportunityGoal | null): string {
  const metric = card.impact.goalMetric;
  const words =
    goal && metric === goal.metric
      ? goal.label
      : metric
        ? HOME_OBJECTIVE_METRICS[metric].label
        : 'results';
  return words.toLowerCase();
}

/** "+0.43 leads a day", "$9.16 MXN a day", or that nothing was priced. */
export function oppImpactLine(card: HomeOpportunityCard, goal: HomeOpportunityGoal | null): string {
  const { impact } = card;
  if (impact.unit === 'goal' && impact.goalUnits !== null) {
    return `+${twoPlaces.format(impact.goalUnits)} ${goalWordsFor(card, goal)} a day`;
  }
  if (!(impact.moneyPerDay > 0)) return 'Not priced per day yet';
  return `${formatMoney(impact.moneyPerDay, impact.currency)} a day`;
}

/** The Optimizer's own reading of the sample; a source that states none says nothing. */
export function oppConfidenceLine(card: Pick<HomeOpportunityCard, 'confidence'>): string | null {
  return card.confidence === null ? null : `Confidence ${Math.round(card.confidence * 100)}%`;
}

export function oppLeadOf(stack: HomeOpportunitiesData | null): HomeOpportunityCard | null {
  return stack?.opportunities[0] ?? null;
}
