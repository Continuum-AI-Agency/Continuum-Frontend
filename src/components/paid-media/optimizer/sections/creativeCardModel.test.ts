import { describe, expect, it } from 'bun:test';
import {
  adImageUrl,
  angleAriaLabel,
  angleChipText,
  angleWords,
  audienceWords,
  type CardAdAngle,
  cardAngles,
  creativeCardCopy,
  flashCreativesFor,
  isCreativeRecommendation,
  metaFatigueCardOf,
  parseCardAdAngles,
  resolveAdAngle,
  standingChart,
  subjectAds,
  wearOutComparison,
} from './creativeCardModel';

const ad = (id: string, status = 'ACTIVE', imageUrl: string | null = null) =>
  ({ id, name: `Ad ${id}`, status, thumbnailUrl: `thumb-${id}`, creative: { imageUrl } }) as never;

describe('creative card model', () => {
  it('knows which recommendations are about a creative', () => {
    expect(isCreativeRecommendation({ kind: 'creative_refresh', ad_id: null })).toBe(true);
    expect(isCreativeRecommendation({ kind: 'pause', ad_id: null })).toBe(false);
    expect(isCreativeRecommendation({ kind: 'pause', ad_id: 'x' })).toBe(true);
  });
  it('picks the subject ad by id, the winner from the seed, or the delivering ads', () => {
    const ads = [ad('a', 'PAUSED'), ad('b'), ad('c'), ad('d')];
    expect(subjectAds({ ad_id: 'c', seed: null }, ads).map((a) => a.id)).toEqual(['c']);
    expect(subjectAds({ ad_id: null, seed: { winnerAdId: 'a' } }, ads).map((a) => a.id)).toEqual([
      'a',
    ]);
    expect(subjectAds({ ad_id: null, seed: null }, ads).map((a) => a.id)).toEqual(['b', 'c', 'd']);
  });
  it('prefers the full image, then the poster, then the thumbnail', () => {
    expect(adImageUrl(ad('a', 'ACTIVE', 'full'))).toBe('full');
    expect(adImageUrl(ad('a'))).toBe('thumb-a');
  });
  it('names the angle from the vocabulary or the labels, and the audience from the seed', () => {
    expect(angleWords({ seed: { angleId: 'offer_discount' } })).toBe('Discount offer');
    expect(angleWords({ seed: { labels: { angle: 'Price', hook: 'Urgency' } } })).toBe(
      'Price · Urgency',
    );
    expect(angleWords({ seed: null })).toBeNull();
    expect(
      audienceWords({ seed: { audience: { branch: 'Prospecting', strategy: 'Broad' } } }, null),
    ).toBe('Prospecting · Broad');
    expect(audienceWords({ seed: null }, 'remarketing')).toBe('remarketing');
  });
  it('says why in the engine’s terms', () => {
    expect(
      creativeCardCopy({ kind: 'variate_creative', trigger: 'C2_creative_winner', seed: null })
        .because,
    ).toBe('winner');
    expect(
      creativeCardCopy({ kind: 'creative_refresh', trigger: 'C4_creative_decay', seed: null })
        .headline,
    ).toContain('own history');
    expect(
      creativeCardCopy({ kind: 'creative_refresh', trigger: 'F1_creative_fatigue', seed: null })
        .because,
    ).toBe('fatigue');
  });
  it('matches flash creatives by recommendation, else by ad set', () => {
    const jobs = [
      { id: 'j1', recommendation_id: 'r1', adset_id: 'a', status: 'generated' },
      { id: 'j2', recommendation_id: 'r9', adset_id: 'a', status: 'queued' },
      { id: 'j3', recommendation_id: 'r9', adset_id: 'a', status: 'cancelled' },
    ] as never;
    expect(flashCreativesFor({ id: 'r1', adset_id: 'a' }, jobs).map((j) => j.id)).toEqual(['j1']);
    expect(flashCreativesFor({ id: 'r2', adset_id: 'a' }, jobs).map((j) => j.id)).toEqual([
      'j1',
      'j2',
    ]);
  });
});

