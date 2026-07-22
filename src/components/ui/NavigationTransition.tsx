'use client';

import React from 'react';

// ViewTransition ships in the React canary build bundled by Next.js
// (experimental.viewTransition: true in next.config.ts). Stable @types/react
// doesn't include it yet, so we pull it at runtime via cast — same pattern
// used in OrganicWorkspaceTabs.tsx.
const ViewTransition =
  (React as unknown as { ViewTransition?: React.ComponentType<{ children: React.ReactNode }> })
    .ViewTransition ??
  function ViewTransitionFallback({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };

export function NavigationTransition({ children }: { children: React.ReactNode }) {
  return <ViewTransition>{children}</ViewTransition>;
}
