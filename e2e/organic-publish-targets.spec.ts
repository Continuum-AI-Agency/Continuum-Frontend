import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';
import {
  dayIdOffsetFromToday,
  LOCAL_OWNER_EMAIL,
  LOCAL_OWNER_PASSWORD,
} from './support/plannerBench';
import {
  ACCOUNTS,
  ARTIFACTS,
  accessTokenOf,
  activateBenchBrand,
  BE_URL,
  BENCH,
  type BenchBackend,
  BRAND_ID,
  BRAND_NAME,
  type BrandRestore,
  draftRow,
  FE_ENV_DIR,
  frontendServerPids,
  launchEnvRedisKeys,
  localStackStatus,
  purgeFixture,
  restoreBrand,
  seedAccounts,
  startBenchBackend,
  type TapCall,
  tap,
  uploadStill,
} from './support/publishTargetsBench';
import { cacheEnvKeys } from './support/publishTargetsBenchEnv';

// organic:publish-targets:e2e:bench — WHO a post goes to, WHERE, and with WHICH caption, in a real
// browser against this clone's Frontend (:3031) and Backend (:4031), on the LOCAL stack, $0.
//
// REAL: the planner in Chrome, the Backend's routes (fields, fan-out, group, publish-plan dry run,
// publish-intent, publish, bulk-publish, approve), its account resolvers and token decrypt, the
// real publishers, local Postgres rows and local storage. Every cell grades the persisted row, the
// dry run, the publish attempt rows or the recorded provider calls — never the DOM alone.
//
// FAKED, STATED EXPLICITLY:
//   · Provider sockets. A `bun --preload` swaps the Backend's global fetch so graph.facebook.com,
//     api.linkedin.com, business-api.tiktok.com and googleapis go to the Backend's own
//     recordingTransport (it speaks their protocols and returns `bench-*` post ids). Every other
//     non-loopback host is refused with a 503 and counted — no model, provider or cache is reached.
//   · Tokens. The seeded connections carry `fake-*` tokens encrypted with the local key.
//   · Avatars. A 1×1 PNG served by the preload; the cells check WHICH avatar URL is shown, not pixels.
//   · Publish media URLs. Local storage signs http://127.0.0.1 URLs and the publisher (rightly)
//     sends providers https only, so the preload presents the publish path's signatures as https
//     (and gives TikTok's media proxy the original form). The faked providers never fetch them.
//   · The adapt model. The preload replaces `PostGenerator.adaptPlacementCopyToPlatform` (the seam
//     CONTRACT.md names) with a deterministic `[<platform>] adapted caption`; the route, the member
//     lookup, the brief gate and the save are real.
//
// UN-EXERCISED, STATED EXPLICITLY (UNEXERCISED below carries the same list into the notes and
// bench-report.json):
//   · The adapt model's own wording (faked above); `organic:copy:bench` is the bench for it.
//   · Cell 8's Approve CLICK. The UI disables Approve for a draft blocked by a foreign stamp; cell 8
//     asserts that from the DOM (disabled, its aria-describedby reason carrying the account fix) and
//     then calls approve on the Backend directly. The 422 is the BE's, not a UI click's.
//   · Dragging a group card; group approve / reschedule / unschedule /
//     delete through the UI; the month and list views (only the week grid is graded, cell 9); the
//     toolbar's default-account PUT (/api/organic/publish-accounts/default); the composer's
//     multi-platform path; Facebook, YouTube and X publish (only Instagram, TikTok, LinkedIn are).
//   · The dated date-range refetch: fixtures are seeded with scheduled_date null (cell 13's
//     scheduled TikTok member alone carries one, and its card sits on its slot_data day).
//   · A process's env after start is invisible to `ps -wwE` (launch env only, and Next loads `.env`
//     in-process); cell 0 reads each process's LIVE env from inside it (Backend: preload tap;
//     Frontend: BUN_OPTIONS preload) and uses `ps -wwE` as a second signal.
//   · Instagram post ids are fixed by recordingTransport (`bench-ig-media-1`), so two Instagram
//     publishes share one organic_published_posts row; the attempt rows are per publish.

const SHOTS = ARTIFACTS;
const HAS_LOCAL_STACK = Boolean(
  /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_API_URL === BE_URL &&
    process.env.PTB_FE_ENV_DIR === FE_ENV_DIR,
);

test.describe.configure({ mode: 'serial' });
test.skip(
  !HAS_LOCAL_STACK,
  'Run through `bun run organic:publish-targets:e2e:bench` (local stack env).',
);

const UNEXERCISED = [
  'the adapt model wording (faked; organic:copy:bench grades it)',
  "cell 8's Approve click: the UI disables Approve for the foreign-stamped draft (cell 8 asserts it disabled, with its reason, from the DOM), so approve is called on the BE directly",
  'dragging a group card',
  'group approve / reschedule / unschedule / delete through the UI',
  'the month and list views (only the week grid is graded)',
  'the toolbar default-account PUT (/api/organic/publish-accounts/default)',
  "the composer's multi-platform path",
  'Facebook, YouTube and X publish (only Instagram, TikTok, LinkedIn publish)',
  "the dated date-range refetch (fixtures are seeded with scheduled_date null; only cell 13's scheduled TikTok member carries one)",
];

const notes = [
  'Local stack only: Frontend :3031, Backend :4031 (workers off, Redis keys removed), tap :4032; seeded brand ' +
    `${BRAND_ID} + one foreign brand, deleted in afterAll.`,
  'Faked: provider sockets (Backend recordingTransport via bun --preload; every other non-loopback host refused), tokens, avatars (1x1 PNG).',
  'Faked: publish media URLs shown as https (local storage signs http; the faked providers never fetch them).',
  'Toasts are made click-through (a local-only Trends error toast covers the panel footer); their text is still read.',
  'Faked: the adapt model (PostGenerator.adaptPlacementCopyToPlatform via mock.module in the preload); route, gate and save are real.',
  `Un-exercised: ${UNEXERCISED.join('; ')}.`,
  'Cell 0 reads each process LIVE env in-process (preload probes), matching cache keys by name OR by an upstash.io / redis:// value (plus its _TOKEN), names only; ps -E launch env is a second signal.',
  'Failure prefixes: "FE:" = the Frontend half is missing it, "BE:" = the Backend half, "bench:" = this bench.',
];
const recorder = createBenchRecorder(BENCH, notes);
const report: Record<string, unknown> = { unexercised: UNEXERCISED };

type Row = {
  id: string;
  platform: string | null;
  platform_account_id: string | null;
  group_id: string | null;
  status: string;
  client_key: string | null;
  updated_at: string;
  platform_post_id: string | null;
  content_json: { copy?: { caption?: string | null } } | null;
};
type GroupFixture =
  | 'group'
  | 'applyAll'
  | 'adapt'
  | 'removeSource'
  | 'removePromote'
  | 'removeScheduled';
type Drafts = Record<
  'identity' | 'pick' | 'membership' | 'foreign' | 'linkedin' | GroupFixture,
  string
>;

let supabase: SupabaseClient;
let backend: BenchBackend | null = null;
let restore: BrandRestore | null = null;
let context: BrowserContext | null = null;
let cookies: Awaited<ReturnType<typeof mintSessionWithPassword>>['cookies'] = [];
let token = '';
const drafts = {} as Drafts;
const groupSetup: Record<GroupFixture, string | null> = {
  group: null,
  applyAll: null,
  adapt: null,
  removeSource: null,
  removePromote: null,
  removeScheduled: null,
};
const foreignRequests: string[] = [];

const ORIGINAL_CAPTION = 'Spring launch: the new range lands Friday. Come see it first.';

