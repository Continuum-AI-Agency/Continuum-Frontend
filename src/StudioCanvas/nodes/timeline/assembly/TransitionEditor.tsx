'use client';

import type {
  EditorProjectV2,
  EditorTrack,
  EditorTransition,
  EditorVideoClip,
} from '@continuum/contracts';
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import {
  type EditorAssemblyOperation,
  removeTransitionOperation,
  upsertTransitionOperation,
} from '../editorProjectV2AssemblyModel';

const TRANSITION_OPTIONS: Array<{
  value: 'cut' | Exclude<EditorTransition['transitionType'], 'cut' | 'blur' | 'custom'>;
  label: string;
}> = [
  { value: 'cut', label: 'Cut' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'dip_to_black', label: 'Dip to black' },
  { value: 'dip_to_white', label: 'Dip to white' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
];

export function TransitionEditor({
  project,
  videoTrack,
  clips,
  onApply,
}: {
  project: EditorProjectV2;
  videoTrack?: Extract<EditorTrack, { kind: 'video' }>;
  clips: EditorVideoClip[];
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  if (!videoTrack || clips.length < 2) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <h3 className="text-xs font-semibold">Transitions</h3>
      {clips.slice(1).map((to, index) => {
        const from = clips[index];
        const transition = project.transitions.find(
          (candidate) =>
            candidate.trackId === videoTrack.id &&
            candidate.fromClipId === from.id &&
            candidate.toClipId === to.id,
        );
        return (
          <TransitionRow
            key={`${from.id}:${to.id}`}
            project={project}
            trackId={videoTrack.id}
            from={from}
            to={to}
            transition={transition}
            onApply={onApply}
          />
        );
      })}
    </section>
  );
}

function TransitionRow({
  project,
  trackId,
  from,
  to,
  transition,
  onApply,
}: {
  project: EditorProjectV2;
  trackId: string;
  from: EditorVideoClip;
  to: EditorVideoClip;
  transition?: EditorTransition;
  onApply: (operation: EditorAssemblyOperation) => void;
}) {
  const [type, setType] = useState<EditorTransition['transitionType']>(
    transition?.transitionType ?? 'cut',
  );
  const [duration, setDuration] = useState(transition?.durationSec ?? 0.6);
  useEffect(() => {
    setType(transition?.transitionType ?? 'cut');
    setDuration(transition?.durationSec ?? 0.6);
  }, [transition]);
  return (
    <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
      <p className="truncate text-3xs text-muted-foreground">
        {from.name ?? 'Clip'} → {to.name ?? 'Clip'}
      </p>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <select
          value={type}
          onChange={(event) =>
            setType(event.currentTarget.value as EditorTransition['transitionType'])
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={`Transition from ${from.name ?? from.id} to ${to.name ?? to.id}`}
        >
          {TRANSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <NumberScrubField
          label="Seconds"
          value={duration}
          min={0.1}
          step={0.1}
          onChange={setDuration}
        />
      </div>
      <div className="flex justify-end gap-1">
        {transition ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onApply(removeTransitionOperation(project, transition.id))}
            aria-label="Delete transition"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            if (type === 'cut') {
              if (transition) onApply(removeTransitionOperation(project, transition.id));
              return;
            }
            onApply(
              upsertTransitionOperation(project, {
                transitionId: transition?.id,
                trackId,
                fromClipId: from.id,
                toClipId: to.id,
                transitionType: type,
                durationSec: duration,
              }),
            );
          }}
          disabled={type === 'cut' && !transition}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
