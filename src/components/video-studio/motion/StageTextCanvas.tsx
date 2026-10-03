'use client';

// Text and speech captions share the export's cue mapping and canvas renderer.

import type { EditorCaptionClip, EditorProjectV2, EditorTextClip } from '@continuum/contracts';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { captionCueFor, textCueFor } from '@/lib/client-render/executors/timelineEditor';
import { ensureCaptionFonts } from '@/lib/clips/captionFonts';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { drawActiveCaption } from '@/StudioCanvas/utils/splice/drawCaptions';

/** Live text and caption clips, drawn at the project's resolution over the picture. */
export function StageTextCanvas({
  clips,
  project,
  sec,
  width,
  height,
}: {
  clips: readonly (EditorTextClip | EditorCaptionClip)[];
  project?: EditorProjectV2;
  sec: number;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const fontKey = JSON.stringify([...new Set(clips.map((clip) => clip.style.fontFamily))].sort());
  useEffect(() => {
    let mounted = true;
    void ensureCaptionFonts(JSON.parse(fontKey) as string[])
      .then(() => {
        // Canvas does not repaint when a font arrives, especially on a paused playhead.
        if (mounted) redraw();
      })
      .catch((error: unknown) => console.error('Stage caption font loading failed', error));
    return () => {
      mounted = false;
    };
  }, [fontKey]);
  useLayoutEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    const live = clips
      .filter(
        (clip) => sec >= clip.timelineStartSec && sec < clip.timelineStartSec + clip.durationSec,
      )
      .toSorted((left, right) => left.timelineStartSec - right.timelineStartSec);
    if (live.length === 0 && !drawn.current) return;
    context.clearRect(0, 0, width, height);
    for (const clip of live) {
      // The renderer is typed for the worker's OffscreenCanvas; the DOM context draws the same.
      drawActiveCaption(
        context as unknown as OffscreenCanvasRenderingContext2D,
        clip.kind === 'caption'
          ? captionCueFor(clip, height, project)
          : textCueFor(clip, height, project),
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
      data-playhead-sec={sec}
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
