'use client';

import { Pause, Play, Video } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { captionAnchorSec, captionWordTransform } from '@/lib/clips/captionAnimation';
import { ensureCaptionFonts } from '@/lib/clips/captionFonts';
import { captionFontFamiliesFor, resolveStyleWithPreset } from '@/lib/clips/captionPresets';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { ResolvedTextOverlay } from '../../utils/render/effectSpec';
import type { CaptionCue } from '../../utils/splice/captionCues';
import type { OverlayPreviewLayer } from './overlayPreview';
import { TimelineOverlayPreviewLayers } from './TimelineOverlayPreviewLayers';

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** `#rrggbb` plus an alpha, without pulling in a colour library for one job. */
function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * The line-level style: everything the canvas sets once per cue.
 *
 * `-webkit-text-stroke` is the DOM's real equivalent of `strokeText`, and it is centred on
 * the glyph edge exactly as the canvas stroke is — so the visible weight is half the value
 * in both places and the two surfaces agree. `paintOrder: stroke fill` is what stops the
 * stroke eating the glyph, matching the renderer's stroke-then-fill order.
 */
function captionBlockStyle(style: CaptionStyle): React.CSSProperties {
  const outlineWidthFrac = style.outlineWidthFrac ?? 0.18;
  const strokes = outlineWidthFrac > 0;
  return {
    fontSize: `${(style.fontSizeFrac ?? 0.055) * 100}cqh`,
    fontFamily: style.fontFamily ? `"${style.fontFamily}", sans-serif` : undefined,
    fontWeight: style.fontWeight ?? 700,
    lineHeight: style.lineHeightFactor ?? 1.25,
    color: style.textColor,
    textTransform: style.uppercase ? 'uppercase' : undefined,
    ...(strokes
      ? {
          WebkitTextStrokeWidth: `${outlineWidthFrac}em`,
          WebkitTextStrokeColor: style.outlineColor,
          paintOrder: 'stroke fill',
        }
      : {}),
    ...(style.shadow
      ? {
          textShadow: `0 ${style.shadow.offsetYFrac}em ${style.shadow.blurFrac}em ${style.shadow.color}`,
        }
      : {}),
    ...(style.backgroundColor && (style.backgroundMode ?? 'line') === 'line'
      ? {
          backgroundColor: withAlpha(style.backgroundColor, style.backgroundOpacity ?? 0.8),
          borderRadius: `${style.backgroundRadiusFrac ?? 0}em`,
          padding: '0.18em 0.35em',
          boxDecorationBreak: 'clone' as const,
          WebkitBoxDecorationBreak: 'clone' as const,
        }
      : {}),
  };
}

/** The per-word style: the active/emphasis fill, the word pill, and the entry transform. */
function captionWordStyle(
  style: CaptionStyle,
  word: { emphasis?: boolean },
  state: { active: boolean; transform: { scale: number; dy: number; alpha: number } },
): React.CSSProperties {
  const activeWordMode = style.activeWordMode ?? 'fill';
  const emphasised = word.emphasis === true;
  const color =
    state.active && activeWordMode !== 'none'
      ? style.highlightColor
      : emphasised && style.emphasis?.color
        ? style.emphasis.color
        : undefined;

  const boxColor =
    state.active && activeWordMode === 'box'
      ? (style.activeBoxColor ?? style.highlightColor)
      : style.backgroundMode === 'word'
        ? style.backgroundColor
        : undefined;

  const scale = state.transform.scale * (emphasised ? (style.emphasis?.scale ?? 1) : 1);
  return {
    color,
    ...(emphasised && style.emphasis?.weight ? { fontWeight: style.emphasis.weight } : {}),
    ...(boxColor
      ? {
          backgroundColor: withAlpha(boxColor, style.backgroundOpacity ?? 0.8),
          borderRadius: `${style.backgroundRadiusFrac ?? 0}em`,
          padding: '0.18em 0.35em',
          boxDecorationBreak: 'clone' as const,
          WebkitBoxDecorationBreak: 'clone' as const,
        }
      : {}),
    display: 'inline-block',
    opacity: state.transform.alpha,
    transform: `translateY(${state.transform.dy}em) scale(${scale})`,
  };
}

