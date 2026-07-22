import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type {
  OnboardingPreviewEvent,
  OnboardingPreviewWorkflowResult,
} from '@/lib/onboarding/agentClient';

const runOnboardingPreviewMock = mock<
  (options: {
    payload: { brandProfile: unknown; runContext: unknown; scrape: unknown };
    signal?: AbortSignal;
    onEvent?: (event: OnboardingPreviewEvent) => void;
    onRunId?: (runId: string | null) => void;
  }) => Promise<{
    runId: string | null;
    brandProfile?: unknown;
    structured?: unknown;
    complete?: unknown;
  }>
>(async () => ({ runId: null }));

const resumeOnboardingPreviewMock = mock<
  (
    runId: string,
    options: {
      onEvent?: (event: OnboardingPreviewEvent) => void;
      lastEventId?: number;
      signal?: AbortSignal;
    },
  ) => Promise<{ brandProfile?: unknown; structured?: unknown; complete?: unknown }>
>(async () => ({}));

mock.module('@/lib/onboarding/agentClient', () => ({
  runOnboardingPreview: runOnboardingPreviewMock,
  resumeOnboardingPreview: resumeOnboardingPreviewMock,
}));

import {
  type AgentPreviewBuckets,
  emptyBuckets,
  makeEventHandler,
  runAgentPreview,
  seedBucketsFromSnapshot,
} from '@/components/onboarding/v2/state/agentPreview';

const makeInput = () => ({
  brandId: 'brand-1',
  userId: 'user-1',
  brandName: 'Acme',
  websiteUrl: 'https://acme.com',
  voiceTags: [] as string[],
  scrape: null,
  onUpdate: mock(() => {}),
});

