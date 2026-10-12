// Escenarios 41–44 (wave 9): delivery and policy, from the platform read to the card. The
// REAL Easy Fit 2026 and Vivo 47 recordings and the DOC_SHAPED TikTok reads go through the
// google_signals / tiktok_signals scopes' own pure mappers (deliverySignals, buildTikTokSignals)
// and then evaluatePlatformSignals — the same chain the Optimizer runs, minus the network.
// Where a recording sits on one side of a rule, the other side is the same read with ONE named
// field changed, and the check label says so.

import {
  PlatformCardSchema,
  type PlatformSignals,
  PlatformSignalsSchema,
} from '@continuum/contracts';
import type { Recorder } from '../../../../Continuum-Backend/scripts/_bench/recorder';
import {
  deliverySignals,
  type GoogleSignalRow,
  SIGNAL_QUERIES,
} from '../../../../supabase/functions/paid-media-metrics/google/signals';
import {
  buildTikTokSignals,
  reviewRowsOf,
} from '../../../../supabase/functions/paid-media-metrics/tiktok/signals';
import {
  evaluatePlatformSignals,
  type PlatformSignalsContext,
  type PlatformSignalsEvaluation,
} from '../../src';
import { loadFixture } from './fixtures';

type Recorded<T> = { _source: { query?: string }; data: T };
type GoogleDelivery = NonNullable<NonNullable<PlatformSignals['google']>['delivery']>;

const squash = (q: string): string => q.replace(/\s+/g, ' ').trim();

function recorded(file: string): Recorded<GoogleSignalRow[]> {
  return loadFixture<GoogleSignalRow[]>(file) as unknown as Recorded<GoogleSignalRow[]>;
}

function windowOf(query: string | undefined): { since: string; until: string } {
  const m = query?.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
  if (!m) throw new Error('recorded daily read has no BETWEEN window');
  return { since: m[1]!, until: m[2]! };
}

/** One Google account's recorded delivery reads → PlatformSignals, through the scope's mapper.
 *  Also says whether the recorder ran the scope's exact statements. */
function googleDelivery(key: 'easyfit2026' | 'vivo47', accountId: string) {
  const campaigns = recorded(`google-${key}-deliveryCampaigns.json`);
  const daily = recorded(`google-${key}-deliveryDaily30d.json`);
  const policy = recorded(`google-${key}-adPolicy.json`);
  const approvals = recorded(`google-${key}-adApprovals.json`);
  const window = windowOf(daily._source.query);
  const skipped: Record<string, number> = {};
  const delivery = deliverySignals(campaigns.data, daily.data, policy.data, window, skipped);
  const signals = PlatformSignalsSchema.parse({
    account_id: accountId,
    currency: 'MXN',
    window,
    google: { search_terms: [], keywords: [], bid_targets: [], asset_groups: [], delivery },
    tiktok: null,
  });
  const sameStatements =
    squash(campaigns._source.query ?? '') === squash(SIGNAL_QUERIES.deliveryCampaigns()) &&
    squash(daily._source.query ?? '') === squash(SIGNAL_QUERIES.deliveryDaily(window)) &&
    squash(policy._source.query ?? '') === squash(SIGNAL_QUERIES.adPolicy());
  return { signals, approvals: approvals.data, skipped, sameStatements };
}

const withDelivery = (signals: PlatformSignals, delivery: GoogleDelivery): PlatformSignals => ({
  ...signals,
  google: { ...signals.google!, delivery },
});

/** The DOC_SHAPED TikTok delivery reads → PlatformSignals, through buildTikTokSignals. */
function tiktokDelivery(): PlatformSignals {
  // biome-ignore lint/suspicious/noExplicitAny: v1.3 envelopes, read field by field
  const data = (file: string): any => (loadFixture(file).data as { data: unknown }).data;
  const groups = loadFixture('tiktok-delivery-adgroup-get.json');
  const window = (groups._source as { window: { since: string; until: string } }).window;
  const { signals } = buildTikTokSignals({
    accountId: '7000000000000000001',
    currency: 'MXN',
    window,
    rows: {
      adGroups: data('tiktok-delivery-adgroup-get.json').list,
      ads: data('tiktok-delivery-ad-get.json').list,
      adDaily: data('tiktok-delivery-report-ad-daily-14d.json').list,
      organic: [],
      reviews: reviewRowsOf(data('tiktok-delivery-review-info.json')),
    },
  });
  return PlatformSignalsSchema.parse(signals);
}

const ctx = (over: Partial<PlatformSignalsContext> = {}): PlatformSignalsContext => ({
  cpaTarget: null,
  now: '2026-10-06T01:00:00Z',
  snapshots: [],
  kpiField: 'leads',
  crossPlatformComparison: false,
  ...over,
});

