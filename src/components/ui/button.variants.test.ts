import { describe, expect, it } from 'bun:test';

import { buttonVariants } from './button';

// The hover fill is driven entirely by --btn-fill: `btn-fill`'s ::before paints
// `var(--btn-fill, transparent)`, so a variant that forgets to declare one still looks
// correct at rest and simply never blooms. Nothing else fails when that happens — which is
// why it is asserted here rather than left to the e2e bench alone.

const FILLED_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'success',
  'outline',
  'ghost',
  'cta',
] as const;

describe('buttonVariants', () => {
  it('gives every filled variant a bloom colour', () => {
    for (const variant of FILLED_VARIANTS) {
      expect(buttonVariants({ variant })).toContain('[--btn-fill:');
    }
  });

  it('applies the fill utility to every button', () => {
    for (const variant of [...FILLED_VARIANTS, 'link'] as const) {
      expect(buttonVariants({ variant })).toContain('btn-fill');
    }
  });

  it('mixes fills toward hue-neutral targets only', () => {
    // `--muted-foreground` and light-mode `--foreground` both carry violet chroma, and mixing
    // toward them in oklch rotates hue: it turned the destructive fill pink and success teal.
    for (const variant of FILLED_VARIANTS) {
      const fill = buttonVariants({ variant }).match(/\[--btn-fill:[^\]]+\]/g) ?? [];
      for (const declaration of fill) {
        expect(declaration).not.toContain('--muted-foreground');
      }
    }
  });

  it('keeps cta solid at rest and every other filled variant tinted', () => {
    // `cta` is the one variant that stays solid: marketing and auth CTAs keep their weight.
    expect(buttonVariants({ variant: 'cta' })).toContain('bg-primary');
    expect(buttonVariants({ variant: 'cta' })).not.toContain('bg-primary/14');

    expect(buttonVariants({ variant: 'default' })).toContain('bg-primary/14');
    expect(buttonVariants({ variant: 'secondary' })).toContain('bg-secondary/14');
  });
});
