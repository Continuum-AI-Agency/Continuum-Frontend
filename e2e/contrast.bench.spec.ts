import { expect, test } from '@playwright/test';
import { badgeVariants } from '../src/components/ui/badge';
import { buttonVariants } from '../src/components/ui/button';
import {
  contrastRatio,
  MIN_CONTRAST,
  measureSwatches,
  SURFACES,
  seedTheme,
} from './support/contrast';

// Every colour variant the design system ships, graded against the 4.5:1 floor
// docs/styleguide.md sets, on both surfaces and in both themes.
//
// This exists because sampling does not work here. A bench that grades whatever buttons
// happen to be on a screen let THREE real failures ship: `destructive` at 3.24:1,
// `success` at 2.90:1, and white-on-dark-`--primary` at 3.77:1 — the last one reaching
// every `bg-primary` surface in the app, Badge included. A variant that renders nowhere on
// the pages a bench visits is exactly the variant nobody has looked at.
//
// It grades the RESTING state only. The filled state needs a real hover plus the label's
// mid-bloom colour transition, which button-hover.bench.spec.ts already drives properly —
// grading it from a static swatch here would compare the rest label against the fill and
// report a failure that does not exist.
//
// It renders its own swatches on /login, so it needs no session and runs even when the
// Supabase stack is down.
//
// Run: cd Continuum-Frontend && bun run contrast:bench

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'success',
  'cta',
  'link',
] as const;

const BADGE_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'violet',
  'teal',
  'success',
  'warning',
  'muted',
] as const;

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: every button and badge variant clears the contrast floor`, async ({ page }) => {
    await seedTheme(page, theme);
    await page.goto('/login');
    await page.locator('[data-slot="button"]:visible').first().waitFor({ state: 'visible' });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(theme);

    const specs = SURFACES.flatMap(([surfaceName, surfaceBg]) => [
      ...BUTTON_VARIANTS.map((variant) => ({
        key: `${surfaceName}:button/${variant}`,
        surface: surfaceBg,
        className: `${buttonVariants({ variant })} h-8 gap-1.5 px-3`,
        tag: 'button' as const,
      })),
      ...BADGE_VARIANTS.map((variant) => ({
        key: `${surfaceName}:badge/${variant}`,
        surface: surfaceBg,
        className: badgeVariants({ variant }),
        tag: 'span' as const,
      })),
    ]);

    const swatches = await measureSwatches(page, specs);
    expect(swatches.length, 'swatches rendered').toBe(specs.length);

    const failures: string[] = [];
    for (const swatch of swatches) {
      const atRest = contrastRatio(swatch.label, swatch.background);
      if (atRest < MIN_CONTRAST) {
        failures.push(
          `${swatch.key} at rest ${atRest.toFixed(2)}:1 — ${swatch.label} on ${swatch.background}`,
        );
      }
    }

    expect(failures, `contrast failures in ${theme}:\n${failures.join('\n')}`).toEqual([]);

    await page.locator('#contrast-panel').screenshot({
      path: `e2e/__screenshots__/contrast/${theme}.png`,
    });
  });
}