describe('runAgentPreview', () => {
  beforeEach(() => {
    runOnboardingPreviewMock.mockReset();
    resumeOnboardingPreviewMock.mockReset();
  });

  it('aggregates voice/audience/business buckets from sequential events', async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent, onRunId }) => {
      onRunId?.('run-1');
      onEvent?.({ type: 'voice', payload: { tone: 'Witty' } });
      onEvent?.({ type: 'audience', payload: { summary: 'Mid-market SaaS founders' } });
      onEvent?.({ type: 'business', payload: { business_description: 'B2B analytics platform' } });
      onEvent?.({
        type: 'complete',
        phase: 'preview',
        status: 'ok',
        result: { prompt_version: 1 },
      });
      return { runId: 'run-1' };
    });

    const input = makeInput();
    const outcome = await runAgentPreview(input, new AbortController().signal);

    expect(outcome.runId).toBe('run-1');
    expect(outcome.buckets.voice?.tone).toBe('Witty');
    expect(outcome.buckets.audience?.summary).toBe('Mid-market SaaS founders');
    expect(outcome.buckets.business?.business_description).toBe('B2B analytics platform');
    expect(input.onUpdate).toHaveBeenCalled();
  });

  it('captures first_impression + spark events', async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: 'first_impression', payload: { headline: 'Acme, decoded.' } });
      onEvent?.({ type: 'spark', section: 'voice', label: 'Found 5 personality adjectives' });
      onEvent?.({ type: 'voice', payload: { tone: 'Bold' } });
      onEvent?.({ type: 'complete', phase: 'preview', status: 'ok', result: undefined });
      return { runId: null };
    });

    const outcome = await runAgentPreview(makeInput(), new AbortController().signal);

    expect(outcome.buckets.firstImpression?.headline).toBe('Acme, decoded.');
    expect(outcome.buckets.latestSpark?.section).toBe('voice');
    expect(outcome.buckets.latestSpark?.label).toBe('Found 5 personality adjectives');
  });

  it('appends stream deltas to the matching section accumulator', async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: 'stream', section: 'voice', delta: 'Bold,' });
      onEvent?.({ type: 'stream', section: 'voice', delta: ' confident,' });
      onEvent?.({ type: 'stream', section: 'audience', delta: 'Mid-market.' });
      onEvent?.({ type: 'voice', payload: { tone: 'Bold' } });
      onEvent?.({ type: 'complete', phase: 'preview', status: 'ok', result: undefined });
      return { runId: null };
    });

    const outcome = await runAgentPreview(makeInput(), new AbortController().signal);
    expect(outcome.buckets.voiceStream).toBe('Bold, confident,');
    expect(outcome.buckets.audienceStream).toBe('Mid-market.');
  });

  it('throws when no buckets are populated', async () => {
    runOnboardingPreviewMock.mockImplementation(async () => ({ runId: null }));
    await expect(runAgentPreview(makeInput(), new AbortController().signal)).rejects.toThrow(
      /no data/i,
    );
  });

  it('resolves with partial buckets when a degraded run mixes good sections with an error', async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent, onRunId }) => {
      onRunId?.('run-degraded');
      onEvent?.({ type: 'voice', payload: { tone: 'Bold' } });
      onEvent?.({ type: 'business', payload: { business_description: 'B2B analytics' } });
      onEvent?.({
        type: 'status',
        section: 'audience',
        status: 'error',
        error: 'No object generated',
      });
      onEvent?.({ type: 'error', message: 'audience synthesis failed' });
      return { runId: 'run-degraded' };
    });

    const outcome = await runAgentPreview(makeInput(), new AbortController().signal);
    expect(outcome.buckets.voice?.tone).toBe('Bold');
    expect(outcome.buckets.business?.business_description).toBe('B2B analytics');
    expect(outcome.buckets.sectionStatus.audience).toBe('error');
  });

  it('emptyBuckets returns a fully-zeroed shape', () => {
    const b = emptyBuckets();
    expect(b.runId).toBeNull();
    expect(b.voice).toBeNull();
    expect(b.firstImpression).toBeNull();
    expect(b.understanding).toBeNull();
    expect(b.latestSpark).toBeNull();
    expect(b.voiceStream).toBe('');
    expect(b.result).toBeNull();
    expect(b.audits).toEqual({});
    expect(b.citations).toEqual({});
    expect(b.sectionStatus.voice).toBe('idle');
    expect(b.sectionStatus.audience).toBe('idle');
    expect(b.sectionStatus.first_impression).toBe('idle');
  });

  it('forwards scrape to runOnboardingPreview', async () => {
    runOnboardingPreviewMock.mockImplementation(async ({ onEvent }) => {
      onEvent?.({ type: 'voice', payload: { tone: 'Calm' } });
      onEvent?.({ type: 'complete', phase: 'preview', status: 'ok', result: undefined });
      return { runId: 'run-2' };
    });

    const input = {
      ...makeInput(),
      scrape: {
        url: 'https://acme.com',
        title: 'Acme',
        description: null,
        logoUrl: null,
        colors: ['#0b1220'],
        typography: { primary: null, secondary: null },
      },
    };

    await runAgentPreview(input, new AbortController().signal);

    const call = runOnboardingPreviewMock.mock.calls[0]?.[0];
    expect((call?.payload?.scrape as { url: string } | null)?.url).toBe('https://acme.com');
  });

  it('calls resumeOnboardingPreview when resumeRunId is supplied', async () => {
    resumeOnboardingPreviewMock.mockImplementation(async (_runId, { onEvent }) => {
      onEvent?.({ type: 'voice', payload: { tone: 'Resumed' } });
      onEvent?.({ type: 'complete', phase: 'preview', status: 'ok', result: undefined });
      return {};
    });

    const input = { ...makeInput(), resumeRunId: 'run-existing', resumeLastEventId: 5 };
    const outcome = await runAgentPreview(input, new AbortController().signal);

    expect(outcome.runId).toBe('run-existing');
    expect(outcome.buckets.voice?.tone).toBe('Resumed');
    expect(runOnboardingPreviewMock).not.toHaveBeenCalled();
    expect(resumeOnboardingPreviewMock).toHaveBeenCalledWith(
      'run-existing',
      expect.objectContaining({ lastEventId: 5 }),
    );
  });
});

