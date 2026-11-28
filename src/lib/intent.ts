import type { FocusEvent, PointerEvent } from 'react';

// Starts work (a lazy feature's import, a route prefetch) once a person shows they mean to use
// something: a mouse resting 50 ms (a pass across the element does not count), keyboard focus,
// or a press, which on touch screens arrives well before the click. Repeat calls are cheap by
// design: a resolved import(), router.prefetch and a fresh query are all no-ops the second time.
// Timers are keyed by element, so these are plain props, usable inside a .map().

const DELIBERATE_HOVER_MS = 50;
const hoverTimers = new WeakMap<EventTarget, number>();

export function intentProps(onIntent: () => unknown) {
  // Warming is best effort: a failed warm-up must not surface as an error; the real open retries.
  const run = () =>
    void Promise.resolve()
      .then(onIntent)
      .catch(() => {});
  const now = (event: PointerEvent | FocusEvent) => {
    window.clearTimeout(hoverTimers.get(event.currentTarget));
    run();
  };
  return {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      hoverTimers.set(event.currentTarget, window.setTimeout(run, DELIBERATE_HOVER_MS));
    },
    onPointerLeave: (event: PointerEvent) =>
      window.clearTimeout(hoverTimers.get(event.currentTarget)),
    onFocus: now,
    onPointerDown: now,
  };
}
