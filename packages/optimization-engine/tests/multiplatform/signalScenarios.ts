// Escenarios 31–40 (wave 8): the platform-only rules over REAL Vivo 47 search terms, keywords
// and bidding, REAL Tangassi PMax coverage, REAL Easy Fit organic TikTok posts and DOC_SHAPED
// TikTok creatives — through evaluatePlatformSignals, the one entry point the Optimizer calls.
// Each threshold is asserted on both sides; where the recording sits on one side only, the
// other side is the same row with ONE named field changed, and the check label says so.

import {
  OptimizerActionSchema,
  PlatformCardSchema,
  type PlatformSignals,
  PlatformSignalsSchema,
} from '@continuum/contracts';
import type { Recorder } from '../../../../Continuum-Backend/scripts/_bench/recorder';
import {
  evaluatePlatformSignals,
  type PlatformSignalsContext,
  type PlatformSignalsEvaluation,
} from '../../src';
import {
  easyFitTikTokSignals,
  easyFitTikTokSnapshots,
  tangassiSignals,
  tangassiSnapshots,
  vivo47Signals,
  vivo47Snapshots,
} from './signalFixtures';

/** M1: a "$" is only ever the symbol before a figure whose ISO code follows it. */
const DOLLAR_WITHOUT_CODE = /\$\d[\d,]*(?:\.\d+)?(?![\d.,]| [A-Z]{3}\b)/;

const MXN = (amount: number) => ({ amount, currency: 'MXN' });
const EKATAR = '20775796216';

type Google = NonNullable<PlatformSignals['google']>;
type TikTok = NonNullable<PlatformSignals['tiktok']>;

/** Every evaluation, whatever it found: cards and actions pass their contracts, every
 *  finding waits for a person, no reason prints a "$" without its ISO code, and (rule, entity, subject) is unique. */
function wellFormed(r: PlatformSignalsEvaluation): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const x of r.recommendations) {
    if (!PlatformCardSchema.safeParse(x.platform_card).success) problems.push(`${x.rule} card`);
    if (x.action && !OptimizerActionSchema.safeParse(x.action).success)
      problems.push(`${x.rule} action`);
    if (x.needsApproval !== true) problems.push(`${x.rule} auto`);
    if (DOLLAR_WITHOUT_CODE.test(x.reason)) problems.push(`${x.rule} prints $ without its code`);
    const key = `${x.rule}|${x.entity.id}|${x.subject_key}`;
    if (keys.has(key)) problems.push(`duplicate ${key}`);
    keys.add(key);
  }
  return problems;
}

