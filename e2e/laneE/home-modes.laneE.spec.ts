import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type HomeBrandReading, readBrand } from '../../packages/contracts/src/home/brandReading';
import { homeProfileRowSchema } from '../../packages/contracts/src/home/objectives';
import {
  type AccountBuckets,
  accountCountsFrom,
  businessFrom,
  portfolioSignalsFrom,
  savedGoalFrom,
} from '../../src/lib/home/brandSignals';
import { mapIntegrationTypeToPlatformKey } from '../../src/lib/integrations/platform';
import { createBenchRecorder } from '../support/benchRecorder';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from '../support/prodEnv';
import {
  audit,
  boxOf,
  cells,
  identityFor,
  Observations,
  onlyCases,
  openAs,
  progress,
  revokeAll,
  settle,
  shot,
} from './support';

// laneE:home — the adaptive Home (FE beta 7e87fc2d) on what its two benches do not drive:
//   · a SETUP brand (nothing connected: the strip must sit above the setup checklist),
//   · the only APPROVE brand in production (Pink Elephant, read-only, Google-only account),
//   · two FIX brands (Easy Fit 2026 with 19 ad accounts, Vivo 47),
// at 390 / 1024 / 1440 in light and dark, with the geometric detector on every cell. The
// expected reading is computed here with the same mappers and readBrand the server uses, from
// service-role reads of the same rows — never from the page.
// READ ONLY: no goal is saved, no control is clicked; brand pins on the bench sessions only.

const { serviceRoleKey } = loadProdSupabaseEnv();
const admin = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VIVO_OWNER = 'mercadotecniavivo@gmail.com';
/** Pink Elephant's members are the client, two agency operators and Ramiro's fallback bench
 *  identity (scripts/_bench/pausedWrites.ts BENCH_FALLBACK_EMAIL, operator since 10-30). */
const PINK_MEMBER = 'ramibuisel@gmail.com';

const CASES = [
  // The Sound Vault: Ramiro's own brand, onboarding completed (a Brand Book exists), nothing
  // assigned — the reading must come from the Brand Book. (mercadotecniavivo's Brand, the first
  // pick, is soft-deleted: active=false.)
  {
    key: 'setup-soundvault',
    email: PINK_MEMBER,
    brandId: '65de7c08-53f6-418c-8907-ffce63624961',
    mode: 'setup',
  },
  {
    key: 'approve-pink',
    email: PINK_MEMBER,
    brandId: '8e5b7185-e43f-4150-b763-b86c4f5297a0',
    mode: 'approve',
  },
  {
    key: 'fix-easyfit2026',
    email: VIVO_OWNER,
    brandId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    mode: 'fix',
  },
  {
    key: 'fix-vivo47',
    email: VIVO_OWNER,
    brandId: '61b80f51-709a-4408-9f11-04142a286baa',
    mode: 'fix',
  },
] as const;

async function expectedReading(brandId: string): Promise<{
  reading: HomeBrandReading;
  accounts: { ads: number; organic: number };
  adPlatforms: string[];
}> {
  const [assets, book, brand, profiles] = await Promise.all([
    admin
      .schema('brand_profiles')
      .from('brand_profile_integration_accounts')
      .select('brand_profile_id, integration_accounts_assets:integration_account_id(type, status)')
      .eq('brand_profile_id', brandId),
    admin
      .schema('brand_profiles')
      .from('brand_book')
      .select(
        'business:assembled->report->composite->structured->business, headline:assembled->report->composite->first_impression->headline',
      )
      .eq('brand_id', brandId)
      .maybeSingle(),
    admin
      .schema('brand_profiles')
      .from('brand_profiles')
      .select('description, approval_chain_required')
      .eq('id', brandId)
      .maybeSingle(),
    admin
      .schema('brand_profiles')
      .from('home_profiles')
      .select('brand_id, scope, objectives, source, updated_at')
      .eq('brand_id', brandId),
  ]);
  const buckets: AccountBuckets = {};
  const adPlatforms: string[] = [];
  for (const row of (assets.data ?? []) as unknown as {
    integration_accounts_assets: { type: string | null; status: string | null } | null;
  }[]) {
    const type = row.integration_accounts_assets?.type ?? null;
    const key = type === 'tiktok_advertiser' ? 'tiktokAds' : mapIntegrationTypeToPlatformKey(type);
    if (!key) continue;
    if (/ads|advertiser/i.test(String(type))) adPlatforms.push(String(type));
    const bucket = buckets[key] ?? { accounts: [] };
    buckets[key] = bucket;
    bucket.accounts.push({ type, status: row.integration_accounts_assets?.status ?? null });
  }
  const accounts = accountCountsFrom(buckets);
  let portfolioRows: unknown = [];
  if (accounts.ads + accounts.organic > 0) {
    const { data } = await admin.rpc('optimizer_list_portfolios', { p_brand_id: brandId });
    portfolioRows = data ?? [];
  }
  const parsedProfiles = ((profiles.data ?? []) as unknown[])
    .map((row) => homeProfileRowSchema.safeParse(row))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  const bookData = (book.data ?? {}) as { business?: unknown; headline?: unknown };
  const brandData = (brand.data ?? {}) as {
    description?: unknown;
    approval_chain_required?: unknown;
  };
  const reading = readBrand({
    accounts,
    savedGoal: savedGoalFrom(parsedProfiles),
    business: businessFrom({
      structuredBusiness: bookData.business ?? null,
      headline: bookData.headline ?? null,
      brandDescription: brandData.description,
    }),
    portfolios: portfolioSignalsFrom(portfolioRows),
    approvalRequired: brandData.approval_chain_required === true,
  });
  return { reading, accounts, adPlatforms };
}

