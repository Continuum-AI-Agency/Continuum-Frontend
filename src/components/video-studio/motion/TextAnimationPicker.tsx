'use client';

import {
  TEXT_ANIMATION_IDS,
  TEXT_ANIMATION_LABELS,
  type TextAnimationId,
} from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TextPreviewCanvas } from './TextPreviewCanvas';
import { ANIMATION_PREVIEW_SEC, animationIdFor, animationPreviewLayer } from './textPreview';

type Phase = 'in' | 'out';
export type TextAnimationField = 'animationIn' | 'animationOut';

function AnimationTile({
  id,
  phase,
  selected,
  onPick,
}: {
  id: TextAnimationId;
  phase: Phase;
  selected: boolean;
  onPick: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const layers = useMemo(() => [animationPreviewLayer(id, phase)], [id, phase]);
  const label = TEXT_ANIMATION_LABELS[id];
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${phase === 'in' ? 'In' : 'Out'}: ${label}`}
      data-animation-id={id}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-md border p-0.5 text-left transition-colors active:scale-[0.97]',
        selected ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/50',
      )}
      onClick={onPick}
      onPointerEnter={() => setPlaying(true)}
      onPointerLeave={() => setPlaying(false)}
      onFocus={() => setPlaying(true)}
      onBlur={() => setPlaying(false)}
    >
      <TextPreviewCanvas
        layers={layers}
        durationSec={ANIMATION_PREVIEW_SEC}
        aspect={16 / 10}
        playing={playing}
        // At rest: entrances show the settled word, exits the word before it leaves.
        restSec={phase === 'in' ? ANIMATION_PREVIEW_SEC * 0.7 : ANIMATION_PREVIEW_SEC * 0.3}
        backingHeight={120}
        label={`${label} preview`}
        className="rounded-sm"
      />
      <span className="truncate px-0.5 text-3xs leading-4">{label}</span>
    </button>
  );
}

/**
 * The In / Out animation grid for a text clip. Every tile previews on hover through the
 * export's own animation resolver; picking one writes the clip's animationIn/animationOut.
 */
export function TextAnimationPicker({
  animationIn,
  animationOut,
  onPick,
}: {
  animationIn?: string;
  animationOut?: string;
  onPick: (field: TextAnimationField, id: TextAnimationId) => void;
}) {
  const current: Record<Phase, TextAnimationId> = {
    in: animationIdFor(animationIn),
    out: animationIdFor(animationOut),
  };
  return (
    <Tabs defaultValue="in" className="gap-2" data-testid="text-animation-picker">
      <TabsList className="h-7">
        <TabsTrigger value="in" className="text-2xs">
          In · {TEXT_ANIMATION_LABELS[current.in]}
        </TabsTrigger>
        <TabsTrigger value="out" className="text-2xs">
          Out · {TEXT_ANIMATION_LABELS[current.out]}
        </TabsTrigger>
      </TabsList>
      {(['in', 'out'] as const).map((phase) => (
        <TabsContent key={phase} value={phase} className="grid grid-cols-3 gap-1.5">
          {TEXT_ANIMATION_IDS.map((id) => (
            <AnimationTile
              key={id}
              id={id}
              phase={phase}
              selected={current[phase] === id}
              onPick={() => onPick(phase === 'in' ? 'animationIn' : 'animationOut', id)}
            />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
