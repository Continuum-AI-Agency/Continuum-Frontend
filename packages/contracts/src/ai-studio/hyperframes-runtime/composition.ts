/**
 * A composition document's timeline and media, as every HyperFrames renderer reads them.
 * The browser (Frontend `browserRenderer.ts`) and Continuum Render's headless Chrome run
 * these same functions, so a seek or a mix cannot mean one thing in one renderer and
 * another in the other. Browser-only: not exported from the package root, whose Backend
 * consumers typecheck without the DOM.
 */

export type HyperframesNodePlan = {
  nodes: readonly { id: string; tag: string; inert: boolean; directText: string }[];
};

export type CompositionState = {
  root: Element;
  elements: Element[];
  videos: HTMLVideoElement[];
  audio: HTMLAudioElement[];
  copy: HTMLElement[];
  text: Set<Element>;
  ids: Map<Element, string>;
  generation: number;
  mappedNodes: number;
  dynamicNodes: number;
};

type CompositionManager = {
  state: () => CompositionState;
  dispose: () => void;
};
const managers = new WeakMap<Document, CompositionManager>();
const hasDirectText = (element: Element): boolean =>
  Array.from(element.childNodes).some((node) => node.nodeType === 3 && !!node.textContent?.trim());

/** Bind Rust identities once; JavaScript-created/reparented elements invalidate topology only. */
export function initializeComposition(doc: Document, plan?: HyperframesNodePlan): CompositionState {
  managers.get(doc)?.dispose();
  const planned = new Map(plan?.nodes.map((node) => [node.id, node]));
  const dynamicIds = new WeakMap<Element, string>();
  let nextId = 0;
  let current: CompositionState;
  let dirty = true;
  let changes: MutationRecord[] = [];
  const observer = new MutationObserver((records) => {
    changes.push(...records);
  });
  observer.observe(doc, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['id', 'data-hf-id', 'data-hf-node', 'data-composition-id', 'data-hf-copy'],
  });
  const state = (): CompositionState => {
    changes.push(...observer.takeRecords());
    for (const record of changes) {
      if (
        record.type === 'attributes' ||
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
          (node) => node.nodeType === 1,
        )
      )
        dirty = true;
      else {
        const element =
          record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement;
        if (element && current) {
          if (hasDirectText(element)) current.text.add(element);
          else current.text.delete(element);
        }
      }
    }
    changes = [];
    if (!dirty) return current;
    const elements = Array.from(doc.querySelectorAll('*'));
    const ids = new Map<Element, string>();
    const used = new Set<string>();
    let mappedNodes = 0;
    for (const element of elements) {
      const key = element.getAttribute('data-hf-node');
      const mapped = key ? planned.get(key) : undefined;
      let id =
        mapped && mapped.tag === element.localName
          ? key!
          : (!plan ? key : null) ||
            element.getAttribute('data-hf-id') ||
            element.id ||
            dynamicIds.get(element);
      if (mapped && id === key && !used.has(id!)) mappedNodes++;
      if (!id || used.has(id)) {
        do {
          id = `hf-dynamic-${nextId++}`;
        } while (used.has(id) || planned.has(id));
        dynamicIds.set(element, id);
      }
      used.add(id);
      ids.set(element, id);
    }
    current = {
      root: doc.querySelector('[data-composition-id]') ?? doc.body,
      elements,
      videos: elements.filter((el): el is HTMLVideoElement => el.tagName === 'VIDEO'),
      audio: elements.filter((el): el is HTMLAudioElement => el.tagName === 'AUDIO'),
      copy: elements.filter((el): el is HTMLElement => el.hasAttribute('data-hf-copy')),
      text: new Set(elements.filter((el) => hasDirectText(el))),
      ids,
      generation: (current?.generation ?? 0) + 1,
      mappedNodes,
      dynamicNodes: plan ? elements.length - mappedNodes : 0,
    };
    dirty = false;
    return current;
  };
  managers.set(doc, { state, dispose: () => observer.disconnect() });
  return state();
}

export function compositionState(doc: Document): CompositionState {
  return managers.get(doc)?.state() ?? initializeComposition(doc);
}

