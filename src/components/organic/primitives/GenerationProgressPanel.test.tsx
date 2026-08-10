import { describe, expect, it } from 'bun:test';
import { render, screen } from '@testing-library/react';
import type { GridStatus } from '@/lib/organic/store';
import { GenerationProgressPanel } from './GenerationProgressPanel';

describe('GenerationProgressPanel', () => {
  it('renders null when status is idle', () => {
    const { container } = render(<GenerationProgressPanel status="idle" percent={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders progress panel when running', () => {
    render(
      <GenerationProgressPanel
        status="running"
        percent={45}
        message="Drafting content..."
        stage="drafting"
      />,
    );

    expect(screen.getByTestId('generation-progress-panel')).toBeTruthy();
    expect(screen.getByTestId('generation-progress-bar')).toBeTruthy();
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('Drafting content...')).toBeTruthy();
    expect(screen.getByText('Drafting')).toBeTruthy();
  });

  it('renders complete state', () => {
    render(<GenerationProgressPanel status="complete" percent={100} stage="finalizing" />);

    expect(screen.getByText('Generation Complete')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('renders error state', () => {
    render(
      <GenerationProgressPanel status="error" percent={0} error="Failed to connect to service" />,
    );

    expect(screen.getByText('Generation Failed')).toBeTruthy();
    expect(screen.getByText('Failed to connect to service')).toBeTruthy();
    expect(screen.queryByTestId('generation-progress-bar')).toBeNull();
  });

  it('shows correct stage badge', () => {
    const stages: Array<{ stage: string; label: string }> = [
      { stage: 'analyzing', label: 'Analyzing' },
      { stage: 'optimizing', label: 'Optimizing' },
      { stage: 'drafting', label: 'Drafting' },
      { stage: 'matching', label: 'Matching' },
      { stage: 'finalizing', label: 'Finalizing' },
    ];

    stages.forEach(({ stage, label }) => {
      const { unmount } = render(
        <GenerationProgressPanel status="running" percent={50} stage={stage} />,
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    });
  });

  it('has accessibility attributes for error state', () => {
    render(<GenerationProgressPanel status="error" percent={0} error="Test error message" />);

    const errorBox = screen.getByRole('alert');
    expect(errorBox?.getAttribute('aria-live')).toBe('assertive');
  });
});
