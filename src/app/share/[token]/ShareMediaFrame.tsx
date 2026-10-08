'use client';

// The box around one previewed asset. On a protected link (downloads off, or a
// watermark) it refuses the browser's save/copy context menu and replaces the
// video's own fullscreen (turned off by controlsList) with one on this box, so
// the per-viewer watermark stays on screen in fullscreen too.

import type { ShareLinkWatermark, ShareWatermarkViewer } from '@continuum/contracts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ShareWatermark } from './ShareWatermark';

export function ShareMediaFrame({
  protect,
  watermark,
  viewer,
  children,
}: {
  protect: boolean;
  watermark: ShareLinkWatermark | null;
  viewer: Omit<ShareWatermarkViewer, 'time'> | null;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const node = frame.current;
    if (!protect || !node) return;
    const refuse = (event: Event) => event.preventDefault();
    node.addEventListener('contextmenu', refuse);
    return () => node.removeEventListener('contextmenu', refuse);
  }, [protect]);

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen();
  };

  return (
    <div
      ref={frame}
      data-share-frame
      data-protected={protect ? 'true' : undefined}
      className="relative [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:justify-center [&:fullscreen]:bg-black [&:fullscreen_img]:max-h-screen [&:fullscreen_video]:max-h-screen"
    >
      {children}
      {watermark && viewer ? <ShareWatermark watermark={watermark} viewer={viewer} /> : null}
      {protect ? (
        <button
          type="button"
          data-share-fullscreen
          onClick={toggle}
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          className="absolute top-2 right-2 z-10 rounded-md bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
        >
          {fullscreen ? (
            <Minimize2 className="size-4" aria-hidden />
          ) : (
            <Maximize2 className="size-4" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
