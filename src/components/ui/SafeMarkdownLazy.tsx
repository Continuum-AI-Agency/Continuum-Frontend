'use client';

import dynamic from 'next/dynamic';

/**
 * Lazily-loaded SafeMarkdown component.
 * Keeps Shiki, KaTeX and Streamdown out of the initial bundle for routes
 * that do not render markdown on first paint.
 */
export const SafeMarkdown = dynamic(
  () => import('./SafeMarkdown').then((mod) => mod.SafeMarkdown),
  { ssr: false },
);
