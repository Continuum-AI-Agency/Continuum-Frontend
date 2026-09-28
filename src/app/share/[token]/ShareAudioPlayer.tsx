'use client';

// A shared audio file: the Library's waveform stage with the open time and range
// comments riding above it. When guests may comment, the playhead and any I/O
// range they mark feed the guest form, as the video player's do.

import { useCallback, useState } from 'react';
import { type AudioPlayhead, AudioStage } from '@/components/library/detail/audio/AudioStage';
import type { TimeMarker } from '@/components/library/detail/TimelineMarkerStrip';
import { publishSharePlayhead } from './sharePlayhead';

export function ShareAudioPlayer({
  assetId,
  src,
  label,
  markers,
  initialSelectedId = null,
  pinnable,
}: {
  assetId: string;
  src: string;
  label: string;
  markers: TimeMarker[];
  initialSelectedId?: string | null;
  pinnable: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const publish = useCallback(
    (playhead: AudioPlayhead) => publishSharePlayhead(assetId, playhead),
    [assetId],
  );
  return (
    <div
      data-testid="share-audio-player"
      className="overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      <AudioStage
        src={src}
        label={label}
        markers={markers.map((marker) => ({ ...marker, selected: marker.id === selectedId }))}
        onSelectMarker={setSelectedId}
        onPlayhead={pinnable ? publish : undefined}
        hotkeys="hover"
      />
    </div>
  );
}
