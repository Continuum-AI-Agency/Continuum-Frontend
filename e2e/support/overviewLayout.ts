import type { BrowserContext } from '@playwright/test';

// The Optimizer Overview opens on the adaptive board (sections/board/boardLayout.ts) and keeps
// today's layout one click away as "Today". The benches written for that layout read today's
// tree, so they pin the viewer's choice to Today, the way a person who prefers it would.
export const OVERVIEW_LAYOUT_KEY = 'continuum:optimizer:overview:layout';

export async function pinTodayOverview(context: BrowserContext): Promise<void> {
  await context.addInitScript((key: string) => {
    try {
      window.localStorage.setItem(key, 'today');
    } catch {
      // Storage refused: the page opens on the board, and the bench's own checks say so.
    }
  }, OVERVIEW_LAYOUT_KEY);
}
