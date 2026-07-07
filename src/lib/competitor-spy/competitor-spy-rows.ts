// Pure derivations for the dashboard Competitor Spy tables. Kept hook-free so
// the status/recency logic is unit testable without React or the network.

import { formatRelativeTime } from '@/lib/time/relativeTime';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdStatusTone = 'new' | 'active' | 'paused';

export function isRecentlyIdentified(firstSeenAt: string, now: number, windowDays = 7): boolean {
  const seen = Date.parse(firstSeenAt);
  if (Number.isNaN(seen)) return false;
  const age = now - seen;
  return age >= 0 && age <= windowDays * DAY_MS;
}

// A competitor ad is "New" when it was first seen within the recency window,
// "Paused" when delivery has stopped, otherwise "Active".
export function adStatusBadge(
  status: 'active' | 'paused',
  firstSeenAt: string,
  now: number,
): { label: string; tone: AdStatusTone } {
  if (status === 'paused') return { label: 'Paused', tone: 'paused' };
  if (isRecentlyIdentified(firstSeenAt, now)) return { label: 'New', tone: 'new' };
  return { label: 'Active', tone: 'active' };
}

export function formatRelativeDay(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return formatRelativeTime(time, now);
}
