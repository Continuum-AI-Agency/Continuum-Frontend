/**
 * A composition document's timeline and media, as every HyperFrames renderer reads them.
 * The browser (Frontend `browserRenderer.ts`) and Continuum Render's headless Chrome run
 * these same functions, so a seek or a mix cannot mean one thing in one renderer and
 * another in the other. Browser-only: not exported from the package root, whose Backend
 * consumers typecheck without the DOM.
 */

type HyperframesWindow = Window & {
  __hyperframe?: { seek?: (seconds: number) => void | Promise<void> };
  __timelines?: Record<string, { seek?: (seconds: number) => void }>;
};

/**
 * The source time a composition `<video>` shows at `timestamp`. `data-source-start` is
 * the in-point within the source clip: `audioElements` honours it for the mix, so
 * ignoring it here would drift the picture against its own audio by exactly that offset.
 */
export const videoSourceTime = (
  timestamp: number,
  dataset: { start?: string; sourceStart?: string },
): number => {
  const start = Number(dataset.start ?? 0);
  const sourceStart = Number(dataset.sourceStart ?? 0);
  return Math.max(0, timestamp - start + (Number.isFinite(sourceStart) ? sourceStart : 0));
};

const waitForSeek = (media: HTMLMediaElement, timestamp: number): Promise<void> => {
  if (!Number.isFinite(media.duration) || media.readyState < 1) return Promise.resolve();
  const target = Math.max(0, Math.min(timestamp, Math.max(0, media.duration - 0.001)));
  if (Math.abs(media.currentTime - target) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Media seek timed out')), 10_000);
    media.addEventListener(
      'seeked',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    media.currentTime = target;
  });
};

/** `__hyperframe.seek`, then `__timelines`, then every document animation and `<video>` at t. */
export async function seekComposition(
  doc: Document,
  view: Window,
  timestamp: number,
): Promise<void> {
  const hyperframes = view as HyperframesWindow;
  await hyperframes.__hyperframe?.seek?.(timestamp);
  for (const timeline of Object.values(hyperframes.__timelines ?? {})) timeline.seek?.(timestamp);
  for (const animation of doc.getAnimations()) {
    animation.pause();
    animation.currentTime = timestamp * 1000;
  }
  await Promise.all(
    Array.from(doc.querySelectorAll('video')).map(async (video) => {
      video.muted = true;
      video.pause();
      await waitForSeek(video, videoSourceTime(timestamp, video.dataset));
    }),
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export type HyperframesAudioElement = {
  assetId: string;
  start: number;
  duration: number;
  sourceStart: number;
  gain: number;
};

/** Every `<audio>`/`<video>` on an attached asset, as a clip of the soundtrack. */
export function audioElements(html: string): HyperframesAudioElement[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(
    document.querySelectorAll('audio[src^="hf-asset://"], video[src^="hf-asset://"]'),
  )
    .map((element) => {
      const source = element.getAttribute('src') ?? '';
      const gain = Number(element.getAttribute('data-volume') ?? 1);
      return {
        assetId: source.slice('hf-asset://'.length),
        start: Number(element.getAttribute('data-start') ?? 0),
        duration: Number(element.getAttribute('data-duration') ?? 0),
        sourceStart: Number(element.getAttribute('data-source-start') ?? 0),
        gain: Number.isFinite(gain) ? gain : 1,
      };
    })
    .filter((element) => element.assetId && element.duration > 0);
}
