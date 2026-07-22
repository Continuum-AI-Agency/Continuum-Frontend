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

    expect(screen.getByTestId('generation-progress-panel')).toBeInTheDocument();
    expect(screen.getByTestId('generation-progress-bar')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('Drafting content...')).toBeInTheDocument();
    expect(screen.getByText('Drafting')).toBeInTheDocument();
  });

  it('renders complete state', () => {
    render(<GenerationProgressPanel status="complete" percent={100} stage="finalizing" />);

    expect(screen.getByText('Generation Complete')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(
      <GenerationProgressPanel status="error" percent={0} error="Failed to connect to service" />,
    );

    expect(screen.getByText('Generation Failed')).toBeInTheDocument();
    expect(screen.getByText('Failed to connect to service')).toBeInTheDocument();
    expect(screen.queryByTestId('generation-progress-bar')).not.toBeInTheDocument();
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
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('has accessibility attributes for error state', () => {
    render(<GenerationProgressPanel status="error" percent={0} error="Test error message" />);

    const errorBox = screen.getByRole('alert');
    expect(errorBox).toHaveAttribute('aria-live', 'assertive');
  });
});
