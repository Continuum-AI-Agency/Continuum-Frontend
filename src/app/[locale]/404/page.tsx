import type { Metadata } from 'next';
import { BrandedNotFound } from '@/components/not-found/BrandedNotFound';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: '404 | Continuum AI',
};

export default function ExplicitNotFoundPage() {
  return <BrandedNotFound />;
}
