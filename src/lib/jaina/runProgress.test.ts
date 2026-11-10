import { describe, expect, it } from 'bun:test';
import type { JainaUIMessage } from '@continuum/contracts';
import {
  createRunProgressTracker,
  formatEta,
  JAINA_TURN_BUDGET_SECONDS,
  type JainaRunSignals,
  RUNNING_FRACTION_CAP,
  readRunSignals,
  routeOf,
} from './runProgress';

const message = (parts: unknown[], metadata?: Record<string, unknown>) =>
  ({ id: 'm', role: 'assistant', parts, metadata }) as unknown as JainaUIMessage;

const plan = (question: Record<string, unknown>) => ({
  type: 'data-jaina-plan',
  data: { plan_id: 'p', presentation: { question } },
});
const row = (kind: string, id: string, status: string) => ({
  type: 'data-jaina-analysis-progress',
  data: { kind, id, status, label: id },
});

const signals = (overrides: Partial<JainaRunSignals> = {}): JainaRunSignals => ({
  planned: false,
  questionClass: null,
  expectedDuration: null,
  language: null,
  analysisRows: false,
  readingLayers: false,
  hypothesesTotal: 0,
  hypothesesSettled: 0,
  toolCalls: 0,
  answerStreaming: false,
  finished: false,
  ...overrides,
});

const at = (seconds: number) => seconds * 1000;

describe('readRunSignals', () => {
  it('reads the planner question class, duration and language from the plan part', () => {
    const read = readRunSignals(
      message([plan({ class: 'diagnostic', expected_duration: 'long', language: 'es' })]),
    );
    expect(read).toMatchObject({
      planned: true,
      questionClass: 'diagnostic',
      expectedDuration: 'long',
      language: 'es',
    });
  });

  it('knows when a layer read is in flight', () => {
    expect(readRunSignals(message([row('layer', 'waste', 'running')])).readingLayers).toBe(true);
    expect(
      readRunSignals(
        message([row('layer', 'waste', 'running'), row('layer', 'waste', 'completed')]),
      ).readingLayers,
    ).toBe(false);
  });

  it('labels a short answer that is reading layers as reading', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0, question: '¿Cuánto gasté?' });
    const progress = tracker.observe(
      signals({ planned: true, questionClass: 'lookup', analysisRows: true, readingLayers: true }),
      at(8),
    );
    expect(progress.stage).toBe('analyzing');
    expect(progress.label.startsWith('Leyendo los datos de la cuenta · ')).toBe(true);
  });

  it('counts hypotheses once per id, keeping the latest status, and ignores the notice', () => {
    const read = readRunSignals(
      message([
        row('notice', 'analysis', 'running'),
        row('hypothesis', 'cpm', 'running'),
        row('hypothesis', 'ctr', 'running'),
        row('hypothesis', 'cpm', 'completed'),
        row('hypothesis', 'cvr', 'partial'),
      ]),
    );
    expect(read.analysisRows).toBe(true);
    expect(read.hypothesesTotal).toBe(3);
    expect(read.hypothesesSettled).toBe(2);
  });

  it('a notice alone is not an analysis: a clarification turn opens with one and ends', () => {
    expect(readRunSignals(message([row('notice', 'analysis', 'running')])).analysisRows).toBe(
      false,
    );
  });

  it('sees tool parts, streaming answer text and the finish metadata', () => {
    const read = readRunSignals(
      message(
        [
          {
            type: 'dynamic-tool',
            toolName: 'get_key_metrics',
            toolCallId: 'a',
            state: 'input-available',
            input: {},
          },
          {
            type: 'dynamic-tool',
            toolName: 'get_key_metrics',
            toolCallId: 'b',
            state: 'input-available',
            input: {},
          },
          { type: 'text', text: '  ' },
          { type: 'text', text: 'El gasto subió' },
        ],
        { status: 'completed' },
      ),
    );
    expect(read.toolCalls).toBe(2);
    expect(read.answerStreaming).toBe(true);
    expect(read.finished).toBe(true);
  });

  it('an absent message reads as nothing yet', () => {
    expect(readRunSignals(undefined)).toEqual(signals());
  });
});

describe('routeOf', () => {
  it('is pending with no plan and no rows', () => {
    expect(routeOf(signals())).toBe('pending');
  });
  it('is the analysis for a long diagnostic or optimization plan, before any row', () => {
    expect(
      routeOf(signals({ planned: true, questionClass: 'optimization', expectedDuration: 'long' })),
    ).toBe('analysis');
  });
  it('is an ordinary answer for a planned lookup', () => {
    expect(
      routeOf(signals({ planned: true, questionClass: 'lookup', expectedDuration: 'short' })),
    ).toBe('answer');
  });
  it('a short plan that reads layers is still an ordinary answer', () => {
    expect(routeOf(signals({ planned: true, questionClass: 'lookup', analysisRows: true }))).toBe(
      'answer',
    );
  });
  it('hypotheses decide it whatever the plan said', () => {
    expect(
      routeOf(
        signals({ planned: true, questionClass: 'lookup', analysisRows: true, hypothesesTotal: 2 }),
      ),
    ).toBe('analysis');
  });
});

describe('formatEta', () => {
  it('rounds to words a reader can hold', () => {
    expect(formatEta(5, 'es')).toBe('casi listo');
    expect(formatEta(30, 'es')).toBe('~30 s restantes');
    expect(formatEta(70, 'es')).toBe('~1 min restante');
    expect(formatEta(150, 'es')).toBe('~3 min restantes');
    expect(formatEta(150, 'en')).toBe('~3 min left');
  });
});

