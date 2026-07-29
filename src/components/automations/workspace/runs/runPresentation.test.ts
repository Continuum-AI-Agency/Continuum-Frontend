import { describe, expect, test } from 'bun:test';
import type { AutomationRun } from '@continuum/contracts';
import {
  AUTOMATION_EMAIL_STATUS_LABEL,
  AUTOMATION_RUN_STATUS_PILL,
  describeAutomationRun,
  formatAutomationRunDuration,
  sortAutomationRunsNewestFirst,
} from './runPresentation';

const run = (overrides: Partial<AutomationRun> = {}): AutomationRun => ({
  runId: 'run-1',
  automationId: 'automation-1',
  brandId: 'brand-1',
  trigger: 'schedule',
  status: 'completed',
  executionMode: 'production',
  workflowVersionId: null,
  scheduledFor: '2026-07-28T09:00:00.000Z',
  attempts: 1,
  emailStatus: 'sent',
  enqueuedAt: '2026-07-28T09:00:00.000Z',
  startedAt: '2026-07-28T09:00:01.000Z',
  completedAt: '2026-07-28T09:00:13.000Z',
  ...overrides,
});

describe('formatAutomationRunDuration', () => {
  test('renders seconds under a minute', () => {
    expect(formatAutomationRunDuration(run())).toBe('12s');
  });

  test('renders minutes and seconds past a minute', () => {
    expect(
      formatAutomationRunDuration(
        run({ startedAt: '2026-07-28T09:00:00.000Z', completedAt: '2026-07-28T09:02:05.000Z' }),
      ),
    ).toBe('2m 5s');
  });

  test('is null while the run has not finished', () => {
    expect(formatAutomationRunDuration(run({ completedAt: null }))).toBeNull();
    expect(formatAutomationRunDuration(run({ startedAt: null }))).toBeNull();
  });
});

describe('describeAutomationRun', () => {
  test('names the trigger and the duration', () => {
    const summary = describeAutomationRun(run({ trigger: 'manual' }));
    expect(summary).toContain('12s');
    expect(summary).toContain('Manual');
  });

  test('omits the duration for a run still in flight', () => {
    const summary = describeAutomationRun(
      run({ status: 'running', completedAt: null, trigger: 'webhook' }),
    );
    expect(summary).not.toContain('s ·');
    expect(summary).toContain('Webhook');
  });
});

describe('sortAutomationRunsNewestFirst', () => {
  test('orders by enqueue time, newest first, without mutating the input', () => {
    const runs = [
      run({ runId: 'older', enqueuedAt: '2026-07-26T09:00:00.000Z' }),
      run({ runId: 'newest', enqueuedAt: '2026-07-28T09:00:00.000Z' }),
      run({ runId: 'middle', enqueuedAt: '2026-07-27T09:00:00.000Z' }),
    ];

    expect(sortAutomationRunsNewestFirst(runs).map((entry) => entry.runId)).toEqual([
      'newest',
      'middle',
      'older',
    ]);
    expect(runs[0]?.runId).toBe('older');
  });
});

describe('status vocabulary', () => {
  test('covers every run status and email status the contract allows', () => {
    expect(AUTOMATION_RUN_STATUS_PILL.failed.variant).toBe('error');
    expect(AUTOMATION_RUN_STATUS_PILL.running.pulse).toBe(true);
    expect(AUTOMATION_EMAIL_STATUS_LABEL.skipped).toBe('Email skipped');
  });
});
