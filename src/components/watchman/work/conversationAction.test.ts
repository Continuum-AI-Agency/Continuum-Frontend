import { expect, test } from 'bun:test';
import { conversationAction } from './conversationAction';

test('recognizes a complete historic gesture without exposing its identifiers as prose', () => {
  const action = {
    type: 'open_work',
    execution: {
      goalId: 'goal',
      workNodeId: 'node',
      harnessRunId: '11111111-1111-4111-8111-111111111111',
    },
  };
  expect(conversationAction(JSON.stringify(action))).toEqual(action);
});

test('preserves ordinary replies, malformed JSON and incomplete or extra action data', () => {
  for (const text of [
    'A launch plan please',
    '{broken',
    '{"type":"open_work"}',
    '{"type":"reply","conversation_id":"conversation","text":"Keep my words"}',
    '{"type":"resolve_question","request_id":"q","expected_version":0,"value":"Yes","unexpected":"field"}',
  ])
    expect(conversationAction(text)).toBeNull();
});

test('recognizes versioned human decisions for display without running them', () => {
  const action = {
    type: 'decide_approval',
    proposal_id: '11111111-1111-4111-8111-111111111111',
    operation_id: 'operation',
    expected_version: 0,
    decision: 'reject',
  };
  expect(conversationAction(JSON.stringify(action))).toEqual(action);
});
