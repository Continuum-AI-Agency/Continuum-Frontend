import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BrowserContext, expect, type Page, type Response, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessageChunk,
  uiMessageChunkSchema,
} from 'ai';
import {
  CHART_CASES,
  type ChartCase,
} from '@/components/paid-media/jaina/blocks/chartCases.fixture';
import { formatValue } from '@/lib/jaina/formatValue';
import {
  mintSessionBundleForEmail,
  type PlaywrightStorageState,
  revokeBenchSession,
} from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import { benchBrowserChannel, loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

// ---------------------------------------------------------------------------
// jaina:answer-formats:e2e:bench — the asked-for answer format, end to end.
//
// A real Chrome drives the real /scale?tab=jaina chat as the Easy Fit owner, against production
// Supabase and the Backend the config names (an already-running local one, default :4002). It
// asks two real questions in Spanish, each in a fresh conversation:
//
//   steps        "dame los pasos para bajar el costo por resultado de mis conjuntos de Mensajes…"
//   comparison   "compara <A> vs <B> en los últimos 7 días" — A and B are two ACTIVE campaigns
//                read live from the account (fetch-meta-campaigns), never typed here.
//
// The report graded is the one THE PAGE RECEIVED: the SSE body of its own POST to
// /api/agents/jaina/chat/stream, reassembled the way `uiMessageProjection.reportOf` does
// (report-block parts by id, the last report-meta's block_order). Nothing is mocked or routed.
//
// Per ask, one Recorder check per assertion:
//   payload.answer-format     exactly one block with answer_format true, of the asked category
//   dom.under-sentence        it renders in [data-report-section=answer], right under the lead
//                             sentence, with nothing before it but the sentence and its frame
//                             (the data_scope line / the templated executive, per withJ2BlockOrder)
//                             and no stratum label ([data-report-label]) over it
//   steps.items-in-order      each item's action, where and expected_effect, in order
//   comparison.column-heads   the two figure columns are headed side_a.label / side_b.label
//   comparison.sides-match-ask  side_a and side_b are the two entities the ask named, one each
//   figures.raw-and-currency  every [data-testid=figure] in the block: data-figure-raw = the
//                             payload value, money nodes carry MXN
//   layout.no-hscroll-390     at 390px neither the page nor anything in the report scrolls
//                             sideways
// A missing format is a FAIL with the payload excerpt; the checks that need the block are SKIP.
//
// ── WRITES ── the bench user's active-brand preference (restored) and the two conversations
// the asks create, deleted at the end through the product's DELETE endpoint (cascades runs).
// Screenshots (1280 and 390) and the captured reports: e2e/__screenshots__/jaina-answer-formats/.
//
// ── CHARTS (P12) ── the standard's worked cases that call for a chart (§12: 2, 3, 4, 7, 11, 12)
// plus a funnel, each asked in the same real chat, light and dark, and answered with a FIXTURE:
// `CHART_CASES` (src/components/paid-media/jaina/blocks/chartCases.fixture.ts) streamed as the
// Backend's own UI message stream — `data-jaina-report-block` per block, then
// `data-jaina-report-meta` with its block_order (`uiMessageChunks.ts`), every chunk validated
// against the AI SDK's schema and framed by its `JsonToSseTransformStream`. The page parses and
// renders it with its real parser and ChartBlock; the checks read the drawn SVG:
//   chart.<case>.<theme>.renders     a chart (not tiles, not a degraded placeholder) in the answer
//   chart.<case>.<theme>.form        the form §4 names: axes, series kinds, goal lines (dashed),
//                                    markers, category order, orientation, legend
//   chart.<case>.<theme>.values      every value the block asks to label is printed, at 1280 and
//                                    375, money as MXN (a stacked segment too narrow for its
//                                    label keeps it in the chart's accessible text, noted)
//   chart.<case>.<theme>.legible     at 1280 and 375 no category names run together and no
//                                    value, goal or marker label is printed cut at the edge
//   chart.<case>.<theme>.fits-375    at 375px neither the page nor the chart scrolls sideways
// UN-EXERCISED HOP: the Backend and the model. The chat stream and the conversation routes are
// answered inside the page, so no Backend is needed and nothing is written; that the Backend
// emits these blocks unchanged through `formatBlocks` and the wire is
// `Continuum-Backend/App/agents-ts/Jaina/src/__tests__/chartVocabulary.spec.ts`, and WHEN Jaina
// picks each form is P13's. Screenshots: e2e/__screenshots__/jaina-answer-formats/charts/.
//
// Usage: cd Continuum-Frontend && bun run jaina:answer-formats:e2e:bench
//        JAINA_ANSWER_FORMATS_ONLY=charts (or a case id, e.g. case-3) runs only the charts;
//        steps | comparison only that live ask.
// ---------------------------------------------------------------------------

test.use(benchBrowserChannel());

loadProdSupabaseEnv();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;

const OWNER_EMAIL = 'mercadotecniavivo@gmail.com';
const EASYFIT_BRAND_ID = '148583e0-5538-462b-8d3a-acd25b80344e';
const AD_ACCOUNT_ID = '521903353286118';
const ACCOUNT_CURRENCY = 'MXN';
const API_URL = process.env.JAINA_ANSWER_FORMATS_API_URL ?? 'http://localhost:4002';
const OUT_DIR = resolve(__dirname, '__screenshots__/jaina-answer-formats');
const TURN_TIMEOUT_MS = 10 * 60_000;
/** Sides in order of preference among the ACTIVE campaigns; the brand's own name is never a side. */
const PREFERRED_SIDES = ['CAÑADAS', 'AV CAMACHO', 'ITESO', 'ALEIRA'];
const BRAND_TOKEN = /^easy\s*fit$|^easy$/i;
const MONTHS =
  /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i;

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

const admin: SupabaseClient = createClient(PROD_SUPABASE_URL, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const notes: string[] = [];
const recorder = createBenchRecorder('jaina:answer-formats:e2e:bench', notes);
let envelopePrinted = false;
function printEnvelopeOnce(): void {
  if (envelopePrinted) return;
  envelopePrinted = true;
  recorder.print();
}
const failed: string[] = [];
const grade = (step: string, ok: boolean, detail: string): void => {
  if (!ok) failed.push(`${step}: ${detail}`);
  recorder.record(step, ok ? 'PASS' : 'FAIL', detail);
};

/* -- session / brand ----------------------------------------------------------------- */

let storageState: PlaywrightStorageState;
let memberToken: string;
let memberId: string;
let originalBrand: string | null = null;
const createdSessions = new Set<string>();

function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
  };
  if (!decoded.sub) throw new Error('[answer-formats] access token carries no sub claim');
  return decoded.sub;
}

