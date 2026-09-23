'use client';

// Asking for a suggestion inside a portfolio, per category, and watching the answer arrive.
//
// Kept beside the cards rather than in useOptimizerData because it is entirely local to the
// portfolio's Activity view — one read, three writes, one poll — and useOptimizerData is the
// file three other workstreams are editing this week.
//
// The floor lives on the server (`optimizer._adhoc_suggestion_gate`): a 90-second cooldown
// and four asks per category per UTC day. The control reads `can_request` off the envelope
// rather than guessing, so it never offers an ask the server will refuse — the same
// discipline the account read's `refresh` block landed.

import {
  ADHOC_SUGGESTION_LIVE_STATUSES,
  type AdhocSuggestionCategory,
  type AdhocSuggestionRow,
  type AdhocSuggestionsEnvelope,
  adhocSuggestionAdoptResultSchema,
  adhocSuggestionGateSchema,
  adhocSuggestionImplementResultSchema,
  adhocSuggestionRowSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type LooseSupabase = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

function getClient(): LooseSupabase {
  return createSupabaseBrowserClient() as unknown as LooseSupabase;
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return 'the request did not go through';
}

export const adhocSuggestionsQueryKey = (portfolioId: string) =>
  ['optimizer', 'adhoc-suggestions', portfolioId] as const;

const EMPTY: AdhocSuggestionsEnvelope = { portfolio_id: '', rows: [], gates: [] };

/** Tolerant on purpose: a row the schema does not recognise is dropped, not thrown. This is
 *  a DB-derived read model, and one malformed plan must not take the whole tab down. */
function parseEnvelope(raw: unknown, portfolioId: string): AdhocSuggestionsEnvelope {
  const source = (raw ?? {}) as { rows?: unknown; gates?: unknown };
  const rows: AdhocSuggestionRow[] = [];
  for (const candidate of Array.isArray(source.rows) ? source.rows : []) {
    const parsed = adhocSuggestionRowSchema.safeParse(candidate);
    if (parsed.success) rows.push(parsed.data);
  }
  const gates = [];
  for (const candidate of Array.isArray(source.gates) ? source.gates : []) {
    const parsed = adhocSuggestionGateSchema.safeParse(candidate);
    if (parsed.success) gates.push(parsed.data);
  }
  return { portfolio_id: portfolioId, rows, gates };
}

const LIVE: ReadonlySet<string> = new Set(ADHOC_SUGGESTION_LIVE_STATUSES);

/**
 * The portfolio's suggestions and, per category, whether asking again is possible.
 *
 * Polls every 3s while a row is still with the worker — the worker claims within two
 * seconds and a flash call answers in a few more, so this is the difference between "then
 * and there" and "reload the page". It stops on its own the moment nothing is in flight.
 */
export function useAdhocSuggestions(portfolioId: string | null) {
  const query = useQuery({
    queryKey: adhocSuggestionsQueryKey(portfolioId ?? 'none'),
    queryFn: async (): Promise<AdhocSuggestionsEnvelope> => {
      const { data, error } = await getClient().rpc('optimizer_get_adhoc_suggestions', {
        p_portfolio_id: portfolioId,
        p_limit: 30,
      });
      if (error) throw new Error(`optimizer_get_adhoc_suggestions: ${errorText(error)}`);
      return parseEnvelope(data, portfolioId as string);
    },
    enabled: Boolean(portfolioId),
    staleTime: 5_000,
    refetchInterval: (current) => {
      const envelope = current.state.data as AdhocSuggestionsEnvelope | undefined;
      return (envelope?.rows ?? []).some((row) => LIVE.has(row.status)) ? 3_000 : false;
    },
  });
  return { ...query, data: query.data ?? { ...EMPTY, portfolio_id: portfolioId ?? '' } };
}

export function useAdhocSuggestionMutations(portfolioId: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: adhocSuggestionsQueryKey(portfolioId ?? 'none'),
      exact: true,
    });
  };

  const ask = useMutation({
    mutationFn: async (category: AdhocSuggestionCategory) => {
      const { data, error } = await getClient().rpc('optimizer_request_adhoc_suggestion', {
        p_portfolio_id: portfolioId,
        p_category: category,
      });
      if (error) throw new Error(`Could not ask for a suggestion: ${errorText(error)}`);
      // The server answers with the gate it just applied, so the control updates from the
      // decision rather than from an optimistic guess.
      return adhocSuggestionGateSchema.partial().parse(data ?? {});
    },
    onSuccess: refresh,
  });

  const adopt = useMutation({
    mutationFn: async (input: { id: string; token: string }) => {
      const { data, error } = await getClient().rpc('optimizer_adopt_adhoc_suggestion', {
        p_id: input.id,
        p_confirm_token: input.token,
      });
      if (error) throw new Error(`Could not take this on: ${errorText(error)}`);
      return adhocSuggestionAdoptResultSchema.parse(data ?? {});
    },
    onSuccess: refresh,
  });

  // Building what the adopted plan described. One RPC, and it opens no write path of its
  // own: it mints the pending recommendation the plan names against the portfolio's latest
  // cycle run and then calls the SAME `optimizer_request_audience_proposal` the audience
  // card has always called. It is idempotent — a second press returns the first handoff
  // with `reused: true` — so a double-tap cannot build twice.
  const implement = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await getClient().rpc('optimizer_implement_adhoc_suggestion', {
        p_id: id,
      });
      if (error) throw new Error(`Could not build this: ${errorText(error)}`);
      return adhocSuggestionImplementResultSchema.parse(data ?? {});
    },
    onSuccess: refresh,
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getClient().rpc('optimizer_dismiss_adhoc_suggestion', { p_id: id });
      if (error) throw new Error(`Could not dismiss this: ${errorText(error)}`);
    },
    onSuccess: refresh,
  });

  return { ask, adopt, implement, dismiss, refresh };
}
