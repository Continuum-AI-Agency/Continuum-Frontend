import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { mintSessionForEmail } from './support/auth';
import { type BenchRecorder, createBenchRecorder } from './support/benchRecorder';
import { seedTheme } from './support/contrast';
import { readBackendEnv } from './support/prodEnv';

// The Loomix player's controls stay readable against whatever is behind them, in both
// themes, without darkening a frame that is already dark.
//
// Drives the real Library Reel view on the bench brand: real signed Storage clips, the
// real `Video` component as Next compiles it, real Chrome decoding, real theme CSS. For
// each paused frame it measures the band under the bottom bar ITSELF (its own canvas
// read plus the player's letterbox colour, not the component's sampler) and grades:
// - every bar control clears 3:1 against that band (WCAG 1.4.11 non-text contrast);
// - a band brighter than 0.62 is inverted (dark controls, no dark wash);
// - a band darker than 0.42 keeps light controls on a lightened gradient;
// - in light theme, the speed menu's items are light on its dark surface.
// Frames between 0.42 and 0.62 are hysteresis territory: recorded, not graded.
//
// Not exercised: a non-CORS host (competitor CDN) falling back to Loomix's own bars. The
// bench brand's Library holds only Storage clips; the host gate is unit-tested in
// src/lib/video-bar-contrast.test.ts.
//
// Run: cd Continuum-Frontend && bun run video-contrast:bench

const BRAND = process.env.CONTINUUM_TEST_BRAND_ID ?? 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const OWNER_EMAIL = readBackendEnv('CONTINUUM_BENCH_OWNER_EMAIL') ?? 'bench@trycontinuum.ai';
const CLIPS = 3;
const SEEKS_PER_CLIP = 5;
const BRIGHT = 0.62;
const DARK = 0.42;
const MIN_CONTRAST = 3;
const BOTTOM_BAND_PX = 128;
const SHOTS = 'test-results/video-contrast';

type Sample = {
  theme: 'light' | 'dark';
  at: number;
  settleMs: number;
  luminance: number;
  filter: string;
  wash: number;
  contrast: number;
};

/**
 * Waits for a visible, decodable clip that has stayed mounted for a full poll: the
 * Library refreshes its tree shortly after load, which replaces every player.
 */
async function waitForClip(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const video = Array.from(document.querySelectorAll('video')).find(
            (v) => v.getBoundingClientRect().width > 0 && v.readyState >= 2,
          );
          if (!video) {
            return `waiting: ${Array.from(document.querySelectorAll('video'))
              .map((v) => `${Math.round(v.getBoundingClientRect().width)}w rs${v.readyState} err${v.error?.code ?? '-'} ${v.currentSrc.slice(8, 40)}`)
              .join(', ') || 'no <video>'} | ${location.pathname}${location.search.slice(0, 60)}`;
          }
          const settled = video.dataset.benchSeen === 'true';
          video.dataset.benchSeen = 'true';
          return settled ? 'settled' : 'first sight';
        }),
      { timeout: 120_000, intervals: [1_500] },
    )
    .toBe('settled');
}

