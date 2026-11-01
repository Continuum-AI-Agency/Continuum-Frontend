import { expect, test } from '@playwright/test';
import { identityFor, openAs, revokeAll, writeJson } from '../laneE/support';

// laneH:mcc — PP-DT-E-home-setup-mode-mcc-mismatch, the Scale half. The Sound Vault's only
// assignment is a Google Ads manager (MCC "Cont Sandbox", 4990471415, status "manager"): it runs
// no campaigns. Lane E saw Scale's gate switch to Google open the portfolio wizard on it
// ("Cont Sandbox · Google ads · Manager", "No active ad sets found for this account yet").
// Read here as a person meets it: Scale opened, then the gate's own "Google Ads" switch pressed
// when the gate is there. The manager is never offered, selected or read as an ad account.
// READ ONLY through lane E's harness: a page is opened and a platform switch pressed.

const RAMI = 'ramibuisel@gmail.com';
const SOUND_VAULT = '65de7c08-53f6-418c-8907-ffce63624961';
const MCC = '4990471415';

test('laneH:mcc — a Google Ads manager is never one of the brand’s ad accounts in Scale', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const identity = await identityFor(RAMI);
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: unknown) => {
    results.push({ name, ok, detail });
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail).slice(0, 400)}`);
  };
  try {
    const opened = await openAs(
      browser,
      identity,
      SOUND_VAULT,
      { width: 1440, height: 900 },
      'light',
    );
    const mccReads: string[] = [];
    opened.page.on('request', (request) => {
      const url = request.url();
      if (!/\/functions\/v1\/(paid-media-metrics|optimizer-suggest)/.test(url)) return;
      if ((request.postData() ?? '').includes(MCC)) {
        mccReads.push(
          `${url.split('/functions/v1/')[1]} ${(request.postData() ?? '').slice(0, 160)}`,
        );
      }
    });
    try {
      const { page } = opened;
      await page.goto('/scale?tab=performance', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(20_000);
      const landing = await page.locator('body').innerText();
      const gate = page.locator('section[aria-label="Paid setup diagnostics"]').first();
      const gated = (await gate.count()) > 0;
      let afterSwitch: string | null = null;
      if (gated) {
        const google = gate.getByRole('button', { name: 'Google Ads', exact: true });
        if ((await google.count()) > 0) {
          await google.click();
          await page.waitForTimeout(15_000);
          afterSwitch = await page.locator('body').innerText();
        }
      }
      check(
        'the landing never names the manager as the account in use',
        !landing.includes('Cont Sandbox'),
        landing.match(/.{0,80}Cont Sandbox.{0,80}/)?.[0] ?? null,
      );
      check(
        'the gate’s Google switch never opens the wizard on the manager',
        afterSwitch === null || !afterSwitch.includes('Cont Sandbox'),
        afterSwitch?.match(/.{0,80}Cont Sandbox.{0,80}/)?.[0] ?? null,
      );
      check('no Optimizer or metrics read asks for the manager', mccReads.length === 0, mccReads);
      results.push({ name: 'state', gated, switched: afterSwitch !== null });
    } finally {
      await opened.close();
    }
  } finally {
    const cleanup = await revokeAll();
    writeJson(`mcc-${process.env.LANE_H_LABEL ?? 'run'}`, { results, failures, cleanup });
  }
  expect(failures).toEqual([]);
});
