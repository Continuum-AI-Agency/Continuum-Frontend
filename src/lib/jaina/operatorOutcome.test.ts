import { describe, expect, it } from 'bun:test';
import {
  BUSY_REASON,
  NO_GATE_REASON,
  operatorActionOutcome,
  operatorDispatchRefusal,
  refusalReasonOf,
} from './operatorOutcome';

describe('operatorActionOutcome', () => {
  it('is pending until the turn has answered', () => {
    expect(
      operatorActionOutcome(
        [{ role: 'user', content: 'Deploy paused: X v2' }],
        'paid_scaffold_deploy',
      ),
    ).toBeNull();
  });

  it('is success when the turn opened a gate for this tool', () => {
    expect(
      operatorActionOutcome(
        [
          { role: 'user', content: 'Deploy paused: X v2' },
          {
            role: 'assistant',
            content: 'Review the plan and approve.',
            pendingToolApprovals: [{ toolName: 'paid_scaffold_deploy' }],
          },
        ],
        'paid_scaffold_deploy',
      ),
    ).toEqual({ ok: true });
  });

  it("carries the Backend's own words when it refused", () => {
    expect(
      operatorActionOutcome(
        [
          { role: 'user', content: 'Deploy paused: X v2' },
          {
            role: 'assistant',
            content:
              'Deploy is blocked: The brand has no single Facebook Page to run these ads from',
          },
        ],
        'paid_scaffold_deploy',
      ),
    ).toEqual({
      ok: false,
      reason: 'Deploy is blocked: The brand has no single Facebook Page to run these ads from',
    });
  });

  it('does not count a gate for a different tool, and never reports an empty reason', () => {
    expect(
      operatorActionOutcome(
        [
          {
            role: 'assistant',
            content: '',
            pendingToolApprovals: [{ toolName: 'pause_meta_entity' }],
          },
        ],
        'paid_scaffold_deploy',
      ),
    ).toEqual({ ok: false, reason: NO_GATE_REASON });
  });
});

describe('operatorDispatchRefusal', () => {
  it('refuses while a turn streams or another action waits on its turn, and only then', () => {
    expect(operatorDispatchRefusal({ isStreaming: true, actionPending: false })).toBe(BUSY_REASON);
    expect(operatorDispatchRefusal({ isStreaming: false, actionPending: true })).toBe(BUSY_REASON);
    expect(operatorDispatchRefusal({ isStreaming: false, actionPending: false })).toBeNull();
  });
});

describe('refusalReasonOf', () => {
  it("is the assistant's last words, skipping the person's own ask and blank answers", () => {
    expect(
      refusalReasonOf([
        { role: 'user', content: 'Pause ad set X' },
        { role: 'assistant', content: 'Pausing is blocked: already PAUSED.' },
        { role: 'assistant', content: '  ' },
      ]),
    ).toBe('Pausing is blocked: already PAUSED.');
    expect(refusalReasonOf([{ role: 'user', content: 'Pause ad set X' }])).toBe(NO_GATE_REASON);
  });
});
