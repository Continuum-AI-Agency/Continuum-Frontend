const REGULAR_GLASS = { blurAmount: 0 } as const;

const SAMPLE_INTERVAL_MS = 50;

const SAMPLE_WIDTH = 48;

const SCRIM_FROM = 0.34;
const SCRIM_TO = 0.78;
const SCRIM_MAX = 0.32;

const SHADE_EASE = 0.08;
const SHADE_SNAP_GAIN = 7;
const SHADE_EASE_MAX = 0.7;

function shadeRate(step: number) {
  return Math.min(SHADE_EASE_MAX, SHADE_EASE + step * SHADE_SNAP_GAIN);
}

const SCRIM_BLIND = 0.2;

type Pane = {
  button: HTMLElement;
  panel: HTMLElement;

  scrim: HTMLElement;

  restore: {
    backgroundColor: string;
    borderColor: string;
    backdropFilter: string;
    boxShadow: string;
  };
};

function clearPlayerGlass(button: HTMLElement) {
  if (button.style.backgroundColor !== 'transparent') {
    button.style.backgroundColor = 'transparent';
  }
  if (button.style.boxShadow !== 'none') button.style.boxShadow = 'none';

  if (button.style.borderColor !== 'transparent') button.style.borderColor = 'transparent';

  for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
    if (button.style.getPropertyValue(property) !== 'none') {
      button.style.setProperty(property, 'none');
    }
  }
}

function restorePlayerGlass(button: HTMLElement, restore: Pane['restore']) {
  button.style.backgroundColor = restore.backgroundColor;
  button.style.borderColor = restore.borderColor;
  button.style.boxShadow = restore.boxShadow;
  button.style.setProperty('backdrop-filter', restore.backdropFilter);
  button.style.removeProperty('-webkit-backdrop-filter');
}

type GlassInstance = { destroy: () => void };

const noop = () => {};

let players = 0;
function sitOut(root: HTMLElement) {
  players += 1;
  root.style.viewTransitionName = `kobra-video-${String(players)}`;
  root.style.setProperty('view-transition-class', 'kobra-video');
  return () => {
    root.style.viewTransitionName = '';
    root.style.removeProperty('view-transition-class');
  };
}

function boxWithin(child: Element, root: Element) {
  const a = child.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
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

      const width = SAMPLE_WIDTH;
      const height = Math.max(1, Math.round((h / w) * SAMPLE_WIDTH));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      try {
        context.drawImage(video, 0, 0, width, height);
        pixels = context.getImageData(0, 0, width, height);
      } catch {
        blind = true;
        pixels = null;
        return false;
      }
      return true;
    },

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

export function scrimFor(luminance: number): number {
  const t = (luminance - SCRIM_FROM) / (SCRIM_TO - SCRIM_FROM);
  return Math.max(0, Math.min(1, t)) * SCRIM_MAX;
}

type Controls = {
  video: HTMLVideoElement;
  root: HTMLElement;
  layer: HTMLElement;
  buttons: HTMLElement[];
};

function findControls(host: HTMLElement): Controls | null {
  const video = host.querySelector('video');
  const root = video?.parentElement;
  if (!video || !root) return null;

  const frame = root.getBoundingClientRect().height;
  if (frame === 0) return null;

  const layer = Array.from(root.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      child !== video &&
      child.querySelector('button') !== null &&
      child.getBoundingClientRect().height > frame * 0.8,
  );
  const buttons = layer ? Array.from(layer.querySelectorAll('button')) : [];
  return layer && buttons.length > 0 ? { video, root, layer, buttons } : null;
}

