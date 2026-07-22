'use client';

import dynamic from 'next/dynamic';
import type { GalaxyBackgroundProps } from './GalaxyBackground';

const GalaxyBackground = dynamic(
  () => import('./GalaxyBackground').then((mod) => ({ default: mod.GalaxyBackground })),
  { ssr: false },
);

export function GalaxyBackgroundLazy(props: GalaxyBackgroundProps) {
  return <GalaxyBackground {...props} />;
}
