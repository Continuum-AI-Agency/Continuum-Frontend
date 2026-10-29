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
            id: 'campaign_scoreboard',
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
  });

  // Phase 3 (PRD §5.6): live progress per layer — every layer and hypothesis with its state,
  // not only the latest line, so a five-minute answer shows what it has already checked.
  it('lists every layer and hypothesis with its state, the notice first', () => {
    render(
      <JainaAnalysisProgress
        message={message([
          part({
            kind: 'notice',
            id: 'budget',
            status: 'running',
            label: 'This can take a few minutes.',
          }),
          part({
            kind: 'layer',
            id: 'campaign_scoreboard',
            status: 'completed',
            label: 'Campaign evidence checked',
          }),
          part({
            kind: 'layer',
            id: 'creative_tier',
            status: 'running',
            label: 'Reading the creative tier',
          }),
          part({ kind: 'hypothesis', id: 'cpm', status: 'completed', label: 'CPM closed' }),
        ])}
      />,
    );
    const rows = Array.from(
      document.querySelectorAll('[data-testid="jaina-analysis-progress"] li'),
    );
    expect(rows.map((row) => [row.textContent, row.getAttribute('data-status')])).toEqual([
      ['Reading campaign results', 'completed'],
      ['Reading ads and creatives', 'running'],
      ['Did it get more expensive to reach people?', 'completed'],
    ]);
    expect(screen.getByRole('status').textContent?.startsWith('This can take a few minutes.')).toBe(
      true,
    );
  });

  it('replaces the same progress identity and shows partial disclosure without duplicated entries', () => {
    render(
      <JainaAnalysisProgress
        message={message([
          part({ kind: 'drill', id: '1', status: 'running', label: 'Working' }),
          part({
            kind: 'drill',
            id: '1',
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

  // The Backend's layer label is the read's internal trigger and a hypothesis's is its id with
  // spaces; the line is named from the code instead (field report 2026-10-21).
  it('never prints the engine wording a layer or hypothesis row carries', () => {
    render(
      <JainaAnalysisProgress
        message={message([
          part({
            kind: 'layer',
            id: 'creative_tier',
            status: 'running',
            label: 'Entity explains >50% of account change.',
          }),
          part({
            kind: 'hypothesis',
            id: 'mix_vs_efficiency',
            status: 'running',
            label: 'mix vs efficiency',
          }),
          part({ kind: 'hypothesis', id: 'settling', status: 'completed', label: 'settling' }),
          part({
            kind: 'layer',
            id: 'a_layer_from_tomorrow',
            status: 'running',
            label: 'Internal trigger.',
          }),
          part({
            kind: 'hypothesis',
            id: 'a_cause_from_tomorrow',
            status: 'running',
            label: 'raw id',
          }),
        ])}
      />,
    );
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).not.toMatch(/>50%|mix vs efficiency|settling|Internal trigger|raw id/);
    expect(text).toContain('Reading ads and creatives');
    expect(text).toContain('Did spend move to weaker campaigns, or did the same ones get worse?');
    expect(text).toContain('Are recent results still being reported?');
    expect(text).toContain('Reading the account');
    expect(text).toContain('Checking a possible cause');
  });

  it('renders no empty status and ignores invalid payloads', () => {
    render(
      <JainaAnalysisProgress message={message([part({ kind: 'bogus', label: 'unsafe shape' })])} />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
