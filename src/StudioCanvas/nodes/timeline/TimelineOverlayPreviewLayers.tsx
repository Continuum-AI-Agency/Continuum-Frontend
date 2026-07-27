'use client';

import { useEffect, useRef } from 'react';
import type { ResolvedTextOverlay } from '../../utils/render/effectSpec';
import type { OverlayPreviewLayer } from './overlayPreview';

function TextOverlays({ overlays }: { overlays: ResolvedTextOverlay[] }) {
  return overlays.map((overlay) => (
    <div
      key={overlay.id}
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center leading-tight"
      style={{
        left: `${overlay.xFrac * 100}%`,
        top: `${overlay.yFrac * 100}%`,
        fontSize: `${overlay.sizeFrac * 100}cqh`,
        color: overlay.color,
        fontWeight: overlay.fontWeight,
        background: overlay.background,
        padding: overlay.background ? '0.15em 0.4em' : undefined,
        borderRadius: overlay.background ? '0.15em' : undefined,
        textShadow: overlay.background ? undefined : '0 0 0.18em rgba(0,0,0,0.75)',
        maxWidth: '90%',
      }}
    >
      {overlay.text}
    </div>
  ));
}

function VideoLayer({
  layer,
  isPlaying,
}: {
  layer: OverlayPreviewLayer;
  isPlaying: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.playbackRate = layer.playbackRate;
    video.volume = layer.volume;
    video.muted = layer.muted;
    if (Math.abs(video.currentTime - layer.sourceSec) > 0.12) {
      video.currentTime = Math.max(0, layer.sourceSec);
    }
    if (isPlaying) void video.play().catch(() => undefined);
    else video.pause();
  }, [isPlaying, layer.muted, layer.playbackRate, layer.sourceSec, layer.volume]);

  return (
    <video
      ref={ref}
      src={layer.url}
      playsInline
      preload="metadata"
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
      style={layer.mediaStyle}
    />
  );
}

export function TimelineOverlayPreviewLayers({
  layers,
  isPlaying,
}: {
  layers: OverlayPreviewLayer[];
  isPlaying: boolean;
}) {
  return layers.map((layer) => (
    <div key={layer.id} className="pointer-events-none absolute inset-0">
      {layer.kind === 'video' ? (
        <VideoLayer layer={layer} isPlaying={isPlaying} />
      ) : (
        // biome-ignore lint/performance/noImgElement: editor preview uses signed/blob media URLs
        <img
          src={layer.url}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={layer.mediaStyle}
        />
      )}
      <TextOverlays overlays={layer.textOverlays} />
    </div>
  ));
}
