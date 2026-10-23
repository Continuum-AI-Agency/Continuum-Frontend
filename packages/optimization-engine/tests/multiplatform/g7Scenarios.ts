// Escenarios 45–49 (G7): Google's own creative and fatigue rules — G09/G10 over ads, G18 over
// PMax assets, G23 over weekly frequency — from the REAL recordings through the google_signals
// scope's own mappers and evaluatePlatformSignals; and G5's two follow-ups (a graced campaign
// with no active peer, the underflow relaxation) on b9cebbcf's REAL 14 days through
// classifyPortfolio and reallocate. Where a recording sits on one side of a rule, the other
// side is the same read with named fields changed, and the check label says so.

import {
  type MultiPlatformSnapshot,
  type PlatformSignals,
  PlatformSignalsSchema,
} from '@continuum/contracts';
import type { Recorder } from '../../../../Continuum-Backend/scripts/_bench/recorder';
import {
  adSignals,
  audienceSignals,
  type GoogleSignalRow,
  pmaxAssetSignals,
  SIGNAL_QUERIES,
} from '../../../../supabase/functions/paid-media-metrics/google/signals';
import * as engine from '../../src';
import type { PlatformSignalsContext, PlatformSignalsEvaluation } from '../../src';
import { loadFixture } from './fixtures';
import { g7EasyFitCampaigns, tangassiSnapshots, vivo47Snapshots } from './signalFixtures';
import { wellFormed } from './signalScenarios';

type Recorded = { _source: { query?: string }; data: GoogleSignalRow[] };
type Prefix = 'vivo47' | 'easyfit2026' | 'tangassi';
type Google = NonNullable<PlatformSignals['google']>;

const ACCOUNT: Record<Prefix, string> = {
  vivo47: '3710693645',
  easyfit2026: '5251780631',
  tangassi: '9343596627',
};
/** What the google_signals scope reads for G7 on each recorded account. */
const READS: Record<Prefix, readonly ('ads' | 'assets' | 'audience')[]> = {
  vivo47: ['ads', 'audience'],
  easyfit2026: ['ads', 'assets', 'audience'],
  tangassi: ['assets'],
};
const EKATAR = '20775796216';
const B9_SEARCH = '24321097869';
const B9_PMAX = '24321868026';

const read = (file: string) => loadFixture<GoogleSignalRow[]>(file) as unknown as Recorded;
const squash = (q: string | undefined): string => (q ?? '').replace(/\s+/g, ' ').trim();
const near = (a: number, b: number, eps = 0.01): boolean => Math.abs(a - b) <= eps;
const MXN = (amount: number) => ({ amount, currency: 'MXN' });

function windowOf(query: string | undefined): { since: string; until: string } {
  const m = query?.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
  if (!m) throw new Error('recorded read has no BETWEEN window');
  return { since: m[1]!, until: m[2]! };
}

/** One account's recorded G7 reads → PlatformSignals through the scope's mappers, and whether
 *  the recorder ran the scope's exact statements. */
function g7Signals(prefix: Prefix) {
  const reads = READS[prefix];
  const skipped: Record<string, number> = {};
  const google: Partial<Google> = { search_terms: [], keywords: [], bid_targets: [], asset_groups: [] };
  const same: boolean[] = [];
  let window: { since: string; until: string } | null = null;
  if (reads.includes('ads')) {
    const catalog = read(`google-${prefix}-adCatalog.json`);
    const metrics = read(`google-${prefix}-adMetrics30d.json`);
    window = windowOf(metrics._source.query);
    google.ads = adSignals(catalog.data, metrics.data, skipped);
    same.push(
      squash(catalog._source.query) === squash(SIGNAL_QUERIES.adCatalog()),
      squash(metrics._source.query) === squash(SIGNAL_QUERIES.adMetrics(window)),
    );
  }
  if (reads.includes('assets')) {
    const assets = read(`google-${prefix}-pmaxAssets30d.json`);
    window = windowOf(assets._source.query);
    google.pmax_assets = pmaxAssetSignals(assets.data, skipped);
    same.push(squash(assets._source.query) === squash(SIGNAL_QUERIES.pmaxAssets(window)));
  }
  if (reads.includes('audience')) {
    const audience = read(`google-${prefix}-audience7d.json`);
    google.audience = audienceSignals(audience.data, skipped);
    same.push(
      squash(audience._source.query) ===
        squash(SIGNAL_QUERIES.audience(windowOf(audience._source.query))),
    );
  }
  const signals = PlatformSignalsSchema.parse({
    account_id: ACCOUNT[prefix],
    currency: 'MXN',
    window,
    google,
    tiktok: null,
  });
  return { signals, google: signals.google!, sameStatements: same.every(Boolean), skipped };
}

