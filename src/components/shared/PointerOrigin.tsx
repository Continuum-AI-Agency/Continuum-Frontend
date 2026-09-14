'use client';

// Records where the pointer entered a `btn-fill` element so its hover fill can bloom from
// that point instead of the centre. CSS cannot read the cursor, so this is the smallest
// amount of JS that buys it.
//
// One delegated listener rather than a handler per button, for two reasons: `ui/button.tsx`
// stays free of `"use client"` (real Server Components import `buttonVariants` from it, and
// a client directive would turn that export into a client reference they cannot call), and
// links styled with `buttonVariants()` get the same behaviour without being Buttons.

import { useEffect } from 'react';

export function PointerOrigin() {
  useEffect(() => {
    const recordOrigin = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLElement>('.btn-fill');
      if (!button) return;

      const bounds = button.getBoundingClientRect();
      button.style.setProperty('--btn-x', `${event.clientX - bounds.left}px`);
      button.style.setProperty('--btn-y', `${event.clientY - bounds.top}px`);
    };

    document.addEventListener('pointerover', recordOrigin, { passive: true });
    return () => document.removeEventListener('pointerover', recordOrigin);
  }, []);

  return null;
}
