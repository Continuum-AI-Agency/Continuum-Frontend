import { describe, expect, it } from 'bun:test';

import {
  blockCategorySchema,
  cellsOfBlocks,
  chartBlockSchema,
  checkpointBlockV2LenientSchema,
  checkpointBlockV2Schema,
  classifyClaims,
  dataTableBlockSchema,
  degradeToNarrativeBlockV2,
  groundingViolationsOf,
  hasProseMarks,
  headersOfBlocks,
  insightListItemSchema,
  narrativeBlockSchema,
  numberReadingsOfToken,
  numbersInText,
  parseProseMarks,
  sectionOfBlockCategory,
  stripProseMarks,
  validateReport,
} from './jaina-report';

describe('checkpointBlockV2LenientSchema', () => {
  it('accepts a partial chart block that the strict schema rejects', () => {
    // Missing chart_config / category_key not on rows — violates the strict
    // chart-renderability invariants, so the strict schema must reject it.
    const partialChart = {
      block_id: 'b1',
      category: 'chart',
      scope: 'account',
      title: 'Spend over time',
      chart_type: 'line',
      data: [{ day: 'Mon', spend: 10 }],
      category_key: 'date',
    };

    expect(checkpointBlockV2Schema.safeParse(partialChart).success).toBe(false);
    expect(checkpointBlockV2LenientSchema.safeParse(partialChart).success).toBe(true);
  });

  it('rejects an object without a valid V2 category', () => {
    expect(checkpointBlockV2LenientSchema.safeParse({ category: 'legacy_graph' }).success).toBe(
      false,
    );
    expect(checkpointBlockV2LenientSchema.safeParse({ title: 'no category' }).success).toBe(false);
  });
});

describe('dataset-ref additive fields', () => {
  const validChart = {
    block_id: 'c1',
    category: 'chart',
    scope: 'account',
    title: 'Spend over time',
    chart_type: 'line',
    data: [
      { date: '2026-05-11', spend: 100 },
      { date: '2026-05-12', spend: 120 },
    ],
    chart_config: { spend: { label: 'Spend', color: '#000' } },
    category_key: 'date',
  };

  it('defaults dataset_id, data_meta, and currency_code to null when absent (back-compat)', () => {
    const parsed = chartBlockSchema.parse(validChart);
    expect(parsed.dataset_id).toBeNull();
    expect(parsed.data_meta).toBeNull();
    expect(parsed.currency_code).toBeNull();
  });

  it('carries an explicit currency_code on a chart block', () => {
    const parsed = chartBlockSchema.parse({
      ...validChart,
      currency_code: 'EUR',
      dataset_id: 'ds_spend_acct_30d',
      data_meta: [
        { date: '2026-05-11', campaign_id: 'c1' },
        { date: '2026-05-12', campaign_id: 'c1' },
      ],
    });
    expect(parsed.currency_code).toBe('EUR');
    expect(parsed.dataset_id).toBe('ds_spend_acct_30d');
    expect(parsed.data_meta?.[0]).toMatchObject({ campaign_id: 'c1' });
  });

  it("accepts a data_table column with format 'creative' + dataset_id + row_meta", () => {
    const parsed = dataTableBlockSchema.parse({
      block_id: 't1',
      category: 'data_table',
      scope: 'campaign',
      title: 'Top creatives',
      columns: [
        { key: 'creative', label: 'Creative', format: 'creative' },
        { key: 'spend', label: 'Spend', format: 'currency' },
      ],
      rows: [{ creative: 'Ad 1', spend: 1000 }],
      dataset_id: 'ds_creatives',
      row_meta: [{ creative: { creative_id: 'cr1', ad_id: 'ad9' }, entity_id: 'c1' }],
    });
    expect(parsed.dataset_id).toBe('ds_creatives');
    expect(parsed.columns[0].format).toBe('creative');
    expect(parsed.row_meta?.[0]).toMatchObject({ entity_id: 'c1' });
  });

  it('defaults legacy data tables to table rendering with no card field mapping', () => {
    const parsed = dataTableBlockSchema.parse({
      block_id: 't2',
      category: 'data_table',
      scope: 'campaign',
      title: 'Legacy table',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'Ad 1' }],
    });
    expect(parsed.render_mode).toBe('table');
    expect(parsed.card_fields).toBeNull();
  });

  it('accepts creative-card rendering with explicit row field keys', () => {
    const parsed = checkpointBlockV2Schema.parse({
      block_id: 't3',
      category: 'data_table',
      scope: 'campaign',
      title: 'Winning creatives',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'Ad 1', preview: 'https://example.com/ad.jpg', spend: 100 }],
      render_mode: 'creative_cards',
      card_fields: {
        creative: 'preview',
        title: 'name',
        metrics: ['spend'],
      },
    });
    expect(parsed.category).toBe('data_table');
    if (parsed.category !== 'data_table') throw new Error('expected data_table');
    expect(parsed.card_fields?.creative).toBe('preview');
    expect(parsed.card_fields?.metrics).toEqual(['spend']);
  });

  it('requires card field keys for creative-card rendering', () => {
    expect(
      dataTableBlockSchema.safeParse({
        block_id: 't4',
        category: 'data_table',
        scope: 'campaign',
        title: 'Broken cards',
        columns: [{ key: 'name', label: 'Name' }],
        rows: [{ name: 'Ad 1' }],
        render_mode: 'creative_cards',
      }).success,
    ).toBe(false);
  });
});

