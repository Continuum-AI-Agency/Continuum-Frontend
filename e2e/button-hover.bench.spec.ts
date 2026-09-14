import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { buttonVariants } from '../src/components/ui/button';
import { mintSessionForEmail } from './support/auth';

const VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'success',
  'cta',
  'link',
] as const;

// A translucent tint takes its contrast from whatever it sits on, so every variant is graded
// on both surfaces the app actually uses. `--card` is the one that has already pushed a
// variant under the floor while the same variant passed on the page background.
const SURFACES = [
  ['page', 'var(--background)'],
  ['card', 'var(--card)'],
] as const;

// Buttons went quiet at rest: a 10% tint, a hairline and a coloured label, with the solid
// brand colour blooming in from the pointer on hover. Four things regress silently here and
// none of them break a unit test:
//
//   1. A variant loses its --btn-fill and stops blooming at all. The button still looks
//      fine at rest, so a screenshot diff of the resting page catches nothing.
//   2. A label colour drops below 4.5:1 — either at rest against the tint, or after the
//      fill lands. `text-primary` and `text-secondary` are CUSTOM utilities in globals.css
//      (near-black and grey) that beat the Tailwind token utilities of the same name, so a
//      variant written the obvious way renders body text on a brand fill.
//   3. `overflow: hidden`, which the fill needs in order to be clipped to the button, starts
//      clipping a real child.
//   4. Hovering an UNSELECTED segment fills it harder than the SELECTED one looks at rest,
//      so hover reads as selection.
//
// Prerequisites (see e2e/README.md):
//   - Chromium: bunx playwright install chromium
//   - Dev server on :3000
//   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_* for session mint
//
// Run: cd Continuum-Frontend && bun run button:hover:bench

const IS_LOCAL_SUPABASE = /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const OWNER_EMAIL =
  process.env.BUTTON_HOVER_EMAIL?.trim() ||
  (IS_LOCAL_SUPABASE ? 'local@continuum.test' : 'duane@continuumai.agency');

const MIN_CONTRAST = 4.5;
// Sub-pixel layout rounding puts a child a fraction outside its parent routinely; a badge
// deliberately hung off a corner sits ~4px out. This separates the two.
const MAX_CHILD_OVERFLOW_PX = 1.5;

interface ButtonProbe {
  label: string;
  variant: string;
  ariaDisabled: string;
  restBackground: string;
  restLabel: string;
  fill: string;
  beforeScale: number;
  originX: string;
  originY: string;
  childOverflowPx: number;
  transitionProperty: string;
}

