/**
 * Keeps Loomix's top and bottom control bars readable against the frame behind
 * them, without darkening a frame that is already dark.
 *
 * Loomix paints a fixed black gradient under each bar (top 0.6 -> 0, bottom
 * 0 -> 0.78) with white controls, and pins the bars whenever playback is
 * paused. That reads well over a bright frame and turns every dark frame into
 * near-black. This samples the band of the frame under each bar and:
 * - over a dark band, keeps white controls and lightens the gradient;
 * - over a bright band, inverts the whole bar (`filter: invert(1)`), so the
 *   icons, time and progress track turn black on a light wash;
 * - in between, keeps the full gradient, which is the case it was made for.
 *
 * A clip that does not fill the player counts its letterbox at the player's own
 * background colour, which the light theme repaints from black to --muted.
 *
 * The centre play button is not touched: Loomix's built-in glass already
 * samples the frame under it.
 *
 * Reading the frame needs a CORS-clean video. A source that is not (see
 * `corsReadable`) leaves the canvas tainted, and the bars stay exactly as
 * Loomix draws them.
 *
 * ponytail: Loomix DOM is found by structure (a root child carrying an inline
 * linear-gradient, `top-0` on the top one). Re-check both on a loomix upgrade.
 */

const SAMPLE_INTERVAL_MS = 100;
const SAMPLE_WIDTH = 48;

// Loomix's gradient heights: h-24 over the top bar, h-32 under the bottom bar.
const TOP_BAND_PX = 96;
const BOTTOM_BAND_PX = 128;

// Two thresholds so a frame hovering near the switch point does not flicker.
const INVERT_ABOVE = 0.58;
const INVERT_BELOW = 0.46;
const PIVOT = (INVERT_ABOVE + INVERT_BELOW) / 2;
const MID_SPAN = 0.3;
const WASH_FLOOR = 0.35;

type Side = 'top' | 'bottom';

export type Rect = { x: number; y: number; w: number; h: number };

export type BarContrast = { invert: boolean; wash: number };

/**
 * `luminance` is the mean relative luminance (0-1) under a bar. `inverted` is
 * the bar's current state. `wash` is the opacity for Loomix's gradient: full
 * only near the pivot, where neither white nor black controls stand out alone.
 */
export function contrastFor(luminance: number, inverted: boolean): BarContrast {
  const invert = inverted ? luminance >= INVERT_BELOW : luminance > INVERT_ABOVE;
  const midness = 1 - Math.min(1, Math.abs(luminance - PIVOT) / MID_SPAN);
  return { invert, wash: WASH_FLOOR + (1 - WASH_FLOOR) * midness };
}

/** Where a video's picture is drawn inside its element box, per `object-fit`. */
export function pictureRect(box: Rect, naturalW: number, naturalH: number, fit: string): Rect {
  if (fit === 'fill' || naturalW === 0 || naturalH === 0) return box;
  const sx = box.w / naturalW;
  const sy = box.h / naturalH;
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const w = naturalW * scale;
  const h = naturalH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Luminance of a computed `rgb()`/`rgba()` colour, alpha taken over black; other forms read as black. */
export function cssLuminance(color: string): number {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?/.exec(color);
  if (!m) return 0;
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  return ((0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255) * alpha;
}

function overlap(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Only hosts known to answer CORS. A `crossorigin` request to a host that does
 * not send the header fails the whole video, so anything unlisted stays as it
 * was: playable, unsampled.
 */
export function corsReadable(src: string | undefined, storageUrl: string | undefined): boolean {
  if (!src) return false;
  if (src.startsWith('blob:') || (src.startsWith('/') && !src.startsWith('//'))) return true;
  if (!storageUrl) return false;
  try {
    return new URL(src).origin === new URL(storageUrl).origin;
  } catch {
    return false;
  }
}

function createSampler(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let pixels: ImageData | null = null;
  let blind = context === null;

  return {
    get blind() {
      return blind;
    },
    read(): boolean {
      if (blind || !context) return false;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return false;
      const height = Math.max(1, Math.round((h / w) * SAMPLE_WIDTH));
      if (canvas.width !== SAMPLE_WIDTH || canvas.height !== height) {
        canvas.width = SAMPLE_WIDTH;
        canvas.height = height;
      }
      try {
        context.drawImage(video, 0, 0, SAMPLE_WIDTH, height);
        pixels = context.getImageData(0, 0, SAMPLE_WIDTH, height);
      } catch {
        // A tainted canvas (no CORS) throws here and never recovers.
        blind = true;
        pixels = null;
        return false;
      }
      return true;
    },
    /** Mean luminance over a region given as fractions of the frame. */
    luminanceOf(nx: number, ny: number, nw: number, nh: number): number | null {
      if (!pixels) return null;
      const { width, height, data } = pixels;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(nx * width)));
      const y0 = Math.max(0, Math.min(height - 1, Math.floor(ny * height)));
      const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil((nx + nw) * width)));
      const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil((ny + nh) * height)));
      let total = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * width + x) * 4;
          total += 0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!;
          count++;
        }
      }
      return count === 0 ? null : total / count / 255;
    },
  };
}

