'use client';

import type {
  EditorProjectV2,
  EditorTrack,
  EditorTransition,
  EditorVideoClip,
} from '@continuum/contracts';
import { Trash2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState, useMemo as useUiConfigMemo } from 'react';
import { Button } from '@/components/ui/button';
import { NumberScrubField } from '@/components/ui/number-field';
import {
  type EditorAssemblyOperation,
  removeTransitionOperation,
  upsertTransitionOperation,
} from '../editorProjectV2AssemblyModel';

function useLocalTransitionOptionsMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: Array<{
      value: 'cut' | Exclude<EditorTransition['transitionType'], 'cut' | 'custom'>;
      label: string;
    }> = [
      { value: 'cut', label: translateConfig('cut_1f45f025') },
      { value: 'crossfade', label: translateConfig('crossfade_d5fe512a') },
      {
        value: 'dip_to_black',
        label: translateConfig('dip_to_black_68514cba'),
      },
      {
        value: 'dip_to_white',
        label: translateConfig('dip_to_white_f37ecc75'),
      },
      { value: 'flash', label: translateConfig('flash_f3577cb5') },
      { value: 'wipe', label: translateConfig('wipe_3404644e') },
      { value: 'slide', label: translateConfig('slide_6bb4c117') },
      { value: 'zoom', label: translateConfig('zoom_509c517e') },
      { value: 'blur', label: translateConfig('blur_cd83e673') },
      { value: 'whip', label: translateConfig('whip_pan_e2ccac87') },
      { value: 'zoom_blur', label: translateConfig('zoom_through_8f81c0ae') },
      { value: 'glitch', label: translateConfig('glitch_14980158') },
    ];
    return value;
  }, [translateConfig]);
}

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
  const translateUi = useUiTranslations('studio');

  if (!videoTrack || clips.length < 2) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
      <h3 className="text-xs font-semibold">{translateUi('transitions_700bb6e8')}</h3>
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
  const TRANSITION_OPTIONS = useLocalTransitionOptionsMessages();

  const translateUi = useUiTranslations('studio');

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
        {from.name ?? translateUi('clip_82337888')} → {to.name ?? translateUi('clip_82337888')}
      </p>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <select
          value={type}
          onChange={(event) =>
            setType(event.currentTarget.value as EditorTransition['transitionType'])
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={translateUi('transition_from_value0_to_value1_b961178e', {
            value0: String(from.name ?? from.id),
            value1: String(to.name ?? to.id),
          })}
        >
          {TRANSITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <NumberScrubField
          label={translateUi('seconds_381a8e96')}
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
            aria-label={translateUi('delete_transition_cdce4e21')}
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
          {' '}
          {translateUi('apply_31e392d1')}{' '}
        </Button>
      </div>
    </div>
  );
}
