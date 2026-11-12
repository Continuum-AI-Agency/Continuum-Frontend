'use client';

// The visible watermark, drawn over a preview for this viewer's session. Its
// clock ticks while the page is open, so a screenshot carries when it was taken.
// Downloads get the same text burned in by the Backend (renderShareWatermarkText).

import {
  renderShareWatermarkText,
  type ShareLinkWatermark,
  type ShareWatermarkViewer,
} from '@continuum/contracts';
import { useEffect, useState } from 'react';

const PLACEMENT: Record<Exclude<ShareLinkWatermark['position'], 'tiled'>, string> = {
  center: 'inset-0 items-center justify-center text-center',
  top_left: 'inset-x-0 top-0 items-start justify-start p-3',
  top_right: 'inset-x-0 top-0 items-start justify-end p-3 text-right',
  bottom_left: 'inset-x-0 bottom-0 items-end justify-start p-3',
  bottom_right: 'inset-x-0 bottom-0 items-end justify-end p-3 text-right',
};

const TEXT_STYLE = 'font-semibold text-white [text-shadow:0_0_2px_#000,0_1px_3px_#000]';

export function ShareWatermark({
  watermark,
  viewer,
}: {
  watermark: ShareLinkWatermark;
  viewer: Omit<ShareWatermarkViewer, 'time'>;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const text = renderShareWatermarkText(watermark.template, { ...viewer, time: now });

  if (watermark.position === 'tiled') {
    return (
      <div
        aria-hidden
        data-share-watermark={text}
        data-position="tiled"
        className="pointer-events-none absolute inset-0 overflow-hidden select-none"
        style={{ opacity: watermark.opacity }}
      >
        <div className="absolute -inset-1/2 flex rotate-[-30deg] flex-wrap content-start gap-x-16 gap-y-12">
          {Array.from({ length: 60 }, (_, index) => (
            <span key={index} className={`text-xs whitespace-nowrap ${TEXT_STYLE}`}>
              {text}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      data-share-watermark={text}
      data-position={watermark.position}
      className={`pointer-events-none absolute flex select-none ${PLACEMENT[watermark.position]}`}
      style={{ opacity: watermark.opacity }}
    >
      <span className={`text-[clamp(0.7rem,2.2vw,1.1rem)] ${TEXT_STYLE}`}>{text}</span>
    </div>
  );
}
