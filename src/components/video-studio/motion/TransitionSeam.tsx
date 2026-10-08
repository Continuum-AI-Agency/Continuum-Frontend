'use client';

import {
  type EditorTransition,
  VIDEO_EDITOR_OPS,
  type VideoEditorOpInput,
} from '@continuum/contracts';
import { Blend } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SliderField } from '@/components/ui/slider-field';
import { cn } from '@/lib/utils';

export type TransitionType = VideoEditorOpInput<'add_transition'>['type'];
export type TransitionInput = {
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  durationSec: number;
};

export const TRANSITION_TYPES = VIDEO_EDITOR_OPS.add_transition.input.shape.type
  .options as readonly TransitionType[];
export const TRANSITION_LABELS: Record<TransitionType, string> = {
  cut: 'Cut',
  crossfade: 'Crossfade',
  dip_to_black: 'Dip to black',
  dip_to_white: 'Dip to white',
  wipe: 'Wipe',
  slide: 'Slide',
  zoom: 'Zoom',
  blur: 'Blur',
};
/**
 * The looks a seam can take; `cut` is how one is removed.
 * ponytail: `blur` is in the contract but add_transition refuses it until the compositor
 * draws a blur ramp — offered again once it renders.
 */
export const SEAM_TRANSITIONS = TRANSITION_TYPES.filter(
  (type) => type !== 'cut' && type !== 'blur',
);
export const DEFAULT_TRANSITION_SEC = 0.5;

const knownType = (type: EditorTransition['transitionType'] | undefined): TransitionType =>
  type && type !== 'custom' && type !== 'cut' ? type : 'crossfade';

/**
 * The seam between two adjacent clips on the main track: a small handle that opens a
 * transition picker — type and length — applied through `add_transition`.
 */
export function TransitionSeam({
  fromClip,
  toClip,
  existing,
  leftPx,
  onApply,
}: {
  fromClip: { id: string; label: string; durationSec: number };
  toClip: { id: string; label: string; durationSec: number };
  existing?: EditorTransition;
  leftPx: number;
  onApply: (input: TransitionInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransitionType>(knownType(existing?.transitionType));
  const [durationSec, setDurationSec] = useState(existing?.durationSec ?? DEFAULT_TRANSITION_SEC);
  const maxSec = Math.max(0.1, Math.min(3, fromClip.durationSec, toClip.durationSec));
  const apply = (next: TransitionType) => {
    setOpen(false);
    onApply({
      fromClipId: fromClip.id,
      toClipId: toClip.id,
      type: next,
      durationSec: Math.min(maxSec, durationSec),
    });
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setType(knownType(existing?.transitionType));
          setDurationSec(Math.min(maxSec, existing?.durationSec ?? DEFAULT_TRANSITION_SEC));
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            data-seam={fromClip.id}
            data-transition={existing?.transitionType ?? 'cut'}
            aria-label={`Transition between ${fromClip.label} and ${toClip.label}`}
            className={cn(
              // Straddles the lane's bottom border: the clips' edge trim handles keep the
              // lane's middle, where a press at the seam would otherwise land on this.
              'absolute bottom-0 z-20 flex size-4 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-sm border shadow-sm transition-colors',
              existing
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background/90 text-muted-foreground hover:text-foreground',
            )}
            style={{ left: leftPx }}
          />
        }
      >
        <Blend className="size-2.5" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-60 space-y-3 p-3" data-testid="transition-popover">
        <p className="text-xs font-semibold">Transition</p>
        <div className="grid grid-cols-2 gap-1">
          {SEAM_TRANSITIONS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={type === candidate}
              data-transition-type={candidate}
              className={cn(
                'h-7 rounded-md border px-2 text-left text-2xs transition-colors',
                type === candidate
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border/60 hover:border-primary/60',
              )}
              onClick={() => setType(candidate)}
            >
              {TRANSITION_LABELS[candidate]}
            </button>
          ))}
        </div>
        <SliderField
          label="Duration"
          value={Math.min(maxSec, durationSec)}
          min={0.1}
          max={maxSec}
          step={0.05}
          suffix="s"
          onChange={setDurationSec}
        />
        <div className="flex justify-end gap-1">
          {existing ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => apply('cut')}>
              Remove
            </Button>
          ) : null}
          <Button size="sm" className="h-7 text-xs" onClick={() => apply(type)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
