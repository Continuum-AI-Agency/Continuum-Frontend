import { type RefObject, useLayoutEffect } from 'react';

/**
 * Packs the dots board like masonry. With 1px grid rows, each slot spans its card's own height
 * plus the board gap, so the board's dense placement fills the space a tall neighbour leaves
 * instead of stretching every row to its tallest card. Column spans (the tiles' logical sizes)
 * and DOM order are untouched. Every grid child is fitted, so the board legend settles into the
 * first hole the tiles leave. `data-masonry` switches the 1px rows on only once every child has
 * a span, so server HTML never renders collapsed rows.
 */
export function useDotsMasonry(
  grid: RefObject<HTMLElement | null>,
  enabled: boolean,
  layoutKey: string,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey re-runs the fit when the tile set or order changes.
  useLayoutEffect(() => {
    const board = grid.current;
    if (!enabled || !board) return;
    const slots = [...board.querySelectorAll<HTMLElement>(':scope > *')];
    const fit = (slot: HTMLElement) => {
      const gap = Number.parseFloat(getComputedStyle(board).columnGap) || 0;
      slot.style.gridRow = `span ${Math.ceil(slot.getBoundingClientRect().height + gap)}`;
    };
    for (const slot of slots) fit(slot);
    board.dataset.masonry = '';
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) fit(entry.target as HTMLElement);
    });
    for (const slot of slots) observer.observe(slot);
    return () => {
      observer.disconnect();
      delete board.dataset.masonry;
      for (const slot of slots) slot.style.gridRow = '';
    };
  }, [grid, enabled, layoutKey]);
}
