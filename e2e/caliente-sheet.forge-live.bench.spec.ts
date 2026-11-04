import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { type MintedSession, mintSessionBundleForEmail } from './support/auth';
import { STARCRAFT_BRAND_ID } from './support/forge-studio-fixtures';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// forge:caliente:ui:bench — the owner's Caliente Fecha 10 workbook through the Render tab, in a
// real Chrome, as bench@trycontinuum.ai in StarCraft, against Inyogo's Card B (207) and Card A
// (331) assigned to StarCraft. Real backend, production Supabase; nothing is rendered.
//
// Per card: pick the template → Import → choose the .xlsx → (week 1) the AI mapping lands, or
// (week 2) last week's mapping applies → Import 9 rows (they land selected) → the AI button makes
// one edit → ⌘Z takes it back, ⇧⌘Z puts it back → Render opens the confirmation. Every click is
// counted and every step timed; the run fails on a wrong value, never on a slow one, and writes
// what it measured to FORGE_CALIENTE_OUT. Run week 1 then week 2:
//   FORGE_CALIENTE_WEEK=1 FORGE_CALIENTE_API_URL=http://127.0.0.1:4811 bun run forge:caliente:ui:bench
//   FORGE_CALIENTE_WEEK=2 … bun run forge:caliente:ui:bench
// ---------------------------------------------------------------------------

const { publishableKey, serviceRoleKey } = loadProdSupabaseEnv();
const API_URL = process.env.FORGE_CALIENTE_API_URL ?? 'http://localhost:4000';
const WEEK = process.env.FORGE_CALIENTE_WEEK === '2' ? 2 : 1;
const RUN_ID = process.env.FORGE_CALIENTE_RUN_ID ?? String(Date.now());
// Playwright loads specs as CommonJS; the script runs from the Frontend root.
const HERE = resolve(process.cwd(), 'e2e');
const OUT = resolve(
  process.env.FORGE_CALIENTE_OUT ??
    resolve(HERE, `../test-results/forge-caliente-week${WEEK}-${RUN_ID}.json`),
);
const WORKBOOK = resolve(
  HERE,
  '../packages/contracts/src/ai-studio/fixtures/caliente/cuotas-fecha-10.xlsx',
);
const RUN_STARTED = new Date().toISOString();

const CARDS = [
  {
    card: 'B',
    key: '207',
    qrKey: 'template_field_10',
    bindingId: '80cc4f63-c3c3-4063-a2e1-9ddb3a777c6c',
    template: 'Caliente Card B Halftime',
    sheet: 'Card B',
    headerRow: '3',
    firstRow: 'Alianza Atletico vs Comerciantes Unidos',
    ask: 'Pon la cuota B de Alianza Atletico vs Comerciantes Unidos en 1.95',
    field: 'Right Odds (Menos de 2.5 / No)',
    fieldKey: 'template_field_1',
    before: '1.90',
    after: '1.95',
  },
  {
    card: 'A',
    key: '331',
    qrKey: 'qr_code',
    bindingId: '7156d3c3-f5db-4849-b9fd-d07772e62a8c',
    template: 'Card A (Pre-Match) — Jerseys',
    sheet: 'Card A',
    headerRow: '2',
    firstRow: 'Alianza Atletico',
    ask: 'Cambia la cuota del empate de FC Cajamarca y Cusco FC a 3.70',
    field: 'Draw Bet',
    fieldKey: 'draw_bet',
    before: '3.65',
    after: '3.70',
  },
] as const;

/** Written once on the set by the team; the AI button reads it as the set's rules. */
const CARD_B_RULES =
  'Cuota A = Si / Más de 2.5 (izquierda); Cuota B = No / Menos de 2.5 (derecha). La cuota más alta lleva caja roja #d72828 con texto blanco; la otra caja blanca con texto negro. Ganarías = 100 × la cuota en rojo. Las cuotas siempre llevan 2 decimales.';