test('laneE:home — setup / approve / fix brands, 390·1024·1440 × light·dark', async ({
  browser,
}) => {
  test.setTimeout(3_000_000);
  const notes: string[] = [];
  const recorder = createBenchRecorder('laneE:home', notes);
  const obs = new Observations('home');
  try {
    for (const homeCase of onlyCases(CASES)) {
      const { reading, accounts, adPlatforms } = await expectedReading(homeCase.brandId);
      obs.add({
        case: homeCase.key,
        expectedMode: reading.mode,
        modules: reading.modules.map((m) => m.id),
        accounts,
        adPlatforms,
        opportunities: reading.opportunities,
        goal: reading.goal,
      });
      recorder.record(
        `${homeCase.key}: the computed reading is the mode the case was chosen for (${homeCase.mode})`,
        reading.mode === homeCase.mode ? 'PASS' : 'FAIL',
        `computed ${reading.mode}`,
      );
      const identity = await identityFor(homeCase.email);
      for (const { viewport, theme } of cells()) {
        {
          const cell = `${homeCase.key}@${viewport.width}-${theme}`;
          progress(`home ${cell} open`);
          const opened = await openAs(browser, identity, homeCase.brandId, viewport, theme);
          const { page } = opened;
          try {
            const t0 = Date.now();
            await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 });
            const strip = page.locator('[data-home-reading]').first();
            const stripShown = await strip.waitFor({ state: 'visible', timeout: 90_000 }).then(
              () => true,
              () => false,
            );
            const stripMs = Date.now() - t0;
            const settled = await settle(page, 60_000);
            const shown = stripShown ? await strip.getAttribute('data-home-reading') : null;
            const modeLabel = stripShown
              ? (
                  await page
                    .locator('[data-home-mode]')
                    .first()
                    .innerText({ timeout: 5_000 })
                    .catch(() => '')
                ).trim()
              : null;
            const slots = await page
              .locator('[data-home-slot]')
              .evaluateAll((els) => els.map((el) => el.getAttribute('data-home-slot')));
            const stripBox = stripShown
              ? await strip.boundingBox({ timeout: 5_000 }).catch(() => null)
              : null;
            const setupBox = await boxOf(page, '[data-testid="dashboard-first-run"]');
            const bodyText = (
              await page
                .locator('main, body')
                .first()
                .innerText()
                .catch(() => '')
            ).slice(0, 4000);
            const connectMeta = /Connect a Meta ad account to see paid results/.test(bodyText);
            progress(`home ${cell} audit (strip=${shown} in ${stripMs} ms)`);
            const report = await audit(page, `Home/${homeCase.key}`, viewport.width, theme);
            progress(`home ${cell} audited: ${report.violations.length} violations`);
            const shotPath = await shot(page, `home-${cell}`);
            obs.add({
              cell,
              stripShown,
              stripMs,
              settled,
              shownMode: shown,
              modeLabel,
              slots,
              stripBox,
              setupBox,
              connectMeta,
              violations: report.violations,
              unexercised: report.unexercised,
              events: opened.events,
              guardBlocked: opened.guard.blocked,
              shot: shotPath,
            });
            recorder.record(
              `${cell}: strip shows mode ${reading.mode}`,
              shown === reading.mode ? 'PASS' : 'FAIL',
              `shown ${shown} label "${modeLabel}" in ${stripMs} ms`,
            );
            if (homeCase.mode !== 'setup') {
              const expectedOrder = reading.modules
                .map((m) => m.id)
                .filter((id) => slots.includes(id));
              recorder.record(
                `${cell}: modules follow the reading`,
                JSON.stringify(slots) === JSON.stringify(expectedOrder) && slots.length > 0
                  ? 'PASS'
                  : 'FAIL',
                `slots ${slots.join('>')} expected ${reading.modules.map((m) => m.id).join('>')}`,
              );
            } else {
              const above =
                stripBox && setupBox ? stripBox.y + stripBox.height <= setupBox.y + 2 : null;
              recorder.record(
                `${cell}: setup strip sits above the checklist`,
                above === true ? 'PASS' : 'FAIL',
                `strip ${JSON.stringify(stripBox)} setup ${JSON.stringify(setupBox)}`,
              );
            }
            recorder.record(
              `${cell}: geometric detector`,
              report.violations.length === 0 ? 'PASS' : 'FAIL',
              report.violations
                .slice(0, 6)
                .map((v) => `${v.rule} ${v.selector} ${v.detail}`.slice(0, 180))
                .join(' | '),
            );
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
          } catch (error) {
            recorder.record(`${cell}: page`, 'FAIL', (error as Error).message.split('\n')[0]);
            await shot(page, `home-${cell}-error`);
          } finally {
            await opened.close();
          }
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
