import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionBundleForEmail, type PlaywrightStorageState } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { attachL1, expectDefinedState } from './support/l1Invariants';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// perfplus:tiktok:honesty:ui:bench — the screen half of P2.7 (docs/perfplus-campaign/
// 04-visual-and-platforms.md#tiktok-ads): while TikTok Ads is unbuilt, the product must be
// honest about it everywhere TikTok is named.
//
// A real Chrome drives the real Frontend as the Easy Fit owner against production Supabase and
// the Backend the Frontend `.env` names. On every surface it collects each block of text that
// names TikTok (the sentence, tile, tab or row the mention sits in) and grades:
//
//   paid surfaces     /scale?tab=performance (the three-platform Overview: its TikTok tab and
//                     its "All" tab), /scale?tab=dashboard, /settings?section=integrations:
//                     the TikTok surface is the NAMED empty state (`tiktok-empty`, "TikTok Ads
//                     isn't connected yet"), not one digit beside TikTok once date windows are
//                     stripped, and no action that implies ads data exists (a Jaina prompt about
//                     ad groups, a figure tile, a read block).
//   organic surfaces  /organic?tab=metrics, /organic?tab=explore, /dashboard?view=organic
//                     (the Trends "TikTok" tab): "ads", "ad spend", "CPA" and their kin never sit
//                     in a block that names TikTok — organic reach is not ad performance.
//   copy audit        a static scan of src/ for user-visible strings that name TikTok beside ads
//                     vocabulary without saying it is not connected: sell copy, onboarding chips,
//                     Jaina suggested prompts. Each hit is a finding row with file:line. Copy that
//                     can only render with a connected advertiser is out of scope by path and
//                     said so below; the acceptance spec (tiktokAds.acceptance.ts, describe h)
//                     pins the empty state's own copy.
//
// One viewport (1280): the question is what the words say, not where they wrap; the layout
// lane is perfplus:ui:bench.
//
// ── READ ONLY ── Nothing here connects, approves, applies or saves. The clicks are tab
// triggers and combobox openers. The single write is the bench user's active-brand preference
// (pinned to Easy Fit, restored at the end) — the same row the in-app brand switcher writes.
//
// ── ONE TEST, MANY STEPS ── Soft assertions, one Recorder envelope, every grade named by
// surface. A failed grade is a FINDING for the campaign ledger, never something to loosen here.
// Grades: FAIL = the UI is dishonest (a figure, an ads action, ads words on organic, sell copy);
// WARN = design-intended per docs/optimizer-multiplatform/frontend.html §2 (the "Connect"
// affordance) but worth the ledger because nothing is behind it yet.
//
// Usage: cd Continuum-Frontend && bun run perfplus:tiktok:honesty:ui:bench
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

const { serviceRoleKey, publishableKey } = loadProdSupabaseEnv();

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
/** Easy Fit, the agency row — the campaign's seeded brand (00-context.md, "Auth para tests"). */
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
/** The other Easy Fit row, which owns the active portfolios on the same ad account. The
 *  Optimizer's platform tab row only renders when the brand carries a portfolio, so the TikTok
 *  tab is opened on the first candidate that does (perfplus-l1.bench.spec.ts does the same). */
const EASYFIT_LEDGER_BRAND_ID = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const OPTIMIZER_BRAND_CANDIDATES = [EASYFIT_BRAND_ID, EASYFIT_LEDGER_BRAND_ID] as const;

const VIEWPORT = { width: 1280, height: 900 } as const;
const SHOTS_DIR = resolve(__dirname, '__screenshots__/perfplus-tiktok-honesty');
const SETTLE_MS = 90_000;
const QUIET_MS = 8_000;

const EMPTY_SENTENCE = "TikTok Ads isn't connected yet";

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('perfplus:tiktok:honesty:ui:bench', notes);

type Finding = { surface: string; invariant: string; evidence: string };
const findings: Finding[] = [];

let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  if (findings.length > 0) {
    console.log(
      `[perfplus-tiktok-honesty] FINDINGS (surface × invariant × evidence):\n${findings
        .map((f) => `  - ${f.surface} ${f.invariant}: ${f.evidence}`)
        .join('\n')}`,
    );
  }
  recorder.print();
}