type HyperframesWindow = Window & {
  __hyperframe?: { seek?: (seconds: number) => void | Promise<void> };
  __timelines?: Record<string, { seek?: (seconds: number, suppressEvents?: boolean) => void }>;
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

const SCRAMBLE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/=';
/** Glyphs flip this many times a second while a scramble resolves. */
const SCRAMBLE_RATE = 20;
const glyphAt = (index: number, step: number): string =>
  SCRAMBLE_GLYPHS[((index + 1) * 7919 + step * 104_729) % SCRAMBLE_GLYPHS.length] ?? '#';

/**
 * What a `data-hf-text` element reads at `progress` (0 before its window, 1 settled). `type`
 * reveals the text a character at a time. `scramble` shows `from` (or glyphs), then settles left
 * to right on the text while every unsettled character that differs from `from` flips through
 * glyphs — a fix like SEC0MDS → SECONDS. Deterministic: glyphs follow the index and the time.
 */
export function textEffectAt(
  effect: string,
  text: string,
  from: string | undefined,
  progress: number,
  timestamp: number,
): string {
  const chars = Array.from(text);
  if (effect === 'type') return chars.slice(0, Math.round(chars.length * progress)).join('');
  if (progress >= 1) return text;
  if (progress <= 0)
    return from ?? chars.map((char, index) => (char === ' ' ? ' ' : glyphAt(index, 0))).join('');
  const start = Array.from(from ?? '');
  const settled = Math.floor(chars.length * progress);
  const step = Math.floor(timestamp * SCRAMBLE_RATE);
  return chars
    .map((char, index) =>
      index < settled || char === ' ' || start[index] === char ? char : glyphAt(index, step),
    )
    .join('');
}

const finalText = new WeakMap<Element, string>();

/**
 * The text effects at t: `data-hf-text="type|scramble"` on a text-only element, from
 * `data-hf-text-at` (composition seconds) over `data-hf-text-dur` (default 0.6 s), scramble
 * starting from `data-hf-text-from`. The element's authored text is what it settles on.
 */
function applyTextEffects(doc: Document, timestamp: number): void {
  for (const element of Array.from(doc.querySelectorAll('[data-hf-text]'))) {
    if (element.childElementCount > 0) continue;
    const text = finalText.get(element) ?? element.textContent ?? '';
    finalText.set(element, text);
    const at = Number(element.getAttribute('data-hf-text-at') ?? 0);
    const duration = Number(element.getAttribute('data-hf-text-dur') ?? 0.6);
    const progress = Math.min(1, Math.max(0, (timestamp - at) / (duration > 0 ? duration : 0.001)));
    const shown = textEffectAt(
      element.getAttribute('data-hf-text') ?? '',
      text,
      element.getAttribute('data-hf-text-from') ?? undefined,
      progress,
      timestamp,
    );
    // Edit the text node in place: a characterData change never invalidates the node map.
    const node = element.firstChild;
    if (node?.nodeType === 3) {
      if ((node as Text).data !== shown) (node as Text).data = shown;
    } else element.textContent = shown;
  }
}

/** `__hyperframe.seek`, then `__timelines`, then every document animation and `<video>` at t. */
export async function seekComposition(
  doc: Document,
  view: Window,
  timestamp: number,
  options: { waitForFrame?: boolean } = {},
): Promise<void> {
  const hyperframes = view as HyperframesWindow;
  await hyperframes.__hyperframe?.seek?.(timestamp);
  // Callback-driven text and canvas drawing must update before the frame is captured.
  for (const timeline of Object.values(hyperframes.__timelines ?? {}))
    timeline.seek?.(timestamp, false);
  applyTextEffects(doc, timestamp);
  for (const animation of doc.getAnimations()) {
    animation.pause();
    animation.currentTime = timestamp * 1000;
  }
  await Promise.all(
    compositionState(doc).videos.map(async (video) => {
      video.muted = true;
      video.pause();
      await waitForSeek(video, videoSourceTime(timestamp, video.dataset));
    }),
  );
  // Computed-style reads flush layout synchronously. Sampling structure need not paint a frame.
  if (options.waitForFrame !== false)
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
