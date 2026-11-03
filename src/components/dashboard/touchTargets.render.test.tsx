// PP-DT-C-touch-hit-areas-overlap-home-views-scale-bar: on touch screens neighbouring controls stole
// each other's taps. The invisible pads (`hit-area`, 44 px under a coarse pointer) of controls that
// sit closer than the pad overlap — Home's view switch, the Scale bar's Canvas / Full screen /
// Creative Insights — and Home's module links were 14–15 px tall with no pad at all. A row of
// controls is a `hit-area-row` (or `-column`), which caps each pad at half the gap it shares and
// keeps the 24 px floor; every control in it carries the pad.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({ activeBrandId: 'brand-1' }),
}));

const { HomeBaseDashboard } = await import('./HomeBaseDashboard');

afterEach(cleanup);

const classes = (element: Element | null | undefined) =>
  (element?.getAttribute('class') ?? '').split(/\s+/);

describe('touch targets that sit side by side', () => {
  it("Home's view switch is a row of pads that cannot cross into each other", () => {
    render(<HomeBaseDashboard activeView="organic" activeViewSlot={<div>slot</div>} />);
    const nav = screen.getByRole('navigation', { name: 'Dashboard view options' });
    expect(classes(nav)).toContain('hit-area-row');
  });

  it("the Scale bar's right-hand controls are a row of pads, Creative Insights included", () => {
    // PaidMediaClient is not rendered here (it reads every paid-media hook); its source is.
    const source = readFileSync(
      join(import.meta.dir, '..', '..', 'app', '(post-auth)', 'scale', 'PaidMediaClient.tsx'),
      'utf8',
    );
    expect(source).toMatch(
      /className="[^"]*\bhit-area-row\b[^"]*"[^>]*>\s*\{\/\*[\s\S]*?Full screen/,
    );
    const insights = /data-testid="whats-working-link"[\s\S]*?className=\{cn\(\s*'([^']*)'/.exec(
      source,
    );
    expect(insights?.[1]?.split(/\s+/)).toContain('hit-area');
  });
});
