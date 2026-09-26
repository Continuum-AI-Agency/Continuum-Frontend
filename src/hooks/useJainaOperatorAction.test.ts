import { describe, expect, it } from 'bun:test';
import type { JainaUIMessage } from '@continuum/contracts';
import { NO_GATE_REASON } from '@/lib/jaina/operatorOutcome';
import { operatorActionStateOf } from './useJainaOperatorAction';

const message = (role: 'user' | 'assistant', parts: Record<string, unknown>[]): JainaUIMessage =>
  ({ id: `${role}-${parts.length}`, role, parts }) as unknown as JainaUIMessage;
const said = (text: string) => ({ type: 'text', text });

const ask = message('user', [said('Pause ad set Summer Sale')]);
const earlier = message('assistant', [said('An earlier answer about something else.')]);

const stateOf = (messages: JainaUIMessage[], isStreaming = false) =>
  operatorActionStateOf({ messages, start: 1, decision: null, error: null, isStreaming });

describe('operatorActionStateOf', () => {
  it("reports a refusal in the Backend's own words, not a generic line", () => {
    const state = stateOf([
      earlier,
      ask,
      message('assistant', [said('Pausing is blocked: this ad set is already PAUSED on Meta.')]),
    ]);
    expect(state.phase).toBe('failed');
    expect(state.error).toBe('Pausing is blocked: this ad set is already PAUSED on Meta.');
  });

  it('falls back to the generic line only when the refusal said nothing', () => {
    const state = stateOf([earlier, ask, message('assistant', [])]);
    expect(state.phase).toBe('failed');
    expect(state.error).toBe(NO_GATE_REASON);
  });

  it('is opening, with no error, until the turn answers', () => {
    expect(stateOf([earlier, ask])).toMatchObject({ phase: 'opening', error: null });
    expect(stateOf([earlier, ask, message('assistant', [said('Pausing')])], true)).toMatchObject({
      phase: 'opening',
      error: null,
    });
  });

  it('is awaiting once the gate opens', () => {
    const gate = {
      type: 'dynamic-tool',
      toolName: 'pause_meta_entity',
      state: 'approval-requested',
      toolCallId: 'call_1',
      input: { entity_id: '1', expected_status: 'ACTIVE' },
      approval: { id: 'appr_1' },
    };
    const state = stateOf([earlier, ask, message('assistant', [gate])]);
    expect(state.phase).toBe('awaiting');
    expect(state.approval?.approvalId).toBe('appr_1');
    expect(state.error).toBeNull();
  });
});
