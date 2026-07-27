import { describe, expect, test } from 'bun:test';
import { automationNodeRunSchema } from './workflow';

describe('automation node run live state', () => {
  test('parses running and terminal rows with a selected output handle', () => {
    const base = {
      id: 'node-run-1',
      runId: 'run-1',
      nodeId: 'condition',
      nodeType: 'logic.if',
      attempt: 1,
      input: null,
      output: null,
      errorMessage: null,
      durationMs: 0,
      startedAt: '2026-07-27T00:00:00.000Z',
      completedAt: null,
    };

    expect(
      automationNodeRunSchema.parse({
        ...base,
        status: 'running',
        selectedHandle: null,
      }).selectedHandle,
    ).toBeNull();

    expect(
      automationNodeRunSchema.parse({
        ...base,
        status: 'completed',
        selectedHandle: 'true',
        completedAt: '2026-07-27T00:00:01.000Z',
      }).selectedHandle,
    ).toBe('true');
  });
});
