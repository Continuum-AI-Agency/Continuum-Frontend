import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buttonVariants } from './button';

// PP-L1V-22px-icon-buttons-everywhere: the row toggles ("Show ad sets"), chips and dismiss
// buttons are the shared `xs` / `icon-xs` Button. On the 14.5px root ladder `h-6` / `size-6`
// paints at 21.75px, and the invisible `hit-area` pseudo-element is a hit box the user has but
// not one getBoundingClientRect reports — the tap-target audit (and a target-size check in
// assistive tech) reads the layout box. The shared sizes therefore grow the LAYOUT box to the
// 24px floor and hand the growth back as negative margin, so rows keep their height.

const globals = readFileSync(join(import.meta.dir, '../../app/globals.css'), 'utf8');

function utilityBlock(name: string): string {
  const start = globals.indexOf(`@utility ${name} {`);
  expect(start, `globals.css declares @utility ${name}`).toBeGreaterThan(-1);
  const end = globals.indexOf('\n}\n', start);
  return globals.slice(start, end);
}

describe('shared small button hit box', () => {
  it('grows the block axis of xs and icon-xs to the 24px floor', () => {
    expect(buttonVariants({ size: 'xs' })).toContain('hit-area-block');
    expect(buttonVariants({ size: 'icon-xs' })).toContain('hit-area-block');
  });

  it('grows the inline axis of the square icon-xs only', () => {
    expect(buttonVariants({ size: 'icon-xs' })).toContain('hit-area-inline');
    expect(buttonVariants({ size: 'xs' })).not.toContain('hit-area-inline');
  });

  it('declares the growth as a layout box with the row height handed back', () => {
    const block = utilityBlock('hit-area-block');
    expect(block).toContain('min-block-size: 24px');
    expect(block).toMatch(/margin-block: min\(0px, calc\(\(var\(--hit-area-box, 1\.5rem\) - 24px\) \/ 2\)\)/);
    const inline = utilityBlock('hit-area-inline');
    expect(inline).toContain('min-inline-size: 24px');
    expect(inline).toMatch(/margin-inline: min\(0px, calc\(\(var\(--hit-area-box, 1\.5rem\) - 24px\) \/ 2\)\)/);
  });

  it('keeps the 44px coarse-pointer box on the invisible pseudo-element', () => {
    const hitArea = utilityBlock('hit-area');
    expect(hitArea).toContain('pointer: coarse');
    expect(hitArea).toContain('max(100%, 44px)');
  });
});
