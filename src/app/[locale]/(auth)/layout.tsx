import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FeatureMessages } from '@/i18n/FeatureMessages';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return {
    title: { template: '%s | Continuum', default: t('authentication') },
  };
}

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return <FeatureMessages scope="app/[locale]/(auth)/layout.tsx">{children}</FeatureMessages>;
}