// Presentational sequence preview. The <video> layer is driven imperatively by
// usePlayheadPlayback (it swaps source + seeks across clips); the <img> layer
// shows the active still. Both are letterboxed (object-contain) on a black frame
// to approximate the rendered output.
export function TimelinePreview({
  videoRef,
  showVideo,
  activeImageUrl,
  isEmpty,
  isPlaying,
  isPreparing = false,
  onTogglePlay,
  playheadSec,
  totalSec,
  mediaStyle,
  textOverlays,
  fadeOverlay,
  crossfade,
  overlayLayers,
  mediaMuted,
  mediaVolume,
  caption,
  captionStyle,
  onCaptionPositionChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  showVideo: boolean;
  activeImageUrl?: string;
  isEmpty: boolean;
  isPlaying: boolean;
  isPreparing?: boolean;
  onTogglePlay: () => void;
  playheadSec: number;
  totalSec: number;
  // Effect CSS (filter/transform/opacity) for the active clip — the same spec
  // that the canvas export bakes in, so preview and output match.
  mediaStyle?: React.CSSProperties;
  textOverlays?: ResolvedTextOverlay[];
  // Fade/dip transition wash over the whole frame at the current playhead.
  fadeOverlay?: { color: string; alpha: number } | null;
  // Incoming clip's frame faded in over the current one during a cross-dissolve.
  crossfade?: { url: string; kind: 'video' | 'image'; opacity: number };
  overlayLayers?: OverlayPreviewLayer[];
  mediaMuted?: boolean;
  mediaVolume?: number;
  caption?: CaptionCue;
  captionStyle?: CaptionStyle;
  onCaptionPositionChange?: (position: { xFrac: number; yFrac: number }) => void;
}) {
  // The SAME resolver the burn-in uses (drawCaptions.ts). The preview used to build its own
  // approximation — hardcoded bold + uppercase, a text-shadow standing in for the stroke, no
  // background at all — which read as "close enough" with one style and becomes a lie the
  // moment a preset gallery is offering six.
  const resolvedCaptionStyle = caption
    ? resolveStyleWithPreset(captionStyle, caption.style)
    : undefined;
  const captionFamily = resolvedCaptionStyle?.fontFamily;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = mediaMuted ?? false;
    video.volume = Math.max(0, Math.min(1, mediaVolume ?? 1));
  }, [mediaMuted, mediaVolume, videoRef]);

  // Register the same face the worker will burn in. Without this the preview falls back to
  // the system stack and the gallery shows a typeface the export will not use.
  useEffect(() => {
    const families = captionFontFamiliesFor([{ fontFamily: captionFamily } as CaptionStyle]);
    if (families.length === 0) return;
    void ensureCaptionFonts(families);
  }, [captionFamily]);

  return (
    <div className="flex h-full flex-col gap-2">
      {/* containerType lets text overlays size via cqh (fraction of frame height). */}
      <div
        className="relative flex-1 overflow-hidden rounded-lg border border-border/60 bg-black"
        style={{ containerType: 'size' }}
      >
        <video
          ref={videoRef}
          playsInline
          muted={false}
          className="absolute inset-0 h-full w-full object-contain transition-opacity"
          style={{ ...mediaStyle, opacity: showVideo ? (mediaStyle?.opacity ?? 1) : 0 }}
        />
        {!showVideo && activeImageUrl ? (
          // biome-ignore lint/performance/noImgElement: in-memory still preview; next/image adds no value for canvas media
          <img
            src={activeImageUrl}
            alt="Timeline preview frame"
            className="absolute inset-0 h-full w-full object-contain"
            style={mediaStyle}
          />
        ) : null}

        {crossfade && crossfade.opacity > 0 ? (
          crossfade.kind === 'video' ? (
            <video
              key={crossfade.url}
              src={crossfade.url}
              muted
              playsInline
              preload="metadata"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: crossfade.opacity }}
            />
          ) : (
            // biome-ignore lint/performance/noImgElement: in-memory dissolve frame; next/image adds no value
            <img
              src={crossfade.url}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: crossfade.opacity }}
            />
          )
        ) : null}

        {textOverlays?.map((overlay) => (
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
        ))}

        <TimelineOverlayPreviewLayers layers={overlayLayers ?? []} isPlaying={isPlaying} />

        {fadeOverlay && fadeOverlay.alpha > 0 ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: fadeOverlay.color, opacity: Math.min(1, fadeOverlay.alpha) }}
          />
        ) : null}

        {caption ? (
          <div
            className="absolute flex max-w-[90%] -translate-x-1/2 -translate-y-1/2 touch-none justify-center px-4"
            aria-hidden="true"
            onPointerDown={(event) => {
              if (!onCaptionPositionChange) return;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (
                !onCaptionPositionChange ||
                !event.currentTarget.hasPointerCapture(event.pointerId)
              )
                return;
              const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!bounds) return;
              onCaptionPositionChange({
                xFrac: Math.max(0.05, Math.min(0.95, (event.clientX - bounds.left) / bounds.width)),
                yFrac: Math.max(0.05, Math.min(0.95, (event.clientY - bounds.top) / bounds.height)),
              });
            }}
            style={{
              left: `${resolvedCaptionStyle!.position!.xFrac * 100}%`,
              top: `${resolvedCaptionStyle!.position!.yFrac * 100}%`,
              cursor: onCaptionPositionChange ? 'grab' : undefined,
            }}
          >
            <span
              className="max-w-[90%] text-center"
              style={captionBlockStyle(resolvedCaptionStyle!)}
            >
              {caption.words.map((word, index) => {
                const style = resolvedCaptionStyle!;
                const active = playheadSec >= word.startSec && playheadSec < word.endSec;
                const anchorSec = captionAnchorSec(
                  style.animation,
                  caption.startSec,
                  word.startSec,
                );
                // Same pure function, same numbers as the burn-in. `1em` stands in for the
                // canvas font px, which is what makes the fractional amplitudes carry over.
                const transform = captionWordTransform(style.animation, playheadSec - anchorSec, 1);
                if (!transform.visible) return null;
                return (
                  <span
                    key={`${caption.id}:${word.startSec}:${index}`}
                    style={captionWordStyle(style, word, { active, transform })}
                  >
                    {index > 0 ? ' ' : ''}
                    {style.uppercase ? word.text.toLocaleUpperCase() : word.text}
                  </span>
                );
              })}
            </span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Video className="h-7 w-7 opacity-30" />
            <span className="text-xs">Drag clips from the media bin onto the timeline</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={onTogglePlay}
          disabled={isEmpty}
          aria-label={isPlaying || isPreparing ? 'Pause preview' : 'Play preview'}
        >
          {isPlaying || isPreparing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="tabular-nums text-xs text-muted-foreground">
          {formatTime(playheadSec)} / {formatTime(totalSec)}
        </span>
      </div>
    </div>
  );
}