async function selectBrand(brandId: string): Promise<void> {
  const client = createClient(PROD_SUPABASE_URL, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${memberToken}` } },
  });
  const { error } = await client
    .schema('brand_profiles')
    .from('user_brand_preferences')
    .upsert(
      { user_id: memberId, active_brand_id: brandId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`[answer-formats] brand switch failed: ${error.message}`);
  const { data } = await client.schema('brand_profiles').rpc('resolve_active_brand_for_session');
  expect(data, `the bench session must render brand ${brandId}`).toBe(brandId);
}

/** Two active campaigns of the account, named by their first non-month "//" segment. */
async function comparisonSides(): Promise<[string, string]> {
  const response = await fetch(
    `${PROD_SUPABASE_URL}/functions/v1/fetch-meta-campaigns?brandId=${EASYFIT_BRAND_ID}&adAccountId=act_${AD_ACCOUNT_ID}`,
    { headers: { Authorization: `Bearer ${memberToken}`, apikey: publishableKey } },
  );
  const body = obj(await response.json().catch(() => null));
  const active = rows(body?.campaigns).filter((c) => c.effective_status === 'ACTIVE');
  const labels = active
    .map((c) =>
      (str(c.name) ?? '')
        .split('//')
        .map((part) => part.trim())
        .find((part) => part.length > 0 && !MONTHS.test(part) && !/^\d{4}$/.test(part)),
    )
    .filter((label): label is string => Boolean(label));
  const unique = [...new Set(labels)].filter((label) => !BRAND_TOKEN.test(label));
  notes.push(
    `active campaigns (fetch-meta-campaigns, cachedAt ${str(body?.cachedAt) ?? '—'}): ${active.map((c) => str(c.name)).join(' | ')}`,
  );
  const preferred = PREFERRED_SIDES.filter((label) => unique.includes(label));
  const sides = [...preferred, ...unique.filter((label) => !preferred.includes(label))].slice(0, 2);
  if (sides.length < 2) {
    throw new Error(`[answer-formats] fewer than two active campaigns: ${unique.join(', ')}`);
  }
  return [sides[0] as string, sides[1] as string];
}

/* -- the report the page received ---------------------------------------------------- */

type StreamCapture = {
  report: Row | null;
  partTypes: Record<string, number>;
  errors: string[];
  raw: string;
  sessionId: string | null;
  adAccountId: string | null;
};

/** The SSE body reassembled like `uiMessageProjection.reportOf`. */
function reportFromStream(text: string): Pick<StreamCapture, 'report' | 'partTypes' | 'errors'> {
  const blocks = new Map<string, Row>();
  let meta: Row | null = null;
  const partTypes: Record<string, number> = {};
  const errors: string[] = [];
  for (const line of text.split('\n')) {
    const payload = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
    if (!payload.startsWith('{')) continue;
    let part: Row | null;
    try {
      part = obj(JSON.parse(payload));
    } catch {
      continue;
    }
    const type = str(part?.type);
    if (!part || !type) continue;
    partTypes[type] = (partTypes[type] ?? 0) + 1;
    const data = obj(part.data);
    if (type === 'data-jaina-report-block' && data) {
      blocks.set(str(part.id) ?? str(data.block_id) ?? String(blocks.size), data);
    } else if (type === 'data-jaina-report-meta' && data) {
      meta = data;
    } else if (type === 'error' || type === 'data-jaina-report-error') {
      errors.push(JSON.stringify(part).slice(0, 400));
    }
  }
  if (blocks.size === 0 && !meta) return { report: null, partTypes, errors };
  const streamed = [...blocks.values()];
  if (!meta) return { report: { blocks: streamed }, partTypes, errors };
  const { block_order: order, ...rest } = meta as Row & { block_order?: unknown };
  const ids = Array.isArray(order)
    ? order.filter((id): id is string => typeof id === 'string')
    : [];
  if (ids.length === 0) return { report: { ...rest, blocks: streamed }, partTypes, errors };
  const byId = new Map(streamed.map((block) => [str(block.block_id), block]));
  return {
    report: {
      ...rest,
      blocks: ids.map((id) => byId.get(id)).filter((b): b is Row => b !== undefined),
    },
    partTypes,
    errors,
  };
}

/** The bytes 0x80–0x9F of windows-1252, by the character they decode to. */
const CP1252_HIGH: Record<string, number> = Object.fromEntries(
  [
    0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0, 0x017d, 0, 0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
    0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
  ]
    .map((code, index) => [String.fromCharCode(code), 0x80 + index] as const)
    .filter(([char]) => char !== '\u0000'),
);

/**
 * Playwright hands a streamed `text/event-stream` body back decoded as windows-1252 ("CAÃ‘ADAS",
 * "â†’") while the page's own reader decodes UTF-8. Re-encode to the original bytes and decode
 * them as UTF-8; a body that is not that mojibake is returned untouched.
 */
function utf8OfCapturedBody(text: string): string {
  if (!/[ÃÂâ][\u0080-\u00ff\u0152-\u2122]/.test(text)) return text;
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (CP1252_HIGH[char] !== undefined) bytes.push(CP1252_HIGH[char] as number);
    else return text;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return text;
  }
}

function payloadExcerpt(report: Row | null, raw: string): string {
  if (!report) return `no report parts in the stream; tail: ${raw.slice(-600)}`;
  return JSON.stringify({
    executive_summary: str(report.executive_summary)?.slice(0, 300) ?? null,
    blocks: rows(report.blocks).map((b) => ({
      category: b.category,
      answer_format: b.answer_format ?? null,
      title: b.title ?? null,
    })),
  });
}

/* -- the rendered report ------------------------------------------------------------- */

type DomFigure = { label: string; raw: string; currency: string; text: string };
type DomRead = {
  found: boolean;
  sentence: 'sentence' | 'template' | null;
  children: string[];
  targetIndex: number;
  steps: Array<{ action: string; where: string; effect: string }>;
  heads: Array<{ label: string; detail: string | null }>;
  figures: DomFigure[];
};

async function readAnswer(
  page: Page,
  target: { category: string; blockId: string; pairLabels: string[] },
): Promise<DomRead> {
  return page.evaluate((t) => {
    const sections = [...document.querySelectorAll('[data-report-section="answer"]')];
    const answer = sections.at(-1) as HTMLElement | undefined;
    const empty = {
      found: false,
      sentence: null,
      children: [],
      targetIndex: -1,
      steps: [],
      heads: [],
      figures: [],
    };
    if (!answer) return empty;
    const container = answer.parentElement;
    const sentenceNode = container?.querySelector(':scope > [data-report-part="sentence"]');
    const sentenceFirst =
      sentenceNode != null &&
      Boolean(sentenceNode.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING);
    const kids = [...answer.children] as HTMLElement[];
    const isTarget = (el: HTMLElement): boolean =>
      t.category === 'steps'
        ? el.querySelector(`[data-steps="${CSS.escape(t.blockId)}"]`) != null ||
          el.getAttribute('data-steps') === t.blockId
        : el.querySelector('table') != null &&
          t.pairLabels.every((label) => (el.textContent ?? '').includes(label));
    const kindOf = (el: HTMLElement): string => {
      if (el.hasAttribute('data-report-label'))
        return `label:${el.getAttribute('data-report-label')}`;
      if (
        el.matches('[data-testid="data-scope-block"]') ||
        el.querySelector('[data-testid="data-scope-block"]')
      )
        return 'frame:data_scope';
      if (
        el.matches('[data-template-part="executive"]') ||
        el.querySelector('[data-template-part="executive"]')
      )
        return 'sentence:template';
      if (isTarget(el)) return 'TARGET';
      return `block:${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)}`;
    };
    const children = kids.map(kindOf);
    const targetIndex = children.indexOf('TARGET');
    const templated = children.slice(0, Math.max(targetIndex, 0)).includes('sentence:template');
    const node = targetIndex >= 0 ? kids[targetIndex] : null;
    // A marker for the screenshots and the 390 measurement — the bench's own, never read by the app.
    node?.setAttribute('data-bench-answer-format', t.category);
    const text = (el: Element | null | undefined): string =>
      (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const steps = node
      ? [...node.querySelectorAll('li[data-step]')].map((li) => ({
          action: text(li.querySelector('p')),
          where: text(li.querySelector('[data-step-where]')),
          effect: text(li.querySelector('[data-step-effect]')),
        }))
      : [];
    const heads = node
      ? [...node.querySelectorAll('thead th')].map((th) => ({
          label: (th.firstChild?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          detail: th.querySelector('span') ? text(th.querySelector('span')) : null,
        }))
      : [];
    const figures = node
      ? [...node.querySelectorAll('[data-testid="figure"]')].map((el) => ({
          label: el.getAttribute('data-figure-label') ?? '',
          raw: el.getAttribute('data-figure-raw') ?? '',
          currency: el.getAttribute('data-figure-currency') ?? '',
          text: text(el),
        }))
      : [];
    return {
      found: node != null,
      sentence: sentenceFirst ? 'sentence' : templated ? 'template' : null,
      children,
      targetIndex,
      steps,
      heads,
      figures,
    } as never;
  }, target);
}

type ScrollRead = { page: string[]; block: string[]; elsewhere: string[] };

/**
 * What scrolls sideways at this viewport: the page itself, anything inside the answer-format
 * block (a scroller, or a leaf that runs past the viewport outside any scroller), and — as a
 * note, not a grade — scrollers elsewhere in the same report.
 */
async function horizontalScrollers(page: Page, blockSelector: string | null): Promise<ScrollRead> {
  return page.evaluate((selector) => {
    const read = { page: [] as string[], block: [] as string[], elsewhere: [] as string[] };
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      read.page.push(`document scrollWidth ${doc.scrollWidth} > ${doc.clientWidth}`);
    }
    const answer = [...document.querySelectorAll('[data-report-section="answer"]')].at(-1);
    const report = answer?.parentElement;
    if (!report) return read;
    const block = selector ? (document.querySelector(selector) as HTMLElement | null) : null;
    const scrolls = (el: Element): boolean => {
      const overflowX = getComputedStyle(el).overflowX;
      return overflowX === 'auto' || overflowX === 'scroll';
    };
    const name = (el: Element): string =>
      `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`;
    for (const el of [report, ...report.querySelectorAll('*')] as HTMLElement[]) {
      if (scrolls(el) && el.scrollWidth > el.clientWidth + 1) {
        const where = block && (block === el || block.contains(el)) ? read.block : read.elsewhere;
        const head = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
        where.push(`${name(el)} scrollWidth ${el.scrollWidth} > ${el.clientWidth} ("${head}")`);
      }
    }
    if (block) {
      for (const el of block.querySelectorAll('*') as NodeListOf<HTMLElement>) {
        if (el.children.length > 0) continue;
        const box = el.getBoundingClientRect();
        let inScroller = false;
        for (let up = el.parentElement; up && up !== block.parentElement; up = up.parentElement) {
          if (scrolls(up)) inScroller = true;
        }
        if (!inScroller && box.width > 0 && box.right > window.innerWidth + 1) {
          read.block.push(
            `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 40)}" runs to ${Math.round(box.right)}px`,
          );
        }
      }
    }
    return read;
  }, blockSelector);
}

