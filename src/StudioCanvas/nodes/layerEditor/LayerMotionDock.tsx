'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LayerEditorLayer } from '../../types';
import { formatMotionTime } from '../timeline/motion/motionChrome';

export function layerMotionDurationSec(layers: readonly LayerEditorLayer[]): number {
  let max = 0;
  for (const layer of layers) {
    if (layer.durationSec) max = Math.max(max, layer.durationSec);
    for (const keyframe of layer.keyframes ?? []) {
      max = Math.max(max, keyframe.timeSec);
    }
  }
  return Math.max(2, max);
}

export function LayerMotionDock({
  layers,
  timeSec,
  onSeek,
}: {
  layers: readonly LayerEditorLayer[];
  timeSec: number;
  onSeek: (timeSec: number) => void;
}) {
  const durationSec = useMemo(() => layerMotionDurationSec(layers), [layers]);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(timeSec);
  timeRef.current = timeSec;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = timeRef.current + dt;
      onSeek(next >= durationSec ? 0 : next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, durationSec, onSeek]);

  return (
    <div
      className="flex h-9 shrink-0 items-center gap-2 border-t border-border/60 bg-card px-3"
      data-testid="layer-motion-dock"
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 active:scale-[0.96]"
        aria-label={playing ? 'Pause layer motion' : 'Play layer motion'}
        onClick={() => setPlaying((current) => !current)}
      >
        {playing ? (
          <Pause className="size-3.5 fill-current" />
        ) : (
          <Play className="size-3.5 fill-current" />
        )}
      </Button>
      <span className="w-16 font-mono text-2xs tabular-nums text-muted-foreground">
        {formatMotionTime(timeSec, 's')}
      </span>
      <input
        type="range"
        min={0}
        max={durationSec}
        step={0.01}
        value={Math.max(0, Math.min(durationSec, timeSec))}
        aria-label="Layer motion playhead"
        className="h-1 min-w-0 flex-1 accent-primary"
        onChange={(event) => {
          setPlaying(false);
          onSeek(Number(event.target.value));
        }}
      />
      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
        {formatMotionTime(durationSec, 's')}
      </span>
    </div>
  );
}