function admin(): SupabaseClient {
  const status = localStackStatus();
  return createClient(status.API_URL ?? '', status.SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
}

const organic = () =>
  (supabase as unknown as { schema: (s: string) => SupabaseClient }).schema('organic');
const ROW_COLUMNS =
  'id, platform, platform_account_id, group_id, status, client_key, updated_at, platform_post_id, content_json';

async function row(id: string): Promise<Row | null> {
  const { data } = await organic()
    .from('organic_calendar_drafts')
    .select(ROW_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function groupRows(groupId: string): Promise<Row[]> {
  const { data } = await organic()
    .from('organic_calendar_drafts')
    .select(ROW_COLUMNS)
    .eq('brand_id', BRAND_ID)
    .eq('group_id', groupId);
  return (data as Row[] | null) ?? [];
}

/** The group a source row belongs to, read from the column, members keyed by platform. */
async function groupOf(
  sourceId: string,
): Promise<{ groupId: string; members: Record<string, Row> } | null> {
  const source = await row(sourceId);
  if (!source?.group_id) return null;
  const members = Object.fromEntries(
    (await groupRows(source.group_id)).map((r) => [r.platform ?? '?', r]),
  );
  return { groupId: source.group_id, members };
}

const captionOf = (r: Row | null | undefined) => r?.content_json?.copy?.caption ?? null;

async function attempts(draftIds: string[]) {
  const { data } = await organic()
    .from('organic_publish_attempts')
    .select(
      'draft_id, platform, platform_account_id, status, caption_sent, platform_post_id, error_code, error_message',
    )
    .in('draft_id', draftIds);
  return (data ?? []) as Array<{
    draft_id: string;
    platform: string;
    platform_account_id: string;
    status: string;
    caption_sent: string | null;
    platform_post_id: string | null;
    error_code: string | null;
    error_message: string | null;
  }>;
}

async function be(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, body };
}

type DryRun = {
  plan?: {
    account?: { id: string | null; status: string; handle: string | null };
    caption?: { text: string | null; body: string };
  };
  boundAccountId?: string | null;
  accounts?: Array<{ id: string; handle: string | null; needsReauth?: boolean }>;
};

async function dryRun(draftId: string, platform: string): Promise<DryRun> {
  const { status, body } = await be(
    `/api/organic/calendar/drafts/${draftId}/publish-plan?platform=${platform}`,
  );
  if (status !== 200)
    throw new Error(
      `BE: publish-plan for ${platform} answered ${status} ${JSON.stringify(body).slice(0, 160)}`,
    );
  return body as DryRun;
}

type Candidate = {
  id: string;
  platform: string;
  handle: string | null;
  avatarUrl: string | null;
  needsReauth: boolean;
};
async function publishAccounts(): Promise<Candidate[] | string> {
  const { status, body } = await be(`/api/organic/publish-accounts?brandId=${BRAND_ID}`);
  if (status !== 200) return `BE: GET /api/organic/publish-accounts answered ${status}`;
  return ((body as { accounts?: Candidate[] }).accounts ?? []) as Candidate[];
}

async function poll<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!ok(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    value = await read();
  }
  return value;
}

// --- Cells ---------------------------------------------------------------------------------------

/** Pages opened by the running cell; cell() closes them, after a failure screenshot. */
let cellPages: Page[] = [];

/** First line of an error, plus Playwright's "waiting for <locator>" line when it has one. */
function firstLine(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const lines = error.message.split('\n');
  const waiting = lines.find((line) => line.includes('waiting for'))?.trim();
  return waiting ? `${lines[0]} (${waiting})` : (lines[0] ?? '');
}

/** One named cell: PASS with its evidence, or FAIL with what broke + a screenshot. Never throws. */
async function cell(step: string, run: () => Promise<string>): Promise<void> {
  const outer = cellPages;
  cellPages = [];
  try {
    const detail = await run();
    recorder.record(step, 'PASS', detail);
  } catch (error) {
    const message = firstLine(error);
    const slug = step.split(' ')[0];
    const page = cellPages.at(-1);
    if (page && !page.isClosed()) await shot(page, `fail-${slug}.png`);
    recorder.record(step, 'FAIL', `${message}${page ? ` [fail-${slug}.png]` : ''}`);
    expect.soft(false, `${step}: ${message}`).toBe(true);
  } finally {
    await Promise.all(cellPages.map((page) => page.close().catch(() => {})));
    cellPages = outer;
  }
}

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- UI ------------------------------------------------------------------------------------------

async function newPage(): Promise<Page> {
  const page = await (context as BrowserContext).newPage();
  cellPages.push(page);
  page.on('pageerror', (error) =>
    console.log(`[${BENCH}] pageerror: ${error.message.split('\n')[0]}`),
  );
  return page;
}

async function openPlanner(page: Page, query: string): Promise<void> {
  await page.goto(`/organic?tab=planner${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page, 'bench: the session did not hold (redirected to /login)').not.toHaveURL(
    /\/login/,
    {
      timeout: 60_000,
    },
  );
  await expect(page.getByRole('button', { name: 'Planner', exact: true }).first()).toBeVisible({
    timeout: 240_000,
  });
}

async function openDraft(page: Page, draftId: string): Promise<Locator> {
  await openPlanner(page, `&draftId=${draftId}`);
  const panel = page.getByRole('complementary', { name: 'Draft preview' });
  await expect(panel, `FE: the review panel never opened for ?draftId=${draftId}`).toBeVisible({
    timeout: 120_000,
  });
  return panel;
}

async function openWeek(page: Page): Promise<void> {
  await openPlanner(page, '&view=week');
  const week = page.getByRole('button', { name: 'Week', exact: true }).first();
  if ((await week.getAttribute('aria-pressed').catch(() => null)) !== 'true')
    await week.click().catch(() => {});
}

/** The visible week-grid cards of one group. */
const groupCards = (page: Page, groupId: string) =>
  page.locator(`[data-draft-card][data-group-id="${groupId}"]:visible`);

const identityTrigger = (panel: Locator, label: string) =>
  panel.getByRole('button', { name: new RegExp(`^${label} account:`) }).first();

async function triggerName(trigger: Locator): Promise<string> {
  return (
    (await trigger.getAttribute('aria-label').catch(() => null)) ??
    (await trigger.textContent().catch(() => null)) ??
    ''
  ).trim();
}

async function frame(panel: Locator, label: string): Promise<void> {
  const button = panel
    .locator('button[aria-pressed]')
    .and(panel.getByRole('button', { name: label, exact: true }))
    .first();
  await expect(button, `FE: no "See it on" frame button named ${label} (aria-pressed)`).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button, `FE: the ${label} frame did not become pressed`).toHaveAttribute(
    'aria-pressed',
    'true',
    {
      timeout: 10_000,
    },
  );
}

async function captionBox(panel: Locator): Promise<Locator> {
  // Feed frames (LinkedIn, Facebook) call it "post copy"; the others "caption".
  const edit = panel
    .getByRole('button', { name: /^(Edit|Add an?) (\w+ )?(caption|post copy)$/i })
    .first();
  // The preview is a lazy chunk: wait for its Edit button (isVisible() would not wait).
  const editShown = await edit
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (editShown) await edit.click();
  const box = panel.getByRole('textbox', { name: /caption|post copy/i }).first();
  await expect(box, 'FE: no caption textbox in the review panel').toBeVisible({ timeout: 20_000 });
  return box;
}

const isFieldsPatch = (draftId: string | null) => (response: Response) =>
  response.request().method() === 'PATCH' &&
  (draftId
    ? response.url().includes(`/calendar/drafts/${draftId}/fields`)
    : /\/calendar\/drafts\/[^/]+\/fields/.test(response.url()));

const fieldsPatchTarget = (response: Response) =>
  response.url().match(/\/calendar\/drafts\/([^/]+)\/fields/)?.[1] ?? '?';

async function openSelector(page: Page, panel: Locator): Promise<void> {
  const trigger = panel.getByRole('button', { name: /^Change platforms/ }).first();
  await expect(trigger, 'FE: no "Change platforms" selector trigger').toBeVisible({
    timeout: 30_000,
  });
  await trigger.click();
  await expect(
    page.getByRole('menuitemcheckbox').first(),
    'FE: the platform selector shows no menuitemcheckbox',
  ).toBeVisible({
    timeout: 10_000,
  });
}

const platformItem = (page: Page, label: string) =>
  page.getByRole('menuitemcheckbox', { name: new RegExp(`^${label}(\\s|$)`) }).first();

/** Unticks `label` in the platform selector; the group/remove answer, or null when none was sent. */
async function untick(page: Page, panel: Locator, label: string): Promise<Response | null> {
  if (
    !(await platformItem(page, label)
      .isVisible()
      .catch(() => false))
  )
    await openSelector(page, panel);
  const item = platformItem(page, label);
  must(
    (await item.getAttribute('aria-checked')) === 'true',
    `FE: ${label} is not ticked before the untick`,
  );
  must(
    (await item.getAttribute('aria-disabled')) !== 'true',
    `FE: the ${label} item is disabled (locked)`,
  );
  const removed = page
    .waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/group/remove'), {
      timeout: 20_000,
    })
    .catch(() => null);
  await item.click();
  return removed;
}

/** Each label's tick in the platform selector ("Instagram=false LinkedIn=true"); closes it after. */
async function selectorTicks(page: Page, panel: Locator, labels: string[]): Promise<string> {
  await openSelector(page, panel);
  const ticks: string[] = [];
  for (const label of labels) {
    const checked = await platformItem(page, label).getAttribute('aria-checked');
    ticks.push(`${label}=${checked === 'true'}`);
  }
  await page.keyboard.press('Escape');
  return ticks.join(' ');
}

/** The calendar-rows GET the planner runs after a membership change. Arm it before the change. */
const calendarRefetch = (page: Page) =>
  page
    .waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/organic\/calendar\/drafts\?/.test(r.url()),
      { timeout: 30_000 },
    )
    .catch(() => null);

/** After that refetch, with no reload: the panel must still be open; returns its selector ticks. */
async function ticksAfterRefetch(
  page: Page,
  refetched: Promise<Response | null>,
  labels: string[],
): Promise<string> {
  if (
    await page
      .getByRole('menuitemcheckbox')
      .first()
      .isVisible()
      .catch(() => false)
  )
    await page.keyboard.press('Escape');
  must(await refetched, 'FE: no calendar refetch (GET /calendar/drafts) after the untick');
  await page.waitForTimeout(1_500);
  const panel = page.getByRole('complementary', { name: 'Draft preview' });
  must(
    await panel.isVisible().catch(() => false),
    'FE: the review panel closed after the untick (before any reload)',
  );
  return selectorTicks(page, panel, labels);
}

/** Every field / membership write the page makes: what it sent and what came back. */
function recordWrites(page: Page): () => Promise<string> {
  const writes: Promise<string>[] = [];
  page.on('response', (response) => {
    const request = response.request();
    const match = new URL(response.url()).pathname.match(
      /\/drafts\/([^/]+)\/(fields|fan-out|group\/remove)$/,
    );
    if (!match || !['PATCH', 'POST'].includes(request.method())) return;
    const sent = (request.postData() ?? '').slice(0, 90);
    writes.push(
      response
        .text()
        .catch(() => '')
        .then(
          (body) =>
            `${match[2]} ${match[1]?.slice(0, 8)} sent ${sent} → ${response.status()} ${body.slice(0, 90)}`,
        ),
    );
  });
  return async () => (await Promise.all(writes)).join(' | ') || 'no writes';
}

const toastTexts = (page: Page) =>
  page.locator('[role="dialog"]:has(button[aria-label="Dismiss toast"])').allTextContents();

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, name) }).catch(() => {});
}

// --- Fixture -------------------------------------------------------------------------------------

async function makeStill(page: Page): Promise<Buffer> {
  await page.goto('about:blank');
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
    gradient.addColorStop(0, '#1f4e79');
    gradient.addColorStop(1, '#f2b134');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px sans-serif';
    ctx.fillText('Spring launch', 120, 560);
    return canvas.toDataURL('image/png').split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

async function seedDrafts(stillPath: string): Promise<void> {
  const today = dayIdOffsetFromToday(0);
  const spec: Array<[keyof Drafts, string, 'instagram' | 'linkedin', string]> = [
    ['identity', 'PTB identity', 'instagram', ACCOUNTS.igA.id],
    ['pick', 'PTB pick account', 'instagram', ACCOUNTS.igA.id],
    ['membership', 'PTB membership', 'instagram', ACCOUNTS.igA.id],
    ['group', 'PTB group', 'instagram', ACCOUNTS.igA.id],
    ['applyAll', 'PTB apply all', 'instagram', ACCOUNTS.igA.id],
    ['adapt', 'PTB adapt', 'instagram', ACCOUNTS.igA.id],
    ['foreign', 'PTB foreign stamp', 'instagram', ACCOUNTS.foreignIg.id],
    ['linkedin', 'PTB linkedin long', 'linkedin', ACCOUNTS.linkedin.id],
    ['removeSource', 'PTB untick source of 2', 'instagram', ACCOUNTS.igA.id],
    ['removePromote', 'PTB untick source of 3', 'instagram', ACCOUNTS.igA.id],
    ['removeScheduled', 'PTB untick scheduled', 'instagram', ACCOUNTS.igA.id],
  ];
  const rows = spec.map(([key, title, platform, accountId]) => {
    drafts[key] = randomUUID();
    return draftRow({
      id: drafts[key],
      title,
      platform,
      accountId,
      caption: ORIGINAL_CAPTION,
      dayId: today,
      stillPath,
      withBrief: key === 'adapt',
    });
  });
  await organic().from('organic_calendar_drafts').insert(rows).throwOnError();
}

/** The group fixtures go through the REAL membership route, the one writer of `group_id`. */
async function fanOutFixture(
  key: GroupFixture,
  want: string[] = ['instagram', 'tiktok', 'linkedin'],
): Promise<void> {
  const { status, body } = await be(`/api/organic/calendar/drafts/${drafts[key]}/fan-out`, {
    method: 'POST',
    body: JSON.stringify({ platforms: want }),
  });
  if (status !== 200) {
    groupSetup[key] =
      `BE: setup fan-out of ${key} answered ${status} ${JSON.stringify(body).slice(0, 160)}`;
    return;
  }
  const group = await groupOf(drafts[key]);
  const platforms = Object.keys(group?.members ?? {})
    .sort()
    .join(',');
  groupSetup[key] =
    platforms === [...want].sort().join(',')
      ? null
      : `BE: setup fan-out of ${key} left members [${platforms}]`;
}

/** A member caption unlike the source's, so "keeps its own caption" means something. */
const memberCaption = (platform: string) => `${platform} copy: its own words, not the source's.`;

/**
 * The untick fixtures, past the fan-out: every member gets its own caption, and the scheduled
 * fixture's TikTok member is scheduled a week out (approved first: the approval gate trigger).
 */
async function shapeRemovalFixtures(): Promise<void> {
  const keys = ['removeSource', 'removePromote', 'removeScheduled'] as const;
  for (const key of keys) {
    if (groupSetup[key]) continue;
    try {
      const group = await groupOf(drafts[key]);
      for (const member of Object.values(group?.members ?? {})) {
        if (member.id === drafts[key]) continue;
        const content = member.content_json ?? {};
        await organic()
          .from('organic_calendar_drafts')
          .update({
            content_json: {
              ...content,
              copy: { ...content.copy, caption: memberCaption(member.platform ?? '?') },
            },
          })
          .eq('id', member.id)
          .throwOnError();
      }
      const tiktok = group?.members.tiktok;
      if (key === 'removeScheduled' && tiktok) {
        const table = () => organic().from('organic_calendar_drafts');
        await table().update({ status: 'approved' }).eq('id', tiktok.id).throwOnError();
        await table()
          .update({
            status: 'scheduled',
            scheduled_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          })
          .eq('id', tiktok.id)
          .throwOnError();
      }
    } catch (error) {
      groupSetup[key] = `bench: shaping the ${key} fixture failed: ${firstLine(error)}`;
    }
  }
}

// --- Hooks ---------------------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  try {
    await setUp(browser);
  } catch (error) {
    recorder.record(
      'setup',
      'FAIL',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
    throw error;
  }
});

async function setUp(browser: Browser): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  supabase = admin();
  report.purgedBefore = await purgeFixture(supabase);
  backend = await startBenchBackend();
  report.backendPid = backend.pid;
  report.backendSpawnEnvRedisKeys = cacheEnvKeys(backend.env);
  await seedAccounts(supabase);
  restore = await activateBenchBrand(supabase);
  const scratch = await browser.newPage();
  const stillPath = await uploadStill(supabase, await makeStill(scratch));
  await scratch.close();
  await seedDrafts(stillPath);
  cookies = (await mintSessionWithPassword(LOCAL_OWNER_EMAIL, LOCAL_OWNER_PASSWORD)).cookies;
  token = accessTokenOf(cookies);
  await fanOutFixture('group');
  await fanOutFixture('applyAll');
  await fanOutFixture('adapt');
  await fanOutFixture('removeSource', ['instagram', 'linkedin']);
  await fanOutFixture('removePromote');
  await fanOutFixture('removeScheduled', ['instagram', 'tiktok']);
  await shapeRemovalFixtures();
  report.drafts = drafts;
  report.groupSetup = groupSetup;

  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // No config actionTimeout: without this a click on a missing control waits out the whole test.
  context.setDefaultTimeout(30_000);
  // Toasts are click-through. On the local stack "Trend intelligence unavailable" stays up over
  // the panel footer (Approve, Publish now, Change platforms); the cells grade publish targets, not
  // toasts, and cell 8 still READS toast text.
  await context.addInitScript(() => {
    const toast = ':is([role="dialog"], [role="region"]):has(button[aria-label="Dismiss toast"])';
    const style = () => {
      const tag = document.createElement('style');
      tag.textContent = `${toast}, ${toast} * { pointer-events: none !important; }`;
      document.head.appendChild(tag);
    };
    if (document.head) style();
    else document.addEventListener('DOMContentLoaded', style);
  });
  await context.addCookies(cookies);
  // The browser stays on loopback too: analytics, fonts or anything else off-machine is aborted.
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) => {
    foreignRequests.push(new URL(route.request().url()).host);
    return route.abort();
  });
}

