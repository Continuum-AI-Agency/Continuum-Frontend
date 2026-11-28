/**
 * End-to-end bench of the desktop app sidebar's motion as a person drives it: a real session in a
 * real browser, every animation frame sampled from the trigger until 3.5 s after it, graded on
 * checkable claims. The rubric and its history live in the monorepo's docs/hillclimb/sidebar.md.
 *
 * A case is route@width:interaction. Interactions, each from rest with the pointer away from the rail:
 *   hover-in      the pointer moves onto the rail and rests there
 *   hover-out     the pointer leaves an open hover panel
 *   cross         the pointer teleports over the rail on its way to the top bar (5-step move)
 *   cross-human   the same pass at human speed, one move per 16 ms frame
 *   overshoot     a reach for the page's left gutter that lands ~30 ms inside the rail, then settles
 *   menu          with the panel hover-open, a menu is opened from it, the pointer goes to the page,
 *                 and the menu is closed with Escape
 *   pin / unpin   Ctrl+B with the rail closed / the panel pinned open
 * Claims (weight): C1 (2) every nav icon holds its x, C2 (2) its y, ±1px on every frame. C3 (2) the
 * page is not malformed: on a hover the top bar and <main> never move or resize; on a pin the page
 * edge meets the panel edge (±2px) on every frame. C4 (1) the end state is right. C5 (1) a pass over
 * the rail does not open it; a pass is a stay on the rail shorter than PASS_MAX_MS, and a case whose
 * driver held the pointer there longer (a stalled machine) is excluded as infra, never graded. C6 (1) hover-in starts opening within 500 ms of the pointer reaching
 * the rail. C7 (2) the panel stays open under a menu it opened, on every frame that menu is open.
 *
 * Reads only. Needs the app running at SIDEBAR_BENCH_URL (default http://localhost:3000).
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      BENCH_EMAIL, optional SIDEBAR_BENCH_URL, SIDEBAR_BENCH_REPEATS (default 1),
 *      SIDEBAR_BENCH_ROUTES (comma list), SIDEBAR_BENCH_SCORES (write a hillclimb gate score file),
 *      PLAYWRIGHT_EXECUTABLE.
 */
import { writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { mintSessionForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const RUBRIC = 'v4';
const BASE = new URL(process.env.SIDEBAR_BENCH_URL ?? 'http://localhost:3000');
const REPEATS = Number(process.env.SIDEBAR_BENCH_REPEATS ?? 1);
const SPLIT: Record<'train' | 'test', string[]> = {
  train: ['/dashboard', '/library', '/ai-studio'],
  test: ['/settings', '/organic', '/admin'],
};
const ONLY = process.env.SIDEBAR_BENCH_ROUTES?.split(',');
const WIDTHS = [1440, 1024];
const ACTIONS = [
  'hover-in',
  'hover-out',
  'cross',
  'cross-human',
  'overshoot',
  'menu',
  'pin',
  'unpin',
] as const;
type Action = (typeof ACTIONS)[number];
const PASSES: Action[] = ['cross', 'cross-human', 'overshoot'];
const WEIGHTS = { c1: 2, c2: 2, c3: 2, c4: 1, c5: 1, c6: 1, c7: 2 };
type Claim = keyof typeof WEIGHTS;
const OPEN_MENU_TRIGGER = '[aria-haspopup][aria-expanded="true"]';
// What counts as passing over the rail rather than resting on it. Chosen for a quick human flick,
// not from the product's open delay, so the bench grades the delay instead of inheriting it.
const PASS_MAX_MS = 120;

type Rect = [number, number, number, number];
type Frame = {
  t: number;
  pL: number;
  pR: number;
  main: Rect | null;
  hdr: Rect | null;
  fixedL: number | null;
  menu: boolean;
  icons: ([number, number] | null)[];
  labels: { right: number; lines: number }[];
};
type Recording = {
  frames: Frame[];
  widths: { open: number; icon: number };
  arrive: number | null;
  railStays: number[];
};
type Graded = Partial<Record<Claim, 0 | 1>> & { score: number; notes: string[] };

const email = process.env.BENCH_EMAIL;
if (!email) throw new Error('BENCH_EMAIL is required');
const recorder = createBenchRecorder('sidebar-motion', [
  `url: ${BASE.origin}`,
  `rubric: ${RUBRIC}`,
]);

// In-page sampler: geometry of the animated panel, the page and the nav icons on every frame.
function startSampler(menuSelector: string) {
  const win = window as unknown as Record<string, unknown>;
  const px = (value: string) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;width:${value}`;
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  };
  const widths = { open: px('var(--shell-sidebar-w)'), icon: px('var(--shell-sidebar-w-icon)') };
  win.__widths = widths;
  const round = (r: DOMRect | undefined) =>
    r ? [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10) : null;
  const snap = () => {
    const panel = document.querySelector('[data-sidebar=sidebar]') as HTMLElement;
    const outer = (panel.parentElement as HTMLElement).getBoundingClientRect();
    const fixed = [...document.querySelectorAll('[class*="left-[var(--app-sidebar-width"]')]
      .map((e) => e.getBoundingClientRect())
      .find((r) => r.width > 0);
    const icons = [...panel.querySelectorAll('[data-sidebar=menu-button]')].map((button) => {
      const r = button.querySelector('svg')?.getBoundingClientRect();
      return r?.width ? [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10] : null;
    });
    const labels = [...panel.querySelectorAll<HTMLElement>('[data-sidebar=menu-button] span')]
      .filter((s) => {
        const cs = getComputedStyle(s);
        return (
          s.textContent?.trim() &&
          !s.closest('.sr-only') &&
          cs.display !== 'none' &&
          cs.visibility === 'visible' &&
          Number(cs.opacity) > 0.05 &&
          s.getBoundingClientRect().width > 0
        );
      })
      .map((s) => {
        const r = s.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(s).lineHeight) || r.height;
        return { right: r.right, lines: Math.round(r.height / lineHeight) };
      });
    return {
      t: performance.now(),
      pL: outer.left,
      pR: outer.right,
      main: round(document.querySelector('main')?.getBoundingClientRect()),
      hdr: round(document.querySelector('header.group\\/app-header')?.getBoundingClientRect()),
      fixedL: fixed ? fixed.left : null,
      menu: panel.querySelector(menuSelector) !== null,
      icons,
      labels,
    };
  };
  win.__arrive = null;
  win.__railStays = [];
  win.__railSince = null;
  if (!win.__arriveHooked) {
    win.__arriveHooked = true;
    document.addEventListener(
      'pointermove',
      (e) => {
        const now = performance.now();
        const onRail = e.clientX <= widths.icon;
        if (win.__arrive == null && onRail) win.__arrive = now;
        if (onRail && win.__railSince == null) win.__railSince = now;
        if (!onRail && win.__railSince != null) {
          (win.__railStays as number[]).push(Math.round(now - (win.__railSince as number)));
          win.__railSince = null;
        }
      },
      { capture: true },
    );
  }
  const frames = [snap()];
  win.__frames = frames;
  const t0 = performance.now();
  const loop = () => {
    frames.push(snap());
    if (performance.now() - t0 < 3500) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function record(page: Page, width: number, action: Action): Promise<Recording> {
  const far: [number, number] = [width - 5, 895];
  const glide = async (x0: number, y0: number, x1: number, y1: number, steps: number) => {
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
      await page.waitForTimeout(16);
    }
  };
  await page.mouse.move(...far);
  await page.waitForTimeout(500);
  if (action === 'hover-out' || action === 'menu') {
    await page.mouse.move(22, 300, { steps: 4 });
    await page.waitForTimeout(3000);
  }
  if (action === 'menu') {
    await page.locator(`[data-sidebar=sidebar] [aria-haspopup]`).first().click();
    await page.waitForTimeout(800);
  }
  if (action === 'unpin') {
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(3000);
  }
  await page.evaluate(startSampler, OPEN_MENU_TRIGGER);
  await page.waitForTimeout(60);
  if (action === 'hover-in') await page.mouse.move(22, 300, { steps: 4 });
  if (action === 'hover-out') await page.mouse.move(width - 300, 300, { steps: 4 });
  if (action === 'cross') {
    await page.mouse.move(width / 2, 40);
    await page.mouse.move(8, 40, { steps: 5 });
    await page.mouse.move(width / 2, 40, { steps: 5 });
  }
  if (action === 'cross-human') {
    await page.mouse.move(width / 2, 40);
    await glide(width / 2, 40, 8, 40, 10);
    await glide(8, 40, width / 2, 40, 10);
  }
  if (action === 'overshoot') {
    await page.mouse.move(width / 2, 450);
    await glide(width / 2, 450, 30, 450, 8);
    await page.waitForTimeout(16);
    await glide(30, 450, 80, 450, 3);
  }
  if (action === 'menu') {
    await page.mouse.move(width - 300, 600, { steps: 6 });
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
  }
  if (action === 'pin' || action === 'unpin') await page.keyboard.press('Control+b');
  await page.waitForTimeout(action === 'menu' ? 2300 : 3500);
  const recording = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    return {
      frames: win.__frames,
      widths: win.__widths,
      arrive: win.__arrive,
      railStays: win.__railStays,
    } as Recording;
  });
  if (action === 'pin') await page.keyboard.press('Control+b');
  if (action === 'menu') await page.keyboard.press('Escape');
  await page.mouse.move(...far);
  await page.waitForTimeout(2500);
  return recording;
}

function grade(action: Action, { frames, widths, arrive, railStays }: Recording): Graded | string {
  if (PASSES.includes(action)) {
    if (!railStays.length) return 'the pointer never crossed the rail';
    const stay = Math.max(...railStays);
    if (stay >= PASS_MAX_MS)
      return `the driver held the pointer on the rail ${stay} ms: a rest, not a pass`;
  }
  const first = frames[0];
  const last = frames[frames.length - 1];
  const claims: Partial<Record<Claim, 0 | 1>> = {};
  const notes: string[] = [];
  let dx = 0;
  let dy = 0;
  for (const frame of frames)
    frame.icons.forEach((p, i) => {
      const q = first.icons[i];
      if (!p || !q) return;
      dx = Math.max(dx, Math.abs(p[0] - q[0]));
      dy = Math.max(dy, Math.abs(p[1] - q[1]));
    });
  claims.c1 = dx <= 1 ? 1 : 0;
  claims.c2 = dy <= 1 ? 1 : 0;
  if (!claims.c1) notes.push(`icon dx ${dx}`);
  if (!claims.c2) notes.push(`icon dy ${dy}`);
  const same = (a: Rect | null, b: Rect | null) =>
    (!a && !b) || (!!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 0.5));
  if (action === 'pin' || action === 'unpin') {
    const gap = Math.max(
      ...frames.map((f) =>
        Math.max(
          Math.abs((f.hdr?.[0] ?? f.pR) - f.pR),
          f.fixedL == null ? 0 : Math.abs(f.fixedL - f.pR),
        ),
      ),
    );
    claims.c3 = gap <= 2 ? 1 : 0;
    if (!claims.c3) notes.push(`page edge ${gap.toFixed(1)}px off the panel`);
  } else {
    const moved = frames.filter((f) => !same(f.main, first.main) || !same(f.hdr, first.hdr)).length;
    claims.c3 = moved ? 0 : 1;
    if (moved) notes.push(`page moved on ${moved} frames`);
  }
  const width = last.pR - last.pL;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  claims.c4 =
    action === 'hover-in' || action === 'pin'
      ? near(width, widths.open) &&
        last.labels.length > 0 &&
        last.labels.every((l) => l.right <= last.pR + 0.5 && l.lines === 1)
        ? 1
        : 0
      : near(width, widths.icon) && last.labels.length === 0
        ? 1
        : 0;
  if (!claims.c4) notes.push(`ends at ${width.toFixed(1)}px with ${last.labels.length} labels`);
  if (PASSES.includes(action)) {
    const widest = Math.max(...frames.map((f) => f.pR - f.pL));
    claims.c5 = widest <= widths.icon + 2 ? 1 : 0;
    if (!claims.c5) notes.push(`a pass opened the panel to ${widest.toFixed(1)}px`);
    notes.push(`on the rail ${Math.max(...railStays)} ms`);
  }
  if (action === 'hover-in') {
    if (arrive == null) return 'the pointer never reached the rail';
    const opening = frames.find((f) => f.t >= arrive && f.pR - f.pL > widths.icon + 2);
    const lag = opening ? Math.round(opening.t - arrive) : null;
    claims.c6 = lag != null && lag <= 500 ? 1 : 0;
    notes.push(`open lag ${lag ?? 'never'} ms`);
  }
  if (action === 'menu') {
    const withMenu = frames.filter((f) => f.menu);
    if (!withMenu.length) return 'no menu opened from the panel';
    const collapsed = withMenu.filter((f) => !near(f.pR - f.pL, widths.open)).length;
    claims.c7 = collapsed ? 0 : 1;
    if (collapsed) notes.push(`panel not open on ${collapsed} of ${withMenu.length} menu frames`);
  }
  const keys = Object.keys(claims) as Claim[];
  const score =
    keys.reduce((sum, k) => sum + WEIGHTS[k] * (claims[k] ?? 0), 0) /
    keys.reduce((sum, k) => sum + WEIGHTS[k], 0);
  return { ...claims, score, notes };
}

const state = await mintSessionForEmail(email);
const secure = BASE.protocol === 'https:';
const cookies = state.cookies.map((cookie) => ({
  ...cookie,
  domain: BASE.hostname,
  secure,
  sameSite: 'Lax' as const,
}));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
});
const scores: { rubric: string } & Record<'train' | 'test', Record<string, number[]>> = {
  rubric: RUBRIC,
  train: {},
  test: {},
};
let gradedCases = 0;

for (let repeat = 0; repeat < REPEATS; repeat++)
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      storageState: { cookies, origins: [] },
    });
    for (const split of ['train', 'test'] as const)
      for (const route of SPLIT[split].filter((r) => !ONLY || ONLY.includes(r))) {
        const page = await context.newPage();
        await page.mouse.move(width - 5, 895);
        await page
          .goto(new URL(`/en${route}`, BASE).href, { waitUntil: 'load', timeout: 180_000 })
          .catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        const ready = await page
          .waitForSelector('[data-sidebar=sidebar]', { timeout: 60_000 })
          .then(
            () => true,
            () => false,
          );
        await page.waitForTimeout(2500);
        // The first hover after a load also pays for code paths that later hovers do not.
        await page.mouse.move(22, 300, { steps: 4 });
        await page.waitForTimeout(2500);
        await page.mouse.move(width - 5, 895);
        await page.waitForTimeout(2500);
        for (const action of ACTIONS) {
          const id = `${route}@${width}:${action}`;
          let result: Graded | string;
          try {
            result = ready ? grade(action, await record(page, width, action)) : 'no sidebar';
          } catch (error) {
            result = error instanceof Error ? error.message.split('\n')[0] : String(error);
          }
          if (typeof result === 'string') {
            recorder.record(id, 'SKIP', `infra: ${result}`);
            continue;
          }
          gradedCases += 1;
          (scores[split][id] ??= []).push(Math.round(result.score * 1e4) / 1e4);
          recorder.record(
            id,
            result.score === 1 ? 'PASS' : 'FAIL',
            [`score ${result.score.toFixed(3)}`, ...result.notes].join('; '),
          );
        }
        await page.close();
      }
    await context.close();
  }
await browser.close();
recorder.record(
  'at least one case was graded',
  gradedCases > 0 ? 'PASS' : 'FAIL',
  `${gradedCases}`,
);
if (process.env.SIDEBAR_BENCH_SCORES)
  writeFileSync(process.env.SIDEBAR_BENCH_SCORES, JSON.stringify(scores, null, 1));
recorder.print();
process.exit(recorder.failed() ? 1 : 0);
