'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_REASON =
  'Derived from your brand setup and the campaign objective. Shown for review; it is not edited here.';

/**
 * Renders a value the server derived, visibly distinct from a value someone chose.
 *
 * This is the derived-vs-declared boundary made VISIBLE rather than merely
 * documented. A name, a targeting spec, a billing event or a promoted object is
 * recomputed from the version a human approved — typing over one would break the
 * round-trip law that lets analytics recover a name's components from the Meta side.
 * Muting them, and saying why on hover, is how a reader knows which cells are theirs.
 */
export function DerivedValue({
  children,
  reason = DEFAULT_REASON,
  className,
}: {
  children: ReactNode;
  reason?: string;
  className?: string;
}) {
  return (
    <span className={cn('text-muted-foreground', className)} title={reason}>
      {children}
    </span>
  );
}

/** The em-dash used wherever a derived value is not populated yet. */
export function DerivedEmpty({ reason }: { reason?: string }) {
  return <DerivedValue reason={reason}>—</DerivedValue>;
}
