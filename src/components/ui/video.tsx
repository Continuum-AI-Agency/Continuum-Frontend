'use client';

import { type LoomixCaption, LoomixPlayer, type LoomixPlayerProps } from 'loomix';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';
import { attachBarContrast, corsReadable } from '@/lib/video-bar-contrast';

// Loomix sets `crossOrigin` only when it is handed captions, but shows its CC
// button only when the list is non-empty. An empty list asks for CORS with no
// visible change, which is what lets Loomix's glass and the bar contrast read
// the frame behind the controls. Module-level so the prop keeps one identity.
const CORS_ONLY: LoomixCaption[] = [];

let players = 0;

// Loomix concatenates `aspect-video` onto the root and does not merge, so a
// caller that needs another ratio passes an important utility (`aspect-auto!`).
export function Video(props: LoomixPlayerProps) {
  const host = useRef<HTMLDivElement>(null);
  const captions =
    props.captions ??
    (corsReadable(props.src, process.env.NEXT_PUBLIC_SUPABASE_URL) ? CORS_ONLY : undefined);

  useEffect(() => {
    const video = host.current?.querySelector('video');

    if (!video || video.readyState < 1) return;
    video.dispatchEvent(new Event('loadedmetadata'));
  }, [props.src]);

  useEffect(() => {
    const hostEl = host.current;
    if (!hostEl) return;
    const root = hostEl.querySelector('video')?.parentElement;
    // Each player is its own view-transition group, out of the page snapshot.
    if (root) {
      players += 1;
      root.style.viewTransitionName = `kobra-video-${String(players)}`;
      root.style.setProperty('view-transition-class', 'kobra-video');
    }
    const detach = attachBarContrast(hostEl);
    return () => {
      detach();
      if (!root) return;
      root.style.viewTransitionName = '';
      root.style.removeProperty('view-transition-class');
    };
  }, [props.src]);

  return (
    <div ref={host} dir="ltr" className="contents">
      <LoomixPlayer
        {...props}
        captions={captions}
        className={cn(
          'aspect-video w-full overflow-hidden rounded-xl border [&:not([data-glass=live])>div>button]:invisible [&>div>button[aria-label=Pause]>svg]:size-8 md:[&>div>button[aria-label=Pause]>svg]:size-10 [&>div>button[aria-label=Play]>svg]:size-8 md:[&>div>button[aria-label=Play]>svg]:size-10',
          props.className,
        )}
      />
    </div>
  );
}
