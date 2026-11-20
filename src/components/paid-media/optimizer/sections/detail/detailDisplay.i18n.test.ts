import { describe, expect, it } from 'bun:test';
import {
  type CpaSeriesPoint,
  getOptimizationMetricDefinition,
  RecommendationEvidenceSchema,
  type ResolvedRange,
} from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';
import en from '../../../../../../messages/scale/en.json';
import es from '../../../../../../messages/scale/es.json';
import pt from '../../../../../../messages/scale/pt-BR.json';
import {
  asOfLine,
  evidenceLine,
  formatSettingsValue,
  queueSummary,
  triggerReason,
  withHonestCapBinding,
} from '../recQueueModel';
import { buildBeforeAfter, cycleWhen } from './beforeAfterModel';
import { buildDailyRead } from './dailyReadModel';
import {
  anchorOf,
  blockerSentence,
  buildPortfolioHeadline,
  isComparison,
  relevantTiles,
  resultNouns,
  segmentText,
  sentenceFigures,
  statusSentence,
} from './headlineModel';
import type { HeroMismatch } from './heroHeaderModel';
import { REAL_BODIES, readBody } from './news/realBodies.fixture';

const range: ResolvedRange = {
  spec: { kind: 'preset', preset: 'd7' },
  from: '2026-09-21',
  to: '2026-09-27',
  days: 7,
  label: 'Last 7 days',
  previous: { from: '2026-09-14', to: '2026-09-20' },
  lookback: 'd7',
  window: 'd7',
  flightMissing: false,
};
const series: CpaSeriesPoint[] = [
  {
    cycle_ts: '2026-09-28T02:05:00Z',
    spend_d3: 90,
    conv_d3: 3,
    spend_d7: 210,
    conv_d7: 7,
    spend_d14: 420,
    conv_d14: 14,
    adsets: 3,
  },
  {
    cycle_ts: '2026-09-21T02:05:00Z',
    spend_d3: 120,
    conv_d3: 3,
    spend_d7: 280,
    conv_d7: 7,
    spend_d14: 560,
    conv_d14: 14,
    adsets: 3,
  },
];
const now = Date.parse('2026-10-01T12:00:00Z');
const rawFigures = (sentence: Parameters<typeof sentenceFigures>[0]) =>
  sentenceFigures(sentence)
    .map(({ text: _, ...figure }) => figure)
    .sort((a, b) => a.key.localeCompare(b.key));
const plain = (sentence: Parameters<typeof sentenceFigures>[0]) =>
  sentence.map(segmentText).join('');