describe('standingChart', () => {
  const standing = {
    winner: { adId: 'w', adName: 'Winner', spend: 300, events: 10, costPerEvent: 30 },
    laggards: [
      { adId: 'l1', adName: 'Slow', spend: 280, events: 4, costPerEvent: 70 },
      { adId: 'l0', adName: 'Nothing yet', spend: 40, events: 0, costPerEvent: null },
    ],
    eligibleAds: 3,
    totalAds: 5,
    killSpendShare: null,
    belowAvgSpendShare: null,
    medianCostPerEvent: 50,
    flags: [],
  } as never;
  it('ranks cheapest first, scales to the widest bar and places the median on it', () => {
    const chart = standingChart(standing, 'w');
    expect(chart?.bars.map((b) => b.adId)).toEqual(['w', 'l1', 'l0']);
    expect(chart?.bars[0]).toMatchObject({ subject: true, winner: true, share: 30 / 70 });
    expect(chart?.bars[2]?.share).toBeNull();
    expect(chart?.medianShare).toBeCloseTo(50 / 70);
    expect(chart?.eligibleAds).toBe(3);
  });
  it('says nothing when there is no standing or nothing compared', () => {
    expect(standingChart(null, 'w')).toBeNull();
    expect(
      standingChart({ ...(standing as object), winner: null, laggards: [] } as never, 'w'),
    ).toBeNull();
  });
});

// Real rows from paid_media_get_ad_angles for Easy Fit (brand 6f597f42-…), ad set
// 120252387195420236. The first three carry only the pre-migration keys; the provenance
// row is one below the classifier's bar (choice value_stack, confidence 0.5).
const EASY_FIT_ADSET = '120252387195420236';
const easyFitRows = [
  {
    ad_id: '120252387195440236',
    adset_id: EASY_FIT_ADSET,
    angle: 'value_stack',
    hook: 'Tu primer mes por solo $12',
    rationale: 'Low first-month price',
    themes: ['price'],
    analyzed_at: '2026-09-30T10:00:00Z',
  },
  {
    ad_id: '120252387195460236',
    adset_id: EASY_FIT_ADSET,
    angle: 'value_stack',
    hook: '50% de descuento en tu anualidad',
    rationale: null,
    themes: [],
    analyzed_at: '2026-09-30T10:00:00Z',
  },
  {
    ad_id: '120252387195450236',
    adset_id: EASY_FIT_ADSET,
    angle: 'value_stack',
    hook: 'Entrena desde $249 en Ávila Camacho',
    rationale: null,
    themes: [],
    analyzed_at: '2026-09-30T10:00:00Z',
  },
];
const fatigueRec = (over: Record<string, unknown> = {}) =>
  ({ ad_id: null, adset_id: EASY_FIT_ADSET, seed: null, ...over }) as never;

describe('parseCardAdAngles', () => {
  it('reads rows with and without the closed-vocabulary keys, dropping malformed rows only', () => {
    const rows = parseCardAdAngles([
      ...easyFitRows,
      { ...easyFitRows[0], ad_id: 'x', angle_id: 'offer_discount' },
      { ad_id: 42, adset_id: EASY_FIT_ADSET, angle: 'value_stack' },
    ]);
    expect(rows.map((r) => r.ad_id)).toEqual([
      '120252387195440236',
      '120252387195460236',
      '120252387195450236',
      'x',
    ]);
    expect(rows[0]?.angle_id ?? null).toBeNull();
    expect(rows[3]?.angle_id).toBe('offer_discount');
  });
  it('reads anything that is not an array as no rows', () => {
    expect(parseCardAdAngles(null)).toEqual([]);
    expect(parseCardAdAngles({ ad_id: 'x' })).toEqual([]);
  });
});

describe('resolveAdAngle — the resolution order', () => {
  const row = easyFitRows[0] as never as CardAdAngle;
  it('1. a closed-vocabulary angle_id is confirmed', () => {
    expect(
      resolveAdAngle({ ...row, angle_id: 'offer_discount', angle_leaning: 'value_stack' }, null),
    ).toEqual({ status: 'confirmed', label: 'Discount offer' });
  });
  it('2. a leaning from the vocabulary is a leaning, with its share', () => {
    expect(
      resolveAdAngle(
        { ...row, angle_id: null, angle_leaning: 'value_stack', angle_leaning_share: 0.5 },
        null,
      ),
    ).toEqual({ status: 'leaning', label: 'Everything you get', share: 0.5 });
  });
  it('3. the coarse hookArchetype, when it is a vocabulary key, is a leaning without a share', () => {
    expect(resolveAdAngle(row, null)).toEqual({
      status: 'leaning',
      label: 'Everything you get',
      share: null,
    });
  });
  it('ignores ids outside the vocabulary at every step', () => {
    expect(
      resolveAdAngle(
        { ...row, angle_id: 'made_up', angle_leaning: 'also_made_up', angle: 'x' },
        null,
      ),
    ).toEqual({ status: 'none' });
  });
  it('4. falls back to the seed: a vocabulary id is confirmed, free labels are a leaning', () => {
    expect(resolveAdAngle(null, { seed: { angleId: 'offer_discount' } })).toEqual({
      status: 'confirmed',
      label: 'Discount offer',
    });
    expect(resolveAdAngle(null, { seed: { labels: { angle: 'Price', hook: 'Urgency' } } })).toEqual(
      {
        status: 'leaning',
        label: 'Price · Urgency',
        share: null,
      },
    );
  });
  it('5. otherwise there is no angle', () => {
    expect(resolveAdAngle(null, { seed: null })).toEqual({ status: 'none' });
  });
});

