import { useEffect } from 'react';
import { useStudioStore } from '../stores/useStudioStore';
import { simplifyAspectRatio, snapNodeDimensionsToAspectRatio } from '../utils/aspectRatioSizing';

/**
 * The three numbers `snapNodeDimensionsToAspectRatio` needs. Every
 * `GeneratorNodeBounds` from contracts satisfies it; the nodes with no family
 * envelope (video reference, extend, hyperframes) declare their own beside their
 * `NodeResizer` minimums so the box can never snap below what it renders at.
 */
export interface SnapToVideoAspectBounds {
  minWidth: number;
  minHeight: number;
  fallbackWidth: number;
}

/**
 * The real pixel ratio of a clip, read from its metadata. A DETACHED element, so
 * the preview the user is looking at keeps its own playback state — and only
 * `metadata` is fetched, never the media.
 */
/**
 * One probe per clip, shared by everyone who asks.
 *
 * `detectAspectRatioFromVideo` is not cheap the way its name suggests: `preload="metadata"`
 * against Supabase storage answers with HTTP 206 ranges of 1.5-1.7 MB, because the reader
 * keeps pulling until it finds the moov atom. Measured on FOUR idle video nodes: 17 range
 * requests. The effect below runs on every mount, and with viewport culling a node
 * remounts every time it is panned back into view — so the probe was being paid over and
 * over for a number that cannot change.
 *
 * Keyed by src. Two nodes showing the same clip share one probe, and a remount within the
 * session pays nothing. A rejected/failed probe is evicted so it can be retried.
 */
const aspectBySrc = new Map<string, string | null>();
const aspectInFlight = new Map<string, Promise<string | null>>();

function detectAspectRatioOnce(src: string): Promise<string | null> {
  if (aspectBySrc.has(src)) return Promise.resolve(aspectBySrc.get(src) ?? null);

  const existing = aspectInFlight.get(src);
  if (existing) return existing;

  const probe = detectAspectRatioFromVideo(src)
    .then((detected) => {
      // Only a real answer is worth remembering — caching a null would make one
      // transient failure permanent for the session.
      if (detected) aspectBySrc.set(src, detected);
      return detected;
    })
    .finally(() => {
      aspectInFlight.delete(src);
    });

  aspectInFlight.set(src, probe);
  return probe;
}

/** Drop the probe memo. Used by tests; the canvas has no reason to call it. */
export function clearVideoAspectCache(): void {
  aspectBySrc.clear();
  aspectInFlight.clear();
}

/**
 * A `<video>` already on the page showing this exact clip, if there is one.
 *
 * The node that wants the ratio is usually rendering the clip already — media-chrome
 * loads it for the scrub bar the moment the node mounts. Measuring with a second,
 * detached element therefore downloaded the SAME bytes twice, and because both requests
 * were issued in the same instant under the same token neither could use the other's
 * cache entry. Measured: 15 video nodes, 15 distinct clips, 30 requests.
 */
function mountedVideoFor(src: string): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;
  for (const element of Array.from(document.querySelectorAll('video'))) {
    if (element.currentSrc === src || element.getAttribute('src') === src) return element;
  }
  return null;
}

/**
 * Read a clip's real pixel ratio, preferring the element that is already loading it.
 *
 * Falls back to a detached element only when nothing on the page is showing the clip —
 * a node whose preview has not rendered yet. That element's download IS aborted on
 * settle: detaching alone does not stop it, so a node flickering through the initial
 * fitView would otherwise leave megabytes in flight behind it.
 */
export function detectAspectRatioFromVideo(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const ratioOf = (element: HTMLVideoElement): string | null => {
      const { videoWidth, videoHeight } = element;
      return videoWidth > 0 && videoHeight > 0
        ? simplifyAspectRatio(videoWidth, videoHeight)
        : null;
    };

    const mounted = mountedVideoFor(src);
    if (mounted) {
      // Already has its dimensions — no request of any kind.
      const known = ratioOf(mounted);
      if (known) {
        resolve(known);
        return;
      }
      // Still loading: ride along on the download it is already doing.
      const onLoaded = () => {
        mounted.removeEventListener('loadedmetadata', onLoaded);
        mounted.removeEventListener('error', onFailed);
        resolve(ratioOf(mounted));
      };
      const onFailed = () => {
        mounted.removeEventListener('loadedmetadata', onLoaded);
        mounted.removeEventListener('error', onFailed);
        resolve(null);
      };
      mounted.addEventListener('loadedmetadata', onLoaded);
      mounted.addEventListener('error', onFailed);
      return;
    }

    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.muted = true;
    const release = () => {
      videoElement.onloadedmetadata = null;
      videoElement.onerror = null;
      videoElement.removeAttribute('src');
      videoElement.load();
    };
    videoElement.onloadedmetadata = () => {
      const ratio = ratioOf(videoElement);
      release();
      resolve(ratio);
    };
    videoElement.onerror = () => {
      release();
      resolve(null);
    };
    videoElement.src = src;
  });
}

