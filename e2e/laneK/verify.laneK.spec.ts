import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { identityFor, openAs, outPath, revokeAll, settle } from '../laneE/support';

// laneK:verify — three of lane K's fixes measured in the real app (deep test 2026-10-31), each the
// way the finding was measured. Read-only against production Supabase through lane E's harness:
// minted sessions with a session brand pin, a write guard that aborts any write, revoke at the end.
//   · PP-DT-H-sidebar-hover-pushes-page: the page's x before and with the pointer on the collapsed
//     rail (lane H measured 43.5 -> 217.5), at 1024 and 1440.
//   · PP-DT-E-canvas-small-copy: the Campaign Canvas picker on "EASY FIT // TEST AUDIENCIAS //
//     MENSAJES" — cut, and ending in an ellipsis.
//   · PP-DT-H-first-run-checklist-contrast: the computed colour of the Brand Book card's
//     "Updated …" on The Sound Vault's setup checklist (lane H measured 4.03:1).

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
/** The Sound Vault is Ramiro's own brand; this identity is a member (lane E's home-modes). */
const SOUND_VAULT_MEMBER = 'ramibuisel@gmail.com';
const EASYFIT_2026 = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const SOUND_VAULT = '65de7c08-53f6-418c-8907-ffce63624961';
/** "EASY FIT // TEST AUDIENCIAS // MENSAJES" on Easy Fit 2026, proposed 2026-10-31. */
const SCAFFOLD = 'deab38f1-577c-45bd-b3d9-448f0544ea32';

const results: Record<string, unknown>[] = [];

test.afterAll(async () => {
  const revoked = await revokeAll();
  results.push({ check: 'sessions', revoked });
  writeFileSync(outPath('verify.laneK.json'), JSON.stringify(results, null, 2));
});

async function mainX(page: Page): Promise<number | null> {
  return page.evaluate(() => document.querySelector('main')?.getBoundingClientRect().x ?? null);
}

test('laneK:verify — the sidebar hover, the canvas picker and the setup checklist', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const vivo = await identityFor(VIVO_OWNER);

  for (const width of [1024, 1440]) {
    const opened = await openAs(browser, vivo, EASYFIT_2026, { width, height: 900 }, 'light');
    try {
      const { page } = opened;
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await settle(page);
      await page.mouse.move(width - 2, 450);
      await page.waitForTimeout(1_000);
      const before = await mainX(page);
      await page.mouse.move(24, 450);
      await page.waitForTimeout(1_200);
      const hovered = await mainX(page);
      const expanded = await page.locator('[data-side]').first().getAttribute('data-state');
      results.push({ check: `sidebar hover @${width}`, mainX: { before, hovered }, expanded });
      expect(expanded, 'the hovered rail expands over the page').toBe('expanded');
      expect(hovered, 'the page stays where it is').toBe(before);
    } finally {
      await opened.close();
    }
  }

  const canvas = await openAs(browser, vivo, EASYFIT_2026, { width: 1440, height: 900 }, 'light');
  try {
    const { page } = canvas;
    await page.goto(`/scale/campaign-canvas?scaffold=${SCAFFOLD}`, {
      waitUntil: 'domcontentloaded',
    });
    const value = page.locator('[data-testid="canvas-scaffold-picker"] [data-slot="select-value"]');
    await expect(value).toContainText('EASY FIT', { timeout: 120_000 });
    const box = await value.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent,
        display: style.display,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    results.push({ check: 'canvas picker', ...box });
    expect(box.scrollWidth, 'the name is longer than the picker').toBeGreaterThan(box.clientWidth);
    expect(box.display).not.toBe('flex');
    expect(box.textOverflow).toBe('ellipsis');
  } finally {
    await canvas.close();
  }

  const owner = await identityFor(SOUND_VAULT_MEMBER);
  const setup = await openAs(browser, owner, SOUND_VAULT, { width: 1440, height: 900 }, 'light');
  try {
    const { page } = setup;
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const updated = page.locator('[data-testid="brand-book-milestone"] p', { hasText: 'Updated' });
    await expect(updated).toBeVisible({ timeout: 120_000 });
    const measured = await updated.evaluate((element) => {
      const parse = (value: string) =>
        (value.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number, number?];
      const background = (() => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const [r, g, b, a = 1] = parse(getComputedStyle(node).backgroundColor);
          if (a > 0) return [r, g, b] as [number, number, number];
        }
        return [255, 255, 255] as [number, number, number];
      })();
      const [r, g, b, a = 1] = parse(getComputedStyle(element).color);
      const opacity = (() => {
        let product = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          product *= Number(getComputedStyle(node).opacity);
        }
        return product * a;
      })();
      const ink = [r, g, b].map((channel, i) =>
        Math.round(channel * opacity + (background[i] as number) * (1 - opacity)),
      );
      const lum = ([cr, cg, cb]: number[]) => {
        const [lr, lg, lb] = [cr, cg, cb].map((v) => {
          const c = (v ?? 0) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      };
      const [hi, lo] = [lum(ink), lum(background)].sort((x, y) => y - x) as [number, number];
      return {
        text: element.textContent,
        color: getComputedStyle(element).color,
        fontSize: getComputedStyle(element).fontSize,
        background,
        ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
      };
    });
    results.push({ check: 'setup checklist contrast', ...measured });
    expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
  } finally {
    await setup.close();
  }
});
