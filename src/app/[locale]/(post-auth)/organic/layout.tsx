import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeatureMessages } from '@/i18n/FeatureMessages';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Organic | Continuum AI',
};

export default function OrganicLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureMessages scope="app/[locale]/(post-auth)/organic/layout.tsx">
      {children}
    </FeatureMessages>
  );
}