/** One transparent pixel: a jersey stand-in named after its team, as a design team's folder is. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const KITS_DIR = resolve(HERE, `../test-results/caliente-kits-${RUN_ID}`);
const CARD_A_TEAMS = [
  'Alianza Atletico',
  'Comerciantes Unidos',
  'Alianza Lima',
  'ADT',
  'FC Cajamarca',
  'Cusco FC',
  'Sporting Cristal',
  'Atletico Grau',
  'Deportivo Garcilaso',
  'Universitario de Deportes',
  'FBC Melgar',
  'Sports Boys',
  'Sport Huancayo',
  'UTC',
  'Juan Pablo II',
  'CD Moquegua',
  'Cienciano',
];

let session: MintedSession | null = null;
let documentsBefore = 0;
const measured: Record<string, unknown> = { week: WEEK, api: API_URL, runId: RUN_ID, cards: {} };

const service = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false },
});
const countDocuments = async () => {
  const { count, error } = await service
    .schema('brand_profiles')
    .from('brand_documents')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', STARCRAFT_BRAND_ID);
  if (error) throw new Error(`[caliente-bench] document count failed: ${error.message}`);
  return count ?? 0;
};

async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  if (!session) throw new Error('[caliente-bench] no session');
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    // A JSON content type with no body is a 400 on Fastify: only a request with a body says it.
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok)
    throw new Error(`[caliente-bench] ${init.method ?? 'GET'} ${path} → ${response.status}`);
  return response.status === 204 ? null : response.json();
}

/** Pins THIS session to StarCraft through the same RLS the in-app switcher writes through. */
async function pinSessionToStarCraft(accessToken: string) {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as {
    sub: string;
    session_id: string;
  };
  const member = createClient(PROD_SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await member.schema('brand_profiles').from('user_session_brands').upsert(
    {
      user_id: payload.sub,
      session_id: payload.session_id,
      active_brand_id: STARCRAFT_BRAND_ID,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_id' },
  );
  if (error) throw new Error(`[caliente-bench] session brand pin failed: ${error.message}`);
  const { data } = await member.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  if (data !== STARCRAFT_BRAND_ID)
    throw new Error(`[caliente-bench] session resolves to ${String(data)}, not StarCraft`);
}

async function openRenderTab(browser: Browser): Promise<Page> {
  if (!session) throw new Error('[caliente-bench] no session');
  const context = await browser.newContext({
    storageState: session.state,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto('/forge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Forge' })).toBeVisible({
    timeout: 240_000,
  });
  const tab = page.getByRole('tab', { name: 'Render', exact: true });
  await expect(async () => {
    // A pointer resting where the sidebar hover-expands holds it open over the tabs: park it
    // over the page first, and give each click its own deadline so this loop can retry.
    await page.mouse.move(1200, 600);
    await expect(page.locator('.group.peer[data-state]').first()).toHaveAttribute(
      'data-state',
      'collapsed',
    );
    await tab.click({ timeout: 5_000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
    // A cold dev server compiles the Forge's client chunks after the first paint.
  }).toPass({ timeout: 180_000 });
  return page;
}

const selectedCount = (page: Page) =>
  page.locator('[aria-label="Select row"][aria-checked="true"]').count();
const rowNamed = (page: Page, label: string): Locator =>
  page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^Drag ${label}`) }) });
/** How many of a field's inputs hold `value` now — React keeps the property, not the attribute. */
const holding = (page: Page, field: string, value: string) =>
  page
    .locator(`input[aria-label="${field}"]`)
    .evaluateAll(
      (inputs, wanted) =>
        inputs.filter((input) => (input as HTMLInputElement).value === wanted).length,
      value,
    );

/** How many rows of this run's set, as SAVED, hold `value` for `key` — the autosave's proof. */
async function savedHolding(templateKey: string, key: string, value: string) {
  const { data } = await service
    .schema('media')
    .from('render_sets')
    .select('rows')
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .eq('template_key', templateKey)
    .eq('name', `Bench · Caliente ${RUN_ID}`)
    .maybeSingle();
  const rows = (data?.rows ?? []) as Array<{ overrides?: Record<string, unknown> }>;
  return rows.filter((row) => row.overrides?.[key] === value).length;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  session = await mintSessionBundleForEmail('bench@trycontinuum.ai');
  await pinSessionToStarCraft(session.accessToken);
  if (WEEK === 1)
    for (const card of CARDS)
      await api('/api/ai-studio/renders/import-mapping', {
        method: 'PUT',
        body: {
          brandId: STARCRAFT_BRAND_ID,
          bindingId: card.bindingId,
          templateKey: card.key,
          mapping: null,
        },
      });
  documentsBefore = await countDocuments();
  // Last week's set, as the team left it: one row carrying the QR every card shows. The import
  // carries it onto the new rows. Card B's set holds the team's written rules.
  const { data: images } = await service
    .schema('media')
    .from('assets')
    .select('id')
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .eq('kind', 'image')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const qr = images?.[0]?.id as string | undefined;
  if (!qr)
    throw new Error('[caliente-bench] StarCraft holds no Library image to stand in for the QR');
  for (const card of CARDS) {
    const contract = (await api(
      `/api/ai-studio/renders/templates/${card.key}/contract?brandId=${STARCRAFT_BRAND_ID}&bindingId=${card.bindingId}`,
    )) as { template: { contractHash: string } };
    await api('/api/ai-studio/renders/sets', {
      method: 'POST',
      body: {
        brandId: STARCRAFT_BRAND_ID,
        bindingId: card.bindingId,
        name: `Bench · Caliente ${RUN_ID}`,
        ...(card.card === 'B' ? { description: CARD_B_RULES } : {}),
        templateKey: card.key,
        contractHash: contract.template.contractHash,
        rows: [
          {
            id: randomUUID(),
            parentId: null,
            label: 'Last week · QR',
            overrides: { [card.qrKey]: { assetId: qr } },
            clearedKeys: [],
            outputIds: [],
          },
        ],
      },
    });
  }
  mkdirSync(KITS_DIR, { recursive: true });
  for (const team of CARD_A_TEAMS) writeFileSync(resolve(KITS_DIR, `${team}.png`), PIXEL_PNG);
});

for (const spec of CARDS) {
  test(`week ${WEEK} · Card ${spec.card}: workbook → mapped → 9 rows → one AI edit → tray`, async ({
    browser,
  }) => {
    const page = await openRenderTab(browser);
    const steps: Record<string, number> = {};
    let clicks = 0;
    const click = async (target: Locator) => {
      clicks += 1;
      await target.click();
    };

    // The template, as a person picks it. Not counted: choosing the template is not the import.
    // The picker is disabled until the template list loads, and a click before hydration is lost.
    const search = page.getByRole('combobox', { name: 'Search templates' });
    await expect(async () => {
      if (!(await search.isVisible()))
        await page.getByRole('button', { name: 'Template', exact: true }).click();
      await expect(search).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    await search.fill(spec.template);
    await page
      // The picker shows display names: "Pre-Match" reads "Pre Match" there.
      .getByRole('option', {
        name: new RegExp(`^${spec.template.replace(/[()]/g, '\\$&').replace(/-/g, '[- ]')}`),
      })
      .first()
      .click();
    await expect(page.getByRole('toolbar', { name: 'Render' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[aria-label="Select row"]').first()).toBeVisible({
      timeout: 60_000,
    });
    const rowsBefore = await page.locator('[aria-label="Select row"]').count();

    let mark = Date.now();
    await click(page.getByRole('button', { name: /^Import/ }));
    await click(page.getByRole('menuitem', { name: /Upload CSV or XLSX/ }));
    const dialog = page.getByRole('dialog', { name: 'Import render rows' });
    await expect(dialog).toBeVisible();
    clicks += 1; // the file picker
    await dialog.locator('input[type="file"]').first().setInputFiles(WORKBOOK);
    const fileChosen = Date.now();
    const importButton = dialog.getByRole('button', { name: 'Import 9 rows' });
    if (WEEK === 2)
      await expect(dialog.getByText(/mapped as last time/)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('button', { name: 'Mapping columns…' })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(importButton).toBeEnabled({ timeout: 30_000 });
    steps.fileToMappedMs = Date.now() - fileChosen;
    await expect(dialog.getByLabel('Sheet')).toContainText(spec.sheet);
    await expect(dialog.getByLabel('Header row')).toHaveValue(spec.headerRow);
    const mappingClicks = clicks - 3;
    if (spec.card === 'A') {
      // No jersey in StarCraft's Library carries these names: the team's folder is dropped in.
      await expect(dialog.getByText(/Pictures by name/)).toBeVisible();
      await click(dialog.getByRole('button', { name: /Add a folder of pictures/ }));
      await dialog.getByLabel('Choose a folder of pictures').setInputFiles(KITS_DIR);
      await expect(dialog.getByText(/(\d+) of \1 found\./)).toBeVisible({ timeout: 30_000 });
    }

    await click(importButton);
    await expect(page.locator('[aria-label="Select row"]')).toHaveCount(rowsBefore + 9, {
      timeout: 120_000,
    });
    expect(await selectedCount(page)).toBe(9);
    steps.importClickToRowsMs = Date.now() - mark;
    const row = rowNamed(page, spec.firstRow).first();
    await expect(row).toBeVisible();

    // One edit through the AI button, then undo and redo it from the keyboard.
    const editStarted = Date.now();
    let assistClicks = 0;
    const assistClick = async (target: Locator) => {
      assistClicks += 1;
      await target.click();
    };
    await assistClick(
      page.getByRole('toolbar', { name: 'Render' }).getByRole('button', { name: /^Add/ }),
    );
    await assistClick(page.getByRole('menuitem', { name: /Draft with AI/ }));
    const bubble = page.getByRole('dialog', { name: 'Draft rows with AI' });
    await bubble.getByLabel(/^Ask/).fill(spec.ask);
    const liveBefore = await page
      .locator('#render-preview img[alt="Live preview"]')
      .first()
      .getAttribute('src', { timeout: 1_000 })
      .catch(() => null);
    const sent = Date.now();
    await assistClick(bubble.getByRole('button', { name: 'Send' }));
    await expect(bubble.getByRole('status')).toBeVisible({ timeout: 30_000 });
    steps.assistantAnswerMs = Date.now() - sent;
    const held = () => holding(page, spec.field, spec.after);
    await expect.poll(held, { timeout: 10_000 }).toBe(1);
    steps.askToValueMs = Date.now() - editStarted;
    const landed = Date.now();
    // Kept without a click: the edit reaches the saved set by the grid's own autosave.
    await expect
      .poll(() => savedHolding(spec.key, spec.fieldKey, spec.after), { timeout: 15_000 })
      .toBe(1);
    steps.valueToSavedMs = Date.now() - landed;
    // The Live preview repaints the edited row with no click: a new frame whose drawing holds the
    // new value. Recorded, not asserted — a template whose scene cannot be read has no Live frame.
    const pane = page.locator('#render-preview');
    const live = pane.locator('img[alt="Live preview"]');
    const liveSrc = () =>
      live
        .first()
        .getAttribute('src', { timeout: 1_000 })
        .catch(() => null);
    const previewDrawsEdit = await expect
      .poll(
        async () => {
          const src = await liveSrc();
          if (!src || src === liveBefore) return false;
          return page.evaluate(
            async ({ url, wanted }) => (await (await fetch(url)).text()).includes(wanted),
            { url: src, wanted: spec.after },
          );
        },
        { timeout: 8_000 },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const previewText = ((await pane.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    await assistClick(bubble.getByRole('button', { name: 'Done' }));
    await expect(bubble).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(held, { timeout: 10_000 }).toBe(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(held, { timeout: 10_000 }).toBe(1);

    // Render opens the review with the nine imported rows — once each has passed its dry-run.
    mark = Date.now();
    const renderButton = page
      .getByRole('toolbar', { name: 'Render' })
      .getByRole('button', { name: /^Render 9 rows/ });
    await expect(renderButton)
      .toBeEnabled({ timeout: 180_000 })
      .catch(async (error: unknown) => {
        // Name what each row is waiting on: the grid's own status cells, as a person reads them.
        const rows = await page
          .locator('tr[data-row-id]')
          .evaluateAll((items) =>
            items.map((item) => (item as HTMLElement).innerText.replace(/\s+/g, ' ').slice(-220)),
          );
        throw new Error(`rows never became Ready:\n${rows.join('\n')}`, { cause: error });
      });
    steps.rowsReadyMs = Date.now() - mark;
    await click(renderButton);
    // The render's one confirmation (the old review tray); the metric keeps its historical name.
    const confirm = page.getByRole('dialog', { name: /^Render 9 rows · / });
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    steps.renderClickToTrayMs = Date.now() - mark;
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();

    const cards = measured.cards as Record<string, unknown>;
    cards[spec.card] = {
      template: spec.template,
      importToTrayClicks: clicks,
      mappingClicks,
      assistantClicks: assistClicks,
      previewDrawsEdit,
      previewText: previewText.slice(0, 240),
      steps,
    };
    await page.context().close();
  });
}

test.afterAll(async () => {
  const documentsAfter = await countDocuments().catch(() => -1);
  measured.brandDocumentsBefore = documentsBefore;
  measured.brandDocumentsAfter = documentsAfter;
  // Import and assistant never render: no job for StarCraft may start during the run.
  const { count: jobs } = await service
    .schema('media')
    .from('ad_render_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .gte('created_at', RUN_STARTED);
  measured.renderJobsDuringRun = jobs ?? -1;
  // The sets the imports autosaved, removed; the saved mappings stay — they are week 2's input.
  const { data: sets } = await service
    .schema('media')
    .from('render_sets')
    .select('id,template_key,name')
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .in(
      'template_key',
      CARDS.map((card) => card.key),
    )
    .gte('created_at', RUN_STARTED);
  const left: string[] = [];
  for (const set of sets ?? [])
    await api(`/api/ai-studio/renders/sets/${set.id}?brandId=${STARCRAFT_BRAND_ID}`, {
      method: 'DELETE',
    }).catch((error: unknown) => left.push(`${set.id}: ${String(error)}`));
  measured.setsCleaned = (sets ?? []).length - left.length;
  measured.setsLeft = left;
  // The stand-in jerseys the import uploaded, out of the Library again.
  const { data: kits } = await service
    .schema('media')
    .from('assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('brand_id', STARCRAFT_BRAND_ID)
    .in(
      'file_name',
      CARD_A_TEAMS.map((team) => `${team}.png`),
    )
    .gte('created_at', RUN_STARTED)
    .select('id');
  measured.kitsCleaned = (kits ?? []).length;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(measured, null, 2));
  console.log(`[caliente-bench] ${JSON.stringify(measured)}`);
  expect(documentsAfter).toBe(documentsBefore);
  expect(measured.renderJobsDuringRun).toBe(0);
});
