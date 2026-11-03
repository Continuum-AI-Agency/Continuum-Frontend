// The Jaina brief tile (H05): the daily read the Optimizer's worker already wrote for each of the
// brand's ad accounts (optimizer.account_daily_reads, through optimizer_get_account_read), shown
// as stored. No model call happens here. Every read carries its own date, so a brief the worker
// stopped writing days ago can never pass for today's.
//
// Pure: the tile, the expanded module and the weekly story all draw from these entries.
//
// The headline's direct read (data-value = the ISO day of the newest composed read across the
// brand's ad accounts; optimizer_get_account_read picks each account's row the same way):
//   with latest as (
//     select distinct on (ad_account_id) utc_day, ready_at, read
//     from optimizer.account_daily_reads
//     where brand_id = $brand and ad_account_id = any($ad_account_ids)
//       and read is not null and ready_at is not null
//     order by ad_account_id, ready_at desc)
//   select utc_day from latest
//   where nullif(btrim(read ->> 'narrative'), '') is not null
//   order by ready_at desc limit 1;

import type { AccountReadEnvelope } from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { bareAccountId } from '@/lib/paid-media/accountId';

/** One account's read as React Query left it. `data` null = nothing stored for it. */
export type BriefRead = {
  account: HomeAdAccount;
  status: 'pending' | 'error' | 'success';
  data: AccountReadEnvelope | undefined;
};

export type BriefEntry = {
  adAccountId: string;
  accountName: string;
  platform: HomeAdAccount['platform'];
  /** The UTC day the read was composed for (ISO date). */
  day: string;
  /** When the composition shown was written. */
  readyAt: string;
  /** The stored narrative, in the language the worker wrote it. */
  narrative: string;
  daysOld: number;
  stale: boolean;
};

export type BriefView =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'missing' }
  | {
      state: 'ready';
      headline: { day: string; label: string };
      entries: BriefEntry[];
      /** Accounts whose read failed; the rest are still shown. */
      failed: number;
    };

/** A read composed two or more days before today: the worker skipped at least one night. */
const STALE_AFTER_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(day: string, today: Date): number {
  const from = Date.parse(`${day}T00:00:00Z`);
  const to = Date.parse(`${utcDayOf(today)}T00:00:00Z`);
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

function entryOf(read: BriefRead, today: Date): BriefEntry | null {
  const envelope = read.data;
  const narrative = envelope?.read?.narrative?.trim() ?? '';
  const readyAt = envelope?.ready_at ?? null;
  if (!envelope || narrative === '' || !readyAt) return null;
  const day = envelope.utc_day ?? readyAt.slice(0, 10);
  const daysOld = daysBetween(day, today);
  return {
    adAccountId: read.account.id,
    accountName: read.account.name,
    platform: read.account.platform,
    day,
    readyAt,
    narrative: envelope.read?.narrative ?? narrative,
    daysOld,
    stale: daysOld >= STALE_AFTER_DAYS,
  };
}

/** The newest stored read per account (an account listed as act_123 and 123 counts once),
 *  newest first. Accounts with no composed words are left out. */
export function briefEntries(reads: readonly BriefRead[], today: Date): BriefEntry[] {
  const latest = new Map<string, BriefEntry>();
  for (const read of reads) {
    if (read.status !== 'success') continue;
    const entry = entryOf(read, today);
    if (!entry) continue;
    const key = `${entry.platform}:${bareAccountId(entry.adAccountId)}`;
    const current = latest.get(key);
    if (!current || Date.parse(entry.readyAt) > Date.parse(current.readyAt)) {
      latest.set(key, entry);
    }
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.readyAt) - Date.parse(a.readyAt));
}

/** "Read on Nov 2" — the year only when it is not this year. Read in UTC, as the day is. */
export function readOnLabel(entry: Pick<BriefEntry, 'day'>, today: Date): string {
  const date = new Date(`${entry.day}T00:00:00Z`);
  const sameYear = date.getUTCFullYear() === today.getUTCFullYear();
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
  return `Read on ${formatted}`;
}

/** "4 days old" for a stale read; null while it is current. */
export function staleLabel(entry: Pick<BriefEntry, 'stale' | 'daysOld'>): string | null {
  return entry.stale ? `${entry.daysOld} days old` : null;
}

export function briefView(reads: readonly BriefRead[], today: Date): BriefView {
  if (reads.some((read) => read.status === 'pending')) return { state: 'loading' };
  const entries = briefEntries(reads, today);
  const failed = reads.filter((read) => read.status === 'error').length;
  const [latest] = entries;
  if (!latest) return failed > 0 ? { state: 'error' } : { state: 'missing' };
  return {
    state: 'ready',
    headline: { day: latest.day, label: readOnLabel(latest, today) },
    entries,
    failed,
  };
}

export const BRIEF_MISSING =
  'No daily read stored for these accounts yet. Jaina writes one each night for every ad account with an active Optimizer portfolio.';

export const BRIEF_EVIDENCE_NOTE =
  'Numbered evidence that re-runs each figure in this read is not built yet. The cards behind it are in the account’s Optimizer.';

/** The Optimizer (Performance) for one ad account. */
export function optimizerHref(adAccountId: string): string {
  return `/scale?tab=performance&adAccountId=${encodeURIComponent(adAccountId)}`;
}
