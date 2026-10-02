'use client';

// The stage draws text clips with the export's own renderer (drawActiveCaption) from the
// export plan's own cue (textCueFor), so every entrance, exit and keyframe the export burns
// in — slides, typewriter, wipe, blur, a keyed position — plays on the stage too.

import type { EditorProjectV2, EditorTextClip } from '@continuum/contracts';
import { useLayoutEffect, useRef } from 'react';
import { textCueFor } from '@/lib/client-render/executors/timelineEditor';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import { drawActiveCaption } from '@/StudioCanvas/utils/splice/drawCaptions';

/** Every live text clip at `sec`, drawn at the project's own resolution over the picture. */
export function StageTextCanvas({
  clips,
  project,
  sec,
  width,
  height,
}: {
  clips: readonly EditorTextClip[];
  project?: EditorProjectV2;
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
        textCueFor(clip, height, project),
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