export function runSignalScenarios(rec: Recorder): void {
  const all: PlatformSignalsEvaluation[] = [];
  const evaluate = (signals: PlatformSignals, context: PlatformSignalsContext) => {
    const r = evaluatePlatformSignals(PlatformSignalsSchema.parse(signals), context);
    all.push(r);
    return r;
  };

  // -------------------------------------------------------------------------
  // Google — Vivo 47 (3710693645), REAL GAQL, 14 days
  // -------------------------------------------------------------------------
  const vivo = vivo47Signals();
  const vivoSnaps = vivo47Snapshots();
  const vivoCtx = (over: Partial<PlatformSignalsContext> = {}): PlatformSignalsContext => ({
    cpaTarget: MXN(900),
    now: '2026-10-06T00:13:44Z',
    snapshots: vivoSnaps,
    kpiField: 'leads',
    crossPlatformComparison: false,
    ...over,
  });
  const withGoogle = (g: Partial<Google>): PlatformSignals => ({
    ...vivo,
    google: { ...vivo.google!, ...g },
  });
  const terms = vivo.google!.search_terms;
  const termRow = (text: string) => terms.find((t) => t.term === text)!;

  // 31 — G05 negative terms
  {
    const r = evaluate(vivo, vivoCtx());
    const g05 = r.recommendations.filter((x) => x.rule === 'G05');
    const card = g05[0]?.platform_card;
    rec.check(
      'e31: target 900 MXN → one G05 card on VIVO 47-EKATAR: "vivo 47 center" 998.41 MXN, 27 clicks, 0 conversions in 14 days, EXACT negative',
      g05.length === 1 &&
        card?.variant === 'google_negative_terms' &&
        card.terms.length === 1 &&
        card.terms[0]!.term === 'vivo 47 center' &&
        card.terms[0]!.spend === 998.41 &&
        card.window_days === 14 &&
        card.currency === 'MXN' &&
        g05[0]!.action?.kind === 'add_negatives' &&
        g05[0]!.subject_key === 'negatives',
      g05[0]?.reason,
    );
    const v47 = termRow('vivo47');
    rec.check(
      'e31: the other side — "vivo47" 780.32 MXN with 0 conversions is under the 900 target: no negative',
      v47.totals.spend < 900 &&
        v47.totals.conversions === 0 &&
        card?.variant === 'google_negative_terms' &&
        !card.terms.some((t) => t.term === 'vivo47'),
    );
    const brand = termRow('vivo 47');
    rec.check(
      'e31: "vivo 47" (3,403.71 MXN, ADDED, the ad group\'s keyword) is never a negative',
      brand.status === 'ADDED' &&
        card?.variant === 'google_negative_terms' &&
        !card.terms.some((t) => t.term === 'vivo 47'),
    );
    const low = evaluate(vivo, vivoCtx({ cpaTarget: MXN(50) }));
    const lowCard = low.recommendations.find((x) => x.rule === 'G05')?.platform_card;
    const g05Out = low.abstentions.filter((a) => a.rule === 'G05');
    const waits = g05Out.filter((a) => a.reason.includes('next cycle')).length;
    const tooLong = g05Out.filter((a) => a.reason.includes('10-word')).length;
    const isKeyword = g05Out.filter((a) =>
      a.reason.startsWith('"vivo47" is also an active keyword'),
    ).length;
    rec.check(
      'e31: target 50 MXN (one field changed) → 28 terms qualify: "vivo47" is an enabled keyword (never excluded), 2 are over Google\'s 10-word limit, 20 are proposed, 5 wait for the next cycle',
      lowCard?.variant === 'google_negative_terms' &&
        lowCard.terms.length === 20 &&
        isKeyword === 1 &&
        tooLong === 2 &&
        waits === 5,
      `proposed ${lowCard?.variant === 'google_negative_terms' ? lowCard.terms.length : 0}, keyword ${isKeyword}, over limit ${tooLong}, next cycle ${waits}`,
    );
    const none = evaluate(vivo, vivoCtx({ cpaTarget: null }));
    rec.check(
      'e31: no target in MXN → G05, promote and G11 abstain by name, no card',
      none.recommendations.filter((x) => ['G05', 'G05_promote', 'G11'].includes(x.rule)).length ===
        0 &&
        ['G05', 'G05_promote', 'G11'].every((rule) =>
          none.abstentions.some((a) => a.rule === rule && a.reason.includes('no target')),
        ),
    );
  }

  // 32 — promote a converting term
  {
    const r = evaluate(vivo, vivoCtx());
    const naciones = termRow('vivo 47 naciones unidas');
    rec.check(
      'e32: nothing is promoted — "vivo 47 naciones unidas" has 2 conversions (1,041.43 MXN), under the 3 a keyword needs; "vivo 47" (7) is already the keyword',
      naciones.totals.conversions === 2 && r.recommendations.every((x) => x.rule !== 'G05_promote'),
    );
    const three = withGoogle({
      search_terms: terms.map((t) =>
        t === naciones ? { ...t, totals: { ...t.totals, conversions: 3 } } : t,
      ),
    });
    const p = evaluate(three, vivoCtx()).recommendations.filter((x) => x.rule === 'G05_promote');
    const card = p[0]?.platform_card;
    rec.check(
      'e32: the other side — the same row with 3 conversions (347.14 MXN each, under 900) → promote to an EXACT keyword of ad group "Vivo 47"',
      p.length === 1 &&
        card?.variant === 'google_promote_term' &&
        card.cost_per_result === 347.14 &&
        card.matched_keyword === 'Vivo 47' &&
        p[0]!.entity.id === naciones.ad_group_id &&
        p[0]!.subject_key === 'vivo 47 naciones unidas' &&
        p[0]!.action?.kind === 'add_keyword',
      p[0]?.reason,
    );
    const pricey = evaluate(three, vivoCtx({ cpaTarget: MXN(347) })).recommendations.filter(
      (x) => x.rule === 'G05_promote',
    );
    rec.check(
      'e32: at a 347 MXN target the 347.14 term is over target → not promoted',
      pricey.length === 0,
    );
  }

  // 33 — G07 Google Ads target CPA (bid setting), serving the portfolio CPA goal
  {
    const ekatar = vivoSnaps.find((s) => s.id === EKATAR)!.windows.d14;
    const r = evaluate(vivo, vivoCtx());
    rec.check(
      'e33: EKATAR d14 is 16,202.49 MXN for 15 conversions = 1,080.17, 3.1% lost to rank, Maximize Conversions with NO Google Ads target CPA → G07 abstains by name',
      Math.round(ekatar.spend * 100) === 1620249 &&
        ekatar.leads === 15 &&
        r.recommendations.every((x) => x.rule !== 'G07') &&
        r.abstentions.some(
          (a) =>
            a.rule === 'G07' &&
            a.entityId === EKATAR &&
            a.reason.includes('no Google Ads target CPA'),
        ),
    );
    const bid = vivo.google!.bid_targets.find((b) => b.campaign_id === EKATAR)!;
    const withTarget = (
      googleTarget: number,
      opts: { over?: Partial<typeof bid>; rankLost?: number; goal?: number } = {},
    ) => {
      const { over = {}, rankLost, goal = 900 } = opts;
      const snaps =
        rankLost === undefined
          ? vivoSnaps
          : vivoSnaps.map((s) =>
              s.id === EKATAR
                ? {
                    ...s,
                    windows: {
                      ...s.windows,
                      d14: {
                        ...s.windows.d14,
                        delivery: { ...s.windows.d14.delivery, rankLostImpressionShare: rankLost },
                      },
                    },
                  }
                : s,
            );
      return evaluate(
        withGoogle({ bid_targets: [{ ...bid, target_cpa: googleTarget, ...over }] }),
        vivoCtx({ snapshots: snaps, cpaTarget: MXN(goal) }),
      );
    };
    const g07 = (e: PlatformSignalsEvaluation) => e.recommendations.filter((x) => x.rule === 'G07');
    const regression = g07(withTarget(1500, { rankLost: 0.35 }));
    const regressionCard = regression[0]?.platform_card;
    rec.check(
      'e33 regression: goal 900, Google tCPA 1,500, paying 1,080.17 with 35% lost to rank → NOT raised to 1,650 (it pays over the goal); lowered 10% to 1,350 MXN',
      regression.length === 1 &&
        regression[0]!.action?.kind === 'set_bid_target' &&
        regression[0]!.action.expected === 1_500_000_000 &&
        regression[0]!.action.target === 1_350_000_000 &&
        regressionCard?.variant === 'google_bid_target' &&
        regressionCard.portfolio_goal === 900,
      regression[0]?.reason,
    );
    rec.check(
      'e33: goal 1,400 (1,080.17 is 0.77× the goal), Google tCPA 1,000, only 3.1% lost to rank (≤ 30%) → no raise',
      g07(withTarget(1000, { goal: 1400 })).length === 0,
    );
    const raise = g07(withTarget(1000, { goal: 1400, rankLost: 0.35 }));
    rec.check(
      'e33: … with 35% lost to rank → raise the Google Ads target CPA 10%: 1,000 → 1,100 MXN, under the 1,400 goal',
      raise[0]?.action?.kind === 'set_bid_target' &&
        raise[0].action.expected === 1_000_000_000 &&
        raise[0].action.target === 1_100_000_000,
      raise[0]?.reason,
    );
    const capped = withTarget(1300, { goal: 1400, rankLost: 0.35 });
    rec.check(
      'e33: Google tCPA 1,300 under a 1,400 goal: +10% would be 1,430, above the goal → abstains by name, no card',
      g07(capped).length === 0 &&
        capped.abstentions.some(
          (a) => a.rule === 'G07' && a.reason.includes('above the portfolio CPA goal'),
        ),
    );
    const lower = g07(withTarget(700, { goal: 800 }));
    rec.check(
      'e33: goal 800: 1,080.17 is 1.35× the goal → lower the Google Ads target CPA 10%: 700 → 630 MXN',
      lower[0]?.platform_card.variant === 'google_bid_target' &&
        lower[0].platform_card.proposed_target === 630,
      lower[0]?.reason,
    );
    rec.check(
      'e33: goal 840: 1.29× (≤ 1.3×) with Google tCPA 700 under the goal → no change',
      g07(withTarget(700, { goal: 840 })).length === 0,
    );
    rec.check(
      'e33: never while the strategy is LEARNING_SETTING_CHANGE, never 13 days after the last change; at 14 days it moves',
      g07(withTarget(700, { goal: 800, over: { system_status: 'LEARNING_SETTING_CHANGE' } }))
        .length === 0 &&
        g07(withTarget(700, { goal: 800, over: { last_changed_at: '2026-09-23T00:13:44Z' } }))
          .length === 0 &&
        g07(withTarget(700, { goal: 800, over: { last_changed_at: '2026-09-22T00:13:44Z' } }))
          .length === 1,
    );
  }
  // 34 — G11 low Quality Score
  {
    const keywords = vivo.google!.keywords;
    const brand = keywords.find(
      (k) => k.campaign_id === EKATAR && k.status === 'ENABLED' && !k.negative,
    )!;
    const active = keywords.filter(
      (k) => k.ad_group_id === brand.ad_group_id && k.status === 'ENABLED' && !k.negative,
    );
    const r = evaluate(vivo, vivoCtx());
    rec.check(
      'e34: EKATAR\'s only active keyword, "Vivo 47" BROAD, has Quality Score 10 and 15 conversions → no G11',
      brand.text === 'Vivo 47' &&
        brand.quality_score === 10 &&
        active.length === 1 &&
        r.recommendations.every((x) => x.rule !== 'G11'),
    );
    const poor = { ...brand, quality_score: 2, totals: { ...brand.totals, conversions: 0 } };
    const last = evaluate(
      withGoogle({ keywords: keywords.map((k) => (k === brand ? poor : k)) }),
      vivoCtx(),
    );
    rec.check(
      'e34: QS 2 and 0 conversions (two fields changed) → G11 would fire, but it is the last active keyword of "Vivo 47": declined by name',
      last.recommendations.every((x) => x.rule !== 'G11') &&
        last.abstentions.some((a) => a.rule === 'G11' && a.reason.includes('last active keyword')),
    );
    const sibling = {
      ...brand,
      criterion_id: '999',
      text: 'gimnasio vivo 47',
      match_type: 'EXACT' as const,
      totals: { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
    };
    const fires = evaluate(
      withGoogle({ keywords: [...keywords.map((k) => (k === brand ? poor : k)), sibling] }),
      vivoCtx(),
    );
    const g11 = fires.recommendations.filter((x) => x.rule === 'G11');
    rec.check(
      'e34: … with a second active keyword in the group → pause "Vivo 47": set_status on the keyword (nativeLevel keyword), never the ad group',
      g11.length === 1 &&
        g11[0]!.action?.kind === 'set_status' &&
        g11[0]!.action.ref.nativeLevel === 'keyword' &&
        g11[0]!.action.ref.id === `${brand.ad_group_id}~${brand.criterion_id}` &&
        g11[0]!.subject_key === brand.criterion_id,
      g11[0]?.reason,
    );
    const qs4 = evaluate(
      withGoogle({
        keywords: [
          ...keywords.map((k) => (k === brand ? { ...poor, quality_score: 4 } : k)),
          sibling,
        ],
      }),
      vivoCtx(),
    );
    rec.check(
      'e34: the other side — Quality Score 4 → no G11',
      qs4.recommendations.every((x) => x.rule !== 'G11'),
    );
  }

  // 35 — PMax asset coverage (Tangassi, REAL)
  {
    const tangassi = tangassiSignals();
    const r = evaluate(tangassi, {
      cpaTarget: null,
      now: '2026-10-06T00:13:44Z',
      snapshots: tangassiSnapshots(),
      kpiField: 'leads',
      crossPlatformComparison: false,
    });
    const card = r.recommendations[0]?.platform_card;
    rec.check(
      'e35: Necesidades SLP / TANGASSI, AVERAGE, missing 3 square images, 1 video, 3 headlines, 1 description, 6 sitelinks → one PMax card, no write',
      r.recommendations.length === 1 &&
        card?.variant === 'google_pmax_asset_group' &&
        card.campaign_name === 'Necesidades SLP' &&
        card.asset_groups.length === 1 &&
        card.asset_groups[0]!.ad_strength === 'AVERAGE' &&
        card.asset_groups[0]!.missing.join(', ') ===
          '3 square images, 1 video, 3 headlines, 1 description, 6 sitelinks' &&
        r.recommendations[0]!.action === null,
      r.recommendations[0]?.reason,
    );
    rec.check(
      'e35: the two POOR groups (NOT_ELIGIBLE, in a REMOVED and a PAUSED campaign) get no card',
      tangassi.google!.asset_groups.filter((g) => g.ad_strength === 'POOR').length === 2 &&
        !(
          card?.variant === 'google_pmax_asset_group' &&
          card.asset_groups.some((g) => g.ad_strength === 'POOR')
        ),
    );
    const good = evaluate(
      {
        ...tangassi,
        google: {
          ...tangassi.google!,
          asset_groups: tangassi.google!.asset_groups.map((g) => ({
            ...g,
            ad_strength: 'GOOD' as const,
          })),
        },
      },
      {
        cpaTarget: null,
        now: '2026-10-06T00:13:44Z',
        snapshots: tangassiSnapshots(),
        kpiField: 'leads',
        crossPlatformComparison: false,
      },
    );
    rec.check(
      'e35: the other side — ad strength GOOD → no card',
      good.recommendations.length === 0,
    );
  }

  // -------------------------------------------------------------------------
  // TikTok — Easy Fit (DOC_SHAPED ads, REAL organic posts)
  // -------------------------------------------------------------------------
  const tt = easyFitTikTokSignals();
  const ttSnaps = easyFitTikTokSnapshots();
  const ttCtx = (over: Partial<PlatformSignalsContext> = {}): PlatformSignalsContext => ({
    cpaTarget: MXN(35),
    now: '2026-10-01T12:00:00Z',
    snapshots: ttSnaps,
    kpiField: 'leads',
    crossPlatformComparison: true,
    ...over,
  });
  const withTikTok = (t: Partial<TikTok>): PlatformSignals => ({
    ...tt,
    tiktok: { ...tt.tiktok!, ...t },
  });
  const leadGroups = (ids: string[]) =>
    tt.tiktok!.ad_groups.filter((g) => ids.includes(g.ad_group_id));

  // 36 — T1 weak hook
  {
    const r = evaluate(tt, ttCtx());
    const t1 = r.recommendations.filter((x) => x.rule === 'T1');
    const card = t1[0]?.platform_card;
    rec.check(
      'e36: "Tour del gym" holds 18.0% past 2 s on 28,000 impressions, under the portfolio Q1 of 26.0% → T1',
      t1.length === 1 &&
        t1[0]!.subject_key === '7000000000000000302' &&
        card?.variant === 'tiktok_hook_retention' &&
        card.impressions === 28000,
      t1[0]?.reason,
    );
    rec.check(
      'e36: "Promo 333" holds exactly the Q1 (26%) → not under it; "Antes y después" holds 10% on 1,400 impressions → under 2,000, not judged',
      !t1.some((x) => ['7000000000000000303', '7000000000000000306'].includes(x.subject_key)),
    );
  }

  // 37 — T3 fatigue
  {
    const r = evaluate(tt, ttCtx());
    const t3 = r.recommendations.filter((x) => x.rule === 'T3');
    const card = t3[0]?.platform_card;
    rec.check(
      'e37: "Promo 333" — 53.67 MXN per lead over the 35 target, spend under its 230 MXN average 3 days running, reach −48.2% → T3, "Testimonio socia" as the replacement',
      t3.length === 1 &&
        t3[0]!.subject_key === '7000000000000000303' &&
        card?.variant === 'tiktok_creative_fatigue' &&
        card.replacement?.name === 'Testimonio socia' &&
        card.ctr_now < card.ctr_before,
      t3[0]?.reason,
    );
    rec.check(
      'e37: "Clase funcional" has the CPA and the falling spend but its reach grows ≥ 5% → no T3; "Testimonio socia" is under target → no T3',
      !t3.some((x) => ['7000000000000000305', '7000000000000000304'].includes(x.subject_key)),
    );
    const generous = evaluate(tt, ttCtx({ cpaTarget: MXN(60) })).recommendations.filter(
      (x) => x.rule === 'T3',
    );
    rec.check(
      'e37: the other side — at a 60 MXN target the 53.67 CPA is under it → no T3',
      generous.length === 0,
    );
  }

  // 38 — T5 Spark candidate (REAL organic posts of @easyfit_oficial)
  {
    const r = evaluate(tt, ttCtx({ now: '2026-09-02T15:46:08Z' }));
    rec.check(
      'e38: at the read (2 Sep), the newest post is 5 days old → T5 abstains: nothing published in 72 hours',
      r.recommendations.every((x) => x.rule !== 'T5') &&
        r.abstentions.some((a) => a.rule === 'T5' && a.reason.includes('72 hours')),
    );
    const fresh = evaluate(tt, ttCtx({ now: '2026-08-13T08:12:54Z' }));
    const t5 = fresh.recommendations.filter((x) => x.rule === 'T5');
    const card = t5[0]?.platform_card;
    rec.check(
      'e38: 48 h after "Entrena en Easy Fit desde $12 al mes" (185,270 views ≥ the 13-post P90 of 181,442) → T5 in the account\'s best lead ad group',
      t5.length === 1 &&
        card?.variant === 'tiktok_spark_candidate' &&
        card.post_id === '7672684072287603988' &&
        card.views === 185270 &&
        t5[0]!.entity.nativeLevel === 'ad_group',
      t5[0]?.reason,
    );
    rec.check(
      'e38: the other side — the post of 11 Aug 09:40 (28,063 views) is just as fresh but under the P90 → no card',
      !t5.some((x) => x.subject_key === '7672706715590167825'),
    );
    const sparked = evaluate(
      withTikTok({
        organic_posts: tt.tiktok!.organic_posts.map((p) =>
          p.post_id === '7672684072287603988' ? { ...p, promoted: true } : p,
        ),
      }),
      ttCtx({ now: '2026-08-13T08:12:54Z' }),
    );
    rec.check(
      'e38: already promoted (one field changed) → no card',
      sparked.recommendations.every((x) => x.rule !== 'T5'),
    );
  }

  // 39 — T7 budget below learning
  {
    const r = evaluate(
      withTikTok({
        ad_groups: leadGroups([
          '7000000000000000201',
          '7000000000000000202',
          '7000000000000000203',
        ]),
      }),
      ttCtx(),
    );
    const t7 = r.recommendations.filter((x) => x.rule === 'T7');
    const card = t7[0]?.platform_card;
    rec.check(
      'e39: LEAD_GENERATION needs 10× the 35 MXN target = 350/day: "LAL 2% nuevos" at 300 → T7; "Broad MX" at 400 and "Intereses fitness" at 1,000 → none',
      t7.length === 1 &&
        t7[0]!.entity.id === '7000000000000000203' &&
        card?.variant === 'tiktok_budget_below_learning' &&
        card.required_budget_per_day === 350 &&
        card.required_multiple === 10,
      t7[0]?.reason,
    );
    const floorOnly = evaluate(
      withTikTok({ ad_groups: leadGroups(['7000000000000000203']) }),
      ttCtx({ cpaTarget: null }),
    );
    rec.check(
      "e39: no target → only TikTok's 200 MXN floor (20 USD × 10) applies, and 300 clears it → no card, the multiple abstains by name",
      floorOnly.recommendations.every((x) => x.rule !== 'T7') &&
        floorOnly.abstentions.some(
          (a) => a.rule === 'T7' && a.reason.includes('learning multiple'),
        ),
    );
  }

  // 40 — T12 attribution window
  {
    const r = evaluate(tt, ttCtx());
    const t12 = r.recommendations.filter((x) => x.rule === 'T12');
    rec.check(
      'e40: "EF | Mensajes | Broad" counts 1-day click / no view in a cross-platform portfolio → T12 card and excluded from G27',
      t12.length === 1 &&
        t12[0]!.entity.id === '7000000000000000205' &&
        r.comparisonExclusions.length === 1 &&
        r.comparisonExclusions[0]!.entityId === '7000000000000000205',
      t12[0]?.reason,
    );
    const solo = evaluate(tt, ttCtx({ crossPlatformComparison: false }));
    rec.check(
      'e40: the other side — the 7d/1d ad groups never; and a TikTok-only portfolio compares nothing → no T12, no exclusion',
      !t12.some((x) => x.entity.id !== '7000000000000000205') &&
        solo.recommendations.every((x) => x.rule !== 'T12') &&
        solo.comparisonExclusions.length === 0,
    );
  }

  const problems = all.flatMap(wellFormed);
  rec.check(
    `e31–e40: ${all.length} evaluations — every card passes PlatformCardSchema, every action OptimizerActionSchema, all wait for a person, no "$" without its ISO code (M1), (rule, entity, subject) unique`,
    problems.length === 0,
    problems.join('; ') ||
      `${all.reduce((n, r) => n + r.recommendations.length, 0)} findings checked`,
  );
}