function gradientOf(bar: Element): HTMLElement | null {
  for (const child of Array.from(bar.children)) {
    if (child instanceof HTMLElement && child.style.background.includes('linear-gradient')) {
      return child;
    }
  }
  return null;
}

export function attachBarContrast(host: HTMLElement): () => void {
  const contrast: Partial<Record<Side, BarContrast>> = {};
  let sampler: ReturnType<typeof createSampler> | null = null;
  let sampledVideo: HTMLVideoElement | null = null;
  let sampledAt = 0;
  let sampledKey = '';

  const measure = (video: HTMLVideoElement, root: HTMLElement, now: number) => {
    if (now - sampledAt < SAMPLE_INTERVAL_MS) return;
    sampledAt = now;
    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (sampledVideo !== video) {
      sampledVideo = video;
      sampler = createSampler(video);
      sampledKey = '';
    }
    if (!sampler || sampler.blind) return;

    const base = root.getBoundingClientRect();
    const box = video.getBoundingClientRect();
    // A paused frame in an unchanged box reads the same; skip the copy.
    const key = `${video.currentSrc}|${video.paused ? video.currentTime : now}|${base.width}x${base.height}`;
    if (key === sampledKey || !sampler.read()) return;
    sampledKey = key;

    const picture = pictureRect(
      { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height },
      video.videoWidth,
      video.videoHeight,
      getComputedStyle(video).objectFit,
    );
    if (picture.w === 0 || picture.h === 0) return;
    const letterbox = cssLuminance(getComputedStyle(root).backgroundColor);

    const bands: Record<Side, Rect> = {
      top: { x: 0, y: 0, w: base.width, h: Math.min(TOP_BAND_PX, base.height) },
      bottom: {
        x: 0,
        y: Math.max(0, base.height - BOTTOM_BAND_PX),
        w: base.width,
        h: Math.min(BOTTOM_BAND_PX, base.height),
      },
    };
    for (const side of ['top', 'bottom'] as const) {
      const band = bands[side];
      const seen = overlap(band, picture);
      // Whatever the picture does not cover is the root's own background (the theme
      // can repaint Loomix's black letterbox), weighted by how much of the band it is.
      const covered = seen ? (seen.w * seen.h) / (band.w * band.h) : 0;
      const inside = seen
        ? (sampler.luminanceOf(
            (seen.x - picture.x) / picture.w,
            (seen.y - picture.y) / picture.h,
            seen.w / picture.w,
            seen.h / picture.h,
          ) ?? 0)
        : 0;
      const lit = inside * covered + letterbox * (1 - covered);
      contrast[side] = contrastFor(lit, contrast[side]?.invert ?? false);
    }
  };

  // Loomix mounts and unmounts the bars as controls show and hide, so they are
  // found again every frame; a new bar is styled before its first paint.
  const style = (root: HTMLElement, reset: boolean) => {
    for (const bar of Array.from(root.children)) {
      if (!(bar instanceof HTMLElement)) continue;
      const gradient = gradientOf(bar);
      if (!gradient) continue;
      const state = reset ? undefined : contrast[gradient.classList.contains('top-0') ? 'top' : 'bottom'];
      if (!state && !reset) continue;
      const filter = state?.invert ? 'invert(1)' : '';
      if (bar.style.filter !== filter) bar.style.filter = filter;
      const wash = state ? state.wash.toFixed(2) : '';
      if (gradient.style.opacity !== wash) gradient.style.opacity = wash;
    }
  };

  const rootOf = () => host.querySelector('video')?.parentElement ?? null;

  let frame = requestAnimationFrame(function tick(now) {
    const video = host.querySelector('video');
    const root = video?.parentElement;
    if (video && root) {
      measure(video, root, now);
      style(root, false);
    }
    // An unreadable source never becomes readable; leave Loomix's bars alone.
    if (!sampler?.blind) frame = requestAnimationFrame(tick);
  });

  return () => {
    cancelAnimationFrame(frame);
    const root = rootOf();
    if (root) style(root, true);
  };
}