function grade(
  surface: string,
  invariant: string,
  ok: boolean,
  evidence: string,
  severity: 'FAIL' | 'WARN' = 'FAIL',
): void {
  recorder.record(`${surface} ${invariant}`, ok ? 'PASS' : severity, evidence);
  if (!ok) {
    findings.push({ surface, invariant, evidence: `[${severity}] ${evidence}` });
    if (severity === 'FAIL') expect.soft(ok, `${surface} ${invariant}: ${evidence}`).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Text analysis — the same rules the Backend half applies to Jaina's answers
// ---------------------------------------------------------------------------

const TIKTOK = /tik\s?tok/i;
const DIGIT = /\d/;
/** Ads vocabulary that must never share a block with TikTok on an organic surface. */
const ADS_WORDS =
  /\bads?\b|ad spend|\bCPA\b|cost per (?:result|lead|acquisition|click)|\bROAS\b|\bCPC\b|\bCPM\b|advertiser|ad groups?|ad accounts?/i;

/** A window is not a figure: "last 7 days", "últimos 30 días", a date, a year carry no claim. */
function stripWindows(text: string): string {
  return (
    text
      .replace(
        /\b(last|past|previous|[úu]ltim[oa]s?|pasad[oa]s?|pr[óo]xim[oa]s?)\s+\d+\s+(days?|d[íi]as?|weeks?|semanas?|months?|meses|hours?|horas?)\b/gi,
        ' ',
      )
      .replace(
        /\b\d+\s*(days?|d[íi]as?|weeks?|semanas?|months?|meses|hours?|horas?|seconds?|segundos?)\b/gi,
        ' ',
      )
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
      // "Sep 1", "Sept. 14, 2026", "1 de septiembre": a connection date is not a figure either.
      .replace(
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
        ' ',
      )
      .replace(
        /\b\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi,
        ' ',
      )
      .replace(/\b(19|20)\d{2}\b/g, ' ')
  );
}

type TikTokBlock = { tag: string; testid: string | null; text: string; visible: boolean };

/**
 * Every block of visible text that names TikTok, as a reader sees it: the smallest element
 * holding the mention, lifted to the sentence, tile, tab or row it sits in (the nearest block
 * tag or `data-testid` ancestor, at most four levels up). Script, style and template content is
 * not text a reader sees and is skipped.
 */
async function tiktokBlocks(page: Page): Promise<TikTokBlock[]> {
  return page.evaluate(() => {
    const TT = /tik\s?tok/i;
    const BLOCK = new Set([
      'p',
      'li',
      'td',
      'th',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'button',
      'a',
      'label',
      'dt',
      'dd',
      'figcaption',
      'blockquote',
      'summary',
      'legend',
      'caption',
      'option',
    ]);
    const SKIP = new Set(['script', 'style', 'noscript', 'template']);
    // Text nodes joined with a space, not textContent: "Sep 1" + "Revoke" in sibling nodes must
    // read "Sep 1 Revoke", or the date loses its word boundary and reads as a figure.
    const collapse = (node: Node): string => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      let current = walker.nextNode();
      while (current) {
        const value = (current.nodeValue ?? '').trim();
        if (value) parts.push(value);
        current = walker.nextNode();
      }
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    };
    const out = new Map<string, TikTokBlock>();
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(tag) || el.closest('script,style,noscript,template')) continue;
      const text = collapse(el);
      if (!TT.test(text)) continue;
      if (Array.from(el.children).some((child) => TT.test(collapse(child)))) continue;
      let block: HTMLElement | null = el;
      let hops = 0;
      while (
        block &&
        block !== document.body &&
        hops < 4 &&
        !(BLOCK.has(block.tagName.toLowerCase()) || block.hasAttribute('data-testid'))
      ) {
        block = block.parentElement;
        hops += 1;
      }
      const node = block && block !== document.body ? block : (el.parentElement ?? el);
      const blockText = collapse(node).slice(0, 400);
      if (out.has(blockText)) continue;
      const rect = node.getBoundingClientRect();
      out.set(blockText, {
        tag: node.tagName.toLowerCase(),
        testid: node.getAttribute('data-testid'),
        text: blockText,
        visible: rect.width > 0 && rect.height > 0,
      });
    }
    return Array.from(out.values());
  });
}

