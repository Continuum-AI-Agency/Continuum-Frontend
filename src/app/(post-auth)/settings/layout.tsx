import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: 'Settings | Continuum AI',
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
