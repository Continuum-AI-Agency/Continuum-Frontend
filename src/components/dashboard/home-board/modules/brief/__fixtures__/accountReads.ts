// optimizer_get_account_read envelopes shaped like production on 2026-11-03 (read-only probe):
// Easy Fit's Meta account carries a model-written narrative, its Google customer the
// deterministic one. The figures inside the narratives are the stored text, not ours.
import type { AccountReadEnvelope } from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';

export const BRIEF_TODAY = new Date('2026-11-03T15:00:00Z');

export const META_ACCOUNT: HomeAdAccount = {
  id: 'act_521903353286118',
  name: 'Easy Fit Meta',
  currency: 'MXN',
  platform: 'meta',
};

export const GOOGLE_ACCOUNT: HomeAdAccount = {
  id: '5251780631',
  name: 'Easy Fit Google',
  currency: 'MXN',
  platform: 'google_ads',
};

export const ORPHAN_ACCOUNT: HomeAdAccount = {
  id: 'act_100200300',
  name: 'Old account',
  currency: 'USD',
  platform: 'meta',
};

export const META_NARRATIVE =
  "The 'Leads // Google Ads only' portfolio has ceased spending, with $2795 MXN of its daily budget going undelivered. One active ad set has been dark for 246 days.";

export const GOOGLE_NARRATIVE =
  'Every check ran and none of them found money worth moving across this account today.';

function envelope(input: {
  day: string;
  readyAt: string;
  narrative: string | null;
  model?: string;
}): AccountReadEnvelope {
  return {
    utc_day: input.day,
    read:
      input.narrative === null
        ? null
        : {
            candidates: [],
            guards: [],
            narrative: input.narrative,
            lead_reason: null,
            justification_if_not_max: null,
            conflicts: [],
            starved: [],
            deck: null,
            assumptions: [],
            ceiling_defaults: {},
            scale_per_day: null,
            currency: 'MXN',
            model: input.model ?? 'deterministic',
          },
    ready_at: input.narrative === null ? null : input.readyAt,
    refresh: null,
  };
}

export const META_READ_TODAY = envelope({
  day: '2026-11-03',
  readyAt: '2026-11-03T00:02:28.879362+00:00',
  narrative: META_NARRATIVE,
  model: 'gemini-2.5-flash',
});

export const GOOGLE_READ_TODAY = envelope({
  day: '2026-11-03',
  readyAt: '2026-11-03T00:02:24.005334+00:00',
  narrative: GOOGLE_NARRATIVE,
});

/** A read the worker stopped writing four days ago: its words stay, dated. */
export const GOOGLE_READ_STALE = envelope({
  day: '2026-10-30',
  readyAt: '2026-10-30T00:02:24.005334+00:00',
  narrative: GOOGLE_NARRATIVE,
});

/** Today's row is queued and nothing was ever composed: no words to show. */
export const QUEUED_FIRST_READ = envelope({
  day: '2026-11-03',
  readyAt: '2026-11-03T00:00:00Z',
  narrative: null,
});

/** A composed read whose narrative came back empty. */
export const EMPTY_NARRATIVE_READ = envelope({
  day: '2026-11-02',
  readyAt: '2026-11-02T00:02:00Z',
  narrative: '   ',
});
