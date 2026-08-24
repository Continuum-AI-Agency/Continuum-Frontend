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
export function detectAspectRatioFromVideo(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.muted = true;
    videoElement.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = videoElement;
      resolve(
        videoWidth > 0 && videoHeight > 0 ? simplifyAspectRatio(videoWidth, videoHeight) : null,
      );
    };
    videoElement.onerror = () => resolve(null);
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

    let cancelled = false;

    void detectAspectRatioFromVideo(source).then((detected) => {
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
        // Re-mounting a node that is already the right shape must not dirty the
        // canvas: this effect runs on every mount, and an unconditional write
        // would autosave the graph each time the node scrolled back into view.
        if (boxAlreadyMatches && ratioAlreadyMatches) return node;

        changed = true;
        return {
          ...node,
          data: writeAspectRatio ? { ...node.data, aspectRatio: detected } : node.data,
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
