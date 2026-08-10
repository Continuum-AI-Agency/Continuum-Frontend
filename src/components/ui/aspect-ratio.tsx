'use client';

import type * as React from 'react';

import { cn } from '@/lib/utils';

// Base UI has no aspect-ratio primitive; base-nova ships the native CSS property instead.
function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<'div'> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={{ '--ratio': ratio } as React.CSSProperties}
      className={cn('relative aspect-(--ratio)', className)}
      {...props}
    />
  );
}

export { AspectRatio };
