'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Whether an element has come within `margin` of the screen: the cue to start loading what it
 * shows. Once near it stays near, so what has loaded is not thrown away when it scrolls past.
 */
export function useNearViewport<T extends Element>(immediate = false, margin = '200px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(immediate);
  useEffect(() => {
    if (near || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: margin },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near, margin]);
  return { ref, near: near || immediate };
}
