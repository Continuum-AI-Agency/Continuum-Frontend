import type { AutomationDeploymentEnvironment } from '@/lib/automations/access';

export const GOALS_PRODUCTION_DISABLED_REASON = 'Coming Soon';

export function canAccessGoals({
  isAdmin,
  environment,
}: {
  isAdmin: boolean;
  environment: AutomationDeploymentEnvironment;
}): boolean {
  return isAdmin || environment !== 'production';
}
