'use client';

import type { AsciiRevealController } from 'ascii-reveal/core';
import { type RefObject, useEffect } from 'react';

const SKELETON = '[data-slot="skeleton"],[data-slot="skeleton-text"]';

/**
 * Decodes content into place, dither-style, wherever a skeleton leaves the DOM under `root`:
 * the loading half of ascii-reveal (github.com/quanhoangindex/ascii-reveal), keyed off the
 * skeleton primitives instead of a `loading` prop, so every `isLoading ? <Skeleton/> : …`
 * gets it without touching the call site.
 *
 * The region that decodes is the parent the skeleton was removed from, which is where its
 * content landed: the card for a query swap, the grid for a mapped list, the page for a
 * route's loading.tsx. Removals in one frame collapse to their outermost regions.
 *
 * `root` should be a positioned box that does not grow with its content (the app shell's
 * viewport-sized inset): the engine finishes in-flight reveals early whenever its root resizes,
 * and makes a static root `relative` to host its overlay. Images, canvases and video are
 * left out (`media` matches nothing unless marked `data-ascii="media"`); the engine skips
 * `data-ascii="skip"` subtrees and form fields. The observer starts after hydration, so
 * server-rendered content never animates. Reduced motion gets a short fade.
 */
export function useDitherReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let controller: AsciiRevealController | null = null;
    let frame = 0;
    let disposed = false;
    const pending = new Set<Element>();

    const flush = () => {
      frame = 0;
      const regions = [...pending];
      pending.clear();
      for (const region of regions) {
        if (!region.isConnected) continue;
        if (regions.some((other) => other !== region && other.contains(region))) continue;
        void controller?.reveal({ within: region });
      }
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node instanceof Element && (node.matches(SKELETON) || node.querySelector(SKELETON))) {
            pending.add(record.target as Element);
          }
        }
      }
      if (pending.size > 0 && frame === 0) frame = requestAnimationFrame(flush);
    });

    import('ascii-reveal/core').then(({ createAsciiReveal }) => {
      if (disposed) return;
      controller = createAsciiReveal(root, {
        preset: 'dither',
        lazy: false,
        media: '[data-ascii="media"]',
      });
      observer.observe(root, { childList: true, subtree: true });
    });

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      controller?.destroy();
    };
  }, [rootRef]);
}
