import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from '@/i18n/__tests__/render';

import { lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import { LIVE_BATCH_PREVIEW } from '@/lib/campaign-canvas/lectura.fixtures';
import { LecturaView } from './LecturaView';

// PP-DT-E-canvas-read-under-bar (deep test 2026-10-31, lane E): on the Canvas page, Read starts
// under the floating bar — Back to chat, the proposal picker with Save · Propose · Deploy, and
// Map/Read — at 390, 1024 and 1440. Its `pt-16` was meant to clear the bar, but `sm:p-4` (a
// later, wider rule) overrode it from 640 px up, and 4 rem never cleared the two-row bar of a
// loaded proposal anyway. The page's Read takes its top clearance from the bar the page
// measures, and no shorthand padding may undo it at any breakpoint.
const model = lecturaFromLiveChange(LIVE_BATCH_PREVIEW);

const contentClasses = (html: string): string[] => {
  const view = html.indexOf('data-testid="lectura-view"');
  const match = /<div class="([^"]+)"/.exec(html.slice(view));
  return (match?.[1] ?? '').split(/\s+/);
};

describe('Read on the Canvas page clears the floating bar', () => {
  it('takes its top padding from the bar the page measured', () => {
    const classes = contentClasses(renderToStaticMarkup(<LecturaView model={model} size="page" />));
    expect(classes).toContain('pt-[var(--canvas-bar-clearance,4rem)]');
  });

  it('carries no padding shorthand that would undo that clearance at a breakpoint', () => {
    const classes = contentClasses(renderToStaticMarkup(<LecturaView model={model} size="page" />));
    expect(
      classes.filter(
        (name) => /^(?:[a-z]+:)?(?:p|py|pt)-/.test(name) && !name.startsWith('pt-[var('),
      ),
    ).toEqual([]);
  });

  it('keeps the panel and chat sizes on their own padding', () => {
    const classes = contentClasses(
      renderToStaticMarkup(<LecturaView model={model} size="panel" />),
    );
    expect(classes.some((name) => name.includes('--canvas-bar-clearance'))).toBe(false);
  });
});
