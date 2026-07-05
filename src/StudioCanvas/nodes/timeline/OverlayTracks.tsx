'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OverlayTrack, overlayDropId } from './OverlayTrack';
import type { OverlayLane } from './useOverlayModel';

// Stacked overlay lanes: one OverlayTrack per track, each its own drop target, plus
// an "Add layer" control. The data model always supported many overlay tracks;
// this renders them so users can build multi-layer PiP / graphic stacks.
export function OverlayTracks({
  lanes,
  pxPerSec,
  totalSec,
  selectedId,
  onSelect,
  onSetStart,
  onRemove,
  onAddTrack,
}: {
  lanes: OverlayLane[];
  pxPerSec: number;
  totalSec: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  onSetStart: (id: string, startSec: number) => void;
  onRemove: (id: string) => void;
  onAddTrack: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold text-muted-foreground">Overlay layers</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-2xs" onClick={onAddTrack}>
          <Plus className="h-3 w-3" />
          Add layer
        </Button>
      </div>
      {lanes.map((lane) => (
        <OverlayTrack
          key={lane.trackId}
          items={lane.items}
          label={lane.label}
          dropId={overlayDropId(lane.trackId)}
          pxPerSec={pxPerSec}
          totalSec={totalSec}
          selectedId={selectedId}
          onSelect={onSelect}
          onSetStart={onSetStart}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
