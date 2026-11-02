import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createBenchRecorder } from '../support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';
import {
  audit,
  cells,
  identityFor,
  Observations,
  onlyCases,
  openAs,
  revokeAll,
  settle,
  shot,
} from './support';

// laneE:optimizer — what landed in the Optimizer after the 10-27 deep tests and no bench drives:
//   · the platform switch with each platform's logo (FE e9c14672, 10-31) and the four tabs on
//     every brand (b5100b29): connection read per brand from its granted accounts, a muted logo
//     and "· Connect" on a platform the brand lacks, the row fitting a phone, keyboard reach;
//   · the P8 Google account findings (deployed 10-29) on the Google tab of Vivo 47, Easy Fit 2026
//     and Pink Elephant: one card per persisted finding, the card's figures = the stored payload,
//     Pink (the client executes) recommend-only with no write control;
// at 390 / 1024 / 1440 × light / dark with the geometric detector.
// READ ONLY: the only clicks are tabs (a URL push); no Approve, Apply, Dismiss, Run now or Connect.

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
const RAMIRO_BENCH = 'ramibuisel@gmail.com';

const CASES = [
  {
    key: 'easyfit2026',
    email: VIVO_OWNER,
    brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    google: true,
  },
  {
    key: 'vivo47',
    email: VIVO_OWNER,
    brandId: '61b80f51-709a-4408-9f11-04142a286baa',
    google: true,
  },
  {
    key: 'pink',
    email: RAMIRO_BENCH,
    brandId: '8e5b7185-e43f-4150-b763-b86c4f5297a0',
    google: true,
  },
  {
    key: 'tangassi',
    email: RAMIRO_BENCH,
    brandId: '9f7e830f-6445-4bba-b199-a2db07fa184a',
    google: true,
  },
  {
    key: 'setup-soundvault',
    email: RAMIRO_BENCH,
    brandId: '65de7c08-53f6-418c-8907-ffce63624961',
    google: false,
  },
] as const;

type Expected = { meta: boolean; google_ads: boolean; tiktok_ads: boolean };

async function expectedConnections(brandId: string): Promise<Expected> {
  const { data } = await admin
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .select('integration_accounts_assets:integration_account_id(type)')
    .eq('brand_profile_id', brandId);
  const types = (
    (data ?? []) as unknown as { integration_accounts_assets: { type: string | null } | null }[]
  ).map((row) => row.integration_accounts_assets?.type ?? '');
  return {
    meta: types.includes('meta_ad_account'),
    google_ads: types.includes('ads_customer'),
    tiktok_ads: types.includes('tiktok_advertiser'),
  };
}

type StoredCard = {
  idea: string | null;
  variant: string;
  facts: { label: string; value: string }[];
  headline: string | null;
};

async function storedGoogleCards(brandId: string): Promise<StoredCard[]> {
  const { data, error } = await admin.rpc('optimizer_get_platform_cards', {
    p_brand_id: brandId,
    p_platform: 'google_ads',
  });
  if (error) throw new Error(`optimizer_get_platform_cards: ${error.message}`);
  return ((data ?? []) as { platform_card?: Record<string, unknown> }[]).map((row) => {
    const card = row.platform_card ?? {};
    return {
      idea: (card.idea as string | undefined) ?? null,
      variant: String(card.variant ?? ''),
      facts: ((card.facts as { label: string; value: string }[] | undefined) ?? []).map((f) => ({
        label: String(f.label),
        value: String(f.value),
      })),
      headline: (card.headline as string | undefined) ?? null,
    };
  });
}