function waitForControls(host: HTMLElement, signal: AbortSignal): Promise<Controls | null> {
  const now = findControls(host);
  if (now) return Promise.resolve(now);

  return new Promise((resolve) => {
    const stop = (value: Controls | null) => {
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => stop(null);
    const observer = new MutationObserver(() => {
      const found = findControls(host);
      if (found) stop(found);
    });
    const timer = setTimeout(() => stop(null), 10_000);

    observer.observe(host, { childList: true, subtree: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForVisible(signal: AbortSignal): Promise<boolean> {
  if (document.visibilityState === 'visible') return Promise.resolve(true);

  return new Promise((resolve) => {
    const stop = (value: boolean) => {
      document.removeEventListener('visibilitychange', onVisible);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') stop(true);
    };
    const onAbort = () => stop(false);

    document.addEventListener('visibilitychange', onVisible);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<boolean> {
  const canWatchFrames = 'requestVideoFrameCallback' in video;
  if (!video.paused && !canWatchFrames) return Promise.resolve(true);

  return new Promise((resolve) => {
    let watch = 0;
    const stop = (value: boolean) => {
      if (watch) video.cancelVideoFrameCallback(watch);
      video.removeEventListener('seeked', onFrame);
      video.removeEventListener('loadedmetadata', nudge);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onFrame = () => stop(true);
    const onAbort = () => stop(false);
    const nudge = () => {
      const at = video.currentTime;
      video.currentTime = at;
    };

    signal.addEventListener('abort', onAbort, { once: true });
    if (canWatchFrames) watch = video.requestVideoFrameCallback(onFrame);
    video.addEventListener('seeked', onFrame);

    if (video.paused) {
      video.preload = 'auto';
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) nudge();
      else video.addEventListener('loadedmetadata', nudge, { once: true });
    }
  });
}

const INIT_TIMEOUT_MS = 15_000;

function initWithDeadline(start: Promise<GlassInstance>): Promise<GlassInstance> {
  let expired = false;

  return Promise.race([
    start.then((instance) => {
      if (expired) {
        instance.destroy();
        throw new Error('glass: init resolved after its deadline');
      }
      return instance;
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        expired = true;
        reject(new Error('glass: init did not settle'));
      }, INIT_TIMEOUT_MS);
    }),
  ]);
}

export async function attachGlassControls(
  host: HTMLElement,
  signal: AbortSignal,
): Promise<() => void> {
  const controls = await waitForControls(host, signal);
  if (!controls || signal.aborted) return noop;
  const { video, root, layer, buttons } = controls;

  const rejoin = sitOut(root);

  const wear = () => {
    root.dataset.glass = 'live';
  };
  const strip = () => {
    delete root.dataset.glass;
  };

  if (!(await waitForVisible(signal)) || signal.aborted) return noop;
  if (!(await waitForFrame(video, signal)) || signal.aborted) return noop;

  const { LiquidGlass } = await import('@/lib/liquidglass');
  if (signal.aborted) return noop;

  const panes: Pane[] = buttons.map((button) => {
    const panel = document.createElement('div');
    panel.setAttribute('aria-hidden', 'true');
    panel.dataset.slot = 'video-glass';
    panel.style.position = 'absolute';

    panel.style.isolation = 'isolate';

    panel.style.pointerEvents = 'none';

    panel.style.opacity = '0';

    root.insertBefore(panel, layer);

    const scrim = document.createElement('div');
    scrim.setAttribute('aria-hidden', 'true');
    scrim.dataset.slot = 'video-glass-scrim';
    scrim.style.position = 'absolute';
    scrim.style.pointerEvents = 'none';
    scrim.style.background = 'rgb(0 0 0)';
    scrim.style.opacity = '0';
    root.insertBefore(scrim, layer);

    return {
      button,
      panel,
      scrim,
      restore: {
        backgroundColor: button.style.backgroundColor,
        borderColor: button.style.borderColor,
        backdropFilter: button.style.getPropertyValue('backdrop-filter'),
        boxShadow: button.style.boxShadow,
      },
    };
  });

  const release = () => {
    strip();
    for (const { button, panel, scrim, restore } of panes) {
      restorePlayerGlass(button, restore);
      panel.remove();
      scrim.remove();
    }
  };

  const sampler = createSampler(video);

  let live = false;

  const lead = buttons[0]!;
  const clusterAlpha = () =>
    live
      ? (Number(getComputedStyle(layer).opacity) || 0) *
        (Number(getComputedStyle(lead).opacity) || 0)
      : 0;

  const sync = () => {
    if (live) for (const { button } of panes) clearPlayerGlass(button);

    const alpha = clusterAlpha();
    if (alpha === 0) {
      for (const { panel, scrim } of panes) {
        if (panel.style.opacity !== '0') panel.style.opacity = '0';
        if (scrim.style.opacity !== '0') scrim.style.opacity = '0';
      }
      return;
    }

    const base = root.getBoundingClientRect();
    for (const { button, panel, scrim } of panes) {
      const rect = button.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) {
        panel.style.opacity = '0';
        scrim.style.opacity = '0';
        continue;
      }
      const x = rect.left - base.left;
      const y = rect.top - base.top;
      const radius = Math.round(h / 2);
      const next = `${x}px|${y}px|${w}px|${h}px|${radius}`;
      if (panel.dataset.box !== next) {
        panel.dataset.box = next;
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.width = `${w}px`;
        panel.style.height = `${h}px`;
        panel.dataset.config = JSON.stringify({
          ...REGULAR_GLASS,

          cornerRadius: radius,
          zRadius: radius,
        });
        scrim.style.left = `${x}px`;
        scrim.style.top = `${y}px`;
        scrim.style.width = `${w}px`;
        scrim.style.height = `${h}px`;
        scrim.style.borderRadius = `${radius}px`;
      }

      const shown = String(alpha);
      if (panel.style.opacity !== shown) panel.style.opacity = shown;

      const level = Number(scrim.dataset.level ?? '0');
      const target = Number(scrim.dataset.target ?? '0');
      const eased = level + (target - level) * Number(scrim.dataset.rate ?? String(SHADE_EASE));
      scrim.dataset.level = String(eased);

      const shade = (alpha * eased).toFixed(3);
      if (scrim.style.opacity !== shade) scrim.style.opacity = shade;
    }
  };

  let sampledAt = 0;
  let sampledFrame = -1;
  const measure = (now: number) => {
    if (!live || sampler.blind) return;
    if (now - sampledAt < SAMPLE_INTERVAL_MS) return;
    sampledAt = now;

    if (clusterAlpha() === 0) return;

    if (video.seeking) return;

    if (video.paused && video.currentTime === sampledFrame) return;
    if (!sampler.read()) return;
    sampledFrame = video.paused ? video.currentTime : -1;

    const frame = boxWithin(video, root);
    if (frame.w === 0 || frame.h === 0) return;

    for (const { button, scrim } of panes) {
      const box = boxWithin(button, root);
      const luminance = sampler.luminanceOf(
        (box.x - frame.x) / frame.w,
        (box.y - frame.y) / frame.h,
        box.w / frame.w,
        box.h / frame.h,
      );
      if (luminance === null) continue;
      const target = scrimFor(luminance);
      scrim.dataset.rate = String(shadeRate(Math.abs(target - Number(scrim.dataset.level ?? '0'))));
      scrim.dataset.target = String(target);
    }
  };

  if (sampler.blind) {
    for (const { scrim } of panes) {
      scrim.dataset.rate = String(SHADE_EASE_MAX);
      scrim.dataset.target = String(SCRIM_BLIND);
    }
  }

  sync();

  let instance: GlassInstance;
  try {
    instance = await initWithDeadline(
      LiquidGlass.init({ root, glassElements: panes.map((pane) => pane.panel) }),
    );
  } catch {
    release();
    return noop;
  }

  if (signal.aborted) {
    instance.destroy();
    release();
    return noop;
  }

  live = true;
  sync();
  wear();

  let frame = requestAnimationFrame(function tick(now) {
    measure(now);
    sync();
    frame = requestAnimationFrame(tick);
  });

  return () => {
    cancelAnimationFrame(frame);
    instance.destroy();
    release();
    rejoin();
  };
}
