import { afterEach, describe, expect, it } from 'bun:test';
import type { JainaUIMessage } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { JainaAnalysisProgress } from './JainaAnalysisProgress';

afterEach(cleanup);
const message = (parts: unknown[]) => ({ id: 'run', role: 'assistant', parts }) as JainaUIMessage;
const part = (data: Record<string, unknown>) => ({ type: 'data-jaina-analysis-progress', data });

describe('Jaina analysis progress', () => {
  it('shows the initial warning and latest scoped progress during live or replayed analysis', () => {
    render(
      <JainaAnalysisProgress
        message={message([
          part({
            kind: 'notice',
            id: 'budget',
            status: 'running',
            label: 'This analysis can take several minutes.',
          }),
          part({
            kind: 'layer',
            id: 'campaign',
            status: 'completed',
            label: 'Campaign evidence checked',
          }),
          part({
            kind: 'drill',
            id: 'round-1',
            status: 'running',
            label: 'Checking the affected ads',
            detail: 'Round 1 of 3',
          }),
        ])}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'This analysis can take several minutes.',
    );
    expect(screen.getByRole('status').textContent).toContain('Checking the affected ads');
    expect(screen.getByRole('status').textContent).toContain('Round 1 of 3');
    expect(screen.queryByText('Campaign evidence checked')).toBeNull();
  });

  it('replaces the same progress identity and shows partial disclosure without duplicated entries', () => {
    render(
      <JainaAnalysisProgress
        message={message([
          part({ kind: 'hypothesis', id: 'fatigue', status: 'running', label: 'Working' }),
          part({
            kind: 'hypothesis',
            id: 'fatigue',
            status: 'partial',
            label: 'Some evidence is unfinished',
            detail: 'Reading deadline reached',
          }),
        ])}
      />,
    );
    expect(screen.queryByText('Working')).toBeNull();
    expect(
      screen.getByText('Some evidence is unfinished').parentElement?.getAttribute('data-status'),
    ).toBe('partial');
    expect(screen.getByRole('status').textContent).toContain('Reading deadline reached');
  });

  it('renders no empty status and ignores invalid payloads', () => {
    render(
      <JainaAnalysisProgress message={message([part({ kind: 'bogus', label: 'unsafe shape' })])} />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