test.afterAll(async () => {
  report.frontendPids = frontendServerPids();
  await context?.close().catch(() => {});
  if (supabase) {
    // Graded, not logged: a failed restore leaves the owner on no active brand while the run reads clean.
    const restoreFailure = restore
      ? await restoreBrand(supabase, restore).then(
          () => null,
          (error: unknown) => firstLine(error),
        )
      : null;
    const left = await purgeFixture(supabase);
    report.purgedAfter = left;
    const leftovers = Object.entries(left).filter(([, n]) => n !== 0);
    recorder.record(
      'cleanup: the owner brand restored, every bench row deleted',
      leftovers.length === 0 && !restoreFailure ? 'PASS' : 'FAIL',
      [
        restoreFailure ? `restore FAILED: ${restoreFailure}` : 'owner brand restored',
        leftovers.length === 0 ? JSON.stringify(left) : `left behind ${JSON.stringify(leftovers)}`,
      ].join('; '),
    );
  }
  await backend?.stop();
  report.backendStopped = backend ? !isAlive(backend.pid) : null;
  report.foreignBrowserRequests = [...new Set(foreignRequests)];
  const envelope = printEnvelope();
  writeFileSync(
    join(SHOTS, 'bench-report.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts: envelope?.counts ?? null,
        exitCode: envelope?.exitCode ?? null,
        cells:
          envelope?.results.map((result) => ({
            id: result.step.split(' ')[0]?.replace(/:$/, ''),
            step: result.step,
            grade: result.grade,
            detail: (result.detail ?? '').split('\n')[0],
          })) ?? 'bench: the Recorder printed no envelope',
        ...report,
      },
      null,
      2,
    )}\n`,
  );
});

type Envelope = {
  results: Array<{ step: string; grade: string; detail?: string }>;
  counts: Record<string, number>;
  exitCode: number;
};

/**
 * Prints the Recorder envelope (the one line the factory grades) and hands back that same object,
 * so bench-report.json carries the very grades stdout does, with no second grading path.
 */
function printEnvelope(): Envelope | null {
  const log = console.log;
  let envelope: Envelope | null = null;
  console.log = (...args: unknown[]) => {
    log(...args);
    try {
      envelope = JSON.parse(String(args[0])) as Envelope;
    } catch {
      // not the envelope
    }
  };
  try {
    recorder.print();
  } finally {
    console.log = log;
  }
  return envelope;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- Cell 0: no Redis/Upstash in either live process ---------------------------------------------

async function redisCell(when: string): Promise<void> {
  await cell(`0 no Redis/Upstash env in the live BE + FE processes (${when})`, async () => {
    const be0 = await tap<{
      pid: number;
      redisKeysSet: string[];
      refused: { url: string }[];
      cacheAttemptsTotal: number;
    }>('/env');
    must(
      be0.pid === backend?.pid,
      `bench: the tap answered from pid ${be0.pid}, not the bench Backend ${backend?.pid}`,
    );
    must(
      be0.redisKeysSet.length === 0,
      `bench: the Backend's live env holds ${be0.redisKeysSet.join(', ')}`,
    );
    const upstash = be0.refused.filter((call) => /upstash/i.test(call.url));
    must(upstash.length === 0, `bench: the Backend tried Upstash ${upstash.length}× (refused)`);
    must(
      be0.cacheAttemptsTotal === 0,
      `bench: the Backend tried a Redis/Upstash host ${be0.cacheAttemptsTotal}× this run (refused)`,
    );
    const psBe = launchEnvRedisKeys(be0.pid);
    must(
      psBe.keys.length === 0,
      `bench: ps -E shows ${psBe.keys.join(', ')} in the Backend's launch env`,
    );

    const serverPids = frontendServerPids();
    must(serverPids.length > 0, 'bench: nothing listens on :3031');
    const probes = existsSync(FE_ENV_DIR)
      ? readdirSync(FE_ENV_DIR).map(
          (file) =>
            JSON.parse(readFileSync(join(FE_ENV_DIR, file), 'utf8')) as {
              pid: number;
              redisKeysSet: string[];
              upstashRefused: number;
              at: number;
            },
        )
      : [];
    const live = probes.filter((probe) => isAlive(probe.pid));
    const covered = serverPids.filter((pid) => live.some((probe) => probe.pid === pid));
    must(
      covered.length > 0,
      `bench: no live FE probe for the :3031 server (pids ${serverPids.join(',')}): run via the package script (BUN_OPTIONS preload)`,
    );
    const stale = live.filter((probe) => Date.now() - probe.at > 10_000);
    must(
      stale.length === 0,
      `bench: FE probes stale for pids ${stale.map((p) => p.pid).join(',')}`,
    );
    const dirty = live.filter((probe) => probe.redisKeysSet.length > 0 || probe.upstashRefused > 0);
    must(
      dirty.length === 0,
      `bench: FE process ${dirty[0]?.pid} holds ${dirty[0]?.redisKeysSet.join(', ')} (upstash tries ${dirty[0]?.upstashRefused})`,
    );
    const psFe = serverPids.map((pid) => launchEnvRedisKeys(pid));
    must(
      psFe.every((ps) => ps.keys.length === 0),
      'bench: ps -E shows Redis keys in an FE launch env',
    );
    return (
      `BE pid ${be0.pid}: 0 cache keys live (by name or Redis/Upstash URL value), 0 Upstash calls; FE ${live.length} live bun processes ` +
      `(server ${covered.join(',')}): 0 keys, 0 Upstash calls; ps -E launch env read: ${psBe.visible ? 'yes, clean' : 'not readable'}`
    );
  });
}