describe('makeEventHandler (reducer)', () => {
  function setup(): {
    buckets: AgentPreviewBuckets;
    dispatch: ReturnType<typeof mock>;
    reduce: ReturnType<typeof makeEventHandler>;
  } {
    const buckets = emptyBuckets();
    const dispatch = mock(() => {});
    const reduce = makeEventHandler(buckets, dispatch);
    return { buckets, dispatch, reduce };
  }

  it('status events drive sectionStatus', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'status', section: 'voice', status: 'running' });
    expect(buckets.sectionStatus.voice).toBe('running');
    reduce({ type: 'status', section: 'voice', status: 'done' });
    expect(buckets.sectionStatus.voice).toBe('done');
  });

  it('run handshake stores runId without resetting rendered state', () => {
    const { buckets, reduce } = setup();
    buckets.voice = { tone: 'Bold' };
    reduce({ type: 'run', runId: 'run-42', reused: true });
    expect(buckets.runId).toBe('run-42');
    expect(buckets.voice).toEqual({ tone: 'Bold' });
  });

  it('enrich on audit.* writes into buckets.audits', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'enrich', section: 'audit.voice', data: { score: 82 }, seq: 7 });
    expect(buckets.audits.voice).toEqual({ score: 82 });
    expect(buckets.audits.audience).toBeUndefined();
    expect(buckets.auditStatus.voice).toBe('available');
  });

  it('enrich on audit.* with data:null marks unavailable and writes no data', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'enrich', section: 'audit.business', data: null, seq: 8 });
    expect(buckets.audits.business).toBeUndefined();
    expect(buckets.auditStatus.business).toBe('unavailable');
  });

  it('enrich audit:null sticks through subsequent complete with a populated result', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'enrich', section: 'audit.business', data: null, seq: 9 });
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: { audits: { voice: { score: 80 }, business: { score: 50 } } },
    } as Parameters<typeof reduce>[0]);
    expect(buckets.auditStatus.business).toBe('unavailable');
    expect(buckets.auditStatus.voice).toBe('available');
  });

  it('enrich on a prose section populates the matching bucket', () => {
    const { buckets, reduce } = setup();
    reduce({
      type: 'enrich',
      section: 'first_impression',
      data: { headline: 'Late landing' },
      seq: 8,
    });
    expect(buckets.firstImpression?.headline).toBe('Late landing');
  });

  it('strategy + guidelines data events populate their buckets', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'strategy', payload: { taglines: { primary: 'Ship it.' } } as never });
    reduce({
      type: 'guidelines',
      payload: { voice_rules: { dos: ['Name the segment'], donts: [] } } as never,
    });
    expect(
      (buckets.strategy as { taglines?: { primary?: string } } | null)?.taglines?.primary,
    ).toBe('Ship it.');
    expect(
      (buckets.guidelines as { voice_rules?: { dos?: string[] } } | null)?.voice_rules?.dos,
    ).toEqual(['Name the segment']);
  });

  it('audit.strategy / audit.guidelines enrich into buckets.audits', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'enrich', section: 'audit.strategy', data: { score: 77 }, seq: 11 });
    reduce({ type: 'enrich', section: 'audit.guidelines', data: { score: 84 }, seq: 12 });
    expect(buckets.audits.strategy).toEqual({ score: 77 });
    expect(buckets.audits.guidelines).toEqual({ score: 84 });
    expect(buckets.auditStatus.strategy).toBe('available');
  });

  it('complete.result fills strategy + guidelines from structured', () => {
    const { buckets, reduce } = setup();
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: {
        structured: {
          strategy: { taglines: { primary: 'From the report.' } },
          guidelines: { content_pillars: [{ pillar: 'x', description: 'y' }] },
        },
      },
    } as Parameters<typeof reduce>[0]);
    expect(
      (buckets.strategy as { taglines?: { primary?: string } } | null)?.taglines?.primary,
    ).toBe('From the report.');
    expect(buckets.guidelines).not.toBeNull();
  });

  it('complete with status=error flips running sections to error', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'status', section: 'audience', status: 'running' });
    reduce({ type: 'status', section: 'voice', status: 'done' });
    reduce({ type: 'complete', phase: 'preview', status: 'error', result: undefined });
    expect(buckets.sectionStatus.audience).toBe('error');
    expect(buckets.sectionStatus.voice).toBe('done');
  });

  it('error event flips all running sections to error', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'status', section: 'voice', status: 'running' });
    reduce({ type: 'status', section: 'audience', status: 'running' });
    reduce({ type: 'error', message: 'boom' });
    expect(buckets.sectionStatus.voice).toBe('error');
    expect(buckets.sectionStatus.audience).toBe('error');
  });

  it('skipped status only marks its own section and leaves run-level state intact', () => {
    const { buckets, reduce } = setup();
    buckets.runId = 'run-9';
    buckets.voice = { tone: 'Bold' };
    reduce({ type: 'status', section: 'audience', status: 'running' });
    reduce({ type: 'status', section: 'audience', status: 'skipped' });
    expect(buckets.sectionStatus.audience).toBe('skipped');
    expect(buckets.sectionStatus.voice).toBe('idle');
    expect(buckets.runId).toBe('run-9');
    expect(buckets.voice).toEqual({ tone: 'Bold' });
  });

  it('complete with status=ok does not flip skipped sections to done', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'status', section: 'audience', status: 'skipped' });
    reduce({ type: 'status', section: 'voice', status: 'running' });
    reduce({ type: 'complete', phase: 'preview', status: 'ok', result: undefined });
    expect(buckets.sectionStatus.audience).toBe('skipped');
    expect(buckets.sectionStatus.voice).toBe('running');
  });

  it('complete with status=error preserves skipped sections (only flips running)', () => {
    const { buckets, reduce } = setup();
    reduce({ type: 'status', section: 'audience', status: 'skipped' });
    reduce({ type: 'status', section: 'voice', status: 'running' });
    reduce({ type: 'complete', phase: 'preview', status: 'error', result: undefined });
    expect(buckets.sectionStatus.audience).toBe('skipped');
    expect(buckets.sectionStatus.voice).toBe('error');
  });

  it('dispatches on every state-touching event', () => {
    const { dispatch, reduce } = setup();
    reduce({ type: 'status', section: 'voice', status: 'running' });
    reduce({ type: 'spark', section: 'voice', label: 'Listening to voice…' });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  // THE MERGE RULE — backend frontend.md §4.
  // complete fires when the report is renderable. result snapshot can lag the
  // per-section data events. State already in buckets must win.

  it('complete merges: pre-existing section data is not overwritten', () => {
    const { buckets, reduce } = setup();
    buckets.voice = { tone: 'Bold' };
    buckets.audience = { summary: 'Pre-existing audience' };
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: {
        structured: {
          brand_voice: { tone: 'STALE' },
          target_audience: { summary: 'STALE audience' },
        },
      },
    } as Parameters<typeof reduce>[0]);
    expect(buckets.voice?.tone).toBe('Bold');
    expect(buckets.audience?.summary).toBe('Pre-existing audience');
  });

  it("complete merges: result fills fields the buckets don't have yet", () => {
    const { buckets, reduce } = setup();
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: {
        brand_profile: { id: 'b1', brand_name: 'Acme' },
        understanding: { positioning_thesis: 'Decoded brand DNA' },
        first_impression: { headline: 'Acme, decoded.' },
      },
    } as Parameters<typeof reduce>[0]);
    expect(buckets.brandProfile?.brand_name).toBe('Acme');
    expect(buckets.understanding?.positioning_thesis).toBe('Decoded brand DNA');
    expect(buckets.firstImpression?.headline).toBe('Acme, decoded.');
  });

  it('complete merges audits per-key: state wins, result fills missing keys', () => {
    const { buckets, reduce } = setup();
    buckets.audits = { voice: { score: 90 } };
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: {
        audits: {
          voice: { score: 10 },
          audience: { score: 50 },
        },
      },
    } as Parameters<typeof reduce>[0]);
    expect((buckets.audits.voice as { score: number }).score).toBe(90);
    expect((buckets.audits.audience as { score: number }).score).toBe(50);
  });

  it('enrich after complete still updates audits (no clobber)', () => {
    const { buckets, reduce } = setup();
    buckets.audits = { voice: { score: 90 } };
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: { audits: { voice: { score: 10 }, audience: { score: 50 } } },
    } as Parameters<typeof reduce>[0]);
    reduce({ type: 'enrich', section: 'audit.voice', data: { score: 99 }, seq: 99 });
    expect((buckets.audits.voice as { score: number }).score).toBe(99);
    expect((buckets.audits.audience as { score: number }).score).toBe(50);
  });

  it('complete merges citations passthrough', () => {
    const { buckets, reduce } = setup();
    buckets.citations = { voice: { source: 'scrape' } };
    reduce({
      type: 'complete',
      phase: 'preview',
      status: 'ok',
      result: {
        citations: {
          voice: { source: 'STALE' },
          audience: { source: 'research' },
        },
      } as Parameters<typeof reduce>[0]['result'] & { citations: Record<string, unknown> },
    } as Parameters<typeof reduce>[0]);
    expect(buckets.citations.voice).toEqual({ source: 'scrape' });
    expect(buckets.citations.audience).toEqual({ source: 'research' });
  });
});

