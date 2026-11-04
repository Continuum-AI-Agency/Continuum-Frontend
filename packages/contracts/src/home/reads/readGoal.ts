// The goal a Home read speaks in. There is one goal per brand and the Goal tile holds it: the
// team's saved goal, else what the month's results say (`resolveHomeObjectives`, fed by
// `readBrand`'s suggestion). The month's results are read live in the browser and the Backend
// stores them for only a handful of accounts, so the board tells each read what it resolved through
// HOME_READ_GOAL_PARAM.
//
// A read never finds its own goal: what a portfolio optimises for says what that portfolio buys,
// and a stored week of results can name a different goal than the month on the tile. Told nothing,
// with nothing saved, a read speaks without a goal.

import {
  HOME_OBJECTIVE_METRICS,
  HOME_PROFILE_BRAND_SCOPE,
  type HomeObjective,
  type HomeProfileRow,
  homeObjectiveMetricSchema,
} from '../objectives';

export const HOME_READ_GOAL_PARAM = 'goalMetric';

export type HomeReadGoal = {
  objective: HomeObjective;
  /** 'team': saved. 'results': resolved by the board from what the ads brought. */
  source: 'team' | 'results';
  /** Nobody named it, so its label is the metric's own and a read may speak it in its language. */
  labelIsInferred: boolean;
};

export function homeReadGoalOf(
  rows: readonly HomeProfileRow[],
  measured: string | undefined,
): HomeReadGoal | null {
  const saved = rows.find((row) => row.scope === HOME_PROFILE_BRAND_SCOPE)?.objectives ?? [];
  const objective = saved.find((candidate) => candidate.role === 'primary') ?? saved[0];
  if (objective) return { objective, source: 'team', labelIsInferred: false };

  const metric = homeObjectiveMetricSchema.safeParse(measured);
  if (!metric.success) return null;
  return {
    objective: {
      id: metric.data,
      label: HOME_OBJECTIVE_METRICS[metric.data].label,
      metric: metric.data,
      role: 'primary',
    },
    source: 'results',
    labelIsInferred: true,
  };
}
