// What the Overnight read (R2) adds to H07: every action with the outcome it really had, and the
// moves held back over the per-cycle cap. Nothing is inferred here: a row says what the read says,
// and a figure the ledger did not record stays out.

import type {
  HomeOvernightActor,
  HomeOvernightCapItem,
  HomeOvernightCounts,
  HomeOvernightEntry,
  HomeOvernightOutcome,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { minorToMajor } from '@/components/paid-media/optimizer/sections/actionRows';
import type { ActionOutcome, OvernightRow } from './overnightModel';

const OUTCOMES: Record<HomeOvernightOutcome, ActionOutcome> = {
  applied: { kind: 'applied', label: 'Applied' },
  failed: { kind: 'failed', label: 'Failed' },
  paused: { kind: 'recorded', label: 'Paused' },
  created_paused: { kind: 'recorded', label: 'Created paused' },
  pending_approval: { kind: 'waiting', label: 'Waiting for approval' },
  queued: { kind: 'waiting', label: 'Approved, waiting to write' },
  undone: { kind: 'recorded', label: 'Undone' },
  skipped: { kind: 'recorded', label: 'Skipped' },
};

const ACTORS: Record<HomeOvernightActor, string> = {
  autopilot: 'Autopilot',
  human: 'A person',
  optimizer: 'Optimizer proposal',
  bench: 'Live test',
};

function nameOf(entry: HomeOvernightEntry): string {
  return entry.entityName ?? entry.portfolioName ?? entry.title;
}

function changeLine(entry: HomeOvernightEntry): string {
  const name = nameOf(entry);
  const { change } = entry;
  if (!change) return name;
  if (change.fromStatus || change.toStatus) {
    return `${name}: ${change.fromStatus ?? '—'} → ${change.toStatus ?? '—'}`;
  }
  const { currency, fromMinor, toMinor } = change;
  if (!currency || fromMinor === null || toMinor === null) return name;
  const money = (minor: number) => formatCurrency(minorToMajor(minor, currency), currency);
  return `${name}: ${money(fromMinor)} → ${money(toMinor)}`;
}

export function overnightRowsOfRead(entries: readonly HomeOvernightEntry[]): OvernightRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    ts: entry.at,
    portfolioName: entry.entityName ? entry.portfolioName : null,
    change: changeLine(entry),
    why: entry.outcomeReason ?? entry.justification,
    actor: entry.actor ? ACTORS[entry.actor] : 'Not recorded',
    outcome: OUTCOMES[entry.outcome],
  }));
}

const COUNT_WORDS: [keyof HomeOvernightCounts, string][] = [
  ['applied', 'applied'],
  ['paused', 'paused'],
  ['createdPaused', 'created paused'],
  ['failed', 'failed'],
  ['pendingApproval', 'waiting for approval'],
  ['queued', 'waiting to write'],
  ['undone', 'undone'],
  ['skipped', 'skipped'],
  ['skippedByCap', 'skipped by cap'],
];

/** "5 applied · 1 failed · 3 skipped by cap": only what happened. */
export function overnightCountsLine(counts: HomeOvernightCounts): string {
  return COUNT_WORDS.filter(([key]) => counts[key] > 0)
    .map(([key, words]) => `${counts[key]} ${words}`)
    .join(' · ');
}

/** "Retargeting: +60%", or only the name when the cycle did not size the move. */
export function capItemLine(item: HomeOvernightCapItem): string {
  const name = item.entityName ?? item.entityId;
  if (item.changePct === null) return name;
  const pct = Math.round(item.changePct * 100);
  return `${name}: ${pct > 0 ? '+' : ''}${pct}%`;
}
