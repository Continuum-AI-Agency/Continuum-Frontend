import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Scale | Continuum AI',
};

export default function ScaleLayout({ children }: { children: ReactNode }) {
  return children;
}
