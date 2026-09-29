'use client';

import dynamic from 'next/dynamic';

const StylesShelfDynamic = dynamic(
  () => import('@/components/styles/StylesShelf').then((m) => ({ default: m.StylesShelf })),
  { ssr: false, loading: () => <p className="text-xs text-muted-foreground">Loading styles…</p> },
);

export function StylesShelfLazy(props: { brandId: string; className?: string }) {
  return <StylesShelfDynamic {...props} />;
}
