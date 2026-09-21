'use client';

// Resolving a cited optimizer card against the read it names.
//
// A citation carries THREE STRINGS and no figures. Everything numeric on screen has to come
// from somewhere, and the only honest somewhere is the stored read whose id the citation
// carries — not live data, and not the model.
//
// WHY THIS FETCH IS NOT `useOptimizerAccountRead`. The dashboard's envelope drops the read's
// `id`, because the dashboard only ever wants "today's". A citation wants THAT one. Without the
// id there is no way to tell "this answer quotes the read still on screen" from "this answer is
// three days old" — and rendering the second as if it were the first is the worst thing a cited
// chart can do: last week's sentence over today's numbers, with nothing saying so.
//
// WHAT HAPPENS WHEN THE IDS DISAGREE is therefore deliberate, not a shortcut: every candidate
// resolves to null and the card renders its "cleared" line with no date claimed. The RPC only
// serves the LATEST ready read per ad account, so a citation naming an older one cannot be
// resolved at all from here — and saying "these figures are from the read it cites" is true,
// where drawing today's numbers under that sentence would not be.

import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * As much of `optimizer_get_account_read` as a citation needs, `id` included.
 *
 * Tolerant like every other read of this row: the worker that writes it moves ahead of the
 * client, and a candidate that no longer parses must drop out of the resolvable set rather than
 * blank the whole read. A blanked read renders as "everything cleared", which is a lie about
 * the account rather than about the fetch.
 */
const citedReadSchema = z
  .object({
    id: z.string().min(1),
    utc_day: z.string().nullable().catch(null),
    read: z
      .object({
        candidates: z.array(accountCandidateSchema).catch([]),
        guards: z.array(accountCandidateSchema).catch([]),
        currency: z.string().nullable().catch(null),
      })
      .nullable()
      .catch(null),
  })
  .nullable();

export type CitedRead = NonNullable<z.infer<typeof citedReadSchema>>;

/** What a citation renders from. `resolve` answers null for anything the read does not hold. */
export type CitedReadResolution = {
  resolve: (candidateId: string) => AccountCandidate | null;
  /** The day the cited read was taken, formatted short. Null when nothing was resolved. */
  readDate: string | null;
  currency: string | null;
};

const NOTHING_RESOLVES: CitedReadResolution = {
  resolve: () => null,
  readDate: null,
  currency: null,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * '2026-09-20' → '20 Sep'. The footer wants a day, not a timestamp.
 *
 * Built rather than localised: the row's `utc_day` is a calendar day the worker chose, and
 * `toLocaleDateString` would re-interpret it per reader — two people quoting the same read
 * seeing different days is a provenance line that has stopped being provenance.
 */
function shortDay(utcDay: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(utcDay ?? '');
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : null;
}

/**
 * The decision, with no fetch in it: does this read answer THIS citation, and if so what does
 * each named candidate resolve to.
 *
 * Separated from the hook because it is the part that can be wrong. A read whose id does not
 * match resolves NOTHING and claims NO date — every candidate renders "cleared", which is true
 * (these are not the figures it cites) where drawing today's numbers would not be.
 */
export function resolutionFrom(read: CitedRead | null, readId: string | null): CitedReadResolution {
  if (!read || !readId || read.id !== readId || !read.read) return NOTHING_RESOLVES;

  const byId = new Map<string, AccountCandidate>();
  for (const candidate of [...read.read.candidates, ...read.read.guards]) {
    byId.set(candidate.id, candidate);
  }

  return {
    resolve: (candidateId: string) => byId.get(candidateId) ?? null,
    readDate: shortDay(read.utc_day),
    currency: read.read.currency,
  };
}

type CitedReadClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** The read, given a client. Exported so a test can drive the failure paths. */
export async function fetchCitedReadForTest(
  client: CitedReadClient,
  brandId: string,
  adAccountId: string,
): Promise<CitedRead | null> {
  return readThrough(client, brandId, adAccountId);
}

async function fetchCitedRead(brandId: string, adAccountId: string): Promise<CitedRead | null> {
  return readThrough(
    createSupabaseBrowserClient() as unknown as CitedReadClient,
    brandId,
    adAccountId,
  );
}

async function readThrough(
  client: CitedReadClient,
  brandId: string,
  adAccountId: string,
): Promise<CitedRead | null> {
  const { data, error } = await client.rpc('optimizer_get_account_read', {
    p_brand_id: brandId,
    p_ad_account_id: adAccountId,
  });
  // The reason travels. An RLS denial, a function that is not deployed and a dropped network
  // are one sentence otherwise — and a citation that cannot be resolved renders as
  // "this one cleared", which tells the reader the finding was FIXED. That is not a missing
  // answer, it is a wrong one, so the cause has to survive the throw.
  if (error) {
    const detail = error as { message?: string; code?: string; details?: string };
    const named = [detail.code, detail.message, detail.details].filter(Boolean).join(' · ');
    throw new Error(`optimizer_get_account_read unreachable${named ? `: ${named}` : ''}`, {
      cause: error,
    });
  }
  // A top-level `.catch(null)` here would turn a CONTRACT break — the read arriving in a
  // shape this build cannot read — into the same confident "this one cleared". The nested
  // catches already keep a partially-moved row renderable; a whole row that does not parse
  // is a defect, and it belongs in the query's error state where it can be seen.
  return citedReadSchema.parse(data ?? null);
}

/**
 * The stored read behind `readId`, as a resolver the card can call per candidate.
 *
 * Shares React Query's cache key shape with nothing else on purpose: this read keeps a field
 * the dashboard's copy drops, so folding them onto one key would let whichever mounted first
 * decide whether the id is there.
 */
export function useCitedOptimizerRead(
  scope: { brandId: string; adAccountId: string | null } | null,
  readId: string | null,
): CitedReadResolution {
  const brandId = scope?.brandId ?? '';
  const adAccountId = scope?.adAccountId ?? null;

  const { data } = useQuery({
    queryKey: ['jaina', 'optimizer-cited-read', brandId, adAccountId ?? 'none'],
    queryFn: () => fetchCitedRead(brandId, adAccountId as string),
    enabled: Boolean(brandId && adAccountId && readId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return resolutionFrom(data ?? null, readId);
}
