import type { Metadata } from 'next';
import { BrandedNotFound } from '@/components/not-found/BrandedNotFound';

export const metadata: Metadata = {
  title: '404 | Continuum AI',
};

export default function NotFound() {
  return <BrandedNotFound />;
}