for (const { locale, messages } of [
  { locale: 'en', messages: en },
  { locale: 'pt-BR', messages: pt },
  { locale: 'es', messages: es },
] as const) {
  const t = createTranslator({
      locale,
      timeZone: 'UTC',
      messages: { scale: messages },
      namespace: 'scale',
      onError(error) {
        throw error;
      },
    }),
    translate = createOptimizerDisplayTranslate(t);
  describe(`detail display integrity ${locale}`, () => {
    it('retains all captured-body figures, comparison tones, IDs, counts and states', () => {
      for (const name of Object.keys(REAL_BODIES) as Array<keyof typeof REAL_BODIES>) {
        const { view, report, dailyTotal } = readBody(name);
        const portfolio = report.portfolio ?? {};
        const metric = getOptimizationMetricDefinition(
          typeof portfolio.objective === 'string' ? portfolio.objective : null,
        );
        const args = {
          view,
          report,
          portfolio: {
            name: typeof portfolio.name === 'string' ? portfolio.name : 'Account source name',
            daily_total: dailyTotal,
            apply_mode: typeof portfolio.apply_mode === 'string' ? portfolio.apply_mode : null,
          },
          metric,
          currency: 'MXN',
          mismatch: null,
          now,
        };
        const before = JSON.stringify({ view, report });
        const original = buildPortfolioHeadline(args),
          shown = buildPortfolioHeadline({ ...args, translate, locale });
        expect(rawFigures(shown.status)).toEqual(rawFigures(original.status));
        expect(rawFigures(shown.opportunity)).toEqual(rawFigures(original.opportunity));
        expect(shown.status.filter(isComparison).map((c) => c.tone)).toEqual(
          original.status.filter(isComparison).map((c) => c.tone),
        );
        expect(shown.decisions).toEqual(original.decisions);
        expect(shown.tiles.map((tile) => ({ figure: tile.figure, state: tile.state }))).toEqual(
          original.tiles.map((tile) => ({ figure: tile.figure, state: tile.state })),
        );
        expect(plain(shown.status)).not.toContain('\uFFF0');
        const tiles = relevantTiles({
          headline: shown,
          brief: view.brief,
          items: report.latest_items,
          dailyTotal,
          currency: 'MXN',
          translate,
          locale,
        });
        const defaults = relevantTiles({
          headline: original,
          brief: view.brief,
          items: report.latest_items,
          dailyTotal,
          currency: 'MXN',
        });
        expect(
          tiles.map((tile) => ({ key: tile.key, figure: tile.figure, state: tile.state })),
        ).toEqual(
          defaults.map((tile) => ({ key: tile.key, figure: tile.figure, state: tile.state })),
        );
        expect(JSON.stringify({ view, report })).toBe(before);
      }
    });
    it('preserves source names, descriptor language and model-authored reports', () => {
      expect(resultNouns('leads', 'Custom demos — Keep CAPITALS', translate)).toEqual({
        one: 'Custom demos — Keep CAPITALS',
        many: 'Custom demos — Keep CAPITALS',
      });
      const { view, report, dailyTotal } = readBody('formularios');
      const modelText = 'Texto original gerado pela IA 123';
      const authoredView = {
        ...view,
        source: 'brief' as const,
        brief: {
          ...view.brief,
          model: 'provider-authored',
          hero: { ...view.brief.hero, headline: modelText },
        },
      };
      const shown = buildPortfolioHeadline({
        view: authoredView,
        report,
        portfolio: { name: 'Customer NAME', daily_total: dailyTotal, apply_mode: 'recommend' },
        metric: getOptimizationMetricDefinition('lead'),
        currency: 'MXN',
        mismatch: null,
        now,
        translate,
        locale,
      });
      expect(shown.read.sentence).toBe(modelText);
      expect(shown.read.label).toContain('Customer NAME');
      const rows = buildDailyRead(view, dailyTotal, translate),
        original = buildDailyRead(view, dailyTotal);
      expect(
        rows.map((row) => ({
          id: row.id,
          module: row.module,
          tier: row.tier,
          reason: row.reason,
          basis: row.basis,
          kind: row.cta.kind,
          rowKey: row.cta.rowKey,
        })),
      ).toEqual(
        original.map((row) => ({
          id: row.id,
          module: row.module,
          tier: row.tier,
          reason: row.reason,
          basis: row.basis,
          kind: row.cta.kind,
          rowKey: row.cta.rowKey,
        })),
      );
    });
    it('keeps the account scheduling timezone and UTC calendar windows independent', () => {
      const { report, view } = readBody('formularios'),
        metric = getOptimizationMetricDefinition('lead');
      const args = {
        report,
        series,
        range,
        events: [],
        metric,
        target: 35,
        timeZone: 'America/Mexico_City',
      };
      const original = buildBeforeAfter(args),
        shown = buildBeforeAfter({ ...args, translate, locale });
      for (const which of ['before', 'after'] as const) {
        expect(shown[which]?.spend).toBe(original[which]?.spend);
        expect(shown[which]?.results).toBe(original[which]?.results);
        expect(shown[which]?.cost).toBe(original[which]?.cost);
      }
      expect(shown.projection).toEqual(original.projection);
      expect(shown.lastCycle?.at).toBe(original.lastCycle?.at);
      const stamp = series[0]!.cycle_ts;
      const localTime = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: args.timeZone,
      }).format(new Date(stamp));
      expect(cycleWhen(stamp, args.timeZone, locale)).toContain(localTime);
      const anchor = anchorOf({
        growth: view.brief.growth,
        words: resultNouns('leads', 'Leads', translate),
        currency: 'MXN',
        days: 7,
        beforeAfter: shown,
        translate,
        locale,
      });
      expect(anchor.figure.raw).toBe(view.brief.growth.cost_per_result);
      expect(anchor.windows.map((window) => window.label)).toEqual([
        shown.after?.short,
        shown.before?.short,
      ]);
    });
    it('uses whole plurals in mismatch/zero-signal states and preserves structured figure slots', () => {
      const { view } = readBody('formularios'),
        growth = {
          ...view.brief.growth,
          results: 1,
          cost_per_result: 38.59,
          target: 35,
          deltas: { spend: null, results: null, cost_per_result: -0.34 },
        };
      const words = resultNouns('leads', 'Leads', translate);
      const shown = statusSentence(growth, words, 'MXN', 1, null, translate, locale);
      expect(rawFigures(shown)).toEqual(rawFigures(statusSentence(growth, words, 'MXN', 1)));
      expect(plain(shown)).toContain(
        locale === 'en' ? '1 day' : locale === 'pt-BR' ? '1 dia' : '1 día',
      );
      const mismatch: HeroMismatch = {
        scope: 'some',
        mismatched: 1,
        total: 2,
        bought: 'conversations',
        measures: 'leads',
        actions: [],
      };
      expect(
        blockerSentence({ growth, words, currency: 'MXN', days: 1, mismatch, translate, locale })
          ?.code,
      ).toBe('kpi_mismatch');
      expect(
        blockerSentence({
          growth: { ...growth, spend: 0 },
          words,
          currency: 'MXN',
          days: 1,
          mismatch: null,
          translate,
          locale,
        })?.code,
      ).toBe('zero_delivery');
      expect(
        blockerSentence({
          growth: { ...growth, results: 0 },
          words,
          currency: 'MXN',
          days: 1,
          mismatch: null,
          translate,
          locale,
        })?.code,
      ).toBe('no_signal');
    });
    it('formats queue evidence while retaining source comparators, grouping and cap arithmetic', () => {
      const evidence = RecommendationEvidenceSchema.parse({
        metric: 'cpp',
        value: 1250.75,
        comparator: 'SOURCE comparison 2.5x',
        threshold: 25,
        window: 'd14',
        estImpactPerDay: 100,
        source: 'engine',
      });
      expect(evidenceLine(evidence, 'MXN', translate, locale)).toContain('SOURCE comparison 2.5x');
      expect(formatSettingsValue('daily_total', 1250.75, 'MXN', translate, locale)).toContain(
        'MXN',
      );
      expect(triggerReason('P2_sustained_poor', translate)).toBe(
        translate('triggerP2_sustained_poor'),
      );
      const rec = {
        kind: 'pause',
        trigger: 'P2_sustained_poor',
        evidence,
        status: 'pending' as const,
      };
      const group = queueSummary([rec, rec], translate)[0]!;
      expect({
        kind: group.kind,
        trigger: group.trigger,
        count: group.count,
        impact: group.impactPerDay,
      }).toEqual({ kind: rec.kind, trigger: rec.trigger, count: 2, impact: 200 });
      const source = {
        trigger: 'S1_velocity_cap_binding',
        reason: 'SOURCE ±30% cap',
        evidence: { ...evidence, comparator: 'SOURCE ±30% cap' },
      };
      const before = JSON.stringify(source);
      const corrected = withHonestCapBinding(
        source,
        [{ change_pct: -0.37 }, { change_pct: 0.3 }],
        translate,
        locale,
      );
      expect(corrected.evidence?.value).toBe(source.evidence.value);
      expect(corrected.reason).toContain('30');
      expect(JSON.stringify(source)).toBe(before);
      expect(
        asOfLine('2026-09-17T06:10:00Z', '2026-09-20T06:00:00Z', true, translate, locale),
      ).toBeTruthy();
    });
  });
}