/* -- one ask --------------------------------------------------------------------------- */

type Expected = { name: 'steps' | 'comparison'; question: string; entities?: [string, string] };

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function rawEquals(domRaw: string, value: unknown): boolean {
  if (value === null || value === undefined) return domRaw === '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return domRaw === '';
  return domRaw !== '' && Number(domRaw) === n;
}

type ExpectedFigure = { label: string; value: unknown; money: boolean };

function expectedFigures(block: Row): ExpectedFigure[] {
  if (block.category === 'steps') {
    return rows(block.items)
      .map((item) => obj(item.figure))
      .filter((f): f is Row => f !== null)
      .map((f) => ({
        label: str(f.label) ?? '',
        value: f.value,
        money: f.format === 'currency' || Boolean(str(f.currency)),
      }));
  }
  const sideA = str(obj(block.side_a)?.label) ?? str(block.before_label) ?? '';
  const sideB = str(obj(block.side_b)?.label) ?? str(block.after_label) ?? '';
  const baseline = str(block.baseline_label);
  return rows(block.pairs).flatMap((pair) => {
    const money = pair.format === 'currency' || Boolean(str(pair.currency));
    const label = str(pair.label) ?? '';
    return [
      { label: `${label} · ${sideA}`, value: pair.before, money },
      { label: `${label} · ${sideB}`, value: pair.after, money },
      ...(baseline && pair.baseline != null
        ? [{ label: `${label} · ${baseline}`, value: pair.baseline, money }]
        : []),
    ];
  });
}