/** Everything the assertions need about one button, read from the real computed styles. */
async function probeButtons(page: Page, selector = '[data-slot="button"]'): Promise<ButtonProbe[]> {
  return page.evaluate((sel) => {
    // Computed colours come back in whatever space the author wrote — color-mix(in oklch)
    // stays oklab(), and its components are not 0-255 sRGB. Reading them as if they were
    // turned a lavender label into rgb(1, 0, 283). Let the canvas do the conversion; a 1x1
    // readback is always 0-255 sRGB with alpha.
    const swatch = document.createElement('canvas');
    swatch.width = 1;
    swatch.height = 1;
    const ctx = swatch.getContext('2d', { willReadFrequently: true });

    const parseColor = (value: string): number[] | null => {
      if (!ctx || !value || value === 'none') return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };

    /** Composite a possibly-translucent colour over its ancestors until opaque. */
    const effectiveBackground = (start: Element): string => {
      const layers: number[][] = [];
      let cursor: Element | null = start;
      while (cursor) {
        const parsed = parseColor(getComputedStyle(cursor).backgroundColor);
        if (parsed) {
          const alpha = parsed[3];
          if (alpha > 0) {
            layers.push([parsed[0], parsed[1], parsed[2], alpha]);
            if (alpha >= 1) break;
          }
        }
        cursor = cursor.parentElement;
      }
      // Back-to-front so each layer paints over what is already there.
      let [r, g, b] = [255, 255, 255];
      for (const [lr, lg, lb, la] of layers.reverse()) {
        r = lr * la + r * (1 - la);
        g = lg * la + g * (1 - la);
        b = lb * la + b * (1 - la);
      }
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    };

    const toRgb = (value: string): string => {
      const parsed = parseColor(value);
      if (!parsed) return value;
      const [r, g, b, a] = parsed;
      return a >= 1
        ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
        : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
    };

    const scaleOf = (transform: string): number => {
      if (!transform || transform === 'none') return 0;
      const nums = transform.match(/-?[\d.]+/g)?.map(Number) ?? [];
      return nums.length >= 4 ? nums[0] : 0;
    };

    return Array.from(document.querySelectorAll<HTMLElement>(sel))
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const own = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        return {
          label: (el.textContent || el.getAttribute('aria-label') || '(icon)').trim().slice(0, 40),
          variant: el.getAttribute('data-variant') ?? '',
          ariaDisabled: el.getAttribute('aria-disabled') ?? '',
          restBackground: effectiveBackground(el),
          restLabel: toRgb(own.color),
          fill: toRgb(before.backgroundColor),
          beforeScale: scaleOf(before.transform),
          originX: own.getPropertyValue('--btn-x').trim(),
          originY: own.getPropertyValue('--btn-y').trim(),
          // How far the worst-offending child pokes outside the button, in px. A corner badge
          // sits ~4px out; sub-pixel layout rounding lands under 1px, so the assertion's
          // threshold can tell a real clip from noise.
          childOverflowPx: Array.from(el.children).reduce((worst, child) => {
            const box = el.getBoundingClientRect();
            const r = child.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return worst;
            return Math.max(
              worst,
              box.left - r.left,
              box.top - r.top,
              r.right - box.right,
              r.bottom - box.bottom,
            );
          }, 0),
          transitionProperty: before.transitionProperty,
        };
      });
  }, selector);
}

/** WCAG 2.1 relative-luminance contrast between two opaque `rgb(...)` strings. */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const scale = color.startsWith('color(') ? 255 : 1;
    const [r, g, b] = (color.match(/-?[\d.]+/g) ?? ['0', '0', '0'])
      .slice(0, 3)
      .map((part) => Number(part) * scale);
    const channel = (value: number) => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** A button that actually carries a bloom colour — `link` and unstyled ones have none. */
function isFilled(probe: ButtonProbe): boolean {
  return probe.fill !== 'rgba(0, 0, 0, 0)' && probe.fill !== 'transparent';
}

// Seed the theme the way a returning user has it, BEFORE the app boots, so ThemeProvider
// applies it through its own code path. Flipping data-theme by hand afterwards is not
// equivalent: applyDomTheme also writes root.style.colorScheme and pins literal
// background/color onto <body>, so a hand-flipped page keeps the old palette's inherited
// text colour and reports contrast failures the product does not have.
async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((next) => {
    window.localStorage.setItem('theme', JSON.stringify(next));
  }, theme);
}

/** Fails loudly if the app did not actually end up in the theme the test asked for. */
async function assertTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe(theme);
}