export function runDeliveryScenarios(rec: Recorder): void {
  const all: PlatformSignalsEvaluation[] = [];
  const evaluate = (signals: PlatformSignals, context = ctx()) => {
    const r = evaluatePlatformSignals(signals, context);
    all.push(r);
    return r;
  };
  const delivery = (r: PlatformSignalsEvaluation, rule: 'G12' | 'T11') =>
    r.recommendations.filter((x) => x.rule === rule);

  // 41 — Easy Fit 2026: the whole account dark, one card
  {
    const ef = googleDelivery('easyfit2026', '5251780631');
    const rows = ef.signals.google!.delivery!;
    rec.check(
      'e41: the recorder ran the google_signals scope’s own three delivery statements (no drift)',
      ef.sameStatements,
    );
    const video = rows.find((c) => c.campaign_id === '20653378244');
    rec.check(
      'e41: REAL read → 7 ENABLED campaigns, 0 days with an impression, 6 SUSPENDED with budget (2,955 MXN/day), the Video ENDED with none',
      rows.length === 7 &&
        rows.filter((c) => c.serving_status === 'SUSPENDED' && (c.budget_per_day ?? 0) > 0)
          .length === 6 &&
        rows.reduce((n, c) => n + (c.budget_per_day ?? 0), 0) === 2955 &&
        video?.primary_status === 'ENDED' &&
        video.budget_per_day === null &&
        video.dark_days === 0,
      rows.map((c) => `${c.campaign_name}: ${c.dark_days}d`).join(', '),
    );
    const r = evaluate(ef.signals);
    const g12 = delivery(r, 'G12');
    const card = g12[0]?.platform_card;
    rec.check(
      'e41: ONE google_delivery_issue, account_wide, read-only — SERVING_STATUS_SUSPENDED + MISSING_LEAD_FORM_EXTENSION, 2,955 MXN/day, dark 8 days (the 28 Sep campaigns; the oldest 30)',
      r.recommendations.length === 1 &&
        g12.length === 1 &&
        g12[0]!.action === null &&
        g12[0]!.severity === 'high' &&
        g12[0]!.subject_key === 'delivery_account' &&
        g12[0]!.entity.id === '20249528111' &&
        card?.variant === 'google_delivery_issue' &&
        card.account_wide &&
        card.budget_per_day === 2955 &&
        card.dark_days === 8 &&
        card.currency === 'MXN' &&
        JSON.stringify(card.reasons) ===
          JSON.stringify(['SERVING_STATUS_SUSPENDED', 'MISSING_LEAD_FORM_EXTENSION']) &&
        g12[0]!.reason.includes('6 campaigns') &&
        g12[0]!.reason.includes('the oldest for 30'),
      g12[0]?.reason,
    );
    const oneServes = evaluate(
      withDelivery(
        ef.signals,
        rows.map((c) =>
          c.campaign_id === '20249528111' ? { ...c, dark_days: 0, serving_status: 'SERVING' } : c,
        ),
      ),
    );
    const perCampaign = delivery(oneServes, 'G12');
    rec.check(
      'e41: the other side — "Campaña búsqueda" serving (one field changed) → no account card: one card per dark campaign (5), each account_wide=false',
      perCampaign.length === 5 &&
        perCampaign.every(
          (x) =>
            x.platform_card.variant === 'google_delivery_issue' &&
            !x.platform_card.account_wide &&
            x.subject_key === 'delivery',
        ) &&
        !perCampaign.some((x) => x.entity.id === '20249528111' || x.entity.id === '20653378244'),
      perCampaign.map((x) => x.entity.name).join(', '),
    );
    const d2 = evaluate(ef.signals, ctx({ d2EntityIds: new Set(rows.map((c) => c.campaign_id)) }));
    rec.check(
      'e41: every dark campaign already carries the D2 card → no G12 card on top, abstained by name',
      d2.recommendations.length === 0 &&
        d2.abstentions.some((a) => a.rule === 'G12' && a.reason.includes('D2')),
    );
  }

  // 42 — Vivo 47: serving, every ad approved
  {
    const v = googleDelivery('vivo47', '3710693645');
    const ekatar = v.signals.google!.delivery![0];
    const approvals = v.approvals as Array<{
      adGroupAd?: { policySummary?: { approvalStatus?: string } };
    }>;
    const refused = approvals.filter((a) =>
      ['DISAPPROVED', 'APPROVED_LIMITED'].includes(
        a.adGroupAd?.policySummary?.approvalStatus ?? '',
      ),
    );
    rec.check(
      'e42: REAL read → VIVO 47-EKATAR ELIGIBLE, SERVING, 1,179 MXN/day, served on the last day; 0 of the recorded ads DISAPPROVED or APPROVED_LIMITED',
      v.sameStatements &&
        ekatar?.campaign_name === 'VIVO 47-EKATAR' &&
        ekatar.serving_status === 'SERVING' &&
        ekatar.budget_per_day === 1179 &&
        ekatar.dark_days === 0 &&
        ekatar.disapproved_ads.length === 0 &&
        approvals.length > 0 &&
        refused.length === 0,
      `${approvals.length} ads in the census`,
    );
    rec.check(
      'e42: serving with every ad approved → no delivery card',
      evaluate(v.signals).recommendations.length === 0,
    );
    const withAd = (approval: string) =>
      withDelivery(v.signals, [
        {
          ...ekatar!,
          disapproved_ads: [
            {
              ad_id: '700000000001',
              approval_status: approval,
              topics: ['DESTINATION_NOT_WORKING'],
            },
          ],
        },
      ]);
    const r = evaluate(withAd('DISAPPROVED'));
    const g12 = delivery(r, 'G12');
    const card = g12[0]?.platform_card;
    rec.check(
      'e42: the other side — one ad DISAPPROVED for DESTINATION_NOT_WORKING (invented) → one medium G12 card on EKATAR quoting Google’s topic',
      g12.length === 1 &&
        g12[0]!.severity === 'medium' &&
        g12[0]!.entity.id === '20775796216' &&
        card?.variant === 'google_delivery_issue' &&
        !card.account_wide &&
        card.disapproved_ads === 1 &&
        card.dark_days === 0 &&
        JSON.stringify(card.reasons) === JSON.stringify(['DESTINATION_NOT_WORKING']),
      g12[0]?.reason,
    );
    rec.check(
      'e42: APPROVED_LIMITED alone (still serving) → no card',
      evaluate(withAd('APPROVED_LIMITED')).recommendations.length === 0,
    );
  }

  // 43, 44 — TikTok (DOC_SHAPED)
  {
    const tt = tiktokDelivery();
    const rows = tt.tiktok!.delivery!;
    const byId = (id: string) => rows.find((g) => g.ad_group_id === id);
    rec.check(
      'e43/e44: tiktok_signals mapping → 206 one refused ad with TikTok’s reason and suggestion; 207 dark 6 days at 300 MXN/day; 208 paused, 0 dark days',
      byId('7000000000000000206')?.rejected_ads.length === 1 &&
        byId('7000000000000000206')?.rejected_ads[0]?.suggestion ===
          'Remove the 30-day before/after promise and show the class itself.' &&
        byId('7000000000000000207')?.dark_days === 6 &&
        byId('7000000000000000207')?.budget_per_day === 300 &&
        byId('7000000000000000208')?.dark_days === 0,
      rows
        .map((g) => `${g.ad_group_name}: ${g.dark_days}d, ${g.rejected_ads.length} refused`)
        .join('; '),
    );
    const r = evaluate(tt);
    const t11 = delivery(r, 'T11');
    const refusal = t11.find((x) => x.entity.id === '7000000000000000206');
    rec.check(
      'e43: the refused ad → T11 medium on "EF | Leads | Retargeting", the reason and the suggestion verbatim, read-only',
      refusal?.severity === 'medium' &&
        refusal.action === null &&
        refusal.platform_card.variant === 'tiktok_delivery_issue' &&
        refusal.platform_card.rejected_ads[0]?.reasons[0] ===
          'Exaggerated or misleading claims about results' &&
        refusal.reason.includes('Remove the 30-day before/after promise'),
      refusal?.reason,
    );
    const dark = t11.find((x) => x.entity.id === '7000000000000000207');
    rec.check(
      'e44: "EF | Leads | Clases nuevas" dark 6 days with budget → T11 high with ADGROUP_STATUS_BALANCE_EXCEED; the paused 208 → none',
      t11.length === 2 &&
        dark?.severity === 'high' &&
        dark.platform_card.variant === 'tiktok_delivery_issue' &&
        dark.platform_card.secondary_status === 'ADGROUP_STATUS_BALANCE_EXCEED' &&
        dark.platform_card.dark_days === 6 &&
        !t11.some((x) => x.entity.id === '7000000000000000208'),
      dark?.reason,
    );
    const d2 = evaluate(tt, ctx({ d2EntityIds: new Set(['7000000000000000207']) }));
    rec.check(
      'e44: the other side — D2 already carries 207 → T11 abstains on it by name; 206 still gets its card',
      delivery(d2, 'T11')
        .map((x) => x.entity.id)
        .join() === '7000000000000000206' &&
        d2.abstentions.some(
          (a) =>
            a.rule === 'T11' && a.entityId === '7000000000000000207' && a.reason.includes('D2'),
        ),
    );
  }

  const problems: string[] = [];
  for (const r of all) {
    const keys = new Set<string>();
    for (const x of r.recommendations) {
      if (!PlatformCardSchema.safeParse(x.platform_card).success) problems.push(`${x.rule} card`);
      if (x.action !== null) problems.push(`${x.rule} writes`);
      if (x.needsApproval !== true) problems.push(`${x.rule} auto`);
      if (x.reason.includes('$')) problems.push(`${x.rule} prints $`);
      const key = `${x.rule}|${x.entity.id}|${x.subject_key}`;
      if (keys.has(key)) problems.push(`duplicate ${key}`);
      keys.add(key);
    }
  }
  rec.check(
    `e41–e44: ${all.length} evaluations — every delivery card passes PlatformCardSchema, none writes, all wait for a person, no "$", (rule, entity, subject) unique`,
    problems.length === 0,
    problems.join('; ') ||
      `${all.reduce((n, r) => n + r.recommendations.length, 0)} findings checked`,
  );
}
