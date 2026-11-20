'use client';

import { useEffect, useState } from 'react';

/**
 * Whether an element has come within 200 px of the screen: the cue to load (or sign) what it
 * shows. Latched, so what came near stays near. A callback ref, so a box that swaps its element
 * (a still for a video) is observed again. `immediate` starts near (the first screenful).
 */
export function useNearViewport(immediate = false): [(node: Element | null) => void, boolean] {
  const [node, setNode] = useState<Element | null>(null);
  // Never near on the first render: on the server there is no screen, and a server-rendered
  // video given its src there is fetched while the HTML parses, before anything is near.
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    if (immediate || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, immediate, node]);
  return [setNode, near || immediate];
}
