export type AutomationDeploymentEnvironment = 'development' | 'preview' | 'production';

type ResolveAutomationEnvironmentInput = {
  nodeEnv?: string;
  vercelEnv?: string;
  siteUrl?: string;
};

const PRODUCTION_HOSTNAME = 'app.trycontinuum.ai';

export function resolveAutomationDeploymentEnvironment({
  nodeEnv,
  vercelEnv,
  siteUrl,
}: ResolveAutomationEnvironmentInput): AutomationDeploymentEnvironment {
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';
  if (nodeEnv !== 'production') return 'development';

  if (siteUrl) {
    try {
      return new URL(siteUrl).hostname === PRODUCTION_HOSTNAME ? 'production' : 'preview';
    } catch {
      return 'preview';
    }
  }

  return 'production';
}

export function canAccessAutomations({
  isAdmin,
  environment,
}: {
  isAdmin: boolean;
  environment: AutomationDeploymentEnvironment;
}): boolean {
  return isAdmin || environment !== 'production';
}

export const AUTOMATIONS_PRODUCTION_DISABLED_REASON = 'Coming Soon';
