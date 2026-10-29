'use client';

import { type RefObject, useEffect } from 'react';

const SKELETON = '[data-slot="skeleton"],[data-slot="skeleton-text"]';
const SKIP = '[data-row-resolve="skip"]';

export const ROW_STAGGER_MS = 70;
export const MAX_STAGGERED_ROWS = 12;
const ROW_DURATION_MS = 320;
const REDUCED_DURATION_MS = 150;
const ROW_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const MAX_WRAPPER_DEPTH = 3;

/**
 * Brings content in row by row wherever a skeleton leaves the DOM under `root`: Motion UI's
 * staggered resolve (motion.dev/ui/components/skeleton), keyed off the skeleton primitives
 * instead of a `loading` prop, so every `isLoading ? <Skeleton/> : …` gets it without touching
 * the call site.
 *
 * The region is the parent the skeleton was removed from, which is where its content landed;
 * removals in one frame collapse to their outermost regions. Its rows are its element children,
 * looking through single-child wrappers (a card around a list). Each row fades in and rises 4px,
 * ROW_STAGGER_MS after the one before. The rise is composited onto the row's own `translate`
 * and the fade ends on the row's own opacity, so nothing lands anywhere but where it already is,
 * and nothing moves the layout. `data-row-resolve="skip"` opts a subtree out. The observer starts
 * after hydration, so server-rendered content never animates. Reduced motion gets a short fade.
 */
export function useRowResolve(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return observeRowResolve(root);
  }, [rootRef]);
}

/** The hook's engine, outside React: watches `root` and returns the teardown. */
export function observeRowResolve(root: HTMLElement): () => void {
  let frame = 0;
  const pending = new Set<Element>();

  const flush = () => {
    frame = 0;
    const regions = [...pending];
    pending.clear();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    for (const region of regions) {
      if (!region.isConnected || region.closest(SKIP)) continue;
      if (regions.some((other) => other !== region && other.contains(region))) continue;
      rowsOf(region).forEach((row, index) => resolveRow(row, index, reduced));
    }
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node instanceof Element && (node.matches(SKELETON) || node.querySelector(SKELETON))) {
          pending.add(record.target as Element);
        }
      }
    }
    if (pending.size > 0 && frame === 0) frame = requestAnimationFrame(flush);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

function rowsOf(region: Element): HTMLElement[] {
  let level = region;
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH && level.childElementCount === 1; depth++) {
    level = level.firstElementChild as Element;
  }
  return [...level.children].filter(
    (row): row is HTMLElement => row instanceof HTMLElement && !row.matches(SKELETON) && !row.matches(SKIP),
  );
}

function resolveRow(row: HTMLElement, index: number, reduced: boolean) {
  if (typeof row.animate !== 'function') return;
  if (reduced) {
    row.animate([{ opacity: 0 }, {}], { duration: REDUCED_DURATION_MS, fill: 'backwards' });
    return;
  }
  const timing = {
    duration: ROW_DURATION_MS,
    delay: Math.min(index, MAX_STAGGERED_ROWS - 1) * ROW_STAGGER_MS,
    easing: ROW_EASING,
    fill: 'backwards' as const,
  };
  row.animate([{ opacity: 0 }, {}], timing);
  row.animate([{ translate: '0 4px' }, { translate: '0 0' }], { ...timing, composite: 'add' });
}
