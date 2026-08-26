'use client';

import { resolveOrganicAgentLabel } from '@continuum/contracts';
import { Check, Clock, Loader2, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CheckpointState } from './types';

// What the row's status badge cannot say in two words. The three-step ladder is the same
// one PipelineCard's stepper draws, reduced to a line each, plus the diagnostic that until
// now only existed inside a native `title=` nobody hovers long enough to read.

type LadderState = 'done' | 'active' | 'waiting' | 'pending';

const LADDER_ICON: Record<LadderState, typeof Check> = {
  done: Check,
  active: Loader2,
  waiting: Clock,
  pending: Minus,
};

const LADDER_TEXT: Record<LadderState, string> = {
  done: 'text-emerald-600 dark:text-emerald-400',
  active: 'text-amber-600 dark:text-amber-400',
  waiting: 'text-muted-foreground',
  pending: 'text-muted-foreground/50',
};

function ladderFor(checkpoint: CheckpointState): Array<[string, LadderState, string | null]> {
  const copy: LadderState = checkpoint.textReady ? 'done' : 'active';
  const preview: LadderState = !checkpoint.textReady
    ? 'pending'
    : checkpoint.blueprintReady
      ? 'done'
      : 'active';
  const media: LadderState = !checkpoint.blueprintReady
    ? 'pending'
    : checkpoint.awaitingMediaChoice
      ? 'waiting'
      : checkpoint.mediaStatus === 'generating'
        ? 'active'
        : checkpoint.mediaStatus === 'ready' || checkpoint.mediaStatus === 'user_supplied'
          ? 'done'
          : 'pending';

  return [
    ['Copy', copy, null],
    ['Preview', preview, null],
    [
      'Media',
      media,
      media === 'waiting'
        ? 'your choice'
        : checkpoint.mediaStatus === 'user_supplied'
          ? 'yours'
          : null,
    ],
  ];
}

export function StatusDetail({
  agentName,
  stageLabel,
  pct,
  checkpoint,
  diagnostic,
  error,
}: {
  agentName?: string | null;
  stageLabel?: string | null;
  pct?: number | null;
  checkpoint?: CheckpointState | null;
  diagnostic?: string | null;
  error?: string | null;
}) {
  const liveLine = [
    resolveOrganicAgentLabel(agentName),
    stageLabel,
    typeof pct === 'number' ? `${Math.round(pct)}%` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="grid gap-2">
      {liveLine && <p className="text-xs font-medium leading-snug text-foreground">{liveLine}</p>}

      {checkpoint && (
        <ul className="grid gap-1">
          {ladderFor(checkpoint).map(([label, state, note]) => {
            const Icon = LADDER_ICON[state];
            return (
              <li className="flex items-center gap-1.5 text-2xs" key={label}>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    'h-3 w-3 shrink-0',
                    LADDER_TEXT[state],
                    state === 'active' && 'animate-spin',
                  )}
                />
                <span className={LADDER_TEXT[state]}>{label}</span>
                {note && <span className="text-muted-foreground/70">· {note}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-2xs leading-relaxed text-destructive/85 text-pretty">{error}</p>}

      {/* Kept last and quiet: this is the engineer's line, not the marketer's. */}
      {diagnostic && (
        <p className="text-3xs leading-relaxed text-muted-foreground/70 text-pretty">
          {diagnostic}
        </p>
      )}
    </div>
  );
}