async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function startFreshConversation(page: Page): Promise<void> {
  await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
  const composer = page.getByRole('textbox', { name: 'Message Jaina' });
  await expect(composer).toBeVisible({ timeout: 240_000 });
  // The panel restores the newest thread on mount; a "new" clicked before that lands is undone.
  const conversations = page.locator('[data-testid^="jaina-conversation-"]');
  const restored = await conversations
    .first()
    .waitFor({ state: 'visible', timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  if (restored) await expect(conversations.first()).toBeDisabled({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Create new conversation' }).click();
  await expect(conversations.and(page.locator(':disabled'))).toHaveCount(0, { timeout: 15_000 });
}

async function ask(page: Page, question: string): Promise<StreamCapture> {
  const composer = page.getByRole('textbox', { name: 'Message Jaina' });
  await composer.click();
  await composer.fill(question);
  const streamResponse = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/api/agents/jaina/chat/stream'),
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  const response: Response = await streamResponse;
  let sessionId: string | null = null;
  let adAccountId: string | null = null;
  try {
    const body = obj(response.request().postDataJSON());
    const context = obj(body?.context);
    sessionId = str(context?.sessionId) ?? str(body?.sessionId);
    adAccountId = str(context?.adAccountId);
  } catch {
    // a body the bench cannot read leaves the ids unknown; the notes say so below
  }
  if (sessionId) createdSessions.add(sessionId);
  const finished = await Promise.race([
    response.finished().then(() => true),
    new Promise<boolean>((done) => setTimeout(() => done(false), TURN_TIMEOUT_MS)),
  ]);
  if (!finished)
    notes.push(`"${question}": the stream did not finish in ${TURN_TIMEOUT_MS / 60_000} min`);
  const raw = await response
    .body()
    .then((buffer) => utf8OfCapturedBody(buffer.toString('utf8')))
    .catch((error: unknown) => {
      notes.push(
        `stream body unreadable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    });
  // The report modules row renders only once the turn stopped streaming with blocks.
  await page
    .getByRole('group', { name: 'Report modules' })
    .last()
    .waitFor({ state: 'visible', timeout: 120_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
  return { ...reportFromStream(raw), raw, sessionId, adAccountId };
}

async function runAsk(context: BrowserContext, expected: Expected): Promise<void> {
  const id = expected.name;
  const page = await context.newPage();
  page.on('response', async (r) => {
    if (
      r.request().method() === 'POST' &&
      r.url().endsWith('/api/agents/jaina/chat/conversations')
    ) {
      const body = obj(await r.json().catch(() => null));
      const sid = str(body?.session_id);
      if (sid) createdSessions.add(sid);
    }
  });
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await startFreshConversation(page);
    const capture = await ask(page, expected.question);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      resolve(OUT_DIR, `${id}.report.json`),
      JSON.stringify({ question: expected.question, ...capture, raw: undefined }, null, 2),
    );
    notes.push(
      `${id}: session ${capture.sessionId ?? '—'}, adAccountId ${capture.adAccountId ?? '—'}, parts ${JSON.stringify(capture.partTypes)}`,
    );
    if (capture.adAccountId && !capture.adAccountId.includes(AD_ACCOUNT_ID)) {
      notes.push(`${id}: the turn ran on ${capture.adAccountId}, not act_${AD_ACCOUNT_ID}`);
    }
    if (capture.errors.length > 0)
      notes.push(`${id}: stream errors ${capture.errors.join(' || ')}`);
    if (/temporarily unavailable|"code"\s*:\s*2\b/i.test(capture.raw)) {
      notes.push(`${id}: the stream mentions Meta "temporarily unavailable" (code 2)`);
    }

    // 1. exactly one answer_format block, of the asked category
    const blocks = rows(capture.report?.blocks);
    const flagged = blocks.filter((b) => b.answer_format === true);
    const block = flagged.length === 1 && flagged[0]?.category === id ? (flagged[0] as Row) : null;
    grade(
      `${id}.payload.answer-format`,
      block !== null,
      block
        ? `one answer_format block, category ${id}, id ${str(block.block_id)}`
        : `expected exactly one answer_format ${id} block, got ${flagged.length} (${flagged.map((b) => b.category).join(', ') || 'none'}); payload ${payloadExcerpt(capture.report, capture.raw)}`,
    );

    const missing = (step: string): void =>
      recorder.record(`${id}.${step}`, 'SKIP', 'no answer_format block in the payload to render');

    let dom: DomRead | null = null;
    if (block) {
      const pairLabels = rows(block.pairs).map((p) => norm(str(p.label) ?? ''));
      dom = await readAnswer(page, {
        category: id,
        blockId: str(block.block_id) ?? '',
        pairLabels,
      });
      // 2. in the answer section, under the sentence, nothing but the frame before it, no label
      const before = dom.children.slice(0, Math.max(dom.targetIndex, 0));
      const allowedBefore = before.every(
        (k) => k === 'frame:data_scope' || k === 'sentence:template',
      );
      const labelled = before.some((k) => k.startsWith('label:'));
      const underSentence = dom.found && dom.sentence !== null && allowedBefore && !labelled;
      grade(
        `${id}.dom.under-sentence`,
        underSentence,
        `answer section children [${dom.children.join(' | ')}], target at ${dom.targetIndex}, lead ${dom.sentence ?? 'MISSING'}`,
      );
    } else {
      missing('dom.under-sentence');
    }

    // 3 / 4. the format's own content
    if (id === 'steps') {
      if (block && dom) {
        const items = rows(block.items);
        const mismatches: string[] = [];
        if (dom.steps.length !== items.length) {
          mismatches.push(`${dom.steps.length} rendered steps vs ${items.length} in the payload`);
        }
        items.forEach((item, index) => {
          const shown = dom?.steps[index];
          const want = {
            action: norm(str(item.action) ?? ''),
            where: norm(str(item.where) ?? ''),
            effect: norm(str(item.expected_effect) ?? ''),
          };
          if (!shown) return;
          if (!shown.action.includes(want.action))
            mismatches.push(`step ${index + 1} action "${shown.action}" ≠ "${want.action}"`);
          if (shown.where !== want.where)
            mismatches.push(`step ${index + 1} where "${shown.where}" ≠ "${want.where}"`);
          if (shown.effect !== want.effect)
            mismatches.push(`step ${index + 1} effect "${shown.effect}" ≠ "${want.effect}"`);
        });
        grade(
          'steps.items-in-order',
          mismatches.length === 0,
          mismatches.length === 0
            ? `${items.length} steps, action/where/expected_effect shown in order`
            : mismatches.join('; '),
        );
      } else {
        missing('items-in-order');
      }
    } else if (block && dom) {
      const sideA = str(obj(block.side_a)?.label);
      const sideB = str(obj(block.side_b)?.label);
      const heads = dom.heads.map((h) => h.label);
      const ok =
        sideA !== null && sideB !== null && heads[1] === norm(sideA) && heads[2] === norm(sideB);
      grade(
        'comparison.column-heads',
        ok,
        `heads [${heads.join(' | ')}] vs side_a "${sideA ?? 'ABSENT'}", side_b "${sideB ?? 'ABSENT'}"`,
      );
      // The two sides are the two entities the ask named, one each.
      const [askedA, askedB] = expected.entities ?? ['', ''];
      const sideOf = (label: string | null): string | null =>
        label === null
          ? null
          : ([askedA, askedB].find((asked) => asked && fold(label).includes(fold(asked))) ?? null);
      const matchA = sideOf(sideA);
      const matchB = sideOf(sideB);
      grade(
        'comparison.sides-match-ask',
        matchA !== null && matchB !== null && matchA !== matchB,
        `asked "${askedA}" vs "${askedB}"; side_a "${sideA ?? 'ABSENT'}" (${matchA ?? 'no match'}), side_b "${sideB ?? 'ABSENT'}" (${matchB ?? 'no match'}), windows ${str(obj(block.side_a)?.window) ?? '—'} / ${str(obj(block.side_b)?.window) ?? '—'}`,
      );
    } else {
      missing('column-heads');
      missing('sides-match-ask');
    }

    // 5. figures carry the payload value, money carries MXN
    if (block && dom) {
      const want = expectedFigures(block);
      const problems: string[] = [];
      if (dom.figures.length !== want.length) {
        problems.push(`${dom.figures.length} figure nodes vs ${want.length} payload figures`);
      }
      want.forEach((w, index) => {
        const node = dom?.figures[index];
        if (!node) return;
        if (node.label !== w.label) problems.push(`#${index} label "${node.label}" ≠ "${w.label}"`);
        if (!rawEquals(node.raw, w.value))
          problems.push(
            `#${index} ${w.label}: raw "${node.raw}" ≠ payload ${JSON.stringify(w.value)}`,
          );
        if (w.money && node.currency !== ACCOUNT_CURRENCY)
          problems.push(`#${index} ${w.label}: money node currency "${node.currency}"`);
      });
      for (const node of dom.figures) {
        if (node.currency !== 'none' && node.currency !== ACCOUNT_CURRENCY) {
          problems.push(`${node.label}: currency ${node.currency}`);
        }
      }
      grade(
        `${id}.figures.raw-and-currency`,
        problems.length === 0,
        problems.length === 0
          ? `${dom.figures.length} figure node(s), ${want.filter((w) => w.money).length} money, all raw = payload, money in ${ACCOUNT_CURRENCY}`
          : problems.join('; '),
      );
    } else {
      missing('figures.raw-and-currency');
    }

    // screenshots + 6. no horizontal scroll at 390
    const marked = dom?.found ? '[data-bench-answer-format]' : null;
    const targetLocator = page.locator(marked ?? '[data-report-section="answer"]').last();
    await targetLocator.scrollIntoViewIfNeeded().catch(() => undefined);
    const wide = await shot(page, `${id}-1280`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1_500);
    await targetLocator.scrollIntoViewIfNeeded().catch(() => undefined);
    const narrow = await shot(page, `${id}-390`);
    notes.push(`${id} screenshots: ${wide} , ${narrow}`);
    const scroll = await horizontalScrollers(page, marked);
    if (scroll.elsewhere.length > 0) {
      notes.push(`${id} at 390, outside the format block: ${scroll.elsewhere.join('; ')}`);
    }
    if (marked) {
      const overflow = [...scroll.page, ...scroll.block];
      grade(
        `${id}.layout.no-hscroll-390`,
        overflow.length === 0,
        overflow.length === 0 ? 'the page and the format block fit 390px' : overflow.join('; '),
      );
    } else {
      missing('layout.no-hscroll-390');
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

/* -- charts: the §12 worked cases as fixture answers --------------------------------- */

type Theme = 'light' | 'dark';
const THEMES: Theme[] = ['light', 'dark'];
const CHART_OUT_DIR = resolve(OUT_DIR, 'charts');
const LIVE_ASKS = ['steps', 'comparison'];

/** One fixture answer as the Backend streams it: the frame, the chart, then the report meta. */
async function fixtureAnswerSse(entry: ChartCase, runId: string): Promise<string> {
  const scope = {
    block_id: `${entry.id}_scope`,
    category: 'data_scope',
    scope: 'account',
    title: 'Alcance',
    priority: 'secondary',
    dates: '1–27 oct 2026 (27 de 31 días)',
    timezone: 'America/Mexico_City',
    source: 'api',
    notes: ['Datos de ejemplo del estándar de presentación (§12), no de una cuenta.'],
  };
  const chart = { ...entry.block, answer_format: true, priority: 'primary' };
  const blocks = [scope, chart];
  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: `jaina:${runId}:assistant`, messageMetadata: { runId } },
    ...blocks.map(
      (block): UIMessageChunk => ({
        type: 'data-jaina-report-block',
        id: `${runId}:block:${block.block_id}`,
        data: block,
      }),
    ),
    {
      type: 'data-jaina-report-meta',
      id: `${runId}:report`,
      data: {
        language: 'es',
        executive_summary: entry.sentence,
        media_map: {},
        follow_up_questions: [],
        what_to_watch: [],
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        _meta: {
          schema_version: '2',
          block_count: blocks.length,
          has_charts: true,
          has_media: false,
          has_citations: false,
          primary_scope: 'account',
        },
        block_order: blocks.map((block) => block.block_id),
      },
    },
    { type: 'finish', messageMetadata: { runId, status: 'completed' } },
  ];
  const schema = uiMessageChunkSchema();
  for (const chunk of chunks) {
    const validated = await schema.validate(chunk);
    if (!validated.success) {
      throw new Error(`[answer-formats] a chunk the AI SDK would reject: ${JSON.stringify(chunk)}`);
    }
  }
  const reader = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  })
    .pipeThrough(new JsonToSseTransformStream())
    .getReader();
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return body;
    body += value;
  }
}

/** The page's chat stream answered in the page (POST → the fixture, GET resume → 204), and its theme. */
async function stubChartAnswer(page: Page, question: string, sse: string, theme: Theme) {
  await page.addInitScript(
    ({ ask, body, headers, mode }) => {
      window.localStorage.setItem('theme', JSON.stringify(mode));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const [input, init] = args;
        const url =
          typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
        if (url.includes('/api/agents/jaina/chat/stream')) {
          const method = (
            init?.method ?? (input instanceof Request ? input.method : 'GET')
          ).toUpperCase();
          if (method === 'GET') return new Response(null, { status: 204 });
          const sent =
            typeof init?.body === 'string' ? (JSON.parse(init.body) as { query?: string }) : {};
          if (sent.query === ask) return new Response(body, { status: 200, headers });
        }
        return originalFetch(...args);
      };
    },
    {
      ask: question,
      body: sse,
      headers: UI_MESSAGE_STREAM_HEADERS as Record<string, string>,
      mode: theme,
    },
  );
}

