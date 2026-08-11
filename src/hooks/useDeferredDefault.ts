'use client';

import { useState } from 'react';

/**
 * Initial UI state that depends on data which arrives after mount.
 *
 * Base UI captures `defaultValue`/`defaultOpen` in a ref on the first render and warns when the
 * serialized value later changes, so an uncontrolled primitive fed by a query silently keeps the
 * loading-state default forever. This drives the primitive as controlled instead: until the user
 * picks something, the value tracks `derived`; once they pick, their choice wins.
 *
 * Callers whose choice can be made without firing the primitive's change event — clicking an
 * already-active tab, for example — must call the setter from their own handler as well.
 */
export function useDeferredDefault<T>(derived: T) {
  const [picked, setPicked] = useState<T>();
  return [picked ?? derived, setPicked] as const;
}
