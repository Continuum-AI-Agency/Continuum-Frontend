import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { JainaObjective } from '@/lib/jaina/schemas';

mock.module('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

const { ObjectivesQueue } = await import('./ObjectivesQueue');

afterEach(cleanup);

const objective = (
  id: string,
  status: JainaObjective['status'],
  reason_code: string | null = null,
  details: string | null = null,
): JainaObjective => ({
  id,
  title: `Objetivo ${id}`,
  status,
  reason_code,
  details,
  attempt_count: 0,
  version: 0,
});

const openQueue = () => fireEvent.click(screen.getByRole('button'));

describe('ObjectivesQueue', () => {
  it('draws every status differently and labels it', () => {
    render(
      <ObjectivesQueue
        isStreaming
        objectives={[
          objective('a', 'completed'),
          objective('b', 'in_progress'),
          objective('c', 'partial', 'required_tool_not_run'),
          objective('d', 'deferred', 'core_deferred'),
          objective('e', 'blocked', 'hard_dependency_terminal'),
          objective('f', 'failed', 'worker_exception'),
          objective('g', 'cancelled'),
          objective('h', 'pending'),
        ]}
      />,
    );
    openQueue();
    const statuses = screen
      .getAllByTestId('objective-row')
      .map((row) => row.getAttribute('data-status'));
    expect(statuses).toEqual([
      'completed',
      'in_progress',
      'partial',
      'deferred',
      'blocked',
      'failed',
      'cancelled',
      'pending',
    ]);
    const icons = new Set(
      screen.getAllByTestId('objective-icon').map((icon) => icon.getAttribute('data-icon')),
    );
    expect(icons.size).toBe(8);
    for (const label of [
      'Completado',
      'En curso',
      'Parcial',
      'Para la próxima',
      'Bloqueado',
      'Falló',
      'Cancelado',
      'Pendiente',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows the reason as a plain sentence', () => {
    render(
      <ObjectivesQueue
        isStreaming={false}
        objectives={[
          objective(
            'a',
            'partial',
            'required_tool_not_run',
            'Required read never ran this turn: get_breakdown_insights_summary.',
          ),
          objective('b', 'deferred', 'core_deferred', 'Deferred by Jaina core: x'),
        ]}
      />,
    );
    openQueue();
    expect(screen.getByText('No se pudo leer el desglose por segmento')).toBeTruthy();
    expect(screen.getByText('Quedó para la próxima')).toBeTruthy();
    expect(screen.queryByText(/required_tool_not_run|core_deferred/)).toBeNull();
  });

  it('counts completed over total and names the partial ones', () => {
    render(
      <ObjectivesQueue
        isStreaming={false}
        objectives={[
          objective('a', 'completed'),
          objective('b', 'partial'),
          objective('c', 'deferred'),
        ]}
      />,
    );
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText(/1 parcial/)).toBeTruthy();
  });

  it('never spins once the turn is over, even if an objective was left in_progress', () => {
    render(<ObjectivesQueue isStreaming={false} objectives={[objective('a', 'in_progress')]} />);
    openQueue();
    const row = screen.getByTestId('objective-row');
    expect(row.getAttribute('data-status')).not.toBe('in_progress');
    expect(screen.getByText('Se cortó antes de terminar')).toBeTruthy();
  });
});