const describeBlock = (b: TikTokBlock): string =>
  `<${b.tag}${b.testid ? ` ${b.testid}` : ''}> "${b.text.slice(0, 200)}"`;

function digitsBesideTikTok(blocks: readonly TikTokBlock[]): TikTokBlock[] {
  return blocks.filter((b) => b.visible && DIGIT.test(stripWindows(b.text)));
}

function adsBesideTikTok(blocks: readonly TikTokBlock[]): TikTokBlock[] {
  return blocks.filter((b) => b.visible && ADS_WORDS.test(b.text));
}

// ---------------------------------------------------------------------------
// Session, brand pin
// ---------------------------------------------------------------------------

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
let optimizerBrand: string = EASYFIT_BRAND_ID;

function memberClient(): SupabaseClient {
  return createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberToken}` } },
  });
}

function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[perfplus-tiktok-honesty] access token carries no sub claim');
  return decoded.sub;
}

async function countPortfolios(brandId: string): Promise<number> {
  const { data, error } = await memberClient().rpc('optimizer_list_portfolios', {
    p_brand_id: brandId,
  });
  if (error)
    throw new Error(
      `[perfplus-tiktok-honesty] optimizer_list_portfolios(${brandId}): ${error.message}`,
    );
  return Array.isArray(data) ? data.length : 0;
}

async function resolveOptimizerBrand(): Promise<string> {
  const seen: string[] = [];
  for (const brandId of OPTIMIZER_BRAND_CANDIDATES) {
    const count = await countPortfolios(brandId);
    seen.push(`${brandId.slice(0, 8)}=${count}`);
    if (count > 0) {
      notes.push(
        `Optimizer brand: ${brandId} (${count} portfolios; candidates ${seen.join(', ')})`,
      );
      return brandId;
    }
  }
  notes.push(
    `Optimizer brand: no candidate owns a portfolio (${seen.join(', ')}) — the platform tab row will not render`,
  );
  return EASYFIT_BRAND_ID;
}

/** Pins the brand the pages render, the way the in-app brand switcher does, and reads it back
 *  through the page's own resolver so a switch that did not take fails here by name. */
async function selectBrand(brandId: string): Promise<void> {
  const client = memberClient();
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[perfplus-tiktok-honesty] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

const slug = (label: string): string => label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

async function open(context: BrowserContext, path: string, surface: string): Promise<Page> {
  const page = await context.newPage();
  attachL1(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  try {
    const state = await expectDefinedState(page, { label: surface, settleMs: SETTLE_MS });
    notes.push(
      `${surface} state: ${state.kind === 'content' ? `content (${state.chars} chars)` : `${state.kind}: ${state.name}`}`,
    );
  } catch (error) {
    notes.push(
      `${surface} did not settle: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    );
  }
  await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
  return page;
}

async function shoot(page: Page, surface: string): Promise<void> {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page
    .screenshot({ path: resolve(SHOTS_DIR, `${slug(surface)}.png`), fullPage: true })
    .catch(() => undefined);
}

function noteBlocks(surface: string, blocks: readonly TikTokBlock[]): void {
  const visible = blocks.filter((b) => b.visible);
  notes.push(`${surface} names TikTok in ${visible.length} visible block(s)`);
  for (const b of visible.slice(0, 12)) notes.push(`${surface} block: ${describeBlock(b)}`);
}

/** No digit beside TikTok anywhere on the page: the one grade every paid surface shares. */
function gradeNoFigures(surface: string, blocks: readonly TikTokBlock[]): void {
  const hits = digitsBesideTikTok(blocks);
  grade(
    surface,
    'zero figures beside TikTok',
    hits.length === 0,
    hits.length === 0
      ? `no digit in any of ${blocks.filter((b) => b.visible).length} block(s) naming TikTok (windows stripped)`
      : hits.map(describeBlock).join(' · '),
  );
}

