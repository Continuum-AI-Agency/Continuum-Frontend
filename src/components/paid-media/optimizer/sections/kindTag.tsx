// The coloured word that says what kind of action a row is — "Budget", "Pause", "Creative" —
// in place of an emoji glyph or a bordered pill. One map, so the Actions tray and the
// portfolio's daily read colour the same kind the same way.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import * as typeScale from '../typeScale';

export type KindTone = 'budget' | 'pause' | 'creative' | 'audience' | 'delivery' | 'neutral';

const TONE_CLASS: Record<KindTone, string> = {
  budget: 'text-sky-700 dark:text-sky-300',
  pause: 'text-amber-700 dark:text-amber-400',
  creative: 'text-teal-700 dark:text-teal-300',
  audience: 'text-emerald-700 dark:text-emerald-300',
  delivery: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const KIND_TONE: Record<string, KindTone> = {
  pause: 'pause',
  pause_ad: 'pause',
  creative_refresh: 'creative',
  variate_creative: 'creative',
  seed_experiment: 'creative',
  audience_expand: 'audience',
  restore_delivery: 'delivery',
};

const KIND_WORD: Record<KindTone, string> = {
  budget: 'Budget',
  pause: 'Pause',
  creative: 'Creative',
  audience: 'Audience',
  delivery: 'Delivery',
  neutral: 'Setting',
};

/** The tone of a recommendation kind; a kind this map does not know reads neutral. */
export function kindTone(kind: string): KindTone {
  return KIND_TONE[kind] ?? 'neutral';
}

/** The tag's word for a recommendation kind ("Creative" for every creative-level kind). */
export function kindWord(kind: string): string {
  return KIND_WORD[kindTone(kind)];
}

export function KindTag({
  tone,
  children,
  className,
}: {
  tone: KindTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(typeScale.label, 'shrink-0 font-semibold', TONE_CLASS[tone], className)}
      data-kind-tone={tone}
    >
      {children}
    </span>
  );
}