/**
 * Re-snap a node's BOX to the ratio of the video it is actually showing — the
 * video twin of the image nodes' `detectAspectRatioFromImage` pass.
 *
 * The box carries the ratio and the `<video>` fills it with `object-contain`
 * (a Radix AspectRatio here sized itself from the WIDTH, ignored `h-full`, and
 * the overflow-hidden card clipped the result into what read as extreme zoom —
 * Airtable #232). A generator asked for 16:9 and handed back a 9:16 clip
 * therefore letterboxed inside a landscape box until someone dragged it.
 *
 * `writeAspectRatio` is OFF by default and must stay off for the video
 * generators: their `data.aspectRatio` is the REQUEST that was sent, and it is a
 * `generationSignature` field (utils/generationSignature.ts) — writing the
 * returned ratio back would read as "the node was edited since it generated" and
 * regenerate every downstream node on the next run. Reference nodes have no
 * request to preserve, so they persist the detected ratio.
 */
/**
 * A key for a clip that survives re-signing.
 *
 * The `src` a node carries is a signed URL whose token is minted fresh on every load,
 * so the URL itself cannot identify the clip across sessions. The PATHNAME can: the
 * token lives in the query string, so `/storage/v1/object/sign/<bucket>/<path>` is
 * stable. Blob and data URLs have no stable identity and get none.
 */
function stableClipKey(src: string): string | null {
  if (src.startsWith('blob:') || src.startsWith('data:')) return null;
  try {
    return new URL(src, 'https://placeholder.invalid').pathname || null;
  } catch {
    return null;
  }
}

interface PersistedAspect {
  key: string;
  ratio: string;
}

function readPersistedAspect(data: unknown, key: string): string | null {
  const stored = (data as { detectedVideoAspect?: PersistedAspect } | undefined)
    ?.detectedVideoAspect;
  if (!stored || stored.key !== key) return null;
  return typeof stored.ratio === 'string' ? stored.ratio : null;
}

export function useSnapToVideoAspect({
  nodeId,
  src,
  bounds,
  writeAspectRatio = false,
}: {
  nodeId: string;
  src?: string | Blob;
  bounds: SnapToVideoAspectBounds;
  writeAspectRatio?: boolean;
}): void {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const source = typeof src === 'string' ? src : undefined;

  useEffect(() => {
    if (!source) return;

    // A clip's proportions never change, so the probe is worth paying exactly once per
    // clip — ever, not per session and certainly not per mount. When a previous visit
    // already recorded the ratio for this exact clip, the box was snapped then and is
    // still right now, so there is nothing to fetch and nothing to write.
    const clipKey = stableClipKey(source);
    if (clipKey) {
      const node = useStudioStore.getState().getNodeById(nodeId);
      if (node && readPersistedAspect(node.data, clipKey)) return;
    }

    let cancelled = false;

    void detectAspectRatioOnce(source as string).then((detected) => {
      if (!detected || cancelled) return;

      let changed = false;
      updateNode(nodeId, (node) => {
        const currentWidth = node.style?.width ?? node.width ?? node.measured?.width;
        const currentHeight = node.style?.height ?? node.height ?? node.measured?.height;
        const next = snapNodeDimensionsToAspectRatio({
          aspectRatio: detected,
          currentWidth,
          currentHeight,
          minWidth: bounds.minWidth,
          minHeight: bounds.minHeight,
          fallbackWidth: bounds.fallbackWidth,
        });

        const boxAlreadyMatches = next.width === currentWidth && next.height === currentHeight;
        const ratioAlreadyMatches =
          !writeAspectRatio || (node.data as { aspectRatio?: string }).aspectRatio === detected;
        const aspectAlreadyStored =
          !clipKey || readPersistedAspect(node.data, clipKey) === detected;
        // Re-mounting a node that is already the right shape must not dirty the
        // canvas: this effect runs on every mount, and an unconditional write
        // would autosave the graph each time the node scrolled back into view.
        if (boxAlreadyMatches && ratioAlreadyMatches && aspectAlreadyStored) return node;

        changed = true;
        // `detectedVideoAspect` is deliberately NOT `aspectRatio`: that one is the
        // REQUEST the generator was given and a generationSignature field, so writing a
        // measured value into it would read as "edited since it generated". This field
        // is absent from the signature whitelist (utils/generationSignature.ts), so it
        // records the measurement without implying an edit.
        const nextData = writeAspectRatio
          ? { ...node.data, aspectRatio: detected }
          : { ...node.data };
        if (clipKey) {
          (nextData as { detectedVideoAspect?: PersistedAspect }).detectedVideoAspect = {
            key: clipKey,
            ratio: detected,
          };
        }
        return {
          ...node,
          data: nextData,
          style: { ...(node.style ?? {}), width: next.width, height: next.height },
        };
      });

      if (changed) triggerSave();
    });

    return () => {
      cancelled = true;
    };
  }, [bounds, nodeId, source, triggerSave, updateNode, writeAspectRatio]);
}
