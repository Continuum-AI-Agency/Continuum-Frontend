import { useEffect, useState } from 'react';
import { getThumbnails, getWaveform } from './mediaThumbs';

// Async filmstrip + waveform for one clip, resolved from its source URL and
// cached in mediaThumbs. Returns empty arrays until decoded (or if the source has
// no video/audio), so the clip renders its label immediately and enriches when
// ready. Guards against setting state after unmount / a source change.
export function useClipMediaPreview(params: {
  url: string | undefined;
  isVideo: boolean;
  hasAudio: boolean;
  thumbnailCount?: number;
  waveformBuckets?: number;
  sourceStartSec?: number;
  sourceEndSec?: number;
  reverse?: boolean;
}): { thumbnails: string[]; peaks: number[] } {
  const {
    url,
    isVideo,
    hasAudio,
    thumbnailCount = 6,
    waveformBuckets = 60,
    sourceStartSec = 0,
    sourceEndSec,
    reverse = false,
  } = params;
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    if (!url || !isVideo) {
      setThumbnails([]);
    } else {
      getThumbnails(url, thumbnailCount).then((result) => {
        if (active) setThumbnails(result.filter(Boolean));
      });
    }
    return () => {
      active = false;
    };
  }, [url, isVideo, thumbnailCount]);

  useEffect(() => {
    let active = true;
    setPeaks([]);
    if (url && hasAudio) {
      getWaveform(url, waveformBuckets, sourceStartSec, sourceEndSec, reverse).then((result) => {
        if (active) setPeaks(result);
      });
    }
    return () => {
      active = false;
    };
  }, [url, hasAudio, waveformBuckets, sourceStartSec, sourceEndSec, reverse]);

  return { thumbnails, peaks };
}