async function readSwitch(page: Page, stopAtGate = true) {
  const tablist = page.locator('[data-testid="platform-tabs"]').first();
  if (stopAtGate) {
    // The connect gate is an answer too: stop waiting for tabs as soon as it is on screen.
    await page
      .locator('[data-testid="platform-tabs"], section[aria-label="Paid setup diagnostics"]')
      .first()
      .waitFor({ state: 'visible', timeout: 90_000 });
    if ((await tablist.count()) === 0) throw new Error('gated');
  }
  await tablist.waitFor({ state: 'visible', timeout: 90_000 });
  return tablist.evaluate((list) => {
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]')).map((tab) => {
      // A brand mark is a <span title> wrapping an inline <svg> (makeSvgIcon); lucide is a bare <svg>.
      const svg = tab.querySelector('svg');
      const mark = (
        svg?.parentElement && svg.parentElement !== tab ? svg.parentElement : svg
      ) as Element | null;
      const style = mark ? getComputedStyle(mark) : null;
      const box = tab.getBoundingClientRect();
      return {
        tab: tab.getAttribute('data-tab'),
        connected: tab.getAttribute('data-connected'),
        selected: tab.getAttribute('aria-selected'),
        text: (tab.textContent ?? '').trim(),
        hasIcon: Boolean(svg),
        iconMuted: style ? Number(style.opacity) < 1 && /grayscale/.test(style.filter) : false,
        markTitle: mark?.getAttribute('title') ?? null,
        markAriaHidden: mark?.getAttribute('aria-hidden') ?? null,
        width: Math.round(box.width),
        height: Math.round(box.height),
        right: Math.round(box.right),
        tabIndex: tab.tabIndex,
      };
    });
    const box = list.getBoundingClientRect();
    return {
      tabs,
      scrollWidth: list.scrollWidth,
      clientWidth: list.clientWidth,
      right: Math.round(box.right),
      viewport: window.innerWidth,
    };
  });
}