describe('angleChipText', () => {
  it('names a confirmed angle plainly and a leaning as a leaning', () => {
    expect(angleChipText({ status: 'confirmed', label: 'Discount offer' })).toBe('Discount offer');
    expect(angleChipText({ status: 'leaning', label: 'Everything you get', share: 0.5 })).toBe(
      'Leaning: Everything you get · 50%',
    );
    expect(angleChipText({ status: 'leaning', label: 'Everything you get', share: null })).toBe(
      'Leaning: Everything you get',
    );
    expect(angleChipText({ status: 'none' })).toBe('Not classified yet');
  });
  it('labels it as the communication angle for assistive tech', () => {
    expect(angleAriaLabel({ status: 'confirmed', label: 'Discount offer' })).toBe(
      'Communication angle: Discount offer',
    );
    expect(angleAriaLabel({ status: 'leaning', label: 'Everything you get', share: 0.5 })).toBe(
      'Communication angle: Leaning: Everything you get · 50%',
    );
  });
});

describe('cardAngles', () => {
  const ads = easyFitRows.map((r) => ad(r.ad_id));
  it('matches the subject ad by ad_id and quotes its hook', () => {
    const view = cardAngles(
      fatigueRec({ ad_id: '120252387195460236' }),
      [ad('120252387195460236')],
      easyFitRows as never,
    );
    expect(view.dominant).toEqual({ status: 'leaning', label: 'Everything you get', share: null });
    expect(view.hook).toBe('50% de descuento en tu anualidad');
    expect(view.mixed).toBe(false);
  });
  it('with no subject ad, reads the ad set ads the card shows', () => {
    const view = cardAngles(fatigueRec(), ads, easyFitRows as never);
    expect([...view.perAd.keys()]).toEqual(easyFitRows.map((r) => r.ad_id));
    expect(view.hook).toBe('Tu primer mes por solo $12');
  });
  it('flags mixed angles and names the dominant one, confirmed before leaning on a tie', () => {
    const rows = [
      { ...easyFitRows[0], angle_id: 'offer_discount' },
      { ...easyFitRows[1], angle_id: 'offer_discount' },
      { ...easyFitRows[2], angle_leaning: 'value_stack', angle_leaning_share: 0.5 },
    ];
    const view = cardAngles(fatigueRec(), ads, rows as never);
    expect(view.mixed).toBe(true);
    expect(view.dominant).toEqual({ status: 'confirmed', label: 'Discount offer' });
    expect(view.perAd.get('120252387195450236')).toEqual({
      status: 'leaning',
      label: 'Everything you get',
      share: 0.5,
    });
    const tie = cardAngles(
      fatigueRec(),
      ads.slice(0, 2),
      [rows[2], rows[0]].map((r, i) => ({ ...r, ad_id: ads[i]?.id })) as never,
    );
    expect(tie.dominant).toEqual({ status: 'confirmed', label: 'Discount offer' });
  });
  it('uses the seed when no row resolves, and none when nothing does', () => {
    expect(
      cardAngles(fatigueRec({ seed: { angleId: 'offer_discount' } }), ads, []).dominant,
    ).toEqual({
      status: 'confirmed',
      label: 'Discount offer',
    });
    expect(cardAngles(fatigueRec(), ads, []).dominant).toEqual({ status: 'none' });
    expect(cardAngles(fatigueRec(), ads, []).hook).toBeNull();
  });
  it('matches the subject id even before the ads have loaded', () => {
    const view = cardAngles(fatigueRec({ ad_id: '120252387195450236' }), [], easyFitRows as never);
    expect(view.hook).toBe('Entrena desde $249 en Ávila Camacho');
  });
});

