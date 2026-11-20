import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { FeatureMessages } from '@/i18n/FeatureMessages';
import {
  canAccessAutomations,
  resolveAutomationDeploymentEnvironment,
} from '@/lib/automations/access';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AutomationsLayout({ children }: { children: ReactNode }) {
  const { user } = await getActiveBrandContext();
  const environment = resolveAutomationDeploymentEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!canAccessAutomations({ isAdmin: isAdminUser(user), environment })) {
    redirect('/dashboard');
  }

  return (
    <FeatureMessages scope="app/[locale]/(post-auth)/automations/layout.tsx">
      {children}
    </FeatureMessages>
  );
}

export async function generateMetadata() {
  const t = await getTranslations('automations');
  return { title: t('automations_ad1fb9e') };
}
