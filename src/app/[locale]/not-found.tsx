import type { Metadata } from 'next';
import { BrandedNotFound } from '@/components/not-found/BrandedNotFound';
import { FeatureMessages } from '@/i18n/FeatureMessages';

export const metadata: Metadata = {
  title: '404 | Continuum AI',
};

export default function NotFound() {
  return <FeatureMessages scope="app/[locale]/not-found.tsx"><BrandedNotFound /></FeatureMessages>;
}