// Only the tests that need real product surfaces mint a session. The variant-coverage and
// reduced-motion tests render their own buttons on /login, so they still run when the
// Supabase stack this repo points at is unavailable.
async function authenticate(context: BrowserContext): Promise<void> {
  let state: Awaited<ReturnType<typeof mintSessionForEmail>>;
  try {
    state = await mintSessionForEmail(OWNER_EMAIL);
  } catch (error) {
    // Say which hops went unexercised and how to cover them. A raw auth error here reads as
    // "the buttons are broken" when the real cause is that the stack this bench points at is
    // not running, and silence would read as coverage this run did not have.
    test.skip(
      true,
      `UNEXERCISED: could not mint a session for ${OWNER_EMAIL} against ` +
        `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(no NEXT_PUBLIC_SUPABASE_URL)'} — ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        'The real-surface checks (/dashboard, /scale) need it; variant coverage and ' +
        'reduced motion above do not and still ran. Start Docker + `bun run supabase:start`, ' +
        'or set BUTTON_HOVER_EMAIL for a reachable project.',
    );
    return;
  }
  await context.addCookies(state.cookies);
}

test.describe('button hover fill', () => {
  // Coverage, not sampling. The page-driven tests below only grade the buttons a screen
  // happens to render, which is how `destructive` (3.24:1) and `success` (2.90:1) both shipped
  // under the floor unnoticed. This renders EVERY variant on BOTH surfaces from the real
  // buttonVariants table, so a variant cannot hide by not being on screen.
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: every variant is legible at rest and once filled, on page and card`, async ({
      page,
    }) => {
      await seedTheme(page, theme);
      // /login boots the real stylesheet and ThemeProvider with no session needed.
      await page.goto('/login');
      await page.locator('[data-slot="button"]:visible').first().waitFor({ state: 'visible' });
      await assertTheme(page, theme);

      const specs = SURFACES.flatMap(([surface, bg]) =>
        VARIANTS.map((variant) => ({
          key: `${surface}:${variant}`,
          variant,
          bg,
          className: `${buttonVariants({ variant })} h-8 gap-1.5 px-3`,
        })),
      );

      await page.evaluate((items) => {
        const panel = document.createElement('div');
        panel.id = 'variant-panel';
        panel.style.cssText =
          'position:fixed;inset:0;z-index:99999;background:var(--background);padding:22px;display:flex;gap:26px;align-items:flex-start';
        const columns = new Map<string, HTMLElement>();
        for (const it of items) {
          let col = columns.get(it.bg);
          if (!col) {
            col = document.createElement('div');
            col.style.cssText = `background:${it.bg};padding:16px;border-radius:10px;display:flex;flex-direction:column;gap:12px;align-items:flex-start`;
            columns.set(it.bg, col);
            panel.append(col);
          }
          const b = document.createElement('button');
          b.setAttribute('data-slot', 'button');
          b.setAttribute('data-variant', it.variant);
          b.setAttribute('data-key', it.key);
          b.className = it.className;
          b.textContent = 'Campaigns';
          col.append(b);
        }
        document.body.append(panel);
      }, specs);

      for (const spec of specs) {
        const target = page.locator(`[data-key="${spec.key}"]`);
        const rest = await probeButtons(page, `[data-key="${spec.key}"]`);
        expect(rest.length, `${spec.key} rendered`).toBe(1);

        expect(
          contrastRatio(rest[0].restLabel, rest[0].restBackground),
          `${spec.key} at rest: label ${rest[0].restLabel} on ${rest[0].restBackground}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);

        if (!isFilled(rest[0])) continue;

        await target.hover();
        // The label flips at the fill's midpoint, so read after the transition settles.
        await page.waitForTimeout(420);
        const hovered = await probeButtons(page, `[data-key="${spec.key}"]`);
        expect(
          contrastRatio(hovered[0].restLabel, hovered[0].fill),
          `${spec.key} once filled: label ${hovered[0].restLabel} on fill ${hovered[0].fill}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }

      await page.mouse.move(4, 4);
      await page.locator('#variant-panel').screenshot({
        path: `e2e/__screenshots__/button-hover/variants-${theme}.png`,
      });
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: filled buttons are quiet at rest and legible once filled`, async ({
      page,
      context,
    }) => {
      await authenticate(context);
      await seedTheme(page, theme);
      await page.goto('/dashboard');
      await page.locator('[data-slot="button"]:visible').first().waitFor({ state: 'visible' });
      await assertTheme(page, theme);

      const probes = (await probeButtons(page)).filter(isFilled);

      // A run that found no filled button proves nothing — say so instead of passing.
      expect(probes.length, 'filled buttons rendered on /dashboard').toBeGreaterThan(0);

      for (const probe of probes) {
        // `cta` is the deliberate exception: marketing and auth CTAs stay solid at rest and
        // the bloom only brightens them. Every other filled variant must be quiet.
        if (probe.variant !== 'cta') {
          expect(
            probe.restBackground,
            `"${probe.label}" is solid at rest — its resting background is the bloom colour`,
          ).not.toBe(probe.fill);
        }

        expect(
          contrastRatio(probe.restLabel, probe.restBackground),
          `"${probe.label}" [${probe.variant}] label ${probe.restLabel} on its resting tint ${probe.restBackground}`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);

        expect(probe.beforeScale, `"${probe.label}" fill is showing before hover`).toBeLessThan(
          0.01,
        );

        expect(
          probe.childOverflowPx,
          `"${probe.label}" has a child ${probe.childOverflowPx.toFixed(1)}px outside its box — overflow:hidden is cutting it off`,
        ).toBeLessThanOrEqual(MAX_CHILD_OVERFLOW_PX);
      }

      await page.screenshot({ path: `e2e/__screenshots__/button-hover/${theme}-rest.png` });
    });

    test(`${theme}: the fill blooms from the pointer and the label survives it`, async ({
      page,
      context,
    }) => {
      await authenticate(context);
      await seedTheme(page, theme);
      await page.goto('/dashboard');
      const button = page
        .locator('[data-slot="button"]:visible')
        .filter({ hasNotText: /^$/ })
        .first();
      await button.waitFor({ state: 'visible' });
      await assertTheme(page, theme);

      const box = await button.boundingBox();
      expect(box, 'button bounding box').not.toBeNull();
      if (!box) return;

      // Enter near the left edge so a centre-origin bloom would be visibly wrong.
      const entryX = Math.round(box.width * 0.2);
      const entryY = Math.round(box.height * 0.5);
      await page.mouse.move(box.x + entryX, box.y + entryY);
      await expect
        .poll(async () => {
          const probe = (await probeButtons(page)).find((p) => p.originX !== '');
          return probe?.beforeScale ?? 0;
        })
        .toBeGreaterThan(0.99);

      const hovered = (await probeButtons(page)).find((probe) => probe.originX !== '');
      expect(hovered, 'a button recorded a pointer origin').toBeTruthy();
      if (!hovered) return;

      // The bloom must start where the pointer entered, not at the centre.
      expect(Number.parseFloat(hovered.originX)).toBeCloseTo(entryX, 0);
      expect(Number.parseFloat(hovered.originY)).toBeCloseTo(entryY, 0);

      expect(
        contrastRatio(hovered.restLabel, hovered.fill),
        `"${hovered.label}" [${hovered.variant}] label ${hovered.restLabel} on fill ${hovered.fill}`,
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);

      await page.screenshot({ path: `e2e/__screenshots__/button-hover/${theme}-hover.png` });
    });
  }

  test('reduced motion crossfades instead of moving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/login');
    await page.locator('[data-slot="button"]:visible').first().waitFor({ state: 'visible' });

    const probes = (await probeButtons(page)).filter(isFilled);
    expect(probes.length, 'filled buttons rendered').toBeGreaterThan(0);

    for (const probe of probes) {
      expect(probe.transitionProperty, `"${probe.label}" still animates transform`).not.toContain(
        'transform',
      );
      expect(probe.transitionProperty, `"${probe.label}" lost its crossfade`).toContain('opacity');
    }
  });

  // The sidebar is the highest-traffic bloom surface and the only one where the fill colour
  // is itself translucent (--sidebar-hover-bg is a color-mix onto transparent), so a missing
  // --btn-fill reads as "no hover at all" rather than as a wrong colour.
  test('sidebar nav items bloom from the pointer without clipping', async ({ page, context }) => {
    await authenticate(context);
    await page.goto('/dashboard');
    const navItem = page.locator('[data-sidebar="menu-button"]:visible').first();
    await navItem.waitFor({ state: 'visible' });

    const before = await probeButtons(page, '[data-sidebar="menu-button"]');
    expect(before.length, 'sidebar nav items rendered').toBeGreaterThan(0);

    // A coming-soon row is deliberately inert (`[--btn-fill:transparent]`), so it is the one
    // row allowed to have no bloom. Every other row must have one.
    const bloomable = before.filter((item) => item.ariaDisabled !== 'true');
    expect(bloomable.length, 'enabled sidebar rows rendered').toBeGreaterThan(0);

    for (const item of bloomable) {
      expect(item.fill, `sidebar item "${item.label}" has no bloom colour`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(
        item.childOverflowPx,
        `sidebar item "${item.label}" has a child ${item.childOverflowPx.toFixed(1)}px outside its box`,
      ).toBeLessThanOrEqual(MAX_CHILD_OVERFLOW_PX);
    }

    const box = await navItem.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const entryX = Math.round(box.width * 0.25);
    // Hover TWICE. The rail expands under the pointer on first hover, and React replaces the
    // row's DOM node as it does — taking the inline --btn-x written on the old node with it.
    // The first hover settles the rail; the second lands on the node that survives, which is
    // the one the probe reads. Without this the bloom looks broken when it is not.
    await navItem.hover();
    await page.waitForTimeout(500);
    const settled = await navItem.boundingBox();
    const settledX = Math.round((settled?.width ?? box.width) * 0.25);
    await navItem.hover({ position: { x: settledX, y: Math.round((settled?.height ?? box.height) / 2) } });

    await expect
      .poll(async () => {
        const hovered = await probeButtons(page, '[data-sidebar="menu-button"]');
        return hovered.find((item) => item.originX !== '')?.beforeScale ?? 0;
      })
      .toBeGreaterThan(0.99);

    const hovered = (await probeButtons(page, '[data-sidebar="menu-button"]')).find(
      (item) => item.originX !== '',
    );
    expect(hovered, 'a sidebar item recorded a pointer origin').toBeTruthy();
    if (!hovered) return;

    // The exact coordinate is pinned by the button-level test on a static page. Here the
    // icon rail EXPANDS under the pointer, so the element is wider by the time the origin is
    // read — assert a real recorded offset inside the current box, not a pre-hover number.
    const recordedX = Number.parseFloat(hovered.originX);
    const recordedY = Number.parseFloat(hovered.originY);
    expect(Number.isFinite(recordedX), `--btn-x is not a length: ${hovered.originX}`).toBe(true);
    expect(Number.isFinite(recordedY), `--btn-y is not a length: ${hovered.originY}`).toBe(true);
    const hoveredBox = await navItem.boundingBox();
    expect(recordedX).toBeGreaterThanOrEqual(0);
    expect(recordedX).toBeLessThanOrEqual((hoveredBox?.width ?? box.width) + 1);

    await page.screenshot({ path: 'e2e/__screenshots__/button-hover/sidebar-hover.png' });
  });

  test('a hovered unselected segment never outweighs the selected one', async ({
    page,
    context,
  }) => {
    await authenticate(context);
    await page.goto('/scale');
    await page.locator('[data-slot="button"]:visible').first().waitFor({ state: 'visible' });

    const toggle = page.locator('[data-tour-id="paid-adset-toggle"]');
    await toggle
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    if ((await toggle.count()) === 0) {
      // The segmented control only mounts behind a connected Meta ad account. The local
      // fixture brand has none, so this hop is genuinely unexercised — fail rather than
      // pass quietly, because a green run here would read as coverage it does not have.
      test.skip(
        true,
        'UNEXERCISED: /scale segmented toggle needs a connected Meta ad account; ' +
          `the ${IS_LOCAL_SUPABASE ? 'local fixture' : 'bench'} brand has none. ` +
          'Re-run against a brand with Meta connected to cover it.',
      );
      return;
    }

    const segments = toggle.locator('[data-slot="button"]');
    const selectedFillBefore = (await probeButtons(page)).filter(isFilled);
    expect(selectedFillBefore.length, 'selected segment carries a tint').toBeGreaterThan(0);

    // Hover the second (unselected) segment and confirm its bloom is the muted colour,
    // not the brand colour the selected one uses.
    await segments.nth(1).hover();
    const hoveredUnselected = await segments.nth(1).evaluate((el) => ({
      fill: getComputedStyle(el, '::before').backgroundColor,
    }));
    const selectedFill = await segments.nth(0).evaluate((el) => ({
      fill: getComputedStyle(el, '::before').backgroundColor,
    }));

    expect(
      hoveredUnselected.fill,
      'hovering an unselected segment blooms the brand colour, so hover reads as selection',
    ).not.toBe(selectedFill.fill);

    await page.screenshot({ path: 'e2e/__screenshots__/button-hover/segmented-hover.png' });
  });
});
