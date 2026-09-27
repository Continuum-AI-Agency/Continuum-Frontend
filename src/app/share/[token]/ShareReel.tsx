'use client';

// Reel layout: one asset at a time, full width, with previous/next and the
// arrow keys. Every slide is server-rendered; this only chooses which shows.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ShareReel({ slides, labels }: { slides: ReactNode[]; labels: string[] }) {
  const [index, setIndex] = useState(0);
  const reel = useRef<HTMLElement>(null);
  const count = slides.length;

  // Leaving a slide stops whatever was playing on it.
  useEffect(() => {
    const hiddenSlides = reel.current?.querySelectorAll<HTMLElement>('[data-reel-slide][hidden]');
    for (const slide of hiddenSlides ?? []) {
      for (const media of slide.querySelectorAll<HTMLMediaElement>('video, audio')) media.pause();
    }
  }, [index]);
  const go = useCallback(
    (step: number) => setIndex((current) => (current + step + count) % count),
    [count],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (count === 0) return null;
  return (
    <section ref={reel} aria-label="Shared assets, one at a time" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => go(-1)} aria-label="Previous asset">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <p className="truncate text-sm text-muted-foreground" data-reel-position={index + 1}>
          {index + 1} / {count} · {labels[index]}
        </p>
        <Button variant="outline" size="sm" onClick={() => go(1)} aria-label="Next asset">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      {slides.map((slide, slideIndex) => (
        <section
          key={slideIndex}
          data-reel-slide
          hidden={slideIndex !== index}
          aria-label={labels[slideIndex]}
        >
          {slide}
        </section>
      ))}
    </section>
  );
}