/** Pauses the active reel clip at `at` seconds and reads the bar once it settles. */
async function sampleAt(
  page: Page,
  at: number,
): Promise<(Omit<Sample, 'theme'> & { box: Box }) | null> {
  return page.evaluate(
    async ({ at, band }) => {
      const video = Array.from(document.querySelectorAll('video')).find(
        (v) => v.getBoundingClientRect().width > 0 && v.readyState >= 2,
      );
      const root = video?.parentElement;
      if (!video || !root) return null;

      video.pause();
      if (Math.abs(video.currentTime - at) > 0.01) {
        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true });
          video.currentTime = at;
        });
      }

      // Any CSS colour (Tailwind 4 serialises opacity modifiers as oklab) to sRGB 0-1.
      const rgb = (css: string): [number, number, number, number] => {
        const pixel = document.createElement('canvas').getContext('2d');
        if (!pixel) return [0, 0, 0, 1];
        pixel.fillStyle = css;
        pixel.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
        return [r! / 255, g! / 255, b! / 255, a! / 255];
      };
      const gray = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      const [lr, lg, lb, la] = rgb(getComputedStyle(root).backgroundColor);
      const letterbox = gray([lr, lg, lb]) * la;

      const base = root.getBoundingClientRect();
      const box = video.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(box.width / vw, box.height / vh);
      const pw = vw * scale;
      const ph = vh * scale;
      const px = box.left - base.left + (box.width - pw) / 2;
      const py = box.top - base.top + (box.height - ph) / 2;
      const bandTop = Math.max(0, base.height - band);
      const bandH = Math.min(band, base.height);
      const x0 = Math.max(0, px);
      const x1 = Math.min(base.width, px + pw);
      const y0 = Math.max(bandTop, py);
      const y1 = Math.min(bandTop + bandH, py + ph);

      let inside = 0;
      let covered = 0;
      if (x1 > x0 && y1 > y0) {
        const canvas = document.createElement('canvas');
        canvas.width = 216;
        canvas.height = Math.round((vh / vw) * 216);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const sx = Math.floor(((x0 - px) / pw) * canvas.width);
        const sy = Math.floor(((y0 - py) / ph) * canvas.height);
        const sw = Math.max(1, Math.ceil(((x1 - x0) / pw) * canvas.width));
        const sh = Math.max(1, Math.ceil(((y1 - y0) / ph) * canvas.height));
        const { data } = ctx.getImageData(sx, sy, sw, sh);
        let total = 0;
        for (let i = 0; i < data.length; i += 4) total += gray([data[i]!, data[i + 1]!, data[i + 2]!]);
        inside = total / (data.length / 4) / 255;
        covered = ((x1 - x0) * (y1 - y0)) / (base.width * bandH);
      }
      const luminance = inside * covered + letterbox * (1 - covered);

      const bar = Array.from(root.children).find((child) =>
        Array.from(child.children).some(
          (c) =>
            c instanceof HTMLElement &&
            c.style.background.includes('linear-gradient') &&
            c.classList.contains('bottom-0'),
        ),
      ) as HTMLElement | undefined;
      const button = bar?.querySelector('button[aria-label]');
      if (!bar || !button) return null;
      const gradient = Array.from(bar.children).find(
        (c) => c instanceof HTMLElement && c.style.background.includes('linear-gradient'),
      ) as HTMLElement;

      // The control as the eye gets it: its colour, inverted if the bar is, laid over
      // the band at its own alpha. Grey levels are linearised for the WCAG ratio.
      // Until the component has styled this bar (a fresh mount or seek takes a decode),
      // capped so a component that never styles it is graded as it stands.
      const settleStart = performance.now();
      // A bar still styled for the previous frame would end the poll at once; the
      // component re-samples every 100 ms, so give it that window first.
      await new Promise((resolve) => setTimeout(resolve, 350));
      while (
        performance.now() - settleStart < 3_000 &&
        getComputedStyle(gradient).opacity === '1' &&
        getComputedStyle(bar).filter === 'none'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const settleMs = Math.round(performance.now() - settleStart);
      if (!video.isConnected) return null;
      const filter = getComputedStyle(bar).filter;
      const [ir, ig, ib, ia] = rgb(getComputedStyle(button).color);
      const flip = (v: number) => (filter.includes('invert(1)') ? 1 - v : v);
      // What sits behind the icon is the band under Loomix's gradient: its alpha at the
      // icon's height (inline stops, scaled by the wash), black, or white once inverted.
      const stops = Array.from(
        gradient.style.background.matchAll(/rgba\(\s*0,\s*0,\s*0,\s*([\d.]+)\)\s*([\d.]+)%/g),
      ).map((m) => ({ alpha: Number(m[1]), at: Number(m[2]) / 100 }));
      const g = gradient.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (b.top + b.height / 2 - g.top) / g.height));
      const next = stops.findIndex((stop) => stop.at >= t);
      const lo = stops[Math.max(0, next - 1)] ?? { alpha: 0, at: 0 };
      const hi = stops[next] ?? lo;
      const shade =
        (hi.at === lo.at ? hi.alpha : lo.alpha + ((t - lo.at) / (hi.at - lo.at)) * (hi.alpha - lo.alpha)) *
        Number(getComputedStyle(gradient).opacity);
      const behind = luminance * (1 - shade) + (filter.includes('invert(1)') ? shade : 0);
      const icon = ia * gray([flip(ir), flip(ig), flip(ib)]) + (1 - ia) * behind;
      const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const [light, dim] = [linear(icon), linear(behind)].sort((x, y) => y - x);
      return {
        box: { x: base.left, y: base.top, width: base.width, height: base.height },
        at: video.currentTime,
        settleMs,
        luminance,
        filter,
        wash: Number(getComputedStyle(gradient).opacity),
        contrast: (light! + 0.05) / (dim! + 0.05),
      };
    },
    { at, band: BOTTOM_BAND_PX },
  );
}

let duplicatePanes = 0;
let menuUnreadable = false;

type Box = { x: number; y: number; width: number; height: number };

const grade = (s: Pick<Sample, 'luminance'>) =>
  s.luminance > BRIGHT ? 'bright' : s.luminance < DARK ? 'dark' : 'mid';

