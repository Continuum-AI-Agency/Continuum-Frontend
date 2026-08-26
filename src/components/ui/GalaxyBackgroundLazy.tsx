'use client';

import dynamic from 'next/dynamic';
import { ClientOnly } from './ClientOnly';
import type { GalaxyBackgroundProps } from './GalaxyBackground';

// `ssr: false` throws BAILOUT_TO_CLIENT_SIDE_RENDERING during prerender, and under Cache
// Components that abort happens above the instant-validation boundary — it takes the static
// shell of every route in this layout with it. Mount-gating keeps the same client-only
// behaviour (the gradient depends on the theme the no-flash script writes to <html>).
const GalaxyBackground = dynamic(() =>
  import('./GalaxyBackground').then((mod) => ({ default: mod.GalaxyBackground })),
);

export function GalaxyBackgroundLazy(props: GalaxyBackgroundProps) {
  return (
    <ClientOnly>
      <GalaxyBackground {...props} />
    </ClientOnly>
  );
}
