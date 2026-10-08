'use client';

import { useEffect, useState } from 'react';
import type { FrameRate, SourceTimecode } from '@/lib/library/commentExport';
import { measureFrameRate } from '@/lib/library/frameRate';
import { readStartTimecode } from '@/lib/library/startTimecode';

// The playing file's measured frame rate, for frame-accurate stepping. Null
// until measured, or when the container cannot be read (the player then steps
// at a nominal 30 fps and says so).
//
// Measured once per stored file, not per URL: a signed URL is re-minted whenever
// the asset refreshes, and a stage keyed on it remounts the player. Without the
// cache that fresh mount steps at the nominal rate until it re-measures, which
// lands a 29.97 fps comment one frame early.
const measuredByFile = new Map<string, FrameRate>();

function fileKey(src: string): string {
  return src.split('?')[0] ?? src;
}

export function useFrameRate(src: string | null): FrameRate | null {
  const [rate, setRate] = useState<FrameRate | null>(() =>
    src ? (measuredByFile.get(fileKey(src)) ?? null) : null,
  );
  useEffect(() => {
    if (!src) return;
    const key = fileKey(src);
    const known = measuredByFile.get(key);
    if (known) {
      setRate(known);
      return;
    }
    let cancelled = false;
    measureFrameRate(src)
      .then((measured) => {
        if (measured) measuredByFile.set(key, measured);
        if (!cancelled) setRate(measured);
      })
      .catch((error: unknown) => console.warn('[useFrameRate] could not read frame rate', error));
    return () => {
      cancelled = true;
    };
  }, [src]);
  return rate;
}

// The playing file's own start timecode (its tmcd track), cached per stored file
// like the rate. `undefined` while reading; null when the file carries none, in
// which case timecode counts from 00:00:00:00.
const startByFile = new Map<string, SourceTimecode | null>();

export function useStartTimecode(src: string | null): SourceTimecode | null | undefined {
  const [start, setStart] = useState<SourceTimecode | null | undefined>(() =>
    src ? startByFile.get(fileKey(src)) : undefined,
  );
  useEffect(() => {
    if (!src) return;
    const key = fileKey(src);
    if (startByFile.has(key)) {
      setStart(startByFile.get(key) ?? null);
      return;
    }
    let cancelled = false;
    readStartTimecode(src)
      .catch((error: unknown) => {
        console.warn('[useStartTimecode] could not read start timecode', error);
        return null;
      })
      .then((read) => {
        startByFile.set(key, read);
        if (!cancelled) setStart(read);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  return start;
}