describe('seedBucketsFromSnapshot', () => {
  it('seeds audits + audit status + readiness + synthesis sections from a completed snapshot result', () => {
    // Scores now arrive on the post-complete scorer lane, so a returning user
    // who loads via the persisted snapshot (not the live stream) must still get
    // the per-section audit scores + readiness. Previously the snapshot path
    // copied only brand_profile/first_impression/readiness and dropped audits.
    const result = {
      prompt_version: 1,
      brand_profile: { id: 'brand-1', brand_name: 'Acme' },
      understanding: {
        positioning_thesis: 'x',
        hypothesis_icp: 'y',
        brand_pillars: ['p'],
        tonal_signal: 't',
      },
      structured: {
        strategy: { taglines: { primary: 'Ship it' } },
        guidelines: { messaging_guardrails: { banned_words: ['leverage'] } },
      },
      audits: {
        voice: { score: 80, severity: 'low', findings: [] },
        strategy: { score: 75, severity: 'low', findings: [] },
      },
      readiness: {
        overall_score: 78,
        dimensions: {},
        findings: [],
        generated_at: '2026-06-21T00:00:00.000Z',
      },
    } as unknown as OnboardingPreviewWorkflowResult;

    const buckets = seedBucketsFromSnapshot(result);

    expect(buckets.audits.voice?.score).toBe(80);
    expect(buckets.audits.strategy?.score).toBe(75);
    expect(buckets.auditStatus.voice).toBe('available');
    expect(buckets.auditStatus.strategy).toBe('available');
    expect(buckets.readiness?.overall_score).toBe(78);
    expect(buckets.strategy?.taglines.primary).toBe('Ship it');
    expect(buckets.guidelines?.messaging_guardrails.banned_words).toEqual(['leverage']);
    expect(buckets.result).toBe(result);
  });
});