test('laneE:optimizer — platform switch + P8 cards, 390·1024·1440 × light·dark', async ({
  browser,
}) => {
  test.setTimeout(3_400_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:optimizer', notes);
  const obs = new Observations('optimizer');
  try {
    for (const brand of onlyCases(CASES)) {
      const expected = await expectedConnections(brand.brandId);
      const cards = brand.google ? await storedGoogleCards(brand.brandId) : [];
      const findings = cards.filter((card) => card.variant === 'google_account_finding');
      obs.add({
        brand: brand.key,
        expected,
        storedCards: cards.map((c) => `${c.variant}:${c.idea ?? ''}`),
      });
      const identity = await identityFor(brand.email);
      let keyboardChecked = false;
      for (const { viewport, theme } of cells()) {
        const cell = `${brand.key}@${viewport.width}-${theme}`;
        const opened = await openAs(browser, identity, brand.brandId, viewport, theme);
        const { page } = opened;
        try {
          const t0 = Date.now();
          await page.goto('/scale?tab=performance&optimizerView=overview', {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          let sw: Awaited<ReturnType<typeof readSwitch>> | null = null as Awaited<
            ReturnType<typeof readSwitch>
          > | null;
          try {
            sw = await readSwitch(page);
          } catch {
            sw = null;
          }
          const switchMs = Date.now() - t0;
          await settle(page, 60_000);
          const overviewText = (
            await page
              .locator('main')
              .first()
              .innerText()
              .catch(() => '')
          ).slice(0, 3000);
          const overviewAudit = await audit(
            page,
            `Optimizer/Overview/${brand.key}`,
            viewport.width,
            theme,
          );
          const overviewShot = await shot(page, `optimizer-overview-${cell}`);
          if (!sw) {
            const gate = page.locator('section[aria-label="Paid setup diagnostics"]').first();
            const gated = (await gate.count()) > 0;
            const steps = gated
              ? await gate.locator('ol > li').evaluateAll((items) =>
                  items.map((li) => ({
                    label: (li.querySelector('p')?.textContent ?? '').trim(),
                    done: Boolean(
                      li.querySelector(
                        'svg[class*="text-success"], svg[class*="emerald"], svg[class*="green"]',
                      ),
                    ),
                    icon: li.querySelector('svg')?.getAttribute('class') ?? '',
                  })),
                )
              : [];
            recorder.record(
              `${cell}: Performance + opens for a brand with ${expected.google_ads ? 'a Google' : 'no'} ad account and ${expected.meta ? 'a' : 'no'} Meta ad account`,
              brand.key.startsWith('setup') ? 'WARN' : 'FAIL',
              gated
                ? `gated by "Connect an ad account to unlock Scale"; checklist: ${steps.map((st) => `${st.label}`).join(' / ')}`
                : `no [data-testid=platform-tabs] after ${switchMs} ms`,
            );
            obs.add({
              cell,
              switch: null,
              gated,
              steps,
              overviewText: overviewText.slice(0, 900),
              overviewViolations: overviewAudit.violations,
              events: opened.events,
              guard: opened.guard.blocked,
              shot: overviewShot,
            });
            // The only way in for a Google-only brand: the gate's own platform switch (a local pick).
            if (gated && expected.google_ads) {
              await gate.getByRole('button', { name: 'Google Ads', exact: true }).click();
              try {
                sw = await readSwitch(page, false);
              } catch {
                sw = null;
              }
              await settle(page, 60_000);
              const via = await shot(page, `optimizer-overview-${cell}-via-google`);
              recorder.record(
                `${cell}: the gate's "Google Ads" switch opens Performance +`,
                sw ? 'PASS' : 'FAIL',
                `${page.url()} · ${via}`,
              );
              obs.add({ cell: `${cell}-via-google`, switch: sw, url: page.url() });
            }
            if (!sw) continue;
          }
          const tablistAria = await page
            .locator('[data-testid="platform-tabs"]')
            .first()
            .ariaSnapshot()
            .catch(() => '');
          obs.add({ cell, tablistAria });
          const doubled = sw.tabs.filter((t) => t.markTitle && t.markAriaHidden !== 'true');
          recorder.record(
            `${cell}: the logo is not read out beside the name`,
            doubled.length === 0 ? 'PASS' : 'FAIL',
            doubled.length
              ? `marks with a title and no aria-hidden: ${doubled.map((t) => `${t.tab}=${t.markTitle}`).join(', ')} · aria: ${tablistAria.replace(/\n/g, ' ').slice(0, 300)}`
              : undefined,
          );
          const byTab = Object.fromEntries(sw.tabs.map((t) => [t.tab, t]));
          const order = sw.tabs.map((t) => t.tab).join(',');
          recorder.record(
            `${cell}: four tabs All·Meta·Google·TikTok`,
            order === 'all,meta,google_ads,tiktok_ads' ? 'PASS' : 'FAIL',
            order,
          );
          for (const platform of ['meta', 'google_ads', 'tiktok_ads'] as const) {
            const tab = byTab[platform];
            const want = expected[platform];
            const ok =
              tab?.hasIcon === true &&
              tab.connected === String(want) &&
              tab.iconMuted === !want &&
              /Connect/.test(tab.text) === !want;
            recorder.record(
              `${cell}: ${platform} tab — logo, ${want ? 'connected' : 'muted + Connect'}`,
              ok ? 'PASS' : 'FAIL',
              JSON.stringify(tab),
            );
          }
          const fits = sw.scrollWidth <= sw.clientWidth + 1 && sw.right <= sw.viewport;
          recorder.record(
            `${cell}: the switch fits the screen (no hidden tab)`,
            fits ? 'PASS' : 'FAIL',
            `scroll ${sw.scrollWidth} client ${sw.clientWidth} right ${sw.right} vw ${sw.viewport}`,
          );
          recorder.record(
            `${cell}: Overview geometric detector`,
            overviewAudit.violations.length === 0 ? 'PASS' : 'FAIL',
            overviewAudit.violations
              .slice(0, 6)
              .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
              .join(' | '),
          );

          // Keyboard, once per brand at 1440 light: arrow keys along the tablist, Enter selects.
          if (!keyboardChecked && viewport.width === 1440 && theme === 'light') {
            keyboardChecked = true;
            const first = page.locator('[data-testid="platform-tab-all"]').first();
            await first.focus();
            await page.keyboard.press('ArrowRight');
            const afterArrow = await page.evaluate(
              () => document.activeElement?.getAttribute('data-tab') ?? null,
            );
            await page.keyboard.press('Tab');
            const afterTab = await page.evaluate(
              () => document.activeElement?.getAttribute('data-tab') ?? null,
            );
            await page.locator('[data-testid="platform-tab-google_ads"]').first().focus();
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1500);
            const selected = await page
              .locator('[data-testid="platform-tab-google_ads"]')
              .first()
              .getAttribute('aria-selected');
            const focusRing = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement | null;
              if (!el) return null;
              const style = getComputedStyle(el);
              return { boxShadow: style.boxShadow, outline: style.outlineStyle };
            });
            obs.add({
              cell,
              keyboard: { afterArrow, afterTab, selected, url: page.url(), focusRing },
            });
            recorder.record(
              `${brand.key}: Enter on the Google tab selects it`,
              selected === 'true' && /platform=google_ads/.test(page.url()) ? 'PASS' : 'FAIL',
              `selected=${selected} url=${page.url()}`,
            );
            recorder.record(
              `${brand.key}: ArrowRight moves focus along the tablist (ARIA tabs pattern)`,
              afterArrow === 'meta' ? 'PASS' : 'WARN',
              `focus after ArrowRight: ${afterArrow}; after Tab: ${afterTab}`,
            );
          }

          // The Google tab with its cards.
          if (brand.google) {
            // A click, as a person does: a reload would put a Google-only brand back behind the gate.
            const googleTab = page.locator('[data-testid="platform-tab-google_ads"]').first();
            if ((await googleTab.getAttribute('aria-selected')) !== 'true') await googleTab.click();
            await page
              .locator('[data-testid="platform-tab-google_ads"][aria-selected="true"]')
              .first()
              .waitFor({ timeout: 90_000 })
              .catch(() => undefined);
            await settle(page, 75_000);
            const rendered = await page
              .locator('[data-testid="account-finding"]')
              .evaluateAll((els) =>
                els.map((el) => ({
                  idea: el.getAttribute('data-idea'),
                  facts: Array.from(
                    el.querySelectorAll('[data-testid="account-finding-fact"]'),
                  ).map((f) => ({
                    label: (f.querySelector('dt')?.textContent ?? '').trim(),
                    value: (f.querySelector('dd')?.textContent ?? '').trim(),
                  })),
                  recommendOnly: Boolean(
                    el.querySelector('[data-testid="account-finding-recommend-only"]'),
                  ),
                  writeButtons: Array.from(
                    el.closest('article, li, section, [data-testid]')?.querySelectorAll('button') ??
                      [],
                  )
                    .map((b) => (b.textContent ?? '').trim())
                    .filter((t) => /^(Approve|Apply|Run|Pause|Add|Raise|Lower|Dismiss)/i.test(t)),
                })),
              );
            const googleText = (
              await page
                .locator('main')
                .first()
                .innerText()
                .catch(() => '')
            ).slice(0, 4000);
            const googleAudit = await audit(
              page,
              `Optimizer/Google/${brand.key}`,
              viewport.width,
              theme,
            );
            const googleShot = await shot(page, `optimizer-google-${cell}`);
            const want = findings.map((c) => c.idea).sort();
            const got = rendered.map((r) => r.idea).sort();
            recorder.record(
              `${cell}: one card per stored P8 finding`,
              JSON.stringify(want) === JSON.stringify(got) ? 'PASS' : 'FAIL',
              `stored [${want.join(',')}] rendered [${got.join(',')}]`,
            );
            let factMismatch = 0;
            for (const card of rendered) {
              const stored = findings.find((c) => c.idea === card.idea);
              if (!stored) continue;
              const same = JSON.stringify(stored.facts) === JSON.stringify(card.facts);
              if (!same) {
                factMismatch += 1;
                obs.add({
                  cell,
                  factMismatch: { idea: card.idea, stored: stored.facts, rendered: card.facts },
                });
              }
            }
            recorder.record(
              `${cell}: every card prints the stored facts`,
              factMismatch === 0 ? 'PASS' : 'FAIL',
              `${factMismatch} card(s) differ`,
            );
            if (brand.key === 'pink') {
              const allRecommendOnly = rendered.every((r) => r.recommendOnly);
              recorder.record(
                `${cell}: Pink — every finding recommend-only`,
                allRecommendOnly && rendered.length > 0 ? 'PASS' : 'FAIL',
                `${rendered.length} cards`,
              );
            }
            recorder.record(
              `${cell}: Google tab geometric detector`,
              googleAudit.violations.length === 0 ? 'PASS' : 'FAIL',
              googleAudit.violations
                .slice(0, 6)
                .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
                .join(' | '),
            );
            obs.add({
              cell,
              googleRendered: rendered,
              googleText: googleText.slice(0, 1500),
              googleViolations: googleAudit.violations,
              googleShot,
            });
          }
          const l1 = [
            ...opened.events.consoleErrors,
            ...opened.events.pageErrors,
            ...opened.events.serverErrors,
          ];
          recorder.record(
            `${cell}: no console error / 5xx`,
            l1.length === 0 ? 'PASS' : 'FAIL',
            l1.slice(0, 3).join(' | '),
          );
          obs.add({
            cell,
            switch: sw,
            switchMs,
            overviewViolations: overviewAudit.violations,
            events: opened.events,
            guardBlocked: opened.guard.blocked,
            guardAllowedNonGet: opened.guard.allowedNonGet.slice(0, 40),
            shot: overviewShot,
          });
        } catch (error) {
          recorder.record(`${cell}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
          await shot(page, `optimizer-${cell}-error`);
        } finally {
          await opened.close();
        }
      }
    }
  } finally {
    notes.push(...(await revokeAll()));
    notes.push(`observations: ${obs.flush()}`);
    recorder.print();
  }
  expect(true).toBe(true);
});
