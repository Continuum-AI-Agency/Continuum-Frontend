import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Studio | Continuum AI',
};

export default function AIStudioLayout({ children }: { children: ReactNode }) {
  return children;
}