describe('createRunProgressTracker', () => {
  it('stays hidden for a quick unplanned turn and finishes at exactly 1', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0, question: '¿Cuánto gasté hoy?' });
    const early = tracker.observe(signals(), at(3));
    expect(early.visible).toBe(false);
    const answered = tracker.observe(signals({ answerStreaming: true }), at(4));
    expect(answered.visible).toBe(false);
    const done = tracker.observe(signals({ finished: true }), at(5));
    expect(done).toMatchObject({ stage: 'done', fraction: 1, visible: false });
  });

  it('shows an unplanned turn once it has run ten seconds, quoting an ordinary answer', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0, question: '¿Cómo va la cuenta?' });
    const progress = tracker.observe(signals(), at(10));
    expect(progress.visible).toBe(true);
    expect(progress.exceeded).toBe(false);
    expect(progress.label).toBe('Preparando el análisis · ~1 min restante');
  });

  it('shows a planned turn as soon as the plan arrives, in the plan language', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0, question: 'How is the account?' });
    const progress = tracker.observe(
      signals({ planned: true, questionClass: 'lookup', language: 'es', toolCalls: 3 }),
      at(4),
    );
    expect(progress.visible).toBe(true);
    expect(progress.stage).toBe('analyzing');
    expect(progress.label).toBe('Analizando la cuenta · 3 consultas · ~1 min restante');
  });

  it('labels in English when the question reads English and the plan states nothing', () => {
    const tracker = createRunProgressTracker({
      startedAtMs: 0,
      question: 'How did my campaigns do this week?',
    });
    const progress = tracker.observe(signals({ planned: true }), at(4));
    expect(progress.label.startsWith('Analyzing the account')).toBe(true);
  });

  it('walks the analysis stages forward, counting hypotheses, and never moves backward', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0 });
    const base = { planned: true, questionClass: 'diagnostic', expectedDuration: 'long' } as const;
    const seen = [
      tracker.observe(signals(base), at(5)),
      tracker.observe(signals({ ...base, analysisRows: true }), at(12)),
      tracker.observe(
        signals({ ...base, analysisRows: true, hypothesesTotal: 5, hypothesesSettled: 0 }),
        at(22),
      ),
      tracker.observe(
        signals({ ...base, analysisRows: true, hypothesesTotal: 5, hypothesesSettled: 2 }),
        at(40),
      ),
      // A hypothesis opened late: the count grows, the stage does not go back.
      tracker.observe(
        signals({ ...base, analysisRows: true, hypothesesTotal: 7, hypothesesSettled: 5 }),
        at(50),
      ),
      tracker.observe(
        signals({ ...base, analysisRows: true, hypothesesTotal: 7, hypothesesSettled: 7 }),
        at(60),
      ),
    ];
    expect(seen.map((p) => p.stage)).toEqual([
      'reading',
      'reading',
      'testing',
      'testing',
      'testing',
      'concluding',
    ]);
    expect(seen[3]?.label).toContain('Revisando posibles causas (2 de 5)');
    for (let i = 1; i < seen.length; i += 1)
      expect(seen[i]?.fraction ?? 0).toBeGreaterThanOrEqual(seen[i - 1]?.fraction ?? 0);
    expect(seen.every((p) => p.fraction < 1 && p.visible)).toBe(true);
  });

  it('says it is taking longer than expected instead of freezing, and still never reaches 1', () => {
    const tracker = createRunProgressTracker({
      startedAtMs: 0,
      question: '¿Por qué subió el CPA?',
    });
    const live = signals({
      planned: true,
      questionClass: 'lookup',
      expectedDuration: 'short',
    });
    const onTime = tracker.observe(live, at(30));
    expect(onTime.exceeded).toBe(false);
    expect(onTime.etaSeconds).not.toBeNull();
    const fractions: number[] = [];
    let last = onTime;
    for (let second = 80; second <= 400; second += 20) {
      last = tracker.observe(live, at(second));
      fractions.push(last.fraction);
    }
    expect(last.exceeded).toBe(true);
    expect(last.etaSeconds).toBeNull();
    expect(last.label).toBe('Analizando la cuenta · Tardando más de lo esperado…');
    for (let i = 1; i < fractions.length; i += 1)
      expect(fractions[i] ?? 0).toBeGreaterThan(fractions[i - 1] ?? 0);
    expect(Math.max(...fractions)).toBeLessThanOrEqual(RUNNING_FRACTION_CAP);
  });

  it('never quotes time past the turn budget', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0 });
    const progress = tracker.observe(
      signals({ planned: true, questionClass: 'optimization', analysisRows: true }),
      at(JAINA_TURN_BUDGET_SECONDS - 5),
    );
    expect(progress.etaSeconds === null || progress.etaSeconds <= 5).toBe(true);
  });

  it('a run whose plan turned into an analysis re-times against the analysis stages', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0 });
    expect(tracker.observe(signals({ planned: true }), at(4)).stage).toBe('analyzing');
    const rerouted = tracker.observe(
      signals({ planned: true, analysisRows: true, hypothesesTotal: 3 }),
      at(30),
    );
    expect(rerouted).toMatchObject({ route: 'analysis', stage: 'testing' });
  });

  it('ignores a clock that runs backward', () => {
    const tracker = createRunProgressTracker({ startedAtMs: 0 });
    const a = tracker.observe(signals({ planned: true }), at(20));
    const b = tracker.observe(signals({ planned: true }), at(10));
    expect(b.fraction).toBeGreaterThanOrEqual(a.fraction);
    expect(b.elapsedSeconds).toBe(a.elapsedSeconds);
  });
});