describe('wearOutComparison', () => {
  const window = (spend: number, leads: number, clicks: number, impressions: number) => ({
    spend,
    leads,
    clicks,
    impressions,
  });
  // CTR 0.45% over 14 and 7 days, 0.32% over the last 3; cost per lead up 31%.
  const snapshot = {
    windows: {
      d3: window(393, 3, 32, 10000),
      d7: window(700, 7, 90, 20000),
      d14: window(1400, 14, 180, 40000),
    },
  } as never;
  const ctrSeries = {
    metric: 'ctr',
    unit: 'percent' as const,
    points: [
      { label: '3d', value: 0.0032 },
      { label: '7d', value: 0.0045 },
      { label: '14d', value: 0.0045 },
    ],
    threshold: 0.0045,
    thresholdLabel: '14d',
  };
  it('orders 14, 7, 3 days and scales every bar to the largest of the three', () => {
    const chart = wearOutComparison(ctrSeries, snapshot, 'leads');
    expect(chart?.rows.map((r) => r.label)).toEqual(['14 days', '7 days', '3 days']);
    expect(chart?.rows.map((r) => r.share)).toEqual([1, 1, 0.0032 / 0.0045]);
    expect(chart?.baselineShare).toBe(1);
  });
  it('flags the worst recent window, and only when it is worse than 14 days', () => {
    const chart = wearOutComparison(ctrSeries, snapshot, 'leads');
    expect(chart?.rows.map((r) => r.flagged)).toEqual([false, false, true]);
    expect(chart?.rows[2]?.changePct).toBeCloseTo(-28.9, 1);
    const steady = { ...ctrSeries, points: ctrSeries.points.map((p) => ({ ...p, value: 0.0045 })) };
    expect(wearOutComparison(steady, snapshot, 'leads')?.rows.some((r) => r.flagged)).toBe(false);
  });
  it('reads higher as worse for cost per result', () => {
    const cpa = {
      metric: 'cpa',
      unit: 'money' as const,
      points: [
        { label: '3d', value: 120 },
        { label: '7d', value: 140 },
        { label: '14d', value: 100 },
      ],
      threshold: null,
      thresholdLabel: null,
    };
    const chart = wearOutComparison(cpa, snapshot, 'leads');
    expect(chart?.rows.map((r) => r.flagged)).toEqual([false, true, false]);
    expect(chart?.rows.map((r) => r.share)).toEqual([100 / 140, 1, 120 / 140]);
    expect(chart?.costChangePct).toBeNull();
  });
  it('adds the cost per result change beside a CTR argument when the windows have results', () => {
    expect(wearOutComparison(ctrSeries, snapshot, 'leads')?.costChangePct).toBeCloseTo(31, 0);
    expect(wearOutComparison(ctrSeries, snapshot, 'purchases')?.costChangePct).toBeNull();
  });
  it('says nothing without a three-window series', () => {
    expect(wearOutComparison(null, snapshot, 'leads')).toBeNull();
    expect(
      wearOutComparison(
        { ...ctrSeries, metric: 'frequency', points: [{ label: '7d', value: 3 }] },
        snapshot,
        'leads',
      ),
    ).toBeNull();
  });
});

describe('creativeCardCopy — problem and instruction', () => {
  it('splits what is wrong from what to make, in fixed copy', () => {
    const fatigue = creativeCardCopy({
      kind: 'creative_refresh',
      trigger: 'F1_creative_fatigue',
      seed: null,
    });
    expect(fatigue.problem).toBe('Engagement is decaying while cost rises');
    expect(fatigue.instruction).toBe('Refresh the creative');
    const rebuild = creativeCardCopy({
      kind: 'variate_creative',
      trigger: 'C2_creative_winner',
      seed: { rebuildCraft: true },
    });
    expect(rebuild.instruction).toBe('Keep the angle, rebuild the execution');
  });
});

describe('the Meta fatigue card a row carries', () => {
  const EVIDENCE = {
    metric: 'ctr',
    value: 0.009,
    comparator: 'down 50% vs 14d',
    threshold: 0.018,
    window: 'd3' as const,
    estImpactPerDay: 12,
    source: 'engine',
  };
  const card = {
    variant: 'meta_creative_fatigue',
    ad_set_name: 'EF | Leads | Intereses fitness',
    creative_name: 'Before-and-after reel',
    ctr_now: 0.009,
    ctr_before: 0.018,
    days: 14,
    frequency: 2.6,
    replacement: null,
  };

  it('reads the card the engine carries in the evidence', () => {
    expect(metaFatigueCardOf({ evidence: { ...EVIDENCE, platformCard: card } })).toEqual(
      card as never,
    );
  });

  it('is null without one, with a malformed one, or with another variant', () => {
    expect(metaFatigueCardOf({ evidence: null })).toBeNull();
    expect(metaFatigueCardOf({ evidence: EVIDENCE })).toBeNull();
    expect(
      metaFatigueCardOf({ evidence: { ...EVIDENCE, platformCard: { ...card, ctr_now: 4 } } }),
    ).toBeNull();
    expect(
      metaFatigueCardOf({
        evidence: { ...EVIDENCE, platformCard: { ...card, variant: 'tiktok_creative_fatigue' } },
      }),
    ).toBeNull();
  });
});
