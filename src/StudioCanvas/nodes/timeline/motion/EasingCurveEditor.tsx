'use client';

import {
  cubicBezierProgress,
  type EditorKeyframe,
  MOTION_BEZIER_PRESETS,
  MOTION_SPRING_PRESETS,
  springProgress,
} from '@continuum/contracts';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

type EasingChoice =
  | { interpolation: 'linear' }
  | { interpolation: 'hold' }
  | { interpolation: 'bezier'; easing: { x1: number; y1: number; x2: number; y2: number } }
  | { interpolation: 'spring'; spring: { bounce: number } };

const PRESETS: Array<{ id: string; label: string; choice: EasingChoice }> = [
  { id: 'linear', label: 'Linear', choice: { interpolation: 'linear' } },
  { id: 'hold', label: 'Hold', choice: { interpolation: 'hold' } },
  {
    id: 'easeOut',
    label: 'Ease out',
    choice: { interpolation: 'bezier', easing: MOTION_BEZIER_PRESETS.easeOut },
  },
  {
    id: 'easeOutBack',
    label: 'Back',
    choice: { interpolation: 'bezier', easing: MOTION_BEZIER_PRESETS.easeOutBack },
  },
  {
    id: 'spring',
    label: 'Spring',
    choice: { interpolation: 'spring', spring: { bounce: MOTION_SPRING_PRESETS.gentle } },
  },
];

function pathFor(choice: EasingChoice): string {
  const points: string[] = [];
  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24;
    const y =
      choice.interpolation === 'hold'
        ? t === 0
          ? 0
          : 1
        : choice.interpolation === 'bezier'
          ? cubicBezierProgress(t, choice.easing)
          : choice.interpolation === 'spring'
            ? springProgress(t, choice.spring.bounce)
            : t;
    const x = 8 + t * 124;
    const py = 80 - Math.max(-0.2, Math.min(1.2, y)) * 64;
    points.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${py.toFixed(1)}`);
  }
  return points.join(' ');
}

export function easingChoiceFromKeyframe(keyframe: EditorKeyframe): EasingChoice {
  if (keyframe.interpolation === 'hold') return { interpolation: 'hold' };
  if (keyframe.interpolation === 'bezier' && keyframe.easing) {
    return { interpolation: 'bezier', easing: keyframe.easing };
  }
  if (keyframe.interpolation === 'spring' && keyframe.spring) {
    return { interpolation: 'spring', spring: keyframe.spring };
  }
  return { interpolation: 'linear' };
}

export function EasingCurveEditor({
  keyframe,
  onChange,
}: {
  keyframe: EditorKeyframe;
  onChange: (
    patch: Pick<EditorKeyframe, 'interpolation' | 'easing' | 'spring' | 'expression'>,
  ) => void;
}) {
  const current = easingChoiceFromKeyframe(keyframe);
  const d = useMemo(() => pathFor(current), [current]);
  return (
    <div className="w-[10.5rem] space-y-2 rounded-lg border border-border/60 bg-card p-2 shadow-sm">
      <svg
        viewBox="0 0 140 88"
        className="h-[5.5rem] w-full text-primary"
        role="img"
        aria-label="Easing curve"
      >
        <title>Easing curve</title>
        <rect x="8" y="8" width="124" height="72" className="fill-muted/40 stroke-border" rx="4" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" />
      </svg>
      <div className="grid grid-cols-2 gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={cn(
              'h-6 rounded-md px-1.5 text-2xs active:scale-[0.96]',
              (preset.choice.interpolation === current.interpolation &&
                preset.choice.interpolation !== 'bezier') ||
                (preset.id === 'easeOutBack' &&
                  current.interpolation === 'bezier' &&
                  current.easing.y1 > 1) ||
                (preset.id === 'easeOut' &&
                  current.interpolation === 'bezier' &&
                  current.easing.y1 <= 1)
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-muted',
            )}
            onClick={() => {
              if (preset.choice.interpolation === 'bezier') {
                onChange({
                  interpolation: 'bezier',
                  easing: preset.choice.easing,
                  spring: undefined,
                });
                return;
              }
              if (preset.choice.interpolation === 'spring') {
                onChange({
                  interpolation: 'spring',
                  spring: preset.choice.spring,
                  easing: undefined,
                });
                return;
              }
              onChange({
                interpolation: preset.choice.interpolation,
                easing: undefined,
                spring: undefined,
              });
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {current.interpolation === 'spring' ? (
        <label className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
          Bounce
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="w-20"
            value={current.spring.bounce}
            onChange={(event) =>
              onChange({
                interpolation: 'spring',
                spring: { bounce: Number(event.target.value) },
                easing: undefined,
              })
            }
          />
        </label>
      ) : null}
      <label className="block text-2xs text-muted-foreground">
        Expression
        <input
          aria-label="Motion expression"
          className="mt-1 h-6 w-full rounded-md border border-input bg-background px-1.5 font-mono text-2xs"
          placeholder="loop or wiggle(2, 0.1)"
          value={keyframe.expression ?? ''}
          onChange={(event) =>
            onChange({
              interpolation: keyframe.interpolation,
              easing: keyframe.easing,
              spring: keyframe.spring,
              expression: event.target.value.trim() || undefined,
            })
          }
        />
      </label>
    </div>
  );
}