async function runTheme(
  page: Page,
  theme: 'light' | 'dark',
  rec: BenchRecorder,
  samples: Sample[],
): Promise<void> {
  await rec.step(`${theme}: reel view opens on a real Storage clip with CORS`, async () => {
    await page.goto(`/library?brandId=${BRAND}&layout=reel&kind=video`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForClip(page);
    const clip = await page.evaluate(() => {
      const v = Array.from(document.querySelectorAll('video')).find(
        (el) => el.getBoundingClientRect().width > 0,
      );
      return v
        ? {
            theme: document.documentElement.getAttribute('data-theme'),
            crossOrigin: v.crossOrigin,
            host: new URL(v.currentSrc).host,
            error: v.error?.code ?? null,
          }
        : null;
    });
    expect(clip?.theme).toBe(theme);
    expect(clip?.host).toContain('supabase.co');
    expect(clip?.crossOrigin).toBe('anonymous');
    expect(clip?.error).toBeNull();
  });
  const duplicates = await page.locator('[data-slot="video-glass"]').count();
  duplicatePanes += duplicates;
  rec.record(
    `${theme}: only Loomix's own glass under the centre buttons`,
    duplicates === 0 ? 'PASS' : 'FAIL',
    `${duplicates} duplicate panes`,
  );

  for (let clip = 0; clip < CLIPS; clip++) {
    const duration = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('video')).find(
          (el) => el.getBoundingClientRect().width > 0,
        )?.duration ?? 0,
    );
    for (let i = 0; i < SEEKS_PER_CLIP && duration > 0; i++) {
      const sample = await sampleAt(page, ((i + 0.5) / SEEKS_PER_CLIP) * duration);
      if (!sample) continue;
      const kind = grade(sample);
      if (kind !== 'mid' && !samples.some((s) => s.theme === theme && grade(s) === kind)) {
        await page.screenshot({ path: `${SHOTS}/${theme}-${kind}.png`, clip: sample.box });
      }
      const { box: _box, ...reading } = sample;
      samples.push({ theme, ...reading });
    }
    await page.keyboard.press('ArrowRight');
    await waitForClip(page);
  }

  if (theme === 'light') {
    // Graded but not fatal, so a red menu still lets the frames be graded below.
    await rec.step('light: the speed menu reads light on its dark surface', async () => {
      await page
        .locator('[class*="group/loomix"]')
        .filter({ visible: true })
        .first()
        .getByRole('button', { name: 'Playback speed' })
        .click();
      const item = page.getByRole('menuitemradio').first();
      await item.waitFor({ state: 'visible' });
      const { color, luminance } = await item.evaluate((el) => {
        const color = getComputedStyle(el).color;
        const pixel = document.createElement('canvas').getContext('2d');
        if (!pixel) return { color, luminance: 0 };
        pixel.fillStyle = color;
        pixel.fillRect(0, 0, 1, 1);
        const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data;
        return { color, luminance: (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255 };
      });
      expect(luminance, `menu item ${color}`).toBeGreaterThan(0.6);
      await page.keyboard.press('Escape');
    }).catch(() => {
      menuUnreadable = true;
    });
  }
}

test('player controls stay readable against the frame behind them', async ({ browser }) => {
  const rec = createBenchRecorder('video-contrast', []);
  mkdirSync(SHOTS, { recursive: true });
  const storageState = await mintSessionForEmail(OWNER_EMAIL);
  const samples: Sample[] = [];

  try {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await seedTheme(page, theme);
      try {
        await runTheme(page, theme, rec, samples);
      } finally {
        await context.close();
      }
    }

    for (const s of samples) {
      rec.notes.push(
        `${s.theme} L=${s.luminance.toFixed(3)} filter=${s.filter} wash=${s.wash.toFixed(2)} contrast=${s.contrast.toFixed(2)} settled=${s.settleMs}ms @${s.at.toFixed(2)}s`,
      );
    }
    const graded = samples.filter((s) => grade(s) !== 'mid');
    const unreadable = graded.filter((s) => s.contrast < MIN_CONTRAST);
    rec.record(
      `controls clear ${MIN_CONTRAST}:1 against the band behind them`,
      graded.length > 0 && unreadable.length === 0 ? 'PASS' : 'FAIL',
      `${graded.length - unreadable.length}/${graded.length} (min ${Math.min(
        ...graded.map((s) => s.contrast),
      ).toFixed(2)}; ${samples.length - graded.length} mid frames not graded)`,
    );
    const bright = samples.filter((s) => grade(s) === 'bright');
    rec.record(
      'bright bands invert the bar',
      bright.length > 0 && bright.every((s) => s.filter === 'invert(1)') ? 'PASS' : 'FAIL',
      `${bright.filter((s) => s.filter === 'invert(1)').length}/${bright.length}`,
    );
    const dark = samples.filter((s) => grade(s) === 'dark');
    rec.record(
      'dark bands keep light controls on a lighter wash',
      dark.length > 0 && dark.every((s) => s.filter === 'none' && s.wash < 1) ? 'PASS' : 'FAIL',
      `${dark.filter((s) => s.filter === 'none' && s.wash < 1).length}/${dark.length}`,
    );
  } finally {
    rec.print();
  }

  expect(duplicatePanes).toBe(0);
  expect(menuUnreadable).toBe(false);
  const graded = samples.filter((s) => grade(s) !== 'mid');
  expect(graded.length).toBeGreaterThan(0);
  expect(graded.filter((s) => s.contrast < MIN_CONTRAST)).toEqual([]);
  expect(samples.some((s) => grade(s) === 'bright')).toBe(true);
  expect(samples.some((s) => grade(s) === 'dark')).toBe(true);
  expect(samples.filter((s) => grade(s) === 'bright' && s.filter !== 'invert(1)')).toEqual([]);
  expect(
    samples.filter((s) => grade(s) === 'dark' && (s.filter !== 'none' || s.wash >= 1)),
  ).toEqual([]);
});
