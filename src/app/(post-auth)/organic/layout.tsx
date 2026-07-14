import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Organic | Continuum AI',
};

export default function OrganicLayout({ children }: { children: ReactNode }) {
  return children;
}
