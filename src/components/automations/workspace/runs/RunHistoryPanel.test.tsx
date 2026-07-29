// The panel adds no data path of its own: both query hooks arrive through
// `source`, so this spec drives the real component with fakes instead of a
// process-wide `mock.module`.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { AutomationRun } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RunHistoryPanel, type RunHistorySource } from './RunHistoryPanel';

afterEach(cleanup);

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

const stubSource = ({
  runs,
  isLoading = false,
  report,
}: {
  runs?: AutomationRun[];
  isLoading?: boolean;
  report?: AutomationRun;
}): RunHistorySource => ({
  useRuns: () => ({ data: runs, isLoading }),
  useRunReport: (_runId, enabled) => ({
    data: enabled ? report : undefined,
    isLoading: false,
  }),
});

const rowButtons = () => screen.getAllByRole('button', { name: /Show run/ });

describe('RunHistoryPanel', () => {
  test('states that there are no runs yet instead of rendering an empty list', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={stubSource({ runs: [] })}
      />,
    );

    expect(screen.getByText('No runs yet')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  test('lists runs newest first whatever order the query returned', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={stubSource({
          runs: [
            run({ runId: 'aaaaaaaa-old', enqueuedAt: '2026-07-26T09:00:00.000Z' }),
            run({ runId: 'cccccccc-new', enqueuedAt: '2026-07-28T09:00:00.000Z' }),
            run({ runId: 'bbbbbbbb-mid', enqueuedAt: '2026-07-27T09:00:00.000Z' }),
          ],
        })}
      />,
    );

    expect(rowButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Show run cccccccc-new on the canvas',
      'Show run bbbbbbbb-mid on the canvas',
      'Show run aaaaaaaa-old on the canvas',
    ]);
  });

  test('clicking a row hands its run id to the workspace', () => {
    const onFocusRun = mock((_runId: string) => {});
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={onFocusRun}
        source={stubSource({ runs: [run({ runId: 'run-clicked' })] })}
      />,
    );

    fireEvent.click(rowButtons()[0] as HTMLElement);

    expect(onFocusRun).toHaveBeenCalledTimes(1);
    expect(onFocusRun.mock.calls[0]?.[0]).toBe('run-clicked');
  });

  test('marks the focused row for assistive tech', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId="run-focused"
        onFocusRun={mock(() => {})}
        source={stubSource({
          runs: [
            run({ runId: 'run-focused', enqueuedAt: '2026-07-28T09:00:00.000Z' }),
            run({ runId: 'run-other', enqueuedAt: '2026-07-27T09:00:00.000Z' }),
          ],
        })}
      />,
    );

    const [focused, other] = rowButtons();
    expect(focused?.getAttribute('aria-current')).toBe('true');
    expect(other?.getAttribute('aria-current')).toBeNull();
  });

  test('surfaces the error message of a failed run', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={stubSource({
          runs: [
            run({
              runId: 'run-failed',
              status: 'failed',
              emailStatus: 'failed',
              errorMessage: 'organic_publish rejected the caption',
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText('organic_publish rejected the caption')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  // The body itself renders through the lazily-loaded markdown component, so
  // the assertion is on the fetch seam: the report query stays disabled until
  // the row is expanded, and the expanded row then reports a body rather than
  // the "no report body" fallback.
  test('asks for a report body only once a completed run is expanded', () => {
    const enabledCalls: boolean[] = [];
    const reportRun = run({
      runId: 'run-with-report',
      output: { text: 'Weekly digest body' },
    });

    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={{
          useRuns: () => ({ data: [run({ runId: 'run-with-report' })], isLoading: false }),
          useRunReport: (_runId, enabled) => {
            enabledCalls.push(enabled);
            return { data: enabled ? reportRun : undefined, isLoading: false };
          },
        }}
      />,
    );

    expect(enabledCalls.every((enabled) => enabled === false)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'View report' }));

    expect(enabledCalls.at(-1)).toBe(true);
    expect(screen.queryByText('This run has no report body.')).toBeNull();
  });

  test('says so when an expanded run carries no report body', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={stubSource({ runs: [run({ runId: 'run-empty' })] })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View report' }));

    expect(screen.getByText('This run has no report body.')).toBeTruthy();
  });

  test('offers no report toggle for a run that never completed', () => {
    render(
      <RunHistoryPanel
        automationId="automation-1"
        activeRunId={null}
        onFocusRun={mock(() => {})}
        source={stubSource({ runs: [run({ status: 'queued', completedAt: null })] })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'View report' })).toBeNull();
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Queued')).toBeTruthy();
  });
});
