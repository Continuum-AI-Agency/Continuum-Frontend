'use client';

// The landing hero's star swirl, pulled toward the login card. The static sky
// paints first; the animation chunk loads only once the browser is idle, and
// never under reduced motion.
import { type ReactNode, useEffect, useRef } from 'react';

type LoginStarfieldProps = {
  className?: string;
  children: ReactNode;
};

export function LoginStarfield({ className, children }: LoginStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const well = wellRef.current;
    if (!canvas || !well || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let stop = () => {};
    const start = () => {
      import('./starfield').then(({ startStarfield }) => {
        if (!cancelled) stop = startStarfield(canvas, well, false);
      });
    };

    const idle = 'requestIdleCallback' in window;
    const handle = idle
      ? window.requestIdleCallback(start, { timeout: 2000 })
      : window.setTimeout(start, 200);

    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      stop();
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 -z-10 size-full" />
      <div ref={wellRef} className={className}>
        {children}
      </div>
    </>
  );
}
