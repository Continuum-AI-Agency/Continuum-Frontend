'use client';

// The stage draws text clips with the export's own renderer (drawActiveCaption), so every
// entrance, exit and keyframe the export burns in — slides, typewriter, wipe, blur, a
// keyed position — plays on the stage too. The cue is built the way the export plan builds
// a text clip's (executors/timelineEditor.ts buildTimelineEditorRenderPlan).

import type { EditorTextClip } from '@continuum/contracts';
import { useLayoutEffect, useRef } from 'react';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import { captionAnimationFromEditorId } from '@/lib/clips/captionAnimation';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { type CaptionCue, wordsForCaptionText } from '@/StudioCanvas/utils/splice/captionCues';
import { drawActiveCaption } from '@/StudioCanvas/utils/splice/drawCaptions';

/** Must match the export plan's TEXT_SHADOW_OFFSET_FRAC. */
const SHADOW_OFFSET_FRAC = 0.06;

/**
 * A text clip as the export plan's caption cue. ponytail: mirrors the plan's private
 * captionStyleFor/textMotionFor; export one `textCueFor` from the executor and call it here.
 */
export function textCueFor(clip: EditorTextClip, canvasHeight: number): CaptionCue {
  const { style } = clip;
  const endSec = clip.timelineStartSec + clip.durationSec;
  const { transform, opacity, motionChannels } = clipEffectSpecFromEditorClip(clip);
  return {
    id: clip.id,
    startSec: clip.timelineStartSec,
    endSec,
    words: wordsForCaptionText(clip.text, clip.timelineStartSec, endSec),
    style: {
      textColor: style.color,
      highlightColor: style.color,
      outlineColor: style.outlineColor ?? '#000000',
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSizeFrac: style.fontSizePx / canvasHeight,
      outlineWidthFrac: style.fontSizePx > 0 ? style.outlineWidthPx / style.fontSizePx : 0,
      position: { xFrac: clip.transform.position.x, yFrac: clip.transform.position.y },
      ...(style.backgroundColor
        ? { backgroundColor: style.backgroundColor, backgroundOpacity: 1 }
        : {}),
      ...(style.shadowColor && style.shadowBlurPx > 0 && style.fontSizePx > 0
        ? {
            shadow: {
              color: style.shadowColor,
              blurFrac: style.shadowBlurPx / style.fontSizePx,
              offsetYFrac: SHADOW_OFFSET_FRAC,
            },
          }
        : {}),
      animation: captionAnimationFromEditorId(clip.animationIn),
      exitAnimation: captionAnimationFromEditorId(clip.animationOut),
    },
    motion: {
      ...(transform ? { transform } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
      ...(motionChannels ? { motionChannels } : {}),
    },
  };
}

/** Every live text clip at `sec`, drawn at the project's own resolution over the picture. */
export function StageTextCanvas({
  clips,
  sec,
  width,
  height,
}: {
  clips: readonly EditorTextClip[];
  sec: number;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);
  useLayoutEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    const live = clips.filter(
      (clip) => sec >= clip.timelineStartSec && sec < clip.timelineStartSec + clip.durationSec,
    );
    if (live.length === 0 && !drawn.current) return;
    context.clearRect(0, 0, width, height);
    for (const clip of live) {
      // The renderer is typed for the worker's OffscreenCanvas; the DOM context draws the same.
      drawActiveCaption(
        context as unknown as OffscreenCanvasRenderingContext2D,
        textCueFor(clip, height),
        sec,
        width,
        height,
        DEFAULT_CAPTION_STYLE,
      );
    }
    drawn.current = live.length > 0;
  });
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      aria-hidden
      data-testid="stage-text"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
