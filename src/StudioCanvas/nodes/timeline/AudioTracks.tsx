'use client';

import { useDroppable } from '@dnd-kit/core';
import { Music2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import { cn } from '@/lib/utils';
import type { TimelineItem } from '../../types';
import type { ResolvedAudioPlacement } from './audioTrackModel';

export const AUDIO_DROP_ID = 'audio-drop';

type AudioPatch = Partial<
  Pick<
    TimelineItem,
    'startSec' | 'trimStartSec' | 'trimEndSec' | 'volume' | 'audioFadeInSec' | 'audioFadeOutSec'
  >
>;

export function AudioTracks({
  placements,
  pxPerSec,
  totalSec,
  selectedId,
  labelFor,
  onSelect,
  onPatch,
  onRemove,
}: {
  placements: ResolvedAudioPlacement[];
  pxPerSec: number;
  totalSec: number;
  selectedId?: string;
  labelFor: (sourceNodeId: string) => string;
  onSelect: (itemId: string) => void;
  onPatch: (itemId: string, patch: AudioPatch) => void;
  onRemove: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: AUDIO_DROP_ID });
  const contentWidth = Math.max(totalSec * pxPerSec + 240, 480);
  const selected = placements.find((placement) => placement.item.id === selectedId);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Music2 className="size-3.5" />
        Audio
        <span className="font-normal text-3xs">music and voiceover · absolute time</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border/60 bg-muted/20">
        <div
          ref={setNodeRef}
          className={cn('relative h-12 transition-colors', isOver && 'bg-primary/10')}
          style={{ width: contentWidth }}
        >
          {placements.map((placement) => (
            <button
              key={placement.item.id}
              type="button"
              onClick={() => onSelect(placement.item.id)}
              className={cn(
                'absolute top-1.5 flex h-9 min-w-14 items-center gap-1 overflow-hidden rounded border bg-violet-500/15 px-2 text-left text-2xs',
                selectedId === placement.item.id
                  ? 'border-violet-400 ring-1 ring-violet-400'
                  : 'border-violet-500/35',
              )}
              style={{
                left: placement.startSec * pxPerSec,
                width: Math.max(56, placement.durationSec * pxPerSec),
              }}
              title={`${labelFor(placement.item.sourceNodeId)} · ${placement.durationSec.toFixed(1)}s`}
            >
              <Music2 className="size-3 shrink-0" />
              <span className="truncate">{labelFor(placement.item.sourceNodeId)}</span>
            </button>
          ))}
          {placements.length === 0 ? (
            <div className="pointer-events-none flex h-full items-center justify-center text-2xs text-muted-foreground">
              Drop audio here or use Add in the media bin
            </div>
          ) : null}
        </div>
      </div>
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1">
          <span className="max-w-32 truncate text-2xs font-medium">
            {labelFor(selected.item.sourceNodeId)}
          </span>
          <NumberScrubField
            orientation="inline"
            min={0}
            step={0.1}
            label="At"
            value={selected.startSec}
            onChange={(startSec) => onPatch(selected.item.id, { startSec })}
          />
          <NumberScrubField
            orientation="inline"
            min={0}
            step={0.1}
            label="In"
            value={selected.item.trimStartSec ?? 0}
            onChange={(trimStartSec) => onPatch(selected.item.id, { trimStartSec })}
          />
          <NumberScrubField
            orientation="inline"
            min={0}
            step={0.1}
            label="Out"
            value={selected.item.trimEndSec ?? selected.durationSec}
            onChange={(trimEndSec) => onPatch(selected.item.id, { trimEndSec })}
          />
          <NumberScrubField
            orientation="inline"
            min={0}
            label="Gain"
            value={selected.item.volume ?? 1}
            step={0.05}
            max={4}
            onChange={(volume) => onPatch(selected.item.id, { volume })}
          />
          <NumberScrubField
            orientation="inline"
            min={0}
            step={0.1}
            label="Fade in"
            value={selected.item.audioFadeInSec ?? 0}
            onChange={(audioFadeInSec) => onPatch(selected.item.id, { audioFadeInSec })}
          />
          <NumberScrubField
            orientation="inline"
            min={0}
            step={0.1}
            label="Fade out"
            value={selected.item.audioFadeOutSec ?? 0}
            onChange={(audioFadeOutSec) => onPatch(selected.item.id, { audioFadeOutSec })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6"
            onClick={() => onRemove(selected.item.id)}
            aria-label="Remove audio placement"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
