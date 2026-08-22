import type { Metadata } from 'next';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: {
    template: '%s | Continuum Auth',
    default: 'Authentication',
  },
};

export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