describe('degradeToNarrativeBlockV2', () => {
  it('turns an unsalvageable block into a valid narrative placeholder', () => {
    const degraded = degradeToNarrativeBlockV2({
      block_id: 'chart_7',
      category: 'chart',
      scope: 'campaign',
      title: 'Broken chart',
      data: 'not an array',
    });

    expect(narrativeBlockSchema.safeParse(degraded).success).toBe(true);
    expect(degraded.category).toBe('narrative');
    expect(degraded.block_id).toBe('chart_7');
    expect(degraded.scope).toBe('campaign');
    expect(degraded.title).toBe('Broken chart');
    expect(degraded.body).toContain('could not be rendered');
  });

  it('fills sane defaults when fields are missing', () => {
    const degraded = degradeToNarrativeBlockV2(null);
    expect(narrativeBlockSchema.safeParse(degraded).success).toBe(true);
    expect(degraded.scope).toBe('account');
    expect(degraded.title).toBe('Section unavailable');
  });
});

describe('Prism blocks + validateReport', () => {
  const base = { block_id: 'b', scope: 'account', title: 'T', priority: 'primary' as const };
  it('parses the four new block categories', () => {
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'data_scope',
        dates: 'Sep 4 – Sep 17, 2026',
        source: 'db',
      }).success,
    ).toBe(true);
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'actions',
        rows: [
          {
            priority: 'P1',
            entity: { name: 'Cold Lookalike' },
            action: 'Pause',
            sizing: '~$120/day recoverable',
            evidence: { metric: 'CPA', value: 71, window: 'L14D', comparator: 'vs $40 target' },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'goal_pacing',
        budget: 3000,
        spent: 1200,
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        elapsed_pct: 0.5,
        pace_ratio: 0.8,
        status: 'underpacing',
      }).success,
    ).toBe(true);
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'survey',
        term: 'recent',
        used: 'last 7 days',
        alternatives: ['last 14 days', 'last 30 days'],
      }).success,
    ).toBe(true);
  });

  it('flags a report with no scope, a naked KPI, a guessed percent, and an undeclared truncation', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, spend: i }));
    const violations = validateReport([
      {
        ...base,
        block_id: 'grid',
        category: 'metric_grid',
        metrics: [
          {
            label: 'CTR',
            value: 0.92,
            unit: null,
            format: 'percent',
            percent_basis: null,
            change: null,
            change_direction: null,
            severity: 'neutral',
          },
        ],
        dataset_id: null,
      },
      {
        ...base,
        block_id: 'table',
        category: 'data_table',
        columns: [
          { key: 'name', label: 'Campaign', format: 'text', align: 'left', percent_basis: null },
          { key: 'spend', label: 'Spend', format: 'currency', align: 'right', percent_basis: null },
        ],
        rows,
        notes: null,
        dataset_id: null,
        row_meta: null,
        render_mode: 'table',
        card_fields: null,
      },
    ] as never);
    expect(violations.map((v) => v.code)).toEqual([
      'data_scope_missing',
      'context_floor_missing',
      'percent_basis_missing',
      'table_truncation_undeclared',
      'table_totals_missing',
    ]);
  });

  it('is clean for a scoped report with a floor, declared bases and a totals row', () => {
    const violations = validateReport([
      {
        ...base,
        block_id: 's',
        category: 'data_scope',
        dates: 'L14D',
        timezone: 'UTC',
        source: 'db',
        notes: [],
      },
      {
        ...base,
        block_id: 'c',
        category: 'comparison',
        before_label: 'Prior',
        after_label: 'This',
        baseline_label: 'L30D',
        pairs: [
          {
            label: 'CTR',
            before: 0.8,
            after: 0.92,
            baseline: 0.85,
            unit: null,
            format: 'percent',
            percent_basis: 'points',
            change: 0.15,
            change_direction: 'up',
            severity: 'positive',
            cite_ids: [],
          },
        ],
        citations: [],
      },
    ] as never);
    expect(violations).toEqual([]);
  });

  // The actions block is the one built to be deep-linked, and live it shipped every row on
  // `account-521903353286118` while the prose beside it named ITESO and CAÑADAS. The schema
  // only ever required a non-empty string; this rule is the witness, the Backend resolver
  // (`resolveBlockEntities`) is the fix, and both read the same name-matching helpers.
  describe('action_entity_is_account', () => {
    const actionsBlock = (entity: Record<string, unknown>, action: string) => ({
      ...base,
      block_id: 'a',
      category: 'actions',
      rows: [
        {
          priority: 'P1',
          entity,
          action,
          sizing: null,
          evidence: { metric: 'roas', value: 0.53, unit: null, window: 'L30D', comparator: null },
          cite_ids: [],
        },
      ],
      citations: [],
    });
    const scope = {
      ...base,
      block_id: 's',
      category: 'data_scope',
      dates: 'L30D',
      timezone: 'UTC',
      source: 'db',
      notes: [],
    };
    const seen = [
      {
        level: 'campaign' as const,
        id: '120230000000002',
        name: 'ITESO // MENSAJES // AGOSTO 2026',
      },
      { level: 'adset' as const, id: '6650000000001', name: 'Broad 25-45' },
    ];

    it('flags an account row whose clause names a campaign the turn saw', () => {
      const violations = validateReport(
        [
          scope,
          actionsBlock(
            { id: null, name: 'account-521903353286118', kind: null, level: null },
            'Reduce budget on ITESO // MENSAJES // AGOSTO 2026 by 30%',
          ),
        ] as never,
        { entities: seen },
      );
      expect(violations.map((v) => v.code)).toEqual(['action_entity_is_account']);
      expect(violations[0].message).toContain('ITESO // MENSAJES // AGOSTO 2026');
    });

    it('flags it from the bold span alone when no entity list was passed', () => {
      const violations = validateReport([
        scope,
        actionsBlock(
          {
            id: '521903353286118',
            name: 'account-521903353286118',
            kind: 'account',
            level: 'account',
          },
          'Shift 30% of budget into **CAÑADAS**',
        ),
      ] as never);
      expect(violations.map((v) => v.code)).toEqual(['action_entity_is_account']);
    });

    it('is clean for an account-wide move that names no entity, and for a row on a campaign', () => {
      expect(
        validateReport(
          [
            scope,
            actionsBlock(
              {
                id: '521903353286118',
                name: 'account-521903353286118',
                kind: 'account',
                level: 'account',
              },
              'Consolidate budgets into top-converting ad sets',
            ),
            actionsBlock(
              {
                id: '120230000000002',
                name: 'ITESO // MENSAJES // AGOSTO 2026',
                kind: 'campaign',
                level: 'campaign',
              },
              'Reduce budget by 30%',
            ),
          ] as never,
          { entities: seen },
        ),
      ).toEqual([]);
    });
  });

  it('carries the entity level on an action row and defaults it to null', () => {
    const parsed = checkpointBlockV2Schema.parse({
      ...base,
      category: 'actions',
      rows: [
        {
          priority: 'P2',
          entity: { name: 'Broad 25-45', level: 'adset', id: '6650000000001' },
          action: 'Pause',
          evidence: { metric: 'CPA', value: 71, window: 'L14D' },
        },
        {
          priority: 'P3',
          entity: { name: 'Cold Lookalike' },
          action: 'Pause',
          evidence: { metric: 'CPA', value: 71, window: 'L14D' },
        },
      ],
    });
    if (parsed.category !== 'actions') throw new Error('expected actions');
    expect(parsed.rows[0].entity.level).toBe('adset');
    expect(parsed.rows[1].entity.level).toBeNull();
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'actions',
        rows: [
          {
            priority: 'P1',
            entity: { name: 'X', level: 'portfolio' },
            action: 'Pause',
            evidence: { metric: 'CPA', value: 71, window: 'L14D' },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

// The emphasis prose carries inside a sentence. One grammar, three readers (the Backend
// prompt, the Backend summary clip, the Frontend renderer) — so the grammar is pinned
// here, where all three import it from.
describe('prose marks', () => {
  it('splits a sentence into text runs and marks, in order, keeping every character', () => {
    const text = 'Spend on **ITESO** fell to [risk: 0.49 ROAS] over the [window: last 30 days].';
    expect(parseProseMarks(text)).toEqual([
      { kind: 'text', value: 'Spend on **ITESO** fell to ' },
      { kind: 'mark', tone: 'risk', value: '0.49 ROAS' },
      { kind: 'text', value: ' over the ' },
      { kind: 'mark', tone: 'window', value: 'last 30 days' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('knows every tone the renderer can colour, and trims the padding inside a mark', () => {
    const tones = parseProseMarks(
      '[risk:  a ] [watch: b] [positive: c] [neutral: d] [window: e]',
    ).filter((segment) => segment.kind === 'mark');
    expect(tones.map((segment) => (segment.kind === 'mark' ? segment.tone : null))).toEqual([
      'risk',
      'watch',
      'positive',
      'neutral',
      'window',
    ]);
    expect(tones[0]).toEqual({ kind: 'mark', tone: 'risk', value: 'a' });
  });

  it('leaves citations and ordinary brackets alone — an unknown keyword is not a mark', () => {
    const text = 'Spend rose 24% [cite:c1] (see [table 2]) and [alert: x].';
    expect(hasProseMarks(text)).toBe(false);
    expect(parseProseMarks(text)).toEqual([{ kind: 'text', value: text }]);
  });

  it('refuses a mark that spans a line or nests a bracket', () => {
    expect(hasProseMarks('[risk: 0.9\nROAS]')).toBe(false);
    expect(hasProseMarks('[risk: [cite:c1] 0.9]')).toBe(false);
  });

  it('strips marks down to their inner text for surfaces that cannot render them', () => {
    expect(stripProseMarks('Fell to [risk: 0.49 ROAS] over the [window: last 30 days].')).toBe(
      'Fell to 0.49 ROAS over the last 30 days.',
    );
  });

  it('yields no segments for empty prose', () => {
    expect(parseProseMarks('')).toEqual([]);
  });
});

describe('insightListItemSchema.highlight', () => {
  const item = {
    item_type: 'insight',
    title: 'ROAS trails break-even',
    summary: 'Account ROAS sits at 0.90 on 80,405 MXN of spend.',
    rationale: 'Below the 1.0 line the brand set.',
    impact: 'Every peso spent returns less than a peso.',
    severity: 'risk',
  };

  it('carries the judged figure the renderer colours, and defaults to null when absent', () => {
    expect(insightListItemSchema.parse({ ...item, highlight: '0.90' }).highlight).toBe('0.90');
    expect(insightListItemSchema.parse(item).highlight).toBeNull();
  });
});

// A creative or audience sentence is a finding after the tool that reads creatives or
// audiences ran, and a fabrication after a turn of spend and CPA. The gate is the tool
// call, never the word — so the classifier is pinned in both languages and the gate is
// pinned on both sides of the same sentence.
describe('classifyClaims', () => {
  const kindsOf = (text: string, entities?: Parameters<typeof classifyClaims>[1]['entities']) =>
    classifyClaims(text, { entities }).map((claim) => claim.kind);

  it('reads creative, audience and landing-page claims in English', () => {
    expect(kindsOf('The video hook loses viewers in the first 3 seconds.')).toEqual([
      'creative',
      'figure',
    ]);
    expect(kindsOf('The headline copy promises a discount the ad never shows.')).toEqual([
      'creative',
    ]);
    expect(kindsOf('Targeting women 25-34 with a lookalike of purchasers.')).toEqual([
      'audience',
      'figure',
    ]);
    expect(kindsOf('The landing page loads slowly on mobile.')).toEqual(['landing']);
  });

  it('reads the same claims in Spanish', () => {
    expect(kindsOf('El gancho del video no retiene en los primeros segundos.')).toEqual([
      'creative',
    ]);
    expect(kindsOf('El titular y el ángulo de la creatividad se sienten genéricos.')).toEqual([
      'creative',
    ]);
    expect(kindsOf('La audiencia de intereses supera a la segmentación por edad.')).toEqual([
      'audience',
    ]);
    expect(kindsOf('La página de destino tarda en cargar.')).toEqual(['landing']);
    expect(kindsOf('El público de mujeres de 25 a 34 años convierte mejor.')).toEqual([
      'audience',
      'figure',
    ]);
  });

  it('classifies a sentence that carries only a number as a figure', () => {
    expect(kindsOf('Spend reached 80,405 MXN over the last 30 days.')).toEqual(['figure']);
    expect(kindsOf('Nothing changed this week.')).toEqual([]);
  });

  it('does not mistake a metric name for a read of the thing it is named after', () => {
    expect(kindsOf('Video views fell 20% while landing page views held.')).toEqual(['figure']);
    expect(kindsOf('Hook rate sits at 18% on the account.')).toEqual(['figure']);
    expect(kindsOf('Las reproducciones de video cayeron 12%.')).toEqual(['figure']);
    expect(kindsOf('ThruPlays cost 0.40 MXN each.')).toEqual(['figure']);
  });

  it('does not read an entity name as a claim about its words', () => {
    expect(kindsOf('**VIDEO Q3 - PROSPECTING** spent 12,000 MXN.')).toEqual(['figure']);
    expect(
      kindsOf('Audiencia Fria Interes spent the most.', [
        { level: 'adset', id: '1', name: 'Audiencia Fria Interes' },
      ]),
    ).toEqual([]);
  });

  it('splits a paragraph into sentences and reports each claim on its own sentence', () => {
    const claims = classifyClaims(
      'ROAS sits at 0.90. The video hook is weak.\nThe audience is too broad.',
    );
    expect(claims).toEqual([
      { kind: 'figure', span: 'ROAS sits at 0.90.' },
      { kind: 'creative', span: 'The video hook is weak.' },
      { kind: 'audience', span: 'The audience is too broad.' },
    ]);
  });
});

describe('groundingViolationsOf', () => {
  const base = { block_id: 'ins', scope: 'account', title: 'Reading', priority: 'primary' };
  const insight = (summary: string, cite_ids: string[] = []) => ({
    ...base,
    category: 'insight_list',
    items: [
      {
        item_type: 'insight',
        title: 'Reading',
        summary,
        rationale: 'Because.',
        impact: 'Fix it.',
        severity: 'risk',
        cite_ids,
      },
    ],
  });
  const hook = 'The video hook loses viewers before the offer.';

  it('flags a creative claim when no creative-reading tool ran this turn', () => {
    expect(groundingViolationsOf(insight(hook, ['c1']), { toolKinds: ['figure'] })).toEqual([
      { kind: 'creative', span: hook, reason: 'claim_without_source' },
    ]);
  });

  it('is clean for the same sentence once a creative tool ran and the row cites it', () => {
    expect(groundingViolationsOf(insight(hook, ['c1']), { toolKinds: ['creative'] })).toEqual([]);
  });

  it('flags the same sentence as uncited when the tool ran and the row cites nothing', () => {
    expect(groundingViolationsOf(insight(hook), { toolKinds: ['creative'] })).toEqual([
      { kind: 'creative', span: hook, reason: 'claim_uncited' },
    ]);
  });

  it('never flags a figure, and never fabricates a citation', () => {
    const block = insight('ROAS sits at 0.90 on 80,405 MXN of spend.');
    expect(groundingViolationsOf(block, { toolKinds: [] })).toEqual([]);
    expect(block.items[0].cite_ids).toEqual([]);
  });

  it('grades an action row on its clause and a narrative on its body, which has no cite slot', () => {
    const action = {
      ...base,
      category: 'actions',
      rows: [
        {
          priority: 'P1',
          entity: { name: 'CAÑADAS // MENSAJES', level: 'campaign', id: '1' },
          action: 'Refresh the creative angle on the carousel.',
          evidence: { metric: 'CPA', value: 71, window: 'L14D' },
          cite_ids: [],
        },
      ],
    };
    expect(groundingViolationsOf(action, { toolKinds: ['creative'] })).toEqual([
      {
        kind: 'creative',
        span: 'Refresh the creative angle on the carousel.',
        reason: 'claim_uncited',
      },
    ]);
    const narrative = {
      ...base,
      category: 'narrative',
      body: 'The audience skews older than the buyer. Spend is flat.',
      highlights: [],
    };
    expect(groundingViolationsOf(narrative, { toolKinds: [] })).toEqual([
      {
        kind: 'audience',
        span: 'The audience skews older than the buyer.',
        reason: 'claim_without_source',
      },
    ]);
    expect(groundingViolationsOf(narrative, { toolKinds: ['audience'] })).toEqual([]);
  });

  it('reports each ungrounded kind once per sentence, and a title that claims is a claim', () => {
    const both = 'The video hook misses the audience it targets.';
    expect(groundingViolationsOf(insight(both), { toolKinds: [] }).map((v) => v.kind)).toEqual([
      'creative',
      'audience',
    ]);
    const titled = {
      ...insight('Spend is flat.'),
      items: [{ ...insight('Spend is flat.').items[0], title: 'Creative fatigue' }],
    };
    expect(groundingViolationsOf(titled, { toolKinds: [] })).toEqual([
      { kind: 'creative', span: 'Creative fatigue', reason: 'claim_without_source' },
    ]);
  });
});

describe('validateReport with the turn tool kinds', () => {
  const base = { block_id: 'b', scope: 'account', title: 'T', priority: 'primary' as const };
  const report = [
    { ...base, block_id: 's', category: 'data_scope', dates: 'L14D', source: 'api', notes: [] },
    {
      ...base,
      block_id: 'ins',
      category: 'insight_list',
      items: [
        {
          item_type: 'insight',
          title: 'Reading',
          summary: 'The video hook is weak.',
          rationale: 'It loses 60% before the offer.',
          impact: 'Fix it.',
          severity: 'risk',
          cite_ids: [],
        },
      ],
      citations: [],
    },
  ] as never;

  it('names claim_without_source and claim_uncited by block id, and stays silent without tool kinds', () => {
    expect(validateReport(report).map((v) => v.code)).toEqual([]);
    const without = validateReport(report, { toolKinds: ['figure'] });
    expect(without.map((v) => [v.code, v.block_id])).toEqual([['claim_without_source', 'ins']]);
    expect(without[0].message).toContain('no creative-reading tool call this turn');
    const uncited = validateReport(report, { toolKinds: ['creative'] });
    expect(uncited.map((v) => [v.code, v.block_id])).toEqual([['claim_uncited', 'ins']]);
  });
});

describe('block grounding field', () => {
  const base = { block_id: 'b', scope: 'account', title: 'T', priority: 'primary' as const };
  it('defaults to null and carries the violations the Backend wrote', () => {
    const plain = checkpointBlockV2Schema.parse({ ...base, category: 'narrative', body: 'x' });
    expect(plain.grounding).toBeNull();
    const flagged = checkpointBlockV2Schema.parse({
      ...base,
      category: 'narrative',
      body: 'The video hook is weak.',
      grounding: [
        { kind: 'creative', span: 'The video hook is weak.', reason: 'claim_without_source' },
      ],
    });
    expect(flagged.grounding).toEqual([
      { kind: 'creative', span: 'The video hook is weak.', reason: 'claim_without_source' },
    ]);
    expect(
      checkpointBlockV2Schema.safeParse({
        ...base,
        category: 'narrative',
        body: 'x',
        grounding: [{ kind: 'vibe', span: 'x', reason: 'claim_uncited' }],
      }).success,
    ).toBe(false);
  });
});

// JG-breakdown-without-tool: a segment WITH a share or a metric beside it is a breakdown
// claim, which only a breakdown read produces; a segment alone is an audience claim, which
// a targeting read can stand behind.
describe('classifyClaims — breakdown', () => {
  const kindsOf = (text: string) => classifyClaims(text).map((claim) => claim.kind);

  it('reads a segment share as a breakdown claim beside the audience claim, in both languages', () => {
    expect(kindsOf('18–24 accounts for 41% of spend and women drive 63% of results.')).toEqual([
      'audience',
      'breakdown',
      'figure',
    ]);
    expect(kindsOf('Mujeres de 25–34 concentran el 58% del gasto y convierten mejor.')).toEqual([
      'audience',
      'breakdown',
      'figure',
    ]);
    expect(kindsOf('Instagram placements carried most of the spend.')).toEqual([
      'audience',
      'breakdown',
    ]);
  });

  it('leaves a targeting statement an audience claim: no share, no metric', () => {
    expect(kindsOf('Targeting women 25-34 with a lookalike of purchasers.')).toEqual([
      'audience',
      'figure',
    ]);
    expect(kindsOf('El público de mujeres de 25 a 34 años convierte mejor.')).toEqual([
      'audience',
      'figure',
    ]);
  });

  it('is claim_without_source after a targeting read and clean after a breakdown read', () => {
    const block = {
      block_id: 'ins',
      category: 'insight_list',
      items: [
        {
          title: 'Split',
          summary: '18–24 accounts for 41% of spend.',
          rationale: '',
          impact: '',
          cite_ids: ['d1'],
        },
      ],
    };
    expect(groundingViolationsOf(block, { toolKinds: ['audience'] })).toEqual([
      {
        kind: 'breakdown',
        span: '18–24 accounts for 41% of spend.',
        reason: 'claim_without_source',
      },
    ]);
    expect(groundingViolationsOf(block, { toolKinds: ['audience', 'breakdown'] })).toEqual([]);
  });
});

// JG-invented-revenue: a figure a block RENDERS is graded against the numbers the turn's
// tool outputs carry, when the caller supplies them. Prose figures stay ungraded.
describe('groundingViolationsOf — rendered figures', () => {
  const figures = [15986.35, 412_910, 9874, 0, 2.39, 1.62, 38.72, 0.0412, 24_900];
  const table = {
    block_id: 'roas',
    category: 'data_table',
    columns: [
      { key: 'campaign', label: 'Campaign', format: 'text' },
      { key: 'spend', label: 'Spend', format: 'currency' },
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
    ],
    rows: [{ campaign: 'Leads 2024', spend: 15986.35, revenue: 'Revenue: $3,000.00', ctr: '2.4%' }],
  };

  it('flags the cell no tool output carries and leaves the measured cells alone', () => {
    expect(groundingViolationsOf(table, { toolKinds: [], figures })).toEqual([
      { kind: 'figure', span: 'Revenue: $3,000.00', reason: 'claim_without_source' },
    ]);
  });

  it('grades nothing without a figure set', () => {
    expect(groundingViolationsOf(table, { toolKinds: [] })).toEqual([]);
  });

  it('accepts rounding to the printed precision, a K suffix, and a ratio printed as a percent', () => {
    const grid = {
      block_id: 'g',
      category: 'metric_grid',
      metrics: [
        { label: 'Spend', value: '16.0K', format: 'currency' },
        { label: 'Clicks', value: 9_870, format: 'number' },
        { label: 'CVR', value: '4.12%', format: 'percent' },
        { label: 'Reach', value: '24.9k', format: 'number' },
        { label: 'Revenue', value: 3000, format: 'currency' },
      ],
    };
    expect(groundingViolationsOf(grid, { toolKinds: [], figures })).toEqual([
      { kind: 'figure', span: 'Revenue: 3000', reason: 'claim_without_source' },
    ]);
  });

  it('reads a text column, the chart category axis and a zero as no claim at all', () => {
    const chart = {
      block_id: 'c',
      category: 'chart',
      category_key: 'date',
      value_format: 'currency',
      data: [{ date: '2026-09-01', spend: 15986.35 }],
    };
    const zero = {
      block_id: 'z',
      category: 'metric_grid',
      metrics: [{ label: 'Purchases', value: 0, format: 'number' }],
    };
    expect(groundingViolationsOf(chart, { toolKinds: [], figures })).toEqual([]);
    expect(groundingViolationsOf(zero, { toolKinds: [], figures })).toEqual([]);
  });

  // JG-prose-figures-ungraded: a figure in prose is held to the figure set like a cell; the
  // window, entity count and delta a sentence computes are the controls the old rule protected.
  it('grades a figure in prose, and leaves the window, count and delta a sentence computes alone', () => {
    const narrative = { block_id: 'n', category: 'narrative', body: 'Revenue reached 3,000 MXN.' };
    expect(groundingViolationsOf(narrative, { toolKinds: [], figures })).toEqual([
      { kind: 'figure', span: 'Revenue reached 3,000 MXN.', reason: 'claim_without_source' },
    ]);
    const computed = {
      block_id: 'n',
      category: 'narrative',
      body: 'Over the last 30 days the top 3 campaigns spent 15,986.35 MXN, up 12% on the prior 7 days; CTR sits at 2.39%, 0.4 pp higher.',
    };
    expect(groundingViolationsOf(computed, { toolKinds: [], figures })).toEqual([]);
  });
});

describe('cellsOfBlocks / headersOfBlocks', () => {
  it('walks every rendered value with its label and format, in render order', () => {
    const cells = cellsOfBlocks([
      {
        block_id: 'g',
        category: 'metric_grid',
        metrics: [{ label: 'Spend', value: 1, format: 'currency' }],
      },
      {
        block_id: 't',
        category: 'data_table',
        columns: [{ key: 'name', label: 'Name', format: 'text' }],
        rows: [{ name: 'A', cost: 2 }],
      },
      {
        block_id: 'p',
        category: 'comparison',
        pairs: [{ label: 'CPA', before: 3, after: 4, format: 'currency' }],
      },
      { block_id: 'a', category: 'actions', rows: [{ evidence: { metric: 'CPA', value: 5 } }] },
      { block_id: 'c', category: 'chart', category_key: 'day', data: [{ day: 'Mon', spend: 6 }] },
      { block_id: 'gp', category: 'goal_pacing', budget: 7, spent: 8, projected_end: null },
    ]);
    expect(cells.map((cell) => [cell.where, cell.label, cell.format, cell.value])).toEqual([
      ['g.metrics[0].value', 'Spend', 'currency', 1],
      ['t.rows[0].name', 'Name', 'text', 'A'],
      ['t.rows[0].cost', 'cost', 'text', 2],
      ['p.pairs[0].before', 'CPA', 'currency', 3],
      ['p.pairs[0].after', 'CPA', 'currency', 4],
      ['p.pairs[0].baseline', 'CPA', 'currency', undefined],
      ['a.rows[0].evidence.value', 'CPA', null, 5],
      ['c.data[0].day', 'day', 'text', 'Mon'],
      ['c.data[0].spend', 'spend', 'number', 6],
      ['gp.budget', 'budget', null, 7],
      ['gp.spent', 'spent', null, 8],
      ['gp.projected_end', 'projected_end', null, null],
    ]);
    expect(
      headersOfBlocks([
        { block_id: 'c', category: 'chart', x_axis_label: 'Day', y_axis_label: 'Spend (MXN)' },
      ]).map((header) => header.value),
    ).toEqual(['Day', 'Spend (MXN)']);
  });

  it('reads printed numbers with their precision', () => {
    expect(numberReadingsOfToken('24.9', 'k')).toEqual([{ value: 24_900, decimals: -2 }]);
    expect(numberReadingsOfToken('3,000.00')).toEqual([{ value: 3000, decimals: 2 }]);
    expect(numbersInText('Spend was MX$73,712.61 across 1,424,702 impressions.')).toEqual([
      73712.61, 1424702,
    ]);
  });
});

describe('sectionOfBlockCategory', () => {
  it('keeps the blocks that state the answer in the answer', () => {
    for (const category of ['narrative', 'insight_list', 'actions', 'survey'] as const) {
      expect(sectionOfBlockCategory(category)).toBe('answer');
    }
  });

  it('files the figures the answer rests on under its justification', () => {
    for (const category of [
      'data_scope',
      'metric_grid',
      'chart',
      'data_table',
      'comparison',
      'goal_pacing',
    ] as const) {
      expect(sectionOfBlockCategory(category)).toBe('justification');
    }
  });

  it('assigns every block category a section', () => {
    for (const category of blockCategorySchema.options) {
      expect(['answer', 'justification']).toContain(sectionOfBlockCategory(category));
    }
  });
});
