'use client';

import { useEffect, useRef } from 'react';
import { StageTextCanvas } from '@/components/video-studio/motion/StageTextCanvas';
import type { ResolvedTextOverlay } from '../../utils/render/effectSpec';
import type { NestedPreviewGroup } from './nestedSequencePreview';
import type { OverlayPreviewLayer } from './overlayPreview';
import { needsCanvasPreview, TimelineShaderPreview } from './TimelineShaderPreview';

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
  canvasSize,
}: {
  layer: OverlayPreviewLayer;
  isPlaying: boolean;
  canvasSize?: { width: number; height: number };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const shaderEnabled = needsCanvasPreview(layer.effects);

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
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: the editor previews authored media; captions are composited separately. */}
      <video
        ref={ref}
        crossOrigin="anonymous"
        src={layer.url}
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={shaderEnabled ? { ...layer.mediaStyle, opacity: 0 } : layer.mediaStyle}
      />
      <TimelineShaderPreview
        videoRef={ref}
        effects={layer.effects}
        canvasSize={canvasSize}
        timeSec={layer.effectTimeSec}
        style={layer.mediaStyle}
      />
    </>
  );
}

function ImageLayer({
  layer,
  canvasSize,
}: {
  layer: OverlayPreviewLayer;
  canvasSize?: { width: number; height: number };
}) {
  const emptyVideoRef = useRef<HTMLVideoElement>(null);
  const shaderEnabled = needsCanvasPreview(layer.effects);
  return (
    <>
      {!shaderEnabled ? (
        // biome-ignore lint/performance/noImgElement: editor preview uses signed/blob media URLs
        <img
          src={layer.url}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={layer.mediaStyle}
        />
      ) : null}
      <TimelineShaderPreview
        videoRef={emptyVideoRef}
        imageUrl={layer.url}
        effects={layer.effects}
        canvasSize={canvasSize}
        timeSec={layer.effectTimeSec}
        style={layer.mediaStyle}
      />
    </>
  );
}

function OverlayLayer({
  layer,
  isPlaying,
  canvasSize,
}: {
  layer: OverlayPreviewLayer;
  isPlaying: boolean;
  canvasSize?: { width: number; height: number };
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {layer.kind === 'video' ? (
        <VideoLayer layer={layer} isPlaying={isPlaying} canvasSize={canvasSize} />
      ) : (
        <ImageLayer layer={layer} canvasSize={canvasSize} />
      )}
      <TextOverlays overlays={layer.textOverlays} />
    </div>
  );
}

export function TimelineOverlayPreviewLayers({
  layers,
  groups,
  isPlaying,
  canvasSize,
}: {
  layers: OverlayPreviewLayer[];
  groups?: NestedPreviewGroup[];
  canvasSize?: { width: number; height: number };
  isPlaying: boolean;
}) {
  return (
    <>
      {layers.map((layer) => (
        <OverlayLayer key={layer.id} layer={layer} isPlaying={isPlaying} canvasSize={canvasSize} />
      ))}
      {(groups ?? []).map((group) => (
        <div
          key={group.id}
          className="pointer-events-none absolute inset-0"
          data-testid={`nested-preview-${group.id}`}
          style={group.style}
        >
          <div className="absolute overflow-hidden" style={group.frameStyle}>
            <TimelineOverlayPreviewLayers
              layers={group.layers}
              isPlaying={isPlaying}
              canvasSize={group.project.canvas}
            />
            <StageTextCanvas
              clips={group.textClips}
              project={group.project}
              sec={group.childTimeSec}
              width={group.project.canvas.width}
              height={group.project.canvas.height}
            />
          </div>
        </div>
      ))}
    </>
  );
}
