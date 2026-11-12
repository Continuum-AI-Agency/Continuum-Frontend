import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { FeatureMessages } from '@/i18n/FeatureMessages';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('admin_continuum_ai_5f1b2cc') };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureMessages scope="app/[locale]/(post-auth)/admin/layout.tsx">{children}</FeatureMessages>
  );
}
