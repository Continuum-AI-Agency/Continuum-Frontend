import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buttonVariants } from './button';

// PP-L1V-22px-icon-buttons-everywhere: the row toggles ("Show ad sets"), chips and dismiss
// buttons are the shared `xs` / `icon-xs` Button, painted at 21.75px on the 14.5px root ladder.
// The redesign's constraint: the target grows INVISIBLY — the painted box, the glyph and the
// Portfolios / Campaigns row heights stay exactly as drawn. The pointer target is the `hit-area`
// pseudo-element (24px floor, 44px under a coarse pointer), which the L1V detector now grades.

const globals = readFileSync(join(import.meta.dir, '../../app/globals.css'), 'utf8');

function utilityBlock(name: string): string {
  const start = globals.indexOf(`@utility ${name} {`);
  expect(start, `globals.css declares @utility ${name}`).toBeGreaterThan(-1);
  const end = globals.indexOf('\n}\n', start);
  return globals.slice(start, end);
}

describe('shared small button hit box', () => {
  it('gives xs and icon-xs the invisible hit area', () => {
    expect(buttonVariants({ size: 'xs' }).split(' ')).toContain('hit-area');
    expect(buttonVariants({ size: 'icon-xs' }).split(' ')).toContain('hit-area');
  });

  it('keeps the painted box at its own size — no layout growth, no margin hand-back', () => {
    for (const size of ['xs', 'icon-xs'] as const) {
      const classes = buttonVariants({ size });
      expect(classes).not.toMatch(/hit-area-(block|inline)/);
      expect(classes).not.toMatch(/\bmin-[hw]-/);
      expect(classes).not.toMatch(/(^|\s)-?m[xy]?-/);
    }
    expect(globals).not.toContain('@utility hit-area-block');
    expect(globals).not.toContain('@utility hit-area-inline');
  });

  it('pads the pointer target on a transparent pseudo-element: 24px floor, 44px when coarse', () => {
    const hitArea = utilityBlock('hit-area');
    expect(hitArea).toContain('&::after');
    expect(hitArea).toContain('opacity: 0');
    expect(hitArea).toContain('max(100%, 24px)');
    expect(hitArea).toContain('pointer: coarse');
    expect(hitArea).toContain('max(100%, 44px)');
  });
});