/** The chat's conversation routes, answered locally: no Backend, no row written. */
async function routeConversations(context: BrowserContext, brandId: string): Promise<void> {
  const sessionId = `bench-p12-${Date.now()}`;
  await context.route('**/api/agents/jaina/chat/conversations**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname.endsWith('/runs')) return json({ runs: [] });
    if (request.method() === 'POST' && pathname.endsWith('/conversations')) {
      const sent = (request.postDataJSON() ?? {}) as { context?: { sessionId?: string } };
      return json({
        session_id: sent.context?.sessionId ?? sessionId,
        brand_id: brandId,
        ad_account_id: null,
        conversation_title: null,
      });
    }
    return json({ sessions: [], messages: [], nextCursor: null });
  });
  await context.route('**/api/agents/jaina/chat/runs/*/delivery', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

type ChartRead = {
  found: boolean;
  inAnswer: boolean;
  tiles: boolean;
  degraded: boolean;
  surface: boolean;
  orientation: string | null;
  categories: string[] | null;
  yAxes: number;
  lines: number;
  areas: number;
  bars: number;
  referenceLines: Array<{ text: string; dasharray: string | null }>;
  markers: string[];
  legend: string[];
  texts: string[];
  /** The chart's accessible text (`role=img` aria-label): every value, drawn or not. */
  aria: string;
  /** The widest elements inside the chart, for a layout failure's detail. */
  widest: string[];
  /** Category tick labels that run into each other, by their text. */
  tickOverlaps: string[];
  /** Value, goal and marker labels drawn past the chart's surface — printed cut. */
  clippedLabels: string[];
  rect: { width: number; right: number };
};

async function readChart(page: Page, blockId: string): Promise<ChartRead> {
  return page.evaluate((id) => {
    const root = document.querySelector(
      `[data-testid="chart-block"][data-chart-block-id="${CSS.escape(id)}"]`,
    ) as HTMLElement | null;
    const answer = [...document.querySelectorAll('[data-report-section="answer"]')].at(-1);
    const text = (el: Element | null | undefined): string =>
      (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const count = (selector: string) => root?.querySelectorAll(selector).length ?? 0;
    const categories = root?.getAttribute('data-chart-categories');
    const box = root?.getBoundingClientRect();
    return {
      found: root != null,
      inAnswer: Boolean(root && answer?.contains(root)),
      tiles: Boolean(answer?.querySelector(`[data-testid="chart-as-tiles"]`)),
      degraded: /could not be rendered/i.test(text(answer)),
      surface: count('svg.recharts-surface') > 0,
      orientation: root?.getAttribute('data-chart-orientation') ?? null,
      categories: categories ? (JSON.parse(categories) as string[]) : null,
      yAxes: count('g.recharts-yAxis'),
      lines: count('.recharts-line'),
      areas: count('.recharts-area'),
      bars: count('.recharts-bar'),
      referenceLines: [...(root?.querySelectorAll('[data-chart-reference-line]') ?? [])].map(
        (el) => ({
          text: text(el),
          dasharray:
            (el.matches('line') ? el : el.querySelector('line'))?.getAttribute(
              'stroke-dasharray',
            ) ?? null,
        }),
      ),
      markers: [...(root?.querySelectorAll('[data-chart-marker]') ?? [])].map((el) => text(el)),
      legend: [...(root?.querySelectorAll('.recharts-legend-wrapper') ?? [])]
        .map((el) => text(el))
        .filter(Boolean),
      // A wrapped tick is one label in several <tspan>s: read each <text> whole, lines joined.
      texts: [...(root?.querySelectorAll('text') ?? [])].map((el) => {
        const lines = [...el.querySelectorAll('tspan')].map((span) => text(span));
        return lines.length > 0 ? lines.join(' ') : text(el);
      }),
      aria: root?.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '',
      ...(() => {
        const surface = root?.querySelector('svg.recharts-surface')?.getBoundingClientRect();
        const ticks = [
          ...(root?.querySelectorAll(
            'text.recharts-xAxis.recharts-cartesian-axis-tick-value, text.recharts-yAxis.recharts-cartesian-axis-tick-value',
          ) ?? []),
        ].map((el) => ({
          name: el.getAttribute('aria-label') ?? text(el),
          box: el.getBoundingClientRect(),
        }));
        const tickOverlaps: string[] = [];
        ticks.forEach((a, i) => {
          for (const b of ticks.slice(i + 1)) {
            const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
            const down = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
            if (across > 1 && down > 1) tickOverlaps.push(`"${a.name}" × "${b.name}"`);
          }
        });
        const clippedLabels = surface
          ? [
              ...(root?.querySelectorAll(
                '[data-chart-value-label], .chart-reference-label, .chart-marker-label',
              ) ?? []),
            ]
              .filter((el) => {
                const box = el.getBoundingClientRect();
                return (
                  box.width > 0 &&
                  (box.left < surface.left - 1 ||
                    box.right > surface.right + 1 ||
                    box.top < surface.top - 1 ||
                    box.bottom > surface.bottom + 1)
                );
              })
              .map((el) => text(el))
          : [];
        return { tickOverlaps, clippedLabels };
      })(),
      widest: [...(root?.querySelectorAll('*') ?? [])]
        .map((el) => ({ el, width: el.getBoundingClientRect().width }))
        .sort((a, b) => b.width - a.width)
        .slice(0, 4)
        .map(
          ({ el, width }) =>
            `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '')
              .split(' ')
              .slice(0, 2)
              .join('.')} ${Math.round(width)}px`,
        ),
      rect: { width: box?.width ?? 0, right: box?.right ?? 0 },
    } as ChartRead;
  }, blockId);
}

const money = (value: number, block: ChartCase['block']): string =>
  formatValue(
    value,
    block.value_format,
    block.currency_code ? { currency: block.currency_code } : undefined,
  );

/** The category order the case must draw: a sort reorders by its measure, a waterfall adds its totals. */
function expectedCategories(block: ChartCase['block']): string[] {
  const labelOf = (row: Record<string, unknown>) => String(row[block.category_key]);
  if (block.chart_type === 'waterfall') {
    return [
      ...(block.start ? [block.start.label] : []),
      ...block.data.map(labelOf),
      ...(block.end ? [block.end.label] : []),
    ];
  }
  if (!block.sort) return block.data.map(labelOf);
  const key = block.value_key ?? Object.keys(block.chart_config)[0] ?? '';
  const measure = (row: Record<string, unknown>) =>
    block.chart_type === 'stacked_bar'
      ? Object.keys(block.chart_config).reduce((sum, k) => sum + Number(row[k] ?? 0), 0)
      : Number(row[key] ?? 0);
  const sorted = [...block.data].sort((a, b) => measure(b) - measure(a));
  return (block.sort === 'asc' ? sorted.reverse() : sorted).map(labelOf);
}

/** What the drawn chart must carry for the case's form; empty when it does. */
function formProblems(block: ChartCase['block'], read: ChartRead): string[] {
  const problems: string[] = [];
  const keys = Object.keys(block.chart_config);
  const baseKind =
    block.chart_type === 'line' ? 'line' : block.chart_type === 'area' ? 'area' : 'bar';
  const kindOf = (key: string) => block.series_kind?.[key] ?? baseKind;
  const wantOrientation =
    block.chart_type === 'funnel' ? 'horizontal' : (block.orientation ?? 'vertical');
  if (read.orientation !== wantOrientation)
    problems.push(`orientation ${read.orientation} ≠ ${wantOrientation}`);
  const wantCategories = expectedCategories(block);
  if (JSON.stringify(read.categories) !== JSON.stringify(wantCategories))
    problems.push(
      `categories ${JSON.stringify(read.categories)} ≠ ${JSON.stringify(wantCategories)}`,
    );
  if (block.chart_type !== 'waterfall' && block.chart_type !== 'funnel') {
    const lines = keys.filter((k) => kindOf(k) === 'line').length;
    const areas = keys.filter((k) => kindOf(k) === 'area').length;
    if (read.lines !== lines) problems.push(`${read.lines} line series ≠ ${lines}`);
    if (read.areas !== areas) problems.push(`${read.areas} area series ≠ ${areas}`);
    if (read.bars < keys.filter((k) => kindOf(k) === 'bar').length)
      problems.push(`${read.bars} bar series < ${keys.filter((k) => kindOf(k) === 'bar').length}`);
    if (keys.length > 1) {
      const missing = keys.filter(
        (k) => !read.legend.some((item) => item.includes(block.chart_config[k]?.label ?? k)),
      );
      if (missing.length > 0) problems.push(`legend lacks ${missing.join(', ')}`);
    }
  }
  const rightAxis = Object.values(block.series_axis ?? {}).includes('right');
  if (rightAxis && read.yAxes !== 2)
    problems.push(`${read.yAxes} value axes, want 2 (a right axis)`);
  for (const line of block.reference_lines ?? []) {
    const drawn = read.referenceLines.find((r) => r.text.includes(line.label));
    if (!drawn) problems.push(`reference line "${line.label}" not drawn`);
    else if (line.style === 'dashed' && !drawn.dasharray)
      problems.push(`reference line "${line.label}" is not dashed`);
  }
  for (const marker of block.markers ?? []) {
    if (!read.markers.some((m) => m.includes(marker.label)))
      problems.push(`marker "${marker.label}" not drawn`);
  }
  return problems;
}

/** What a reader cannot read: names run together, a figure printed cut. Empty when none. */
function legibilityProblems(read: ChartRead, width: number): string[] {
  return [
    ...read.tickOverlaps.map((pair) => `at ${width}px ticks overlap: ${pair}`),
    ...read.clippedLabels.map((label) => `at ${width}px label cut at the edge: "${label}"`),
  ];
}

/** The values the block asks to print, and the money rule; empty when every one is there. */
function valueProblems(block: ChartCase['block'], read: ChartRead): string[] {
  const problems: string[] = [];
  const printed = read.texts.join(' | ');
  const want: number[] = [];
  const key = block.value_key ?? Object.keys(block.chart_config)[0] ?? '';
  if (block.chart_type === 'waterfall') {
    want.push(...block.data.map((row) => Math.abs(Number(row[key]))));
    if (block.start) want.push(block.start.value);
    if (block.end) want.push(block.end.value);
  } else if (block.show_values) {
    for (const row of block.data) {
      for (const series of Object.keys(block.chart_config)) {
        const value = row[series];
        if (typeof value === 'number' && value !== 0) want.push(value);
      }
    }
  }
  // A stacked segment prints inside itself or not at all; one too narrow for its label keeps
  // its value in the chart's accessible text, and the detail says so.
  const unprinted = want
    .map((value) => money(value, block))
    .filter((shown) => !printed.includes(shown));
  const ariaOnly =
    block.chart_type === 'stacked_bar'
      ? unprinted.filter((shown) => read.aria.includes(shown))
      : [];
  for (const shown of unprinted) {
    if (!ariaOnly.includes(shown)) problems.push(`value ${shown} not printed`);
  }
  if (ariaOnly.length > 0 && ariaOnly.length === want.length)
    problems.push('no stacked segment printed its value');
  if (ariaOnly.length > 0)
    notes.push(
      `${block.block_id}: too narrow to print, in the accessible text: ${ariaOnly.join(', ')}`,
    );
  if (block.chart_type === 'funnel') {
    const shares = read.texts.filter((t) => /%/.test(t)).length;
    if (shares < block.data.length - 1)
      problems.push(`${shares} step-to-step shares, want ${block.data.length - 1}`);
  }
  if (block.value_format === 'currency') {
    const bare = read.texts.filter((t) => t.includes('$') && !t.includes('MXN'));
    if (bare.length > 0) problems.push(`money without MXN: ${bare.slice(0, 3).join(' · ')}`);
    if (read.texts.some((t) => /MX\$/.test(t))) problems.push('money printed as MX$');
  }
  return problems;
}

type Graded = [step: string, ok: boolean, detail: string];

/**
 * One case in one theme. Its grades come back to the caller rather than going on the record
 * here, so an attempt the harness broke (a page that never loaded) leaves nothing behind when it
 * is retried. Throws when the harness, not the chart, failed.
 */
async function runChartCase(
  context: BrowserContext,
  entry: ChartCase,
  theme: Theme,
): Promise<Graded[]> {
  const id = `chart.${entry.id}.${theme}`;
  const graded: Graded[] = [];
  const grade = (step: string, ok: boolean, detail: string) => graded.push([step, ok, detail]);
  const runId = `bench_p12_${entry.id}_${theme}`.replace(/-/g, '_');
  const page = await context.newPage();
  try {
    await stubChartAnswer(page, entry.question, await fixtureAnswerSse(entry, runId), theme);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/scale?tab=jaina', { waitUntil: 'domcontentloaded' });
    const composer = page.getByRole('textbox', { name: 'Message Jaina' });
    await expect(composer).toBeVisible({ timeout: 240_000 });
    // The composer mounts read-only while the panel restores; typing before it is editable throws.
    await expect(composer).toBeEditable({ timeout: 60_000 });
    // The panel can remount the composer read-only once more while it restores; type again then.
    await expect(async () => {
      await composer.fill(entry.question, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    // Sent means the question left the composer: a click that lands before the button enables
    // sends nothing, and the chart it waits for never comes.
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(async () => {
      if (((await composer.textContent()) ?? '').includes(entry.question)) {
        await send.click({ timeout: 5_000 });
      }
      expect((await composer.textContent()) ?? '').not.toContain(entry.question);
    }).toPass({ timeout: 60_000 });
    const chart = page.locator(
      `[data-testid="chart-block"][data-chart-block-id="${entry.block.block_id}"]`,
    );
    // The fixture is deterministic: a chart that never shows is the harness or the page, and the
    // failure says which from what the page holds.
    await chart.waitFor({ state: 'visible', timeout: 120_000 }).catch(async (error: unknown) => {
      mkdirSync(CHART_OUT_DIR, { recursive: true });
      await page
        .screenshot({ path: resolve(CHART_OUT_DIR, `${entry.id}-${theme}-failure.png`) })
        .catch(() => undefined);
      const seen = await page.evaluate(
        (question) => ({
          asked: document.body.innerText.includes(question),
          reports: document.querySelectorAll('[data-report-section]').length,
          charts: document.querySelectorAll('[data-testid="chart-block"]').length,
        }),
        entry.question,
      );
      throw new Error(
        `no chart after the send (question in the transcript ${seen.asked}, report sections ${seen.reports}, charts ${seen.charts}): ${String(error).slice(0, 120)}`,
      );
    });
    await page.waitForTimeout(1_200);
    const htmlTheme = await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );
    if (htmlTheme !== theme) notes.push(`${id}: the page rendered ${htmlTheme}, not ${theme}`);
    const wide = await readChart(page, entry.block.block_id);
    grade(
      `${id}.renders`,
      wide.found &&
        wide.inAnswer &&
        wide.surface &&
        !wide.tiles &&
        !wide.degraded &&
        htmlTheme === theme,
      `found ${wide.found}, in answer ${wide.inAnswer}, svg ${wide.surface}, tiles ${wide.tiles}, degraded ${wide.degraded}, theme ${htmlTheme}`,
    );
    const form = formProblems(entry.block, wide);
    grade(
      `${id}.form`,
      wide.found && form.length === 0,
      form.length === 0 ? entry.expect : form.join('; '),
    );
    mkdirSync(CHART_OUT_DIR, { recursive: true });
    const answer = page.locator('[data-report-section="answer"]').last();
    await answer.scrollIntoViewIfNeeded().catch(() => undefined);
    await answer.screenshot({ path: resolve(CHART_OUT_DIR, `${entry.id}-${theme}-1280.png`) });

    await page.setViewportSize({ width: 375, height: 812 });
    await settledChartWidth(page, entry.block.block_id);
    const narrow = await readChart(page, entry.block.block_id);
    const scroll = await horizontalScrollers(
      page,
      `[data-testid="chart-block"][data-chart-block-id="${CSS_ESCAPE(entry.block.block_id)}"]`,
    );
    const values = [
      ...valueProblems(entry.block, wide).map((problem) => `at 1280px ${problem}`),
      ...valueProblems(entry.block, narrow).map((problem) => `at 375px ${problem}`),
    ];
    grade(
      `${id}.values`,
      wide.found && narrow.found && values.length === 0,
      values.length === 0
        ? 'every labelled value printed at 1280 and 375; money as $… MXN'
        : values.join('; '),
    );
    const legible = [...legibilityProblems(wide, 1280), ...legibilityProblems(narrow, 375)];
    grade(
      `${id}.legible`,
      wide.found && narrow.found && legible.length === 0,
      legible.length === 0
        ? 'no category names run together and no label is cut, at 1280 and 375'
        : legible.slice(0, 6).join('; '),
    );
    const overflow = [...scroll.page, ...scroll.block];
    if (narrow.rect.right > 376) overflow.push(`chart runs to ${Math.round(narrow.rect.right)}px`);
    if (overflow.length > 0) overflow.push(`widest: ${narrow.widest.join(', ')}`);
    grade(
      `${id}.fits-375`,
      narrow.found && narrow.surface && overflow.length === 0,
      overflow.length === 0
        ? `chart ${Math.round(narrow.rect.width)}px wide, nothing scrolls sideways`
        : overflow.join('; '),
    );
    // At 375 the answer is taller than the transcript's own scroller, which clips an element
    // shot of it, and the chat's "Jump to latest" floats over its bottom edge: bring the chart
    // to the top of the transcript and shoot the chart itself.
    await chart.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await chart.screenshot({ path: resolve(CHART_OUT_DIR, `${entry.id}-${theme}-375.png`) });
    return graded;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Waits for the chart to finish resizing: Recharts re-measures on a ResizeObserver, and a read
 * taken mid-resize sees the old, wider SVG. Two equal widths 400ms apart, or 10s, then read.
 */
async function settledChartWidth(page: Page, blockId: string): Promise<void> {
  const widthOf = () =>
    page.evaluate(
      (id) =>
        document
          .querySelector(`[data-chart-block-id="${CSS.escape(id)}"] svg.recharts-surface`)
          ?.getBoundingClientRect().width ?? -1,
      blockId,
    );
  let previous = await widthOf();
  for (let waited = 0; waited < 10_000; waited += 400) {
    await page.waitForTimeout(400);
    const current = await widthOf();
    if (current === previous) return;
    previous = current;
  }
}

/** Block ids are plain snake_case; a quote in one would break the attribute selector. */
const CSS_ESCAPE = (value: string): string => value.replace(/["\\]/g, '\\$&');

async function deleteSessions(): Promise<void> {
  for (const sessionId of createdSessions) {
    const response = await fetch(
      `${API_URL}/api/agents/jaina/chat/conversations/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${memberToken}` },
        signal: AbortSignal.timeout(20_000),
      },
    ).catch(
      (error: unknown) => ({ status: `error ${String(error)}` }) as unknown as { status: number },
    );
    notes.push(`cleanup: DELETE conversation ${sessionId} → ${response.status}`);
  }
}

test.describe('Jaina — the asked-for answer format renders under the sentence', () => {
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
    notes.push(`backend ${API_URL}`);
  });

  test.afterAll(async () => {
    await deleteSessions().catch((error: unknown) =>
      notes.push(`cleanup failed: ${String(error)}`),
    );
    if (originalBrand && originalBrand !== EASYFIT_BRAND_ID) await selectBrand(originalBrand);
    // The client session the bench minted ends with it (sign out what a bench creates).
    if (memberToken) {
      const revoked = await revokeBenchSession(storageState, memberToken).catch(
        (error: unknown) => ({
          sessionId: '?',
          revoked: false,
          detail: String(error),
        }),
      );
      notes.push(
        `cleanup: session ${revoked.sessionId} ${revoked.revoked ? 'signed out' : `NOT signed out — ${revoked.detail}`}`,
      );
    }
    printEnvelopeOnce();
  });

  // ONLY decides at load which test exists, so a skipped one never launches a browser.
  const only = process.env.JAINA_ANSWER_FORMATS_ONLY;
  const named = (only ?? '').split(',').filter(Boolean);
  const chartCases = CHART_CASES.filter(
    (entry) => named.length === 0 || named.includes('charts') || named.includes(entry.id),
  );
  const liveTest =
    named.length === 0 || named.some((name) => LIVE_ASKS.includes(name)) ? test : test.skip;
  const chartTest = chartCases.length > 0 ? test : test.skip;

  liveTest(
    'steps and a two-entity comparison, asked in Spanish on Easy Fit',
    async ({ browser }) => {
      test.setTimeout(38 * 60_000);
      await selectBrand(EASYFIT_BRAND_ID);
      const [sideA, sideB] = await comparisonSides();
      const asks: Expected[] = [
        {
          name: 'steps',
          question:
            'dame los pasos para bajar el costo por resultado de mis conjuntos de Mensajes esta semana',
        },
        {
          name: 'comparison',
          question: `compara ${sideA} vs ${sideB} en los últimos 7 días`,
          entities: [sideA, sideB],
        },
      ];
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1280, height: 900 },
      });
      try {
        for (const expected of asks) {
          if (named.length > 0 && !named.includes(expected.name)) continue;
          await test.step(expected.name, async () => runAsk(context, expected));
        }
      } finally {
        await context.close().catch(() => undefined);
      }
      expect(
        failed.filter((step) => !step.startsWith('chart.')),
        'every assertion of both asks',
      ).toEqual([]);
    },
  );

  chartTest(
    'the standard’s worked-case charts render as specified (fixture answers)',
    async ({ browser }) => {
      test.setTimeout(30 * 60_000);
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1280, height: 900 },
        // Recharts' draw-in follows reduced motion: the screenshot is the finished chart.
        reducedMotion: 'reduce',
      });
      await routeConversations(context, originalBrand ?? EASYFIT_BRAND_ID);
      try {
        for (const entry of chartCases) {
          for (const theme of THEMES) {
            // A case that throws (no composer, no chart) is that case's FAIL, not the end of the run.
            // A throw is the harness (a page that never loaded), so it gets one more try; a
            // failed assertion never does.
            await test.step(`${entry.id} ${theme}`, async () => {
              const graded = await runChartCase(context, entry, theme)
                .catch((error: unknown) => {
                  notes.push(`${entry.id} ${theme}: retried after ${String(error).slice(0, 160)}`);
                  return runChartCase(context, entry, theme);
                })
                .catch((error: unknown): Graded[] => [
                  [
                    `chart.${entry.id}.${theme}.renders`,
                    false,
                    `threw twice: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`,
                  ],
                ]);
              for (const [step, ok, detail] of graded) grade(step, ok, detail);
            });
          }
        }
      } finally {
        await context.close().catch(() => undefined);
      }
      notes.push(`chart screenshots: ${CHART_OUT_DIR}`);
      expect(
        failed.filter((step) => step.startsWith('chart.')),
        'every chart check of every case, light and dark',
      ).toEqual([]);
    },
  );
});