// --- The bench -----------------------------------------------------------------------------------

test('publish targets: the account, the channels and the caption are the rows they claim', async () => {
  test.setTimeout(45 * 60_000);
  try {
    await runCells();
  } catch (error) {
    recorder.record(
      'test body',
      'FAIL',
      error instanceof Error ? error.message.split('\n')[0] : String(error),
    );
    throw error;
  }
});

async function runCells(): Promise<void> {
  const evidence: Record<string, unknown> = {};
  report.evidence = evidence;

  // Warm the dev server once: the first /organic compile is minutes on a fresh dist dir.
  {
    const page = await newPage();
    await openPlanner(page, '').catch((error) => console.log(`[${BENCH}] warm-up: ${error}`));
    await page.close();
  }

  await redisCell('start');

  await cell(
    '1 identity row shows the stamped account (avatar + handle) before the dry run, never the brand',
    async () => {
      const id = drafts.identity;
      must(
        (await row(id))?.platform_account_id === ACCOUNTS.igA.id,
        'bench: the identity draft lost its stamp',
      );
      const candidates = await publishAccounts();
      const page = await newPage();
      let held = 0;
      let answered = false;
      let release: () => void = () => {};
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/publish-plan**', async (route) => {
        held += 1;
        await hold;
        await route.continue();
      });
      page.on('response', (response) => {
        if (response.url().includes('/publish-plan')) answered = true;
      });
      try {
        const panel = await openDraft(page, id);
        const trigger = identityTrigger(panel, 'Instagram');
        await expect(trigger, 'FE: no identity trigger named "Instagram account: …"').toBeVisible({
          timeout: 60_000,
        });
        await expect
          .poll(() => triggerName(trigger), {
            timeout: 30_000,
            message: 'FE: the identity trigger never named @acme_a',
          })
          .toMatch(/^Instagram account: @?acme_a$/);
        const accountText = (
          (await panel.locator('[data-review-account]').first().textContent()) ?? ''
        ).trim();
        const dataId = await panel
          .locator('[data-review-account]')
          .first()
          .getAttribute('data-account-id');
        const avatar = panel.locator('img[src*="/avatar/ig-a.png"]').first();
        const avatarShown = await avatar.isVisible().catch(() => false);
        const before = {
          held,
          answered,
          name: await triggerName(trigger),
          accountText,
          dataId,
          avatarShown,
        };
        evidence.identityBefore = before;
        await shot(page, 'identity-before-dry-run.png');
        must(
          !answered,
          'bench: the dry run answered before the check (the route hold did not take)',
        );
        must(
          /acme_a/.test(accountText),
          `FE: [data-review-account] reads "${accountText}", not the stamped @acme_a`,
        );
        must(
          dataId === ACCOUNTS.igA.id,
          `FE: [data-review-account] data-account-id is "${dataId}", not the stamp`,
        );
        must(
          avatarShown,
          'FE: the stamped account avatar (ig-a.png) is not shown before the dry run',
        );
        must(
          ![before.name, accountText].some((text) => text.includes(BRAND_NAME)),
          'FE: the identity row shows the brand name',
        );
        release();
        await page
          .waitForResponse((r) => r.url().includes('/publish-plan'), { timeout: 60_000 })
          .catch(() => null);
        await page.waitForTimeout(1_000);
        const after = (
          (await panel.locator('[data-review-account]').first().textContent()) ?? ''
        ).trim();
        must(
          /acme_a/.test(after) && !after.includes(BRAND_NAME),
          `FE: after the dry run the identity row reads "${after}"`,
        );
        const plan = await dryRun(id, 'instagram');
        must(
          plan.plan?.account?.id === ACCOUNTS.igA.id,
          `BE: the dry run resolves ${plan.plan?.account?.id}, not the stamp`,
        );
        const fromBe =
          typeof candidates === 'string'
            ? candidates
            : candidates.find((c) => c.id === ACCOUNTS.igA.id);
        return `row stamp igA; before the dry run (held ${held}, answered no): "${before.name}", avatar ig-a.png, data-account-id=stamp; dry run account ${plan.plan?.account?.status}; candidates: ${typeof fromBe === 'string' ? fromBe : `${fromBe?.handle} avatar ${fromBe?.avatarUrl ? 'yes' : 'no'}`}`;
      } finally {
        release();
      }
    },
  );

  await cell(
    '7 needs_reauth account disabled with Reconnect; unconnected YouTube/X disabled with a reason',
    async () => {
      const id = drafts.identity;
      // Both halves are graded independently, so one cell says which of them is missing what.
      const problems: string[] = [];
      const seen: string[] = [];
      const page = await newPage();
      const panel = await openDraft(page, id);
      await identityTrigger(panel, 'Instagram').click();
      const radios = page.getByRole('radiogroup', { name: 'Instagram account' });
      if (
        await radios
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        const oldRadio = radios.getByRole('radio', { name: /acme_old/ }).first();
        // Base UI marks a disabled radio with aria-disabled and/or data-disabled.
        const disabled = await oldRadio
          .evaluate(
            (el) =>
              String(
                el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled'),
              ),
            undefined,
            { timeout: 5_000 },
          )
          .catch(() => 'missing');
        const href = await page
          .getByRole('link', { name: /Reconnect/ })
          .first()
          .getAttribute('href', { timeout: 5_000 })
          .catch(() => null);
        await shot(page, 'reauth-account-disabled.png');
        if (disabled !== 'true') problems.push(`FE: acme_old radio aria-disabled=${disabled}`);
        if (!href?.includes('section=integrations'))
          problems.push(`FE: no Reconnect link to integrations (href ${href})`);
        seen.push(`acme_old radio aria-disabled=${disabled}, Reconnect ${href}`);
      } else {
        problems.push('FE: the identity picker is not a radiogroup "Instagram account"');
      }
      await page.keyboard.press('Escape');

      await openSelector(page, panel).catch((error: Error) =>
        problems.push(error.message.split('\n')[0] ?? 'FE: no selector'),
      );
      for (const label of ['YouTube', 'X']) {
        const item = platformItem(page, label);
        if (!(await item.isVisible().catch(() => false))) {
          problems.push(`FE: the selector lists no ${label}`);
          continue;
        }
        const disabled = await item.getAttribute('aria-disabled');
        const reason = (
          (await item
            .locator('[data-platform-reason]')
            .first()
            .textContent({ timeout: 2_000 })
            .catch(() => null)) ?? ''
        ).trim();
        if (disabled !== 'true') problems.push(`FE: ${label} is not aria-disabled`);
        if (!new RegExp(`Connect ${label}`).test(reason))
          problems.push(`FE: ${label}'s reason reads "${reason}"`);
        seen.push(`${label} disabled=${disabled} "${reason}"`);
      }
      await shot(page, 'unconnected-platforms-disabled.png');
      await page.keyboard.press('Escape');

      const candidates = await publishAccounts();
      if (typeof candidates === 'string') problems.push(candidates);
      else {
        const old = candidates.find((c) => c.id === ACCOUNTS.igReauth.id);
        if (old?.needsReauth !== true)
          problems.push(`BE: publish-accounts lists acme_old needsReauth=${old?.needsReauth}`);
      }
      const group = await be(`/api/organic/calendar/drafts/${id}/group`);
      const verdicts =
        (
          group.body as {
            verdicts?: Array<{ platform: string; available: boolean; reason: string | null }>;
          } | null
        )?.verdicts ?? [];
      if (group.status !== 200) problems.push(`BE: GET /drafts/:id/group answered ${group.status}`);
      for (const platform of ['youtube', 'x']) {
        const verdict = verdicts.find((v) => v.platform === platform);
        if (group.status === 200 && verdict?.available !== false)
          problems.push(`BE: the ${platform} verdict is not refused`);
        if (verdict) seen.push(`BE ${platform}: "${verdict.reason}"`);
      }
      must(problems.length === 0, problems.join(' | '));
      return seen.join('; ');
    },
  );

  await cell(
    '2 pick IG account B: persists across a reload; dry run, confirm and the provider call are all B',
    async () => {
      const id = drafts.pick;
      const page = await newPage();
      const panel = await openDraft(page, id);
      await identityTrigger(panel, 'Instagram').click();
      const radios = page.getByRole('radiogroup', { name: 'Instagram account' });
      await expect(
        radios,
        'FE: the identity picker is not a radiogroup "Instagram account"',
      ).toBeVisible({ timeout: 10_000 });
      const patch = page.waitForResponse(isFieldsPatch(id), { timeout: 20_000 }).catch(() => null);
      await radios
        .getByRole('radio', { name: /acme_b/ })
        .first()
        .click();
      const response = await patch;
      must(response, 'FE: picking acme_b sent no PATCH /fields for this draft');
      must(
        response.status() === 200,
        `BE: PATCH /fields { accountId } answered ${response.status()}`,
      );
      const stamped = await poll(
        () => row(id),
        (r) => r?.platform_account_id === ACCOUNTS.igB.id,
      );
      must(
        stamped?.platform_account_id === ACCOUNTS.igB.id,
        `BE: the row's platform_account_id is ${stamped?.platform_account_id}`,
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      const again = page.getByRole('complementary', { name: 'Draft preview' });
      await expect(again).toBeVisible({ timeout: 120_000 });
      await expect
        .poll(() => triggerName(identityTrigger(again, 'Instagram')), {
          timeout: 30_000,
          message: 'FE: after a reload the identity row is not acme_b',
        })
        .toMatch(/acme_b/);
      const plan = await dryRun(id, 'instagram');
      must(
        plan.plan?.account?.id === ACCOUNTS.igB.id && plan.plan?.account?.status === 'resolved',
        `BE: dry run account ${JSON.stringify(plan.plan?.account)}`,
      );

      await tap('/reset', { method: 'POST' });
      await again.getByRole('button', { name: 'Publish now', exact: true }).first().click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog, 'FE: Publish now opened no alertdialog').toBeVisible({
        timeout: 30_000,
      });
      const confirmAccount = (
        (await dialog.locator('[data-publish-account-name]').first().textContent()) ?? ''
      ).trim();
      await shot(page, 'pick-account-confirm.png');
      must(/acme_b/.test(confirmAccount), `FE: the confirm names "${confirmAccount}", not acme_b`);
      const published = page
        .waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            /\/drafts\/(bulk-publish|[^/]+\/publish)$/.test(new URL(r.url()).pathname),
          { timeout: 90_000 },
        )
        .catch(() => null);
      await dialog
        .getByRole('button', { name: /^Publish/ })
        .first()
        .click();
      const done = await published;
      must(done && done.status() < 400, `BE: the publish answered ${done?.status() ?? 'nothing'}`);
      await done.finished().catch(() => {});
      const { calls } = await tap<{ calls: TapCall[] }>('/calls');
      const igCalls = calls.filter(
        (call) => call.url.includes('graph.facebook.com') && call.method === 'POST',
      );
      const toB = igCalls.filter((call) => call.url.includes(`/${ACCOUNTS.igB.externalId}/`));
      const toA = igCalls.filter((call) => call.url.includes(`/${ACCOUNTS.igA.externalId}/`));
      must(
        toB.length > 0 && toA.length === 0,
        `BE: provider calls went to B ${toB.length}×, A ${toA.length}×`,
      );
      const tried = await poll(
        () => attempts([id]),
        (rows) => rows.length > 0,
        20_000,
      );
      const attempt = tried[0];
      must(
        attempt?.status === 'succeeded' &&
          [ACCOUNTS.igB.id, ACCOUNTS.igB.externalId].includes(attempt.platform_account_id),
        `BE: publish attempt ${JSON.stringify(attempt)}`,
      );
      return `PATCH /fields 200 → platform_account_id=igB; reload shows acme_b; dry run resolved igB; confirm "${confirmAccount}"; provider POST /${ACCOUNTS.igB.externalId}/media; attempt ${attempt.status} on ${attempt.platform_account_id}`;
    },
  );

  await cell(
    '3 ticking TikTok + LinkedIn on an IG draft creates the member rows at once; a reload keeps both',
    async () => {
      const id = drafts.membership;
      const page = await newPage();
      const writes = recordWrites(page);
      const panel = await openDraft(page, id);
      const timings: string[] = [];
      for (const label of ['TikTok', 'LinkedIn']) {
        if (
          !(await platformItem(page, label)
            .isVisible()
            .catch(() => false))
        )
          await openSelector(page, panel);
        const fanOut = page
          .waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/fan-out'), {
            timeout: 20_000,
          })
          .catch(() => null);
        const t0 = Date.now();
        await platformItem(page, label).click();
        const response = await fanOut;
        must(response, `FE: ticking ${label} sent no membership (fan-out) request`);
        must(response.status() === 200, `BE: fan-out for ${label} answered ${response.status()}`);
        const platform = label.toLowerCase();
        const group = await poll(
          () => groupOf(id),
          (g) => Boolean(g?.members[platform]),
          3_000,
        );
        must(group?.members[platform], `BE: no ${platform} member row 3 s after the tick`);
        timings.push(`${label} row in ${Date.now() - t0} ms`);
      }
      await page.keyboard.press('Escape');
      await page.reload({ waitUntil: 'domcontentloaded' });
      const again = page.getByRole('complementary', { name: 'Draft preview' });
      await expect(again).toBeVisible({ timeout: 120_000 });
      await page.waitForTimeout(3_000);
      const group = await groupOf(id);
      const platforms = Object.keys(group?.members ?? {})
        .sort()
        .join(',');
      if (platforms !== 'instagram,linkedin,tiktok') {
        throw new Error(
          `FE/BE: after a reload the group rows are [${platforms}]; ${await writes()}`,
        );
      }
      await openSelector(page, again);
      for (const label of ['TikTok', 'LinkedIn']) {
        must(
          (await platformItem(page, label).getAttribute('aria-checked')) === 'true',
          `FE: after a reload ${label} is not ticked`,
        );
      }
      await shot(page, 'membership-after-reload.png');
      await page.keyboard.press('Escape');
      const statuses = Object.values(group?.members ?? {})
        .map((r) => `${r.platform}:${r.status}`)
        .join(' ');
      return `group ${group?.groupId}: ${timings.join(', ')}; after reload rows [${platforms}] (${statuses}), both ticked`;
    },
  );

  await cell(
    '11 unticking the SOURCE of a 2-platform post keeps the other row with its own caption and account; a reload shows 1 card',
    async () => {
      must(!groupSetup.removeSource, groupSetup.removeSource ?? '');
      const before = await groupOf(drafts.removeSource);
      const ig = before?.members.instagram;
      const li = before?.members.linkedin;
      must(before && ig && li, 'bench: the fixture is not an Instagram + LinkedIn group');
      must(captionOf(li) !== captionOf(ig), 'bench: the LinkedIn member shares the source caption');
      const page = await newPage();
      const writes = recordWrites(page);
      const panel = await openDraft(page, ig.id);
      const refetched = calendarRefetch(page);
      const response = await untick(page, panel, 'Instagram');
      must(response, 'FE: unticking the source (Instagram) sent no group/remove request');
      must(
        response.status() === 200,
        `BE: group/remove answered ${response.status()} ${(await response.text().catch(() => '')).slice(0, 140)}`,
      );
      const stayed = await ticksAfterRefetch(page, refetched, ['Instagram', 'LinkedIn']);
      must(
        stayed === 'Instagram=false LinkedIn=true',
        `FE: before a reload the panel's selector reads ${stayed}`,
      );
      await poll(
        () => row(ig.id),
        (r) => r === null,
      );
      const liAfter = await row(li.id);
      const left = await groupRows(before.groupId);
      const problems = [
        (await row(ig.id)) && 'the Instagram row is still there',
        !liAfter && 'the LinkedIn row is gone',
        liAfter &&
          captionOf(liAfter) !== captionOf(li) &&
          `the LinkedIn caption became "${captionOf(liAfter)?.slice(0, 40)}"`,
        liAfter &&
          liAfter.platform_account_id !== ACCOUNTS.linkedin.id &&
          `the LinkedIn account became ${liAfter.platform_account_id}`,
        liAfter &&
          liAfter.client_key !== ig.client_key &&
          `the LinkedIn client_key is ${liAfter.client_key}, not the source's ${ig.client_key}`,
        left.length !== 1 && `the group holds ${left.length} rows`,
      ].filter(Boolean);
      must(problems.length === 0, `BE: ${problems.join('; ')}; ${await writes()}`);

      await openWeek(page);
      const cards = groupCards(page, before.groupId);
      await expect(cards.first(), 'FE: after a reload the group has no week-grid card').toBeVisible(
        { timeout: 60_000 },
      );
      await page.waitForTimeout(1_500);
      const count = await cards.count();
      const shown = await cards.first().getAttribute('data-backend-draft-id');
      await shot(page, 'untick-source-of-2.png');
      must(count === 1, `FE: after a reload the week grid shows ${count} cards for the group`);
      must(shown === li.id, `FE: the card is row ${shown}, not the LinkedIn row`);
      return `group/remove 200; panel stayed open after the refetch (${stayed}); Instagram row deleted; LinkedIn row kept caption "${captionOf(li)?.slice(0, 24)}…", account linkedin, client_key = source's; 1 row; reload: 1 card = LinkedIn row`;
    },
  );

  await cell('12 unticking the SOURCE of a 3-platform post promotes another member', async () => {
    must(!groupSetup.removePromote, groupSetup.removePromote ?? '');
    const before = await groupOf(drafts.removePromote);
    const ig = before?.members.instagram;
    const li = before?.members.linkedin;
    const tt = before?.members.tiktok;
    must(
      before && ig && li && tt,
      'bench: the fixture is not an Instagram + LinkedIn + TikTok group',
    );
    const page = await newPage();
    const writes = recordWrites(page);
    const panel = await openDraft(page, ig.id);
    const refetched = calendarRefetch(page);
    const response = await untick(page, panel, 'Instagram');
    must(response, 'FE: unticking the source (Instagram) sent no group/remove request');
    must(
      response.status() === 200,
      `BE: group/remove answered ${response.status()} ${(await response.text().catch(() => '')).slice(0, 140)}`,
    );
    const labels = ['Instagram', 'LinkedIn', 'TikTok'];
    const want = 'Instagram=false LinkedIn=true TikTok=true';
    const stayed = await ticksAfterRefetch(page, refetched, labels);
    must(stayed === want, `FE: before a reload the panel's selector reads ${stayed}`);
    await poll(
      () => row(ig.id),
      (r) => r === null,
    );
    const kept = { linkedin: await row(li.id), tiktok: await row(tt.id) };
    const wantAccount = { linkedin: ACCOUNTS.linkedin.id, tiktok: ACCOUNTS.tiktok.id };
    const problems: string[] = [];
    if (await row(ig.id)) problems.push('the Instagram row is still there');
    for (const [platform, was] of [
      ['linkedin', li],
      ['tiktok', tt],
    ] as const) {
      const now = kept[platform];
      if (!now) problems.push(`the ${platform} row is gone`);
      else if (captionOf(now) !== captionOf(was))
        problems.push(`the ${platform} caption became "${captionOf(now)?.slice(0, 40)}"`);
      else if (now.platform_account_id !== wantAccount[platform])
        problems.push(`the ${platform} account became ${now.platform_account_id}`);
    }
    const heirs = Object.values(kept).filter((r) => r?.client_key === ig.client_key);
    if (heirs.length !== 1 || heirs[0]?.platform !== 'linkedin')
      problems.push(
        `the source client_key is held by [${heirs.map((r) => r?.platform).join(', ')}], not LinkedIn alone`,
      );
    must(problems.length === 0, `BE: ${problems.join('; ')}; ${await writes()}`);

    // The promoted row's card id is its own (slot_data.placementId), not its row id, so the
    // reloaded post is opened the way a user does: by clicking its card.
    await openWeek(page);
    const card = page
      .locator(`[data-draft-card][data-backend-draft-id="${li.id}"]:visible`)
      .first();
    await expect(card, 'FE: after a reload no week-grid card is the LinkedIn row').toBeVisible({
      timeout: 60_000,
    });
    await card.click();
    const again = page.getByRole('complementary', { name: 'Draft preview' });
    await expect(again, 'FE: clicking the card opened no review panel').toBeVisible({
      timeout: 30_000,
    });
    const ticked = await selectorTicks(page, again, labels);
    await shot(page, 'untick-source-of-3.png');
    must(ticked === want, `FE: after a reload the selector reads ${ticked}`);
    return `group/remove 200; panel stayed open after the refetch (${stayed}); Instagram row deleted; LinkedIn + TikTok kept their captions and accounts; LinkedIn promoted (source client_key); reload: ${ticked}`;
  });

  await cell('13 unticking a scheduled member is refused with the reason', async () => {
    must(!groupSetup.removeScheduled, groupSetup.removeScheduled ?? '');
    const before = await groupOf(drafts.removeScheduled);
    const ig = before?.members.instagram;
    const tt = before?.members.tiktok;
    must(before && ig && tt, 'bench: the fixture is not an Instagram + TikTok group');
    must(tt.status === 'scheduled', `bench: the TikTok member is ${tt.status}, not scheduled`);
    const page = await newPage();
    const panel = await openDraft(page, ig.id);
    const response = await untick(page, panel, 'TikTok');
    const reason = (
      await poll(
        () => toastTexts(page),
        (texts) => texts.some((t) => /TikTok/.test(t) && /scheduled/i.test(t)),
        15_000,
      )
    ).find((t) => /TikTok/.test(t) && /scheduled/i.test(t));
    await shot(page, 'untick-scheduled-refused.png');
    const ttAfter = await row(tt.id);
    const igAfter = await row(ig.id);
    must(
      reason,
      `FE: no toast names TikTok as scheduled (toasts: ${(await toastTexts(page)).map((t) => t.slice(0, 80)).join(' / ') || 'none'}; group/remove ${response?.status() ?? 'not sent'})`,
    );
    must(ttAfter?.status === 'scheduled', `BE: the TikTok row is ${ttAfter?.status ?? 'gone'}`);
    must(igAfter, 'BE: the Instagram row is gone');
    return `group/remove ${response?.status() ?? 'not sent'}; toast "${reason.slice(0, 100)}"; TikTok row still scheduled; Instagram row kept`;
  });

  await cell(
    '4 a caption typed on the TikTok frame lands on the TikTok row and its dry run; the IG row is unchanged',
    async () => {
      must(!groupSetup.group, groupSetup.group ?? '');
      const group = await groupOf(drafts.group);
      must(group, 'BE: the group fixture has no group_id');
      const tt = group.members.tiktok as Row;
      const igBefore = captionOf(group.members.instagram);
      const lines = [
        'TikTok cut: the spring range in 15 seconds.',
        'Line two keeps going.',
        'Line three keeps going.',
        'Line four keeps going.',
        'Line five keeps going.',
        'Last line: link in bio.',
      ];
      const typed = lines.join('\n');
      const page = await newPage();
      const panel = await openDraft(page, drafts.group);
      await frame(panel, 'TikTok');
      const box = await captionBox(panel);
      const patch = page
        .waitForResponse(isFieldsPatch(null), { timeout: 30_000 })
        .catch(() => null);
      await box.fill(lines.slice(0, 5).join('\n'));
      await box.press('End');
      await box.press('Enter');
      await box.pressSequentially(lines[5] ?? '', { delay: 15 });

      // vertical-caption-not-clipped: measured WHILE editing, on the vertical TikTok frame.
      await cell(
        'vertical-caption-not-clipped (TikTok frame, 6-line caption while typing)',
        async () => {
          const measure = () =>
            box.evaluate((el) => {
              const slot = el.closest('[data-preview-frame-slot]');
              if (!slot) return null;
              const s = slot.getBoundingClientRect();
              const t = el.getBoundingClientRect();
              const top = Math.max(s.top, 0);
              const bottom = Math.min(s.bottom, window.innerHeight);
              const field = el as HTMLTextAreaElement;
              return {
                inside:
                  t.top >= top - 1 &&
                  t.bottom <= bottom + 1 &&
                  t.left >= s.left - 1 &&
                  t.right <= s.right + 1,
                lastLineVisible:
                  field.scrollHeight <= field.clientHeight + 1 ||
                  field.scrollTop + field.clientHeight >= field.scrollHeight - 2,
                slot: {
                  top: Math.round(top),
                  bottom: Math.round(bottom),
                  scrollable: slot.scrollHeight > slot.clientHeight,
                },
                textarea: {
                  top: Math.round(t.top),
                  bottom: Math.round(t.bottom),
                  scrollHeight: field.scrollHeight,
                  clientHeight: field.clientHeight,
                },
              };
            });
          let m = await measure();
          must(m, 'FE: the caption textbox has no [data-preview-frame-slot] ancestor');
          let scrolled = false;
          if (!m.inside && m.slot.scrollable) {
            await box.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
            scrolled = true;
            m = (await measure()) ?? m;
          }
          await shot(page, 'tiktok-caption-typing.png');
          must(
            m.inside,
            `FE: the caption box (${m.textarea.top}-${m.textarea.bottom}) is clipped by the frame slot (${m.slot.top}-${m.slot.bottom})`,
          );
          must(
            m.lastLineVisible,
            `FE: the last typed line is hidden (scrollHeight ${m.textarea.scrollHeight} > clientHeight ${m.textarea.clientHeight})`,
          );
          // Inside the slot is not enough: nothing may sit ON the text. Hit-test the first and the
          // last typed line (toasts are click-through here, so they never count).
          const covered = await box.evaluate((el) => {
            const t = el.getBoundingClientRect();
            const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
            const x = t.left + Math.min(40, t.width / 4);
            return [t.top + lineHeight / 2, t.bottom - lineHeight / 2].flatMap((y) => {
              const hit = document.elementFromPoint(x, y);
              if (!hit || hit === el || el.contains(hit)) return [];
              const label =
                hit.getAttribute('aria-label') ?? hit.textContent?.trim().slice(0, 30) ?? '';
              return [`${hit.tagName.toLowerCase()} "${label}" at y=${Math.round(y)}`];
            });
          });
          must(covered.length === 0, `FE: the caption text is covered by ${covered.join('; ')}`);
          return `inside the slot${scrolled ? ' after the slot scrolled to it' : ''}; first + last line uncovered; last line visible (${JSON.stringify(m.textarea)})`;
        },
      );

      const response = await patch;
      must(response, 'FE: typing on the TikTok frame sent no PATCH /fields');
      const target = fieldsPatchTarget(response);
      const ttRow = await poll(
        () => row(tt.id),
        (r) => captionOf(r) === typed,
        20_000,
      );
      if (captionOf(ttRow) !== typed) {
        const others = Object.values((await groupOf(drafts.group))?.members ?? {}).find(
          (r) => captionOf(r) === typed,
        );
        throw new Error(
          `FE: the TikTok caption landed on ${others ? `the ${others.platform} row` : 'no row'} (PATCH went to ${target === tt.id ? 'the TikTok row' : target}); TikTok row reads "${captionOf(ttRow)?.slice(0, 40)}"`,
        );
      }
      const ig = await row(group.members.instagram?.id ?? '');
      must(
        captionOf(ig) === igBefore,
        `FE: the IG row's caption changed to "${captionOf(ig)?.slice(0, 40)}"`,
      );
      const plan = await dryRun(tt.id, 'tiktok');
      must(
        plan.plan?.caption?.body === typed || plan.plan?.caption?.text === typed,
        `BE: the TikTok dry-run caption reads "${plan.plan?.caption?.text?.slice(0, 40)}"`,
      );
      return `PATCH → TikTok row ${tt.id.slice(0, 8)}; copy.caption = the 6 typed lines; TikTok dry-run caption equal; IG row unchanged`;
    },
  );

  await cell('5 "Apply to all platforms" writes every member\'s caption', async () => {
    must(!groupSetup.applyAll, groupSetup.applyAll ?? '');
    const group = await groupOf(drafts.applyAll);
    must(group, 'BE: the apply-all fixture has no group_id');
    const text = `Apply-all caption ${randomUUID().slice(0, 6)}: one line for every network.`;
    const page = await newPage();
    const writes = recordWrites(page);
    const panel = await openDraft(page, drafts.applyAll);
    await frame(panel, 'TikTok');
    const box = await captionBox(panel);
    const patch = page
      .waitForResponse(isFieldsPatch(group.members.tiktok?.id ?? null), { timeout: 30_000 })
      .catch(() => null);
    await box.fill(text);
    must(await patch, 'FE: the TikTok caption sent no PATCH /fields to the TikTok row');
    const apply = panel
      .getByRole('button', { name: 'Apply to all platforms', exact: true })
      .first();
    await expect(apply, 'FE: no "Apply to all platforms" button').toBeVisible({
      timeout: 10_000,
    });
    await apply.click();
    const ids = Object.values(group.members).map((r) => r.id);
    const after = await poll(
      async () => Promise.all(ids.map((memberId) => row(memberId))),
      (rows) => rows.every((r) => captionOf(r) === text),
      20_000,
    );
    const off = after.filter((r) => captionOf(r) !== text).map((r) => r?.platform);
    if (off.length > 0) {
      const toasts = (await toastTexts(page)).map((t) => t.slice(0, 80)).join(' / ');
      throw new Error(
        `FE/BE: after Apply to all, [${off.join(', ')}] still differ; ${await writes()}; toasts: ${toasts || 'none'}`,
      );
    }
    return `all ${ids.length} member rows (${after.map((r) => r?.platform).join(', ')}) carry the applied caption`;
  });

  await cell('9 the week grid shows ONE card per group', async () => {
    const page = await newPage();
    await openWeek(page);
    const lines: string[] = [];
    for (const key of ['group', 'membership'] as const) {
      const group = await groupOf(drafts[key]);
      if (!group) {
        lines.push(`${key}: no group_id (skipped)`);
        continue;
      }
      const rows = Object.keys(group.members).length;
      const cards = groupCards(page, group.groupId);
      await expect(
        cards.first(),
        `FE: no [data-draft-card][data-group-id] for the ${key} group in the week grid`,
      ).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(1_500);
      const count = await cards.count();
      must(
        count === 1,
        `FE: the week grid shows ${count} cards for the ${key} group (${rows} rows)`,
      );
      lines.push(`${key}: ${rows} rows → 1 card`);
    }
    await shot(page, 'week-grid-one-card.png');
    must(
      lines.some((line) => line.includes('1 card')),
      `bench: no group to count (${lines.join('; ')})`,
    );
    return lines.join('; ');
  });

  await cell(
    '6 ONE publish confirm lists 3 platforms with their accounts; publish yields 3 attempts with the right ids + captions',
    async () => {
      must(!groupSetup.group, groupSetup.group ?? '');
      const group = await groupOf(drafts.group);
      must(group, 'BE: the group fixture has no group_id');
      const expected: Record<string, { label: string; externalId: string; id: string }> = {
        instagram: { label: 'acme_a', externalId: ACCOUNTS.igA.externalId, id: ACCOUNTS.igA.id },
        tiktok: {
          label: 'acme_tt',
          externalId: ACCOUNTS.tiktok.externalId,
          id: ACCOUNTS.tiktok.id,
        },
        linkedin: {
          label: 'Acme LinkedIn',
          externalId: ACCOUNTS.linkedin.externalId,
          id: ACCOUNTS.linkedin.id,
        },
      };
      for (const [platform, member] of Object.entries(group.members)) {
        must(
          member.platform_account_id === expected[platform]?.id,
          `BE: the ${platform} member is stamped ${member.platform_account_id}`,
        );
      }
      const planned: Record<string, string | null> = {};
      for (const [platform, member] of Object.entries(group.members)) {
        planned[platform] = (await dryRun(member.id, platform)).plan?.caption?.text ?? null;
      }
      await tap('/reset', { method: 'POST' });
      const page = await newPage();
      const panel = await openDraft(page, drafts.group);
      await panel.getByRole('button', { name: 'Publish now', exact: true }).first().click();
      const dialogs = page.getByRole('alertdialog');
      await expect(dialogs.first(), 'FE: Publish now opened no alertdialog').toBeVisible({
        timeout: 60_000,
      });
      must((await dialogs.count()) === 1, `FE: ${await dialogs.count()} confirm dialogs, not one`);
      const targets = dialogs.first().locator('[data-publish-target]');
      await expect(
        targets,
        'FE: the confirm does not list 3 [data-publish-target] rows',
      ).toHaveCount(3, { timeout: 30_000 });
      const listed: string[] = [];
      for (const platform of Object.keys(expected)) {
        const target = dialogs.first().locator(`[data-publish-target="${platform}"]`);
        must((await target.count()) === 1, `FE: the confirm has no ${platform} row`);
        const account = (
          (await target.locator('[data-publish-account-name]').first().textContent()) ?? ''
        ).trim();
        must(
          account.includes(expected[platform]?.label ?? '?'),
          `FE: the ${platform} row names "${account}"`,
        );
        listed.push(`${platform}=${account}`);
      }
      await shot(page, 'group-publish-confirm.png');
      const published = page
        .waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            /\/drafts\/(bulk-publish|[^/]+\/publish)$/.test(new URL(r.url()).pathname),
          { timeout: 120_000 },
        )
        .catch(() => null);
      await dialogs
        .first()
        .getByRole('button', { name: /^Publish/ })
        .first()
        .click();
      const done = await published;
      must(done, 'FE: confirming sent no publish request');
      must(
        done.url().includes('/bulk-publish'),
        'FE: the group published through single /publish, not /bulk-publish (C1)',
      );
      const sse = await done.text().catch(() => '');
      const complete = sse
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => {
          try {
            return JSON.parse(line.slice(5)) as {
              type?: string;
              groupStatus?: string;
              succeeded?: number;
            };
          } catch {
            return null;
          }
        })
        .find((event) => event?.type === 'complete');
      const memberIds = Object.values(group.members).map((r) => r.id);
      const tried = await poll(
        () => attempts(memberIds),
        (rows) => rows.length >= 3,
        30_000,
      );
      const { calls } = await tap<{ calls: TapCall[] }>('/calls');
      const lines: string[] = [];
      for (const [platform, member] of Object.entries(group.members)) {
        const want = expected[platform] as { externalId: string; id: string };
        const attempt = tried.find((a) => a.draft_id === member.id);
        must(
          attempt?.status === 'succeeded',
          `BE: the ${platform} attempt is ${attempt?.status ?? 'missing'} ${attempt?.error_message ?? ''}`,
        );
        must(
          [want.id, want.externalId].includes(attempt.platform_account_id),
          `BE: the ${platform} attempt went to ${attempt.platform_account_id}`,
        );
        must(
          attempt.caption_sent === planned[platform],
          `BE: the ${platform} caption sent differs from its dry run`,
        );
        const call = calls.find((c) =>
          platform === 'instagram'
            ? c.url.includes(`/${want.externalId}/media`) && c.method === 'POST'
            : platform === 'tiktok'
              ? c.url.includes('/business/') &&
                c.url.includes('/publish/') &&
                JSON.stringify(c.body).includes(want.externalId)
              : c.url.endsWith('/rest/posts') &&
                JSON.stringify(c.body).includes(`urn:li:organization:${want.externalId}`),
        );
        must(call, `BE: no recorded ${platform} provider publish to ${want.externalId}`);
        must(
          JSON.stringify(call.body).includes(JSON.stringify(planned[platform] ?? '').slice(1, 30)),
          `BE: the ${platform} provider call does not carry its caption`,
        );
        lines.push(`${platform}: ${attempt.platform_post_id ?? '?'} via ${want.externalId}`);
      }
      const rows = await Promise.all(memberIds.map((memberId) => row(memberId)));
      must(
        rows.every((r) => r?.status === 'published'),
        `BE: member statuses ${rows.map((r) => r?.status).join(',')}`,
      );
      must(
        complete?.groupStatus === 'published',
        `BE: bulk-publish complete event groupStatus=${complete?.groupStatus ?? 'missing'}`,
      );
      return `one confirm [${listed.join('; ')}]; bulk-publish complete published; ${lines.join('; ')}; every row published`;
    },
  );

  await cell(
    "8 a foreign stamp blocks approve and names the brand's own accounts to pick from",
    async () => {
      const id = drafts.foreign;
      const page = await newPage();
      const panel = await openDraft(page, id);
      const approve = panel.getByRole('button', { name: /^Approve/ }).first();
      await expect(approve, 'FE: no Approve button in the review panel').toBeVisible({
        timeout: 60_000,
      });
      // The UI's own gate, read from the DOM: once the dry run answers, Approve is disabled and its
      // aria-describedby note carries the account fix. That is why approve is then called on the BE
      // directly: the UI click is not exercised (UNEXERCISED says so).
      const readReason = () =>
        approve.evaluate((button) => {
          const notes = (button.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .flatMap((noteId) => document.getElementById(noteId) ?? []);
          return {
            text: notes
              .map((note) => (note.textContent ?? '').trim())
              .join(' ')
              .replace(/\s+/g, ' '),
            accountFix: notes.some((note) => note.querySelector('[data-readiness-fix="account"]')),
          };
        });
      const reason = await poll(readReason, (r) => r.accountFix, 60_000);
      must(
        reason.accountFix,
        `FE: Approve never gave the account fix as its disabled reason (aria-describedby: "${reason.text.slice(0, 120)}")`,
      );
      await expect(
        approve,
        "FE: Approve is enabled for a draft stamped with another brand's account",
      ).toBeDisabled();
      const direct = await be(`/api/organic/calendar/drafts/${id}/approve`, {
        method: 'POST',
        body: '{}',
      });
      const status = direct.status;
      const message = (direct.body as { message?: string } | null)?.message ?? '';
      const via = 'direct BE call (the UI disables Approve)';
      await page.waitForTimeout(1_500);
      await shot(page, 'foreign-stamp-blocked.png');
      const named = /acme_a|acme_b|other_brand_ig|Other Brand IG/;
      const shown = await page.evaluate((pattern) => {
        const re = new RegExp(pattern);
        return Array.from(
          document.querySelectorAll(
            '[role="alert"], [role="status"], [data-sonner-toast], [role="complementary"] p, [role="complementary"] li',
          ),
        )
          .filter((el) => el.getClientRects().length > 0 && !el.closest('[role="radiogroup"]'))
          .map((el) => (el.textContent ?? '').trim())
          .filter((text) => re.test(text) && /account/i.test(text))
          .slice(0, 3);
      }, named.source);
      const after = await row(id);
      must(
        status === 422,
        `BE: approve with another brand's account answered ${status} (A2) via ${via}`,
      );
      must(after?.status === 'draft', `BE: the row is ${after?.status} after the blocked approve`);
      must(
        named.test(message) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(message),
        `BE: the block message does not name the account by handle: "${message.slice(0, 120)}"`,
      );
      must(shown.length > 0, 'FE: no visible text names the account after the blocked approve');
      return `UI Approve disabled, reason "${reason.text.slice(0, 80)}"; approve ${status} via ${via}: "${message.slice(0, 100)}"; shown: "${shown[0]?.slice(0, 80)}"; row stays draft`;
    },
  );

  await cell('10 a 2,500-character LinkedIn caption saves', async () => {
    const id = drafts.linkedin;
    const caption = `${'LinkedIn long form. '.repeat(125)}`.slice(0, 2_500);
    must(caption.length === 2_500, 'bench: caption is not 2,500');
    const page = await newPage();
    const panel = await openDraft(page, id);
    const box = await captionBox(panel);
    const patch = page.waitForResponse(isFieldsPatch(id), { timeout: 30_000 }).catch(() => null);
    await box.fill(caption);
    const response = await patch;
    must(
      response,
      'FE: a 2,500-character LinkedIn caption sent no PATCH /fields (client-side cap?)',
    );
    const body = await response.text().catch(() => '');
    must(
      response.status() === 200,
      `BE: PATCH /fields answered ${response.status()} ${body.slice(0, 120)} (K6)`,
    );
    const saved = await poll(
      () => row(id),
      (r) => captionOf(r)?.length === 2_500,
    );
    must(
      captionOf(saved) === caption,
      `BE: the row's caption is ${captionOf(saved)?.length ?? 0} characters`,
    );
    return 'PATCH /fields 200; content_json.copy.caption read back at 2,500 characters';
  });

  await cell('adapt "Adapt for TikTok" rewrites the TikTok row only (model faked)', async () => {
    must(!groupSetup.adapt, groupSetup.adapt ?? '');
    const group = await groupOf(drafts.adapt);
    must(group, 'BE: the adapt fixture has no group_id');
    const tt = group.members.tiktok as Row;
    const before = Object.fromEntries(
      Object.values(group.members).map((r) => [r.platform, captionOf(r)]),
    );
    await tap('/reset', { method: 'POST' });
    const page = await newPage();
    const panel = await openDraft(page, drafts.adapt);
    await frame(panel, 'TikTok');
    const adapt = panel.getByRole('button', { name: 'Adapt for TikTok' }).first();
    await expect(adapt, 'FE: no "Adapt for TikTok" button on the TikTok frame').toBeEnabled({
      timeout: 20_000,
    });
    const answered = page
      .waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/adapt-caption'),
        {
          timeout: 60_000,
        },
      )
      .catch(() => null);
    await adapt.click();
    const response = await answered;
    must(response, 'FE: "Adapt for TikTok" sent no adapt-caption request');
    const body = (await response.json().catch(() => null)) as {
      memberId?: string;
      caption?: string;
    } | null;
    must(
      response.status() === 200,
      `BE: adapt-caption answered ${response.status()} ${JSON.stringify(body).slice(0, 140)}`,
    );
    const want = '[tiktok] adapted caption';
    const ttRow = await poll(
      () => row(tt.id),
      (r) => captionOf(r) === want,
      15_000,
    );
    must(captionOf(ttRow) === want, `BE: the TikTok row reads "${captionOf(ttRow)?.slice(0, 40)}"`);
    const after = await groupOf(drafts.adapt);
    const changed = Object.values(after?.members ?? {})
      .filter((r) => r.platform !== 'tiktok' && captionOf(r) !== before[r.platform ?? ''])
      .map((r) => r.platform);
    must(changed.length === 0, `BE: adapt also rewrote [${changed.join(', ')}]`);
    const { adaptCalls } = await tap<{ adaptCalls: { targetPlatform: string }[] }>('/calls');
    must(
      adaptCalls.length === 1 && adaptCalls[0]?.targetPlatform === 'tiktok',
      `bench: the faked model saw ${JSON.stringify(adaptCalls)}`,
    );
    await expect
      .poll(async () => ((await page.textContent('[role="complementary"]')) ?? '').includes(want), {
        timeout: 10_000,
        message: 'FE: the TikTok frame does not show the adapted caption',
      })
      .toBe(true);
    await shot(page, 'adapt-tiktok.png');
    return `adapt-caption 200 → memberId ${body?.memberId === tt.id ? 'TikTok row' : body?.memberId}; TikTok copy.caption = "${want}"; IG + LinkedIn unchanged; model fake called once (tiktok); frame shows it`;
  });

  await redisCell('end');
}
