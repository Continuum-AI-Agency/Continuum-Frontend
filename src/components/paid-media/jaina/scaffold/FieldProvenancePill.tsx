'use client';

import type { FieldProvenance } from '@continuum/contracts';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';

/**
 * Who supplied ONE field's value: the person, Jaina, or nobody yet (Jaina asks for it).
 *
 * Not the canvas's `NodeProvenance`, which is the approval state of a whole node (which
 * record it is, which gate stands in front of it). This is a per-field label, presentation
 * only — it never enters the content hash, so relabelling a field never moves an approval.
 * The caller passes the label `effectiveFieldProvenance` resolved, so a stored 'jaina_asks'
 * that has since been answered is never shown as an open question.
 */
const PRESENTATION: Record<
  FieldProvenance,
  { label: string; tone: 'success' | 'info' | 'warning'; hint: string }
> = {
  user_gave: {
    label: 'You gave this',
    tone: 'success',
    hint: 'You set this — in the chat or on the canvas.',
  },
  jaina_filled: {
    label: 'Jaina filled this',
    tone: 'info',
    hint: 'Jaina chose this from the account’s data. Change it on the canvas if it is wrong.',
  },
  jaina_asks: {
    label: 'Jaina asks',
    tone: 'warning',
    hint: 'Nobody has set this yet. Tell Jaina, or set it on the canvas.',
  },
};

export function FieldProvenancePill({ provenance }: { provenance: FieldProvenance }) {
  const { label, tone, hint } = PRESENTATION[provenance];
  return (
    <Pill
      className="shrink-0 whitespace-nowrap"
      title={hint}
      data-testid="field-provenance-pill"
      data-provenance={provenance}
    >
      <PillIndicator variant={tone} />
      {label}
    </Pill>
  );
}
