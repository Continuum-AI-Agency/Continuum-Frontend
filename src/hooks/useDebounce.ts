'use client';

import { useEffect, useState } from 'react';

// One debounce for every search box. Ten surfaces used to hand-roll useRef +
// setTimeout at six different intervals (300/300/300/350/400/500), which meant
// six different answers to "how long until my search runs".
//
// 300ms is the default because it is what the surfaces that got the most use
// already settled on. Pass a longer delay when a keystroke costs real money --
// the media library mints a Gemini embedding per search, so it stays at 500.
export const DEFAULT_SEARCH_DEBOUNCE_MS = 300;

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * The first value is returned immediately rather than after a delay, so an
 * initial render (or a value restored from the URL) does not flash empty.
 */
export function useDebounce<T>(value: T, delayMs: number = DEFAULT_SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (Object.is(value, debounced)) return;
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs, debounced]);

  return debounced;
}