const withGoogle = (signals: PlatformSignals, g: Partial<Google>): PlatformSignals => ({
  ...signals,
  google: { ...signals.google!, ...g },
});

export function runG7Scenarios(rec: Recorder): void {
  const all: PlatformSignalsEvaluation[] = [];
  const evaluate = (signals: PlatformSignals, context: PlatformSignalsContext) => {
    const r = engine.evaluatePlatformSignals(PlatformSignalsSchema.parse(signals), context);
    all.push(r);
    return r;
  };
  const ctx = (
    snapshots: MultiPlatformSnapshot[],
    target: number | null,
  ): PlatformSignalsContext => ({
    cpaTarget: target === null ? null : MXN(target),
    now: '2026-10-20T06:00:00Z',
    snapshots,
    kpiField: 'leads',
    crossPlatformComparison: false,
  });
  const ofRule = (r: PlatformSignalsEvaluation, rule: string) =>
    r.recommendations.filter((x) => x.rule === rule);

  const vivo = g7Signals('vivo47');
  const easyFit = g7Signals('easyfit2026');
  const tangassi = g7Signals('tangassi');
  const vivoSnaps = vivo47Snapshots();
  const easyFitToday = g7EasyFitCampaigns('2026-10-20');
  const easyFitSnaps = easyFitToday.map((c) => c.snapshot);
  rec.check(
    'e45–e47: the recorder ran the google_signals scope’s own G7 statements (ads, assets, frequency) on all three accounts',
    vivo.sameStatements && easyFit.sameStatements && tangassi.sameStatements,
    `window ${vivo.signals.window.since}…${vivo.signals.window.until}`,
  );

  // -------------------------------------------------------------------------
  // 45 — G09/G10: one enabled ad per group today; the other side moves one ad
  // -------------------------------------------------------------------------
  {
    const ads = vivo.google.ads ?? [];
    const enabled = ads.filter((a) => a.status === 'ENABLED');
    const groups = new Set(ads.map((a) => a.ad_group_id));
    const realVivo = evaluate(vivo.signals, ctx(vivoSnaps, 900));
    const realEasyFit = evaluate(easyFit.signals, ctx(easyFitSnaps, 99));
    const creative = (r: PlatformSignalsEvaluation) =>
      [...ofRule(r, 'G09'), ...ofRule(r, 'G10')].length;
    rec.check(
      'e45: REAL reads → Vivo 47: 4 ads in 4 ad groups, 2 ENABLED, one per group; Easy Fit 2026: 1 ad → no G09, no G10 (nothing to compare)',
      ads.length === 4 &&
        groups.size === 4 &&
        enabled.length === 2 &&
        new Set(enabled.map((a) => a.ad_group_id)).size === 2 &&
        (easyFit.google.ads ?? []).length === 1 &&
        creative(realVivo) === 0 &&
        creative(realEasyFit) === 0,
      enabled.map((a) => `"${a.label}" ${a.totals.spend.toFixed(2)}/${a.totals.conversions.toFixed(1)}`).join(', '),
    );

    const moved = withGoogle(vivo.signals, {
      ads: ads.map((a) =>
        a.ad_id === '680706855496'
          ? { ...a, ad_group_id: '155765678139', ad_group_name: 'Vivo 47' }
          : a,
      ),
    });
    const r = evaluate(moved, ctx(vivoSnaps, 900));
    const g09 = ofRule(r, 'G09');
    const card = g09[0]?.platform_card;
    const action = g09[0]?.action;
    rec.check(
      'e45: the other side — "Gimnasio con alberca" moved into the group "Vivo 47" (its group id and name) → G09: pause "Gimnasio Familiar", 88% of the spend at 27.93 MXN per conversion, 3.02× the best; active→paused on 155765678139~680665389502, 1 ad left',
      g09.length === 1 &&
        card?.variant === 'google_ad_drag' &&
        card.ad_label === 'Gimnasio Familiar' &&
        near(card.spend_share, 0.88) &&
        near(card.cost_per_result ?? 0, 27.93) &&
        card.winner?.label === 'Gimnasio con alberca' &&
        card.ads_remaining === 1 &&
        action?.kind === 'set_status' &&
        action.ref.id === '155765678139~680665389502' &&
        action.expected === 'active' &&
        action.target === 'paused',
      g09[0]?.reason,
    );
    const g10 = ofRule(r, 'G10');
    const win = g10[0]?.platform_card;
    rec.check(
      'e45: … and G10 names "Gimnasio con alberca" (9.24 MXN on 441.1 conversions) as the winner to vary, against 27.93 — read-only',
      g10.length === 1 &&
        win?.variant === 'google_ad_winner' &&
        win.winner.label === 'Gimnasio con alberca' &&
        near(win.winner.cost_per_result, 9.24) &&
        win.comparator.label === 'Gimnasio Familiar' &&
        g10[0]!.action === null,
      g10[0]?.reason,
    );
    const none = evaluate(moved, ctx(vivoSnaps, null));
    rec.check(
      'e45: no target in MXN → G09 abstains by name (a spend floor needs one); G10 still speaks',
      ofRule(none, 'G09').length === 0 &&
        none.abstentions.some((a) => a.rule === 'G09') &&
        ofRule(none, 'G10').length === 1,
    );

    const ekatar = vivoSnaps.find((s) => s.id === EKATAR)!;
    const skips = engine.ruleSkipsFor([
      engine.mapMultiPlatformSnapshotToAdSet(ekatar, {
        ageDays: 365,
        kpiField: 'leads',
        channelType: 'SEARCH',
      }),
    ]);
    const covered = Object.fromEntries(skips.map((s) => [s.family, s.coveredBy?.join('/')]));
    rec.check(
      'e45–e47: EKATAR’s Meta-only families stay skipped by name, each naming the Google rules that judge it — delivery G12, fatigue G23, creative G09/G10/G18',
      skips.length === 3 &&
        covered.delivery === 'G12' &&
        covered.fatigue === 'G23' &&
        covered.creative === 'G09/G10/G18_pmax_assets/G18_pmax_coverage',
      JSON.stringify(covered),
    );
  }

  // -------------------------------------------------------------------------
  // 46 — G18_pmax_assets on Easy Fit's PMax at b9cebbcf's target, and on Tangassi
  // -------------------------------------------------------------------------
  {
    const r = evaluate(easyFit.signals, ctx(easyFitSnaps, 99));
    const g18 = ofRule(r, 'G18_pmax_assets');
    const card = g18[0]?.platform_card;
    const first = card?.variant === 'google_pmax_assets' ? card.assets[0] : undefined;
    rec.check(
      'e46: REAL read at b9cebbcf’s 99 MXN target → one G18_pmax_assets card on "PMax | Octubre | Easy Fit | Leads": 5 assets (the cap), the description "Promociones mensuales…" first at 894.24 MXN per conversion against 47.97; no action',
      g18.length === 1 &&
        g18[0]!.entity.nativeLevel === 'asset_group' &&
        card?.variant === 'google_pmax_assets' &&
        card.assets.length === 5 &&
        first?.field_type === 'DESCRIPTION' &&
        first.label.startsWith('Promociones mensuales') &&
        near(first.cost_per_result ?? 0, 894.24) &&
        near(first.best_of_kind.cost_per_result, 47.97) &&
        g18[0]!.action === null,
      `${(easyFit.google.pmax_assets ?? []).length} assets that spent or converted; ${g18[0]?.reason}`,
    );
    rec.check(
      'e46: the asset group carries its campaign’s name → the reason names it once',
      g18[0]?.reason.startsWith('In PMax | Octubre | Easy Fit | Leads, over the last 30 days') ===
        true,
    );
    const most = Math.max(...(easyFit.google.pmax_assets ?? []).map((a) => a.totals.spend));
    const high = evaluate(easyFit.signals, ctx(easyFitSnaps, 900));
    const none = evaluate(easyFit.signals, ctx(easyFitSnaps, null));
    rec.check(
      `e46: the other side — a 900 MXN target, above what any asset spent (${most.toFixed(2)}) → no card; no target in MXN → G18 abstains by name`,
      most < 900 &&
        ofRule(high, 'G18_pmax_assets').length === 0 &&
        ofRule(none, 'G18_pmax_assets').length === 0 &&
        none.abstentions.some((a) => a.rule === 'G18_pmax_assets'),
    );
    const t = evaluate(tangassi.signals, ctx(tangassiSnapshots(), 99));
    const tg = ofRule(t, 'G18_pmax_assets');
    rec.check(
      'e46: Tangassi at 99 MXN → one card on the asset group "TANGASSI", named with its campaign',
      tg.length === 1 && tg[0]!.reason.startsWith('In TANGASSI (Necesidades SLP), over the last 30 days'),
      tg[0]?.reason,
    );
  }

  // -------------------------------------------------------------------------
  // 47 — G23: no Display, Video or Demand Gen serves; the other side invents one
  // -------------------------------------------------------------------------
  {
    const audience = [...(vivo.google.audience ?? []), ...(easyFit.google.audience ?? [])];
    const channels = [...new Set(audience.map((a) => a.channel_type))].sort().join(', ');
    const realVivo = evaluate(vivo.signals, ctx(vivoSnaps, 900));
    const realEasyFit = evaluate(easyFit.signals, ctx(easyFitSnaps, 99));
    const ekatarRow = audience.find((a) => a.campaign_id === EKATAR)!;
    rec.check(
      `e47: REAL reads → ${audience.length} serving campaigns, all ${channels} (EKATAR ${ekatarRow.frequency_7d?.toFixed(2)} per user in 7 days) → no G23 card`,
      audience.length === 4 &&
        channels === 'PERFORMANCE_MAX, SEARCH' &&
        ofRule(realVivo, 'G23').length === 0 &&
        ofRule(realEasyFit, 'G23').length === 0,
    );
    const display = withGoogle(vivo.signals, {
      audience: (vivo.google.audience ?? []).map((a) =>
        a.campaign_id === EKATAR ? { ...a, channel_type: 'DISPLAY', frequency_7d: 3.4 } : a,
      ),
    });
    const ekatar = vivoSnaps.find((s) => s.id === EKATAR)!;
    const { d3, d14 } = ekatar.windows;
    const now = d3.spend / (d3.leads ?? 0);
    const before = d14.spend / (d14.leads ?? 0);
    const two = evaluate(display, ctx(vivoSnaps, 900));
    rec.check(
      `e47: the other side (invented, two fields) — EKATAR as DISPLAY at 3.4 per user → still none: its cost per lead fell (${now.toFixed(2)} MXN over 3 days against ${before.toFixed(2)} over 14)`,
      now < before && ofRule(two, 'G23').length === 0,
    );
    const dearer = vivoSnaps.map((s) =>
      s.id === EKATAR ? { ...s, windows: { ...s.windows, d3: { ...d3, leads: 2 } } } : s,
    );
    const three = evaluate(display, ctx(dearer, 900));
    const g23 = ofRule(three, 'G23');
    const card = g23[0]?.platform_card;
    rec.check(
      `e47: … and a third field, 2 leads in 3 days instead of ${(d3.leads ?? 0).toFixed(2)} (${(d3.spend / 2).toFixed(2)} MXN, +${Math.round((d3.spend / 2 / before - 1) * 100)}%) → one read-only G23 card at 3.4 against the cap of 3`,
      g23.length === 1 &&
        card?.variant === 'google_audience_saturation' &&
        card.frequency === 3.4 &&
        card.frequency_cap === 3 &&
        g23[0]!.action === null,
      g23[0]?.reason,
    );
  }

  // -------------------------------------------------------------------------
  // 48–49 — G5's follow-ups on b9cebbcf, the 16 Oct cycle rebuilt from the REAL 14 days
  // -------------------------------------------------------------------------
  {
    const lead = engine.getObjectiveProfile('lead');
    const cfg = { kpiField: lead.kpiField, upperFunnelField: lead.upperFunnelField };
    const cycle = g7EasyFitCampaigns('2026-10-16');
    const classified = (searchBidStatus?: string) =>
      engine.classifyPortfolio(
        cycle.map((c) =>
          engine.mapMultiPlatformSnapshotToAdSet(
            searchBidStatus && c.snapshot.id === B9_SEARCH
              ? { ...c.snapshot, bidding: { ...c.snapshot.bidding!, systemStatus: searchBidStatus } }
              : c.snapshot,
            { ageDays: c.ageDays, kpiField: 'leads', channelType: c.channelType },
          ),
        ),
        engine.resolveConfig(cfg),
      );
    const budgets = (r: ReturnType<typeof engine.reallocate>) =>
      Object.fromEntries(r.items.map((i) => [i.id, i.finalBudget]));
    const byId = Object.fromEntries(cycle.map((c) => [c.snapshot.id, c]));
    const search = byId[B9_SEARCH]!;
    const pmax = byId[B9_PMAX]!;
    const real = classified();
    rec.check(
      'e48: REAL 14 days rebuilt as the 16 Oct cycle → both 10 days old; Search d7 1,630.16 MXN / 3, PMax 1,558.50 / 19.97; Search active (bidding PAUSED, not learning), PMax in grace (14 days)',
      search.ageDays === 10 &&
        pmax.ageDays === 10 &&
        near(search.snapshot.windows.d7.spend, 1630.16) &&
        search.snapshot.windows.d7.leads === 3 &&
        near(pmax.snapshot.windows.d7.spend, 1558.5) &&
        near(pmax.snapshot.windows.d7.leads ?? 0, 19.97) &&
        real.map((s) => s.status).join(',') === 'active,grace',
      `bidding ${search.snapshot.bidding?.systemStatus} as recorded on 20 Oct`,
    );
    const held = engine.reallocate(real, 670, cfg);
    const slack = budgets(engine.reallocate(real, 790, cfg));
    rec.check(
      'e48: today — 670 (what they hold) → nothing moves; 790 → the graced PMax borrows the active Search’s score and the slack is split (Search 412.69, PMax 377.31)',
      held.items.every((i) => Math.abs(i.changeAbs) < 0.01) &&
        near(slack[B9_SEARCH]!, 412.69) &&
        near(slack[B9_PMAX]!, 377.31),
    );
    const learning = classified('LEARNING_NEW');
    const noPeer = engine.reallocate(learning, 790, cfg);
    const b = budgets(noPeer);
    rec.check(
      'e48: the other side (one field: Search LEARNING_NEW) → no active entity to borrow from: PMax holds 320 of 790, Search takes 470, and the note says why',
      learning.map((s) => s.status).join(',') === 'learning,grace' &&
        near(b[B9_PMAX]!, 320) &&
        near(b[B9_SEARCH]!, 470) &&
        noPeer.conserved &&
        noPeer.notes.some((n) => n.startsWith('held: PMax | Octubre | Easy Fit | Leads is in grace')),
      noPeer.notes.find((n) => n.startsWith('held:')),
    );

    const under = engine.reallocate(real, 500, cfg);
    const u = budgets(under);
    rec.check(
      'e49: total 500 (170 under what they hold) → underflow relaxes only what is not protected: Search 180, PMax keeps 320, the total is met',
      under.feasibility.underflow === true &&
        under.conserved &&
        near(u[B9_SEARCH]!, 180) &&
        near(u[B9_PMAX]!, 320),
    );
    const refused = engine.reallocate(real, 300, cfg);
    rec.check(
      'e49: total 300, under the 320 the graced PMax alone holds → refused protected_above_total by name; every budget holds',
      refused.refusal?.reason === 'protected_above_total' &&
        refused.refusal.protectedBudget === 320 &&
        refused.refusal.totalBudget === 300 &&
        refused.items.every((i) => i.finalBudget === i.currentBudget) &&
        refused.notes.some((n) => n.startsWith('refused: entities inside their learning protection')),
      refused.notes.find((n) => n.startsWith('refused:')),
    );
  }

  const problems = all.flatMap(wellFormed);
  rec.check(
    `e45–e47: ${all.length} evaluations — every G7 card and action passes its contract, all wait for a person, no "$" without its ISO code (M1), (rule, entity, subject) unique`,
    problems.length === 0,
    problems.join('; '),
  );
}
