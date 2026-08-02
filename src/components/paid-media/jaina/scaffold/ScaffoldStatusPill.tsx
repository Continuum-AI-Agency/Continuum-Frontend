'use client';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { ScaffoldNodeStatus } from '@/lib/paid-media/scaffoldTree';

type Tone = 'success' | 'error' | 'warning' | 'info';

/**
 * Eight database statuses onto four tones and their plain-English labels.
 *
 * `indeterminate` is deliberately WARNING and not error: it does not mean the node
 * failed, it means an object may exist on Meta that we could not record — which a
 * blind retry would duplicate. Colouring it the same as a failure would invite
 * exactly the retry that causes the damage.
 */
const STATUS_PRESENTATION: Record<
  ScaffoldNodeStatus,
  { tone: Tone; label: string; pulse: boolean; hint?: string }
> = {
  pending: { tone: 'info', label: 'Not created', pulse: false },
  creating: { tone: 'info', label: 'Creating', pulse: true },
  created: { tone: 'success', label: 'Created (paused)', pulse: false },
  activating: { tone: 'info', label: 'Activating', pulse: true },
  active: { tone: 'success', label: 'Active', pulse: false },
  failed_retryable: { tone: 'error', label: 'Failed', pulse: false },
  failed_terminal: { tone: 'error', label: 'Failed', pulse: false },
  indeterminate: {
    tone: 'warning',
    label: 'Unconfirmed',
    pulse: false,
    hint: 'This may exist on Meta without a recorded id. A human must read the ad account before anything is retried — a retry would create duplicates.',
  },
};

export function ScaffoldStatusPill({ status }: { status: ScaffoldNodeStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  return (
    <Pill
      className="gap-1.5 whitespace-nowrap"
      {...(presentation.hint ? { title: presentation.hint } : {})}
    >
      <PillIndicator variant={presentation.tone} pulse={presentation.pulse} />
      {presentation.label}
    </Pill>
  );
}

export const scaffoldStatusLabel = (status: ScaffoldNodeStatus): string =>
  STATUS_PRESENTATION[status].label;
