'use client';

import { LoomixPlayer, type LoomixPlayerProps } from 'loomix';
import { useEffect, useRef } from 'react';

import { attachGlassControls } from '@/lib/glass-controls';
import { cn } from '@/lib/utils';

// Loomix concatenates `aspect-video` onto the root and does not merge, so a
// caller that needs another ratio passes an important utility (`aspect-auto!`).
export function Video(props: LoomixPlayerProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = host.current?.querySelector('video');

    if (!video || video.readyState < 1) return;
    video.dispatchEvent(new Event('loadedmetadata'));
  }, [props.src]);

  useEffect(() => {
    const hostEl = host.current;
    if (!hostEl) return;

    const controller = new AbortController();
    let detach: (() => void) | null = null;

    void attachGlassControls(hostEl, controller.signal).then((teardown) => {
      if (controller.signal.aborted) teardown();
      else detach = teardown;
    });

    return () => {
      controller.abort();
      detach?.();
    };
  }, [props.src]);

  return (
    <div ref={host} dir="ltr" className="contents">
      <LoomixPlayer
        {...props}
        className={cn(
          'aspect-video w-full overflow-hidden rounded-xl border [&:not([data-glass=live])>div>button]:invisible [&>div>button[aria-label=Pause]>svg]:size-8 md:[&>div>button[aria-label=Pause]>svg]:size-10 [&>div>button[aria-label=Play]>svg]:size-8 md:[&>div>button[aria-label=Play]>svg]:size-10',
          props.className,
        )}
      />
    </div>
  );
}
