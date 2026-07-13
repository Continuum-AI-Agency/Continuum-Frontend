'use client';

// Tracks the stage container size (ResizeObserver) and the media's intrinsic
// size, deriving the object-contain content rect annotations render against.

import { useEffect, useMemo, useRef, useState } from 'react';
import { type CssRect, fitContentRect, type Size } from './annotationGeometry';

export type StageGeometry = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerSize: Size | null;
  contentRect: CssRect | null;
  setNaturalSize: (size: Size | null) => void;
};

export function useStageGeometry(): StageGeometry {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const contentRect = useMemo(
    () => (containerSize && naturalSize ? fitContentRect(containerSize, naturalSize) : null),
    [containerSize, naturalSize],
  );

  return { containerRef, containerSize, contentRect, setNaturalSize };
}
