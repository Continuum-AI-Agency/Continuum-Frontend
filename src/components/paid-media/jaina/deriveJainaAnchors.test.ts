import { describe, expect, it } from 'bun:test';
import { deriveJainaAnchors, milestonesForJainaMessage } from './deriveJainaAnchors';
import type { CheckpointReportV2, JainaChatMessage, JainaPlan } from './types';

const AT = '2026-07-11T12:00:00.000Z';

function assistant(id: string, overrides: Partial<JainaChatMessage> = {}): JainaChatMessage {
  return { id, role: 'assistant', content: 'done', createdAt: AT, ...overrides };
}

const REPORT = { executive_summary: 'summary' } as unknown as CheckpointReportV2;
const PLAN = { steps: [] } as unknown as JainaPlan;

describe('milestonesForJainaMessage', () => {
  it('finds no milestones on a user turn', () => {
    expect(
      milestonesForJainaMessage({ id: 'u1', role: 'user', content: 'hi', createdAt: AT }),
    ).toEqual([]);
  });

  it('marks a completed analysis', () => {
    expect(
      milestonesForJainaMessage(assistant('a1', { reportV2: REPORT, status: 'done' })),
    ).toEqual([{ id: 'a1::analysis', label: 'Analysis complete' }]);
  });

  it('does not mark the analysis until the turn is done', () => {
    expect(
      milestonesForJainaMessage(assistant('a1', { reportV2: REPORT, status: 'streaming' })),
    ).toEqual([]);
  });

  it('marks a plan and a pending clarification', () => {
    const message = assistant('a1', {
      plan: PLAN,
      pendingClarification: { question: 'which account?' },
      status: 'done',
    });

    expect(milestonesForJainaMessage(message)).toEqual([
      { id: 'a1::plan', label: 'Plan ready' },
      { id: 'a1::clarification', label: 'Needs your input' },
    ]);
  });
});

describe('deriveJainaAnchors', () => {
  it('emits a turn anchor per message with milestones after their turn', () => {
    const messages: JainaChatMessage[] = [
      { id: 'u1', role: 'user', content: 'how are ads doing?', createdAt: AT },
      assistant('a1', { reportV2: REPORT, status: 'done' }),
    ];

    expect(deriveJainaAnchors(messages)).toEqual([
      { id: 'u1', kind: 'user', at: AT },
      { id: 'a1', kind: 'assistant', at: AT },
      { id: 'a1::analysis', kind: 'milestone', label: 'Analysis complete' },
    ]);
  });

  it('returns nothing for an empty transcript', () => {
    expect(deriveJainaAnchors([])).toEqual([]);
  });
});
