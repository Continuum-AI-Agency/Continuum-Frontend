import { describe, expect, it } from 'bun:test';
import type { AgentRunDto, AgentRunEventDto } from '@continuum/contracts';
import { createAcknowledgedRuns, runEndedAtMs, shouldAnnounceRunEnd } from './runCompletionToast';

// The beta run of 2026-10-20: started 23:12Z during a Backend deploy, killed mid-turn. Its row
// stayed `running` (so /api/agents/runs/active kept returning it) while its log carried the
// terminal `error` frame. Every page load hydrated it, tailed the log, and toasted again.
const DEPLOY_KILLED_RUN: AgentRunDto = {
  runId: 'run_7f3e2a91',
  agent: 'jaina',
  sessionId: 'jaina_session_c41d',
  brandId: '7a9f1d2e-0b3c-4d5e-8f60-1a2b3c4d5e6f',
  status: 'failed',
  createdAt: '2026-10-20T23:12:04.000Z',
  startedAt: '2026-10-20T23:12:05.000Z',
  finishedAt: null,
  errorMessage:
    'No tool invocation found for tool call ID "phase2_get_ad_creative_preview_3044ae04".',
  initiator: 'user',
};

const DEPLOY_KILLED_LOG: AgentRunEventDto[] = [
  {
    eventId: 'evt_0',
    seq: 0,
    ts: '2026-10-20T23:12:05.120Z',
    type: 'agent.chat_started',
    data: { runId: 'run_7f3e2a91', sessionId: 'jaina_session_c41d', agent: 'jaina' },
  },
  {
    eventId: 'evt_41',
    seq: 41,
    ts: '2026-10-20T23:14:47.880Z',
    type: 'tool.result',
    data: { id: 'call_top_ads_1', ok: true },
  },
  {
    eventId: 'evt_42',
    seq: 42,
    ts: '2026-10-20T23:14:48.002Z',
    type: 'error',
    data: { message: 'internal_error' },
  },
];

const PAGE_OPENED_NEXT_DAY = Date.parse('2026-10-21T15:30:00.000Z');

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

const nothingAcknowledged = { has: () => false };

describe('shouldAnnounceRunEnd', () => {
  it('adopts silently a run whose log ended before the page opened', () => {
    expect(
      shouldAnnounceRunEnd({
        run: DEPLOY_KILLED_RUN,
        events: DEPLOY_KILLED_LOG,
        listeningSinceMs: PAGE_OPENED_NEXT_DAY,
        acknowledged: nothingAcknowledged,
        viewingSessionId: null,
      }),
    ).toBe(false);
  });

  it('announces a run that fails while the page is open', () => {
    const openedBeforeTheFailure = Date.parse('2026-10-20T23:13:00.000Z');
    expect(
      shouldAnnounceRunEnd({
        run: DEPLOY_KILLED_RUN,
        events: DEPLOY_KILLED_LOG,
        listeningSinceMs: openedBeforeTheFailure,
        acknowledged: nothingAcknowledged,
        viewingSessionId: null,
      }),
    ).toBe(true);
  });

  it('announces a run once: a reload, or a second tab, does not say it again', () => {
    const storage = memoryStorage();
    const firstTab = createAcknowledgedRuns(storage);
    const input = {
      run: { ...DEPLOY_KILLED_RUN, finishedAt: null },
      // A log with no timestamped terminal frame: the end time is unknowable.
      events: [],
      listeningSinceMs: PAGE_OPENED_NEXT_DAY,
      viewingSessionId: null,
    };

    expect(shouldAnnounceRunEnd({ ...input, acknowledged: firstTab })).toBe(true);
    firstTab.add(DEPLOY_KILLED_RUN.runId);

    const afterReload = createAcknowledgedRuns(storage);
    expect(shouldAnnounceRunEnd({ ...input, acknowledged: afterReload })).toBe(false);
  });

  it('does not announce a cancelled run, a watched run or another agent’s callee run', () => {
    const base = {
      events: [],
      listeningSinceMs: 0,
      acknowledged: nothingAcknowledged,
      viewingSessionId: null,
    };
    expect(
      shouldAnnounceRunEnd({ ...base, run: { ...DEPLOY_KILLED_RUN, status: 'cancelled' } }),
    ).toBe(false);
    expect(
      shouldAnnounceRunEnd({
        ...base,
        run: DEPLOY_KILLED_RUN,
        viewingSessionId: DEPLOY_KILLED_RUN.sessionId,
      }),
    ).toBe(false);
    expect(
      shouldAnnounceRunEnd({ ...base, run: { ...DEPLOY_KILLED_RUN, initiator: 'agent' } }),
    ).toBe(false);
    expect(
      shouldAnnounceRunEnd({ ...base, run: { ...DEPLOY_KILLED_RUN, status: 'running' } }),
    ).toBe(false);
  });
});

describe('runEndedAtMs', () => {
  it('prefers the row, then the last terminal frame', () => {
    expect(runEndedAtMs({ ...DEPLOY_KILLED_RUN, finishedAt: '2026-10-20T23:20:00.000Z' }, [])).toBe(
      Date.parse('2026-10-20T23:20:00.000Z'),
    );
    expect(runEndedAtMs(DEPLOY_KILLED_RUN, DEPLOY_KILLED_LOG)).toBe(
      Date.parse('2026-10-20T23:14:48.002Z'),
    );
    expect(runEndedAtMs(DEPLOY_KILLED_RUN, DEPLOY_KILLED_LOG.slice(0, 2))).toBeNull();
  });
});

describe('createAcknowledgedRuns', () => {
  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const runs = createAcknowledgedRuns(broken);
    expect(runs.has('run_1')).toBe(false);
    runs.add('run_1');
    expect(runs.has('run_1')).toBe(true);
  });

  it('keeps only the most recent runs', () => {
    const storage = memoryStorage();
    const runs = createAcknowledgedRuns(storage);
    for (let index = 0; index < 205; index++) runs.add(`run_${index}`);
    const fresh = createAcknowledgedRuns(storage);
    expect(fresh.has('run_0')).toBe(false);
    expect(fresh.has('run_204')).toBe(true);
  });
});