/** No ads vocabulary beside TikTok: the grade every organic surface shares. */
function gradeNoAdsWords(surface: string, blocks: readonly TikTokBlock[]): void {
  const hits = adsBesideTikTok(blocks);
  grade(
    surface,
    'no ads vocabulary beside TikTok',
    hits.length === 0,
    hits.length === 0
      ? `none of ${blocks.filter((b) => b.visible).length} block(s) naming TikTok says ads / ad spend / CPA`
      : hits.map(describeBlock).join(' · '),
  );
}

async function auditOptimizerTikTokTab(context: BrowserContext): Promise<void> {
  const surface = 'Optimizer/TikTok tab';
  const page = await open(context, '/scale?tab=performance&platform=tiktok_ads', surface);
  try {
    const tabRow = page.getByTestId('platform-tabs');
    if (!(await tabRow.isVisible({ timeout: 10_000 }).catch(() => false))) {
      const headline = await page
        .locator('h1, h2')
        .first()
        .textContent()
        .catch(() => null);
      recorder.record(
        `${surface} reachable`,
        'SKIP',
        `no platform tab row on brand ${optimizerBrand.slice(0, 8)} (landing: ${headline?.trim() ?? 'unknown'})`,
      );
      return;
    }
    const tab = page.getByTestId('platform-tab-tiktok_ads');
    const tabText = (await tab.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() ?? '';
    const tabConnected = await tab.getAttribute('data-connected').catch(() => null);
    const tabSelected = await tab.getAttribute('aria-selected').catch(() => null);
    grade(
      surface,
      'tab reads TikTok · Connect and is selected',
      /tiktok/i.test(tabText) &&
        /connect/i.test(tabText) &&
        tabConnected === 'false' &&
        tabSelected === 'true',
      `tab "${tabText}" data-connected=${tabConnected} aria-selected=${tabSelected}`,
    );

    const empty = page.getByTestId('tiktok-empty');
    const emptyVisible = await empty.isVisible({ timeout: 30_000 }).catch(() => false);
    const emptyText = emptyVisible
      ? ((await empty.textContent())?.replace(/\s+/g, ' ').trim() ?? '')
      : '';
    grade(
      surface,
      'named empty state',
      emptyVisible && emptyText.includes(EMPTY_SENTENCE),
      emptyVisible ? `tiktok-empty: "${emptyText}"` : 'tiktok-empty is not on the page',
    );
    grade(
      surface,
      'empty state carries no digit',
      emptyVisible && !DIGIT.test(stripWindows(emptyText)),
      emptyVisible ? `"${emptyText}"` : 'no empty state to read',
    );

    const readMarkers: string[] = [];
    for (const id of [
      'tiktok-read',
      'tiktok-headline',
      'tiktok-tiles',
      'tiktok-loading',
      'tiktok-error',
    ]) {
      if (
        await page
          .getByTestId(id)
          .isVisible()
          .catch(() => false)
      )
        readMarkers.push(id);
    }
    grade(
      surface,
      'no read block',
      readMarkers.length === 0,
      readMarkers.length === 0
        ? 'none of tiktok-read / headline / tiles / loading / error is on the page'
        : readMarkers.join(', '),
    );

    // The actions the empty state offers. "Connect TikTok Ads" is the one frontend.html §2
    // asks for; whether anything stands behind it is graded on the settings surface below.
    const actions = await empty
      .locator('a, button')
      .evaluateAll((els) =>
        els.map((el) => ({
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: el.getAttribute('href'),
          testid: el.getAttribute('data-testid'),
        })),
      )
      .catch(() => []);
    const onlyConnect =
      actions.length <= 1 &&
      actions.every(
        (a) => a.testid === 'platform-connect-tiktok_ads' && /connect tiktok ads/i.test(a.text),
      );
    grade(
      surface,
      'empty state offers only the Connect affordance',
      onlyConnect,
      actions.length === 0
        ? 'no action in the empty state'
        : actions.map((a) => `"${a.text}" → ${a.href ?? '(button)'}`).join(' · '),
    );
    if (actions.length > 0) {
      grade(
        surface,
        'Connect affordance has a connector behind it',
        false,
        `"${actions[0]?.text}" → ${actions[0]?.href}: platformTabsModel.connectedPlatforms hard-codes tiktok_ads: false and the Backend mounts /tiktok_ads/* only with TIKTOK_ADS_APP_ID set — design-intended (frontend.html §2), nothing behind it yet`,
        'WARN',
      );
    }

    // The Jaina band on this tab: prepared questions about ad groups, fatigue and Spark Ads,
    // each deep-linking into Jaina with platform=tiktok_ads — on a tab that just said TikTok
    // Ads is not connected.
    const chips = page.locator('[data-testid="jaina-entry-chips"][data-platform="tiktok_ads"]');
    const chipLabels = (await chips.isVisible().catch(() => false))
      ? await chips
          .locator('a')
          .evaluateAll((els) =>
            els.map((el) => ({
              text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
              href: el.getAttribute('href') ?? '',
            })),
          )
          .catch(() => [])
      : [];
    grade(
      surface,
      'no action implying ads data',
      chipLabels.length === 0,
      chipLabels.length === 0
        ? 'no Jaina prompt band scoped to tiktok_ads on the unconnected tab'
        : `Ask Jaina band on the unconnected tab: ${chipLabels.map((c) => `"${c.text}"`).join(' · ')} (each → ${decodeURIComponent(chipLabels[0]?.href ?? '').slice(0, 140)}…)`,
    );

    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoFigures(surface, blocks);
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditOptimizerAllTab(context: BrowserContext): Promise<void> {
  const surface = 'Optimizer/All tab';
  const page = await open(context, '/scale?tab=performance', surface);
  try {
    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoFigures(surface, blocks);
    // Nothing on the "All" tab may carry a TikTok column: the comparison row and the platform
    // tiles list connected platforms only, so a tiktok_ads-marked element outside the tab row
    // is a figure surface for a platform with no data.
    const stray = await page
      .locator('[data-platform="tiktok_ads"]')
      .evaluateAll((els) =>
        els
          .filter((el) => !el.closest('[data-testid="platform-tabs"]'))
          .map(
            (el) =>
              `<${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? ` ${el.getAttribute('data-testid')}` : ''}> "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)}"`,
          ),
      )
      .catch(() => []);
    grade(
      surface,
      'no TikTok figure surface outside the tab row',
      stray.length === 0,
      stray.length === 0 ? 'no tiktok_ads-marked element beyond the tab button' : stray.join(' · '),
    );
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditDashboard(context: BrowserContext): Promise<void> {
  const surface = 'Dashboard';
  const page = await open(context, '/scale?tab=dashboard', surface);
  try {
    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    const visible = blocks.filter((b) => b.visible);
    const onlyEmptyState = visible.every(
      (b) => b.testid === 'tiktok-empty' || /isn'?t connected|not connected/i.test(b.text),
    );
    grade(
      surface,
      'TikTok is absent or the named empty state',
      onlyEmptyState,
      visible.length === 0
        ? 'the Dashboard names TikTok nowhere (PaidMediaPlatform has no tiktok-ads — acceptance d1 is red by design)'
        : visible.map(describeBlock).join(' · '),
    );
    gradeNoFigures(surface, blocks);

    // The platform picker, opened and read, then closed: what the Dashboard says it can show.
    // Its trigger prints the raw value ("meta", "google-ads"), so the match is case-blind.
    const picker = page
      .getByRole('combobox')
      .filter({ hasText: /^(meta|google-ads|google ads|linkedin|openai|dv360)/i })
      .first();
    if (await picker.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await picker.click().catch(() => undefined);
      const options = await page
        .getByRole('option')
        .evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()))
        .catch(() => [] as string[]);
      await page.keyboard.press('Escape').catch(() => undefined);
      notes.push(`${surface} platform picker: ${options.join(' | ') || '(no options read)'}`);
      const tiktokOption = options.find((o) => TIKTOK.test(o));
      grade(
        surface,
        'platform picker promises no TikTok figures',
        tiktokOption == null,
        tiktokOption == null
          ? `picker offers ${options.join(', ') || 'nothing readable'} — no TikTok entry`
          : `picker offers "${tiktokOption}" with no tiktok-ads platform behind it`,
      );
    } else {
      recorder.record(`${surface} platform picker`, 'SKIP', 'no platform combobox on the page');
    }
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditSettingsIntegrations(context: BrowserContext): Promise<void> {
  const surface = 'Settings/Integrations';
  const page = await open(context, '/settings?section=integrations', surface);
  try {
    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoFigures(surface, blocks);
    // Where "Connect TikTok Ads" lands. A tab or card that says "TikTok Ads" here offers a
    // connection the Backend does not mount; a plain "TikTok" is the organic creator login.
    const adsHere = blocks.filter(
      (b) => b.visible && /tiktok ads|tiktok marketing|advertiser/i.test(b.text),
    );
    grade(
      surface,
      'names no TikTok Ads connector',
      adsHere.length === 0,
      adsHere.length === 0
        ? 'the integrations settings name TikTok only as the organic login'
        : adsHere.map(describeBlock).join(' · '),
      'WARN',
    );
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditOrganicMetrics(context: BrowserContext): Promise<void> {
  const surface = 'Organic/Metrics';
  const page = await open(context, '/organic?tab=metrics', surface);
  try {
    let blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoAdsWords(surface, blocks);

    // The scope combobox: if the brand has a TikTok organic account, pick it and read that
    // surface too (a client-side selection; nothing is written).
    const scope = page.getByRole('combobox').first();
    if (await scope.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await scope.click().catch(() => undefined);
      const option = page.getByRole('option').filter({ hasText: TIKTOK }).first();
      if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const label = (await option.textContent())?.replace(/\s+/g, ' ').trim();
        await option.click().catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
        notes.push(`${surface} selected TikTok scope: "${label}"`);
        blocks = await tiktokBlocks(page);
        noteBlocks(`${surface} (TikTok account)`, blocks);
        gradeNoAdsWords(`${surface} (TikTok account)`, blocks);
      } else {
        await page.keyboard.press('Escape').catch(() => undefined);
        recorder.record(
          `${surface} TikTok account`,
          'SKIP',
          'the brand has no TikTok organic account in the metrics scope',
        );
      }
    }
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditOrganicExplore(context: BrowserContext): Promise<void> {
  const surface = 'Organic/Explore';
  const page = await open(context, '/organic?tab=explore', surface);
  try {
    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoAdsWords(surface, blocks);
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function auditOrganicTrendsTikTok(context: BrowserContext): Promise<void> {
  const surface = 'Home/Organic Trends TikTok tab';
  const page = await open(context, '/dashboard?view=organic', surface);
  try {
    const tab = page.getByRole('tab', { name: /^TikTok$/i }).first();
    if (await tab.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await tab.click().catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: QUIET_MS }).catch(() => undefined);
      await page.waitForTimeout(1_500);
      notes.push(`${surface} opened the Trends "TikTok" tab`);
    } else {
      recorder.record(`${surface} tab`, 'SKIP', 'no Trends "TikTok" tab on the organic home view');
    }
    const blocks = await tiktokBlocks(page);
    noteBlocks(surface, blocks);
    gradeNoAdsWords(surface, blocks);
    await shoot(page, surface);
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Copy audit — user-visible strings that sell TikTok Ads while it is unconnected
// ---------------------------------------------------------------------------

const SRC_DIR = resolve(__dirname, '../src');
/** Out of the audit by path, with the reason: tests and fixtures; API routes and schemas (not
 *  copy); the TikTok tab's own connected-only render, the platform cards and the cross-platform
 *  move (they exist only for a connected advertiser) and the entity noun table behind them. */
const SKIP_PATH =
  /\.(test|bench|stories)\.|__tests__|__fixtures__|\/app\/api\/|\/lib\/api\/|\/lib\/schemas\/|platforms\/(?:TikTokAdsTab|useTikTokAdsOverview|tiktokAdsOverviewModel)\.|platformCards\/|crossPlatformMove\/|optimizer\/entityNoun\.ts/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;
/** A string literal or JSX text that names TikTok. */
const USER_VISIBLE = /['"`][^'"`\n]*TikTok[^'"`\n]*['"`]|>[^<{]*TikTok|TikTok[^<{]*</;
const ADS_COPY =
  /ad accounts?|campaign-level|Spark Ads?|ad groups?|\bCPA\b|cost per result|\bspend|\bAds\b|advertiser|pixel|learning|TikTok Marketing|writes alike/i;
/** Copy that says, in the same line, that TikTok Ads is not there. */
const HONEST_COPY =
  /isn'?t connected|not connected|not built|no connector|not supported|coming soon|once a .*connected|could not be loaded|Ads Manager/i;
/** The one affordance frontend.html §2 asks for: a WARN row, not a FAIL. */
const DESIGNED_COPY = /Connect TikTok Ads/;

type CopyHit = { file: string; line: number; text: string; severity: 'FAIL' | 'WARN' };

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
}

export function auditCopy(srcDir = SRC_DIR): CopyHit[] {
  const files: string[] = [];
  walk(srcDir, files);
  const hits: CopyHit[] = [];
  for (const file of files) {
    const rel = relative(srcDir, file);
    if (SKIP_PATH.test(`/${rel}`)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/TikTok/.test(line) || COMMENT_LINE.test(line)) return;
      if (!USER_VISIBLE.test(line) || !ADS_COPY.test(line) || HONEST_COPY.test(line)) return;
      hits.push({
        file: `src/${rel}`,
        line: index + 1,
        text: line.trim().slice(0, 200),
        severity: DESIGNED_COPY.test(line) ? 'WARN' : 'FAIL',
      });
    });
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function auditCopyStep(): void {
  const surface = 'Copy audit';
  const hits = auditCopy();
  recorder.record(
    `${surface} scanned`,
    'PASS',
    `${hits.length} user-visible line(s) name TikTok beside ads vocabulary without saying it is not connected`,
  );
  for (const hit of hits) {
    grade(surface, `${hit.file}:${hit.line}`, false, hit.text, hit.severity);
  }
}

// ---------------------------------------------------------------------------
// The test
// ---------------------------------------------------------------------------

test.describe('perfplus:tiktok:honesty:ui:bench', () => {
  test.beforeAll(async () => {
    const session = await mintSessionBundleForEmail(OWNER_EMAIL);
    memberToken = session.accessToken;
    memberId = subjectOf(memberToken);
    storageState = session.state;
    const { data } = await admin
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', memberId)
      .maybeSingle();
    originalBrand = (data as { active_brand_id?: string } | null)?.active_brand_id ?? null;
    optimizerBrand = await resolveOptimizerBrand();
    await selectBrand(EASYFIT_BRAND_ID);
  });

  test.afterAll(async () => {
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    printEnvelopeOnce();
  });

  test('every surface that names TikTok is honest about TikTok Ads', async ({ browser }) => {
    test.setTimeout(30 * 60_000);
    const context: BrowserContext = await (browser as Browser).newContext({
      storageState,
      viewport: { ...VIEWPORT },
    });
    try {
      await test.step('Optimizer TikTok tab', async () => {
        if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(optimizerBrand);
        try {
          await auditOptimizerTikTokTab(context);
          await auditOptimizerAllTab(context);
        } finally {
          if (optimizerBrand !== EASYFIT_BRAND_ID) await selectBrand(EASYFIT_BRAND_ID);
        }
      });
      await test.step('Dashboard', () => auditDashboard(context));
      await test.step('Settings integrations', () => auditSettingsIntegrations(context));
      await test.step('Organic metrics', () => auditOrganicMetrics(context));
      await test.step('Organic explore', () => auditOrganicExplore(context));
      await test.step('Organic Trends TikTok', () => auditOrganicTrendsTikTok(context));
      await test.step('Copy audit', async () => auditCopyStep());
    } finally {
      await context.close().catch((error: unknown) => {
        notes.push(
          `context.close failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      });
      printEnvelopeOnce();
    }
  });
});
