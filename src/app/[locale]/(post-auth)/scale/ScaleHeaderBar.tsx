'use client';

// The Performance+ page's first bar, drawn INSIDE the app header beside the module pill
// ("one bar" layout, version A): the account chip, then the module's own links and tabs. The
// header belongs to the dashboard layout, not to this route, so the bar is portalled into the
// slot the header leaves for it. Without that slot (a host that renders no app header) the bar
// stands as the page's own first row instead, so nothing it carries is ever lost.

import * as React from 'react';
import { createPortal } from 'react-dom';
import { APP_HEADER_MODULE_SLOT_ID } from '@/components/navigation/routes';

type SlotLookup =
  | { status: 'pending' }
  | { status: 'found'; slot: HTMLElement }
  | { status: 'none' };

export function ScaleHeaderBar({ children }: { children: React.ReactNode }) {
  const [lookup, setLookup] = React.useState<SlotLookup>({ status: 'pending' });

  React.useEffect(() => {
    const slot = document.getElementById(APP_HEADER_MODULE_SLOT_ID);
    setLookup(slot ? { status: 'found', slot } : { status: 'none' });
  }, []);

  // The bar is its own size container (`scale-bar`): it shares the header with the module pill
  // and the bells, so what fits is its own width, not the viewport's. Its children collapse
  // labels to icons against it (the account chip to its avatar, the tabs to their marks).
  const bar = (
    <div className="@container/scale-bar min-w-0 flex-1">
      <div
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] @[30rem]/scale-bar:gap-2"
        data-testid="scale-header-bar"
      >
        {children}
      </div>
    </div>
  );

  if (lookup.status === 'pending') return null;
  if (lookup.status === 'found') return createPortal(bar, lookup.slot);
  return (
    <div className="flex min-h-11 shrink-0 items-center border-border/60 border-b px-[var(--app-shell-pad-inline)]">
      {bar}
    </div>
  );
}
