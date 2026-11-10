import { afterEach, describe, expect, it } from 'bun:test';
import type { JainaUIMessage } from '@continuum/contracts';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { JainaRunProgress } from '@/lib/jaina/runProgress';
import {
  JainaRunProgressBar,
  JainaRunProgressIndicator as JainaRunProgressLive,
} from './JainaRunProgress';

afterEach(cleanup);

const progress = (overrides: Partial<JainaRunProgress> = {}): JainaRunProgress => ({
  route: 'analysis',
  stage: 'testing',
  visible: true,
  fraction: 0.42,
  elapsedSeconds: 60,
  etaSeconds: 80,
  exceeded: false,
  label: 'Revisando posibles causas (2 de 5) · ~1 min restante',
  ...overrides,
});

describe('JainaRunProgressBar', () => {
  it('is an accessible progress bar with the estimate as its label', () => {
    render(<JainaRunProgressBar progress={progress()} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuetext')).toBe(
      'Revisando posibles causas (2 de 5) · ~1 min restante',
    );
    expect(screen.getByTestId('jaina-run-progress').textContent).toContain('~1 min restante');
  });

  it('marks an exceeded estimate and says so', () => {
    render(
      <JainaRunProgressBar
        progress={progress({
          exceeded: true,
          etaSeconds: null,
          fraction: 0.9,
          label: 'Sacando conclusiones · Tardando más de lo esperado…',
        })}
      />,
    );
    expect(screen.getByTestId('jaina-run-progress').getAttribute('data-exceeded')).toBe('true');
    expect(screen.getByText('Sacando conclusiones · Tardando más de lo esperado…')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('90');
  });

  it('renders nothing for a turn too quick to need it', () => {
    const { container } = render(<JainaRunProgressBar progress={progress({ visible: false })} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('JainaRunProgressIndicator', () => {
  const planned = {
    id: 'jaina:run:assistant',
    role: 'assistant',
    parts: [
      {
        type: 'data-jaina-plan',
        data: {
          plan_id: 'p',
          presentation: {
            question: { class: 'lookup', expected_duration: 'short', language: 'es' },
          },
        },
      },
    ],
  } as unknown as JainaUIMessage;

  it('shows the bar for a planned turn and drops it when the turn ends', () => {
    const { rerender } = render(
      <JainaRunProgressLive turnKey="user-1" message={planned} question="¿Cómo va?" active />,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByTestId('jaina-run-progress').textContent).toContain('Analizando la cuenta');
    act(() => {
      rerender(
        <JainaRunProgressLive
          turnKey="user-1"
          message={planned}
          question="¿Cómo va?"
          active={false}
        />,
      );
    });
    expect(screen.queryByTestId('jaina-run-progress')).toBeNull();
  });

  it('stays out of the way before anything says the turn will be long', () => {
    render(<JainaRunProgressLive turnKey="user-2" message={undefined} question="hola" active />);
    expect(screen.queryByTestId('jaina-run-progress')).toBeNull();
  });
});
