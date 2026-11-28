import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { TrendGenerationProgress } from './TrendGenerationProgress';

afterEach(cleanup);

describe('TrendGenerationProgress header', () => {
  it('reads Trends · Generating over the stage, estimate and percent while running', () => {
    render(
      <TrendGenerationProgress progressPercent={64} currentLabel="Synthesis" etaSeconds={95} />,
    );
    const header = screen.getByTestId('trend-generation-header');
    expect(header.textContent).toContain('Trends');
    expect(header.textContent).toContain('Generating');
    const row = screen.getByTestId('trend-generation-progress');
    expect(row.textContent).toContain('Synthesis');
    expect(row.textContent).toContain('~1m 35s left');
    expect(row.textContent).toContain('64%');
  });

  it('shows no elapsed time: the generation state has no start time', () => {
    render(<TrendGenerationProgress progressPercent={64} currentLabel="Synthesis" />);
    expect(screen.getByTestId('trend-generation-header').textContent).not.toMatch(/\d+:\d{2}/);
  });

  it('says Failed once, with the reason in the row and no percent', () => {
    render(
      <TrendGenerationProgress
        progressPercent={40}
        currentLabel="Synthesis"
        isError
        errorMessage="Grounding timed out"
      />,
    );
    const row = screen.getByTestId('trend-generation-progress');
    expect(screen.getByTestId('trend-generation-header').textContent).toContain('Failed');
    expect(row.textContent).toContain('Grounding timed out');
    expect(row.textContent).not.toContain('40%');
  });

  it('says Done at 100%', () => {
    render(<TrendGenerationProgress progressPercent={100} currentLabel="Completed" />);
    expect(screen.getByTestId('trend-generation-header').textContent).toContain('Done');
  });
});
