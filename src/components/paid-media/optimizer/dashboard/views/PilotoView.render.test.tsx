import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { PilotoView } from './PilotoView';

afterEach(cleanup);

const renderPiloto = (config = configFixture) =>
  render(<PilotoView asOfDate="2026-11-01" config={config} payload={payloadFixture} />);

describe('PilotoView', () => {
  it('leads with the pilot goal and marks November in course, the rest not started', () => {
    renderPiloto();

    expect(screen.getByRole('heading', { name: '2,060 altas con $350,000' })).toBeTruthy();
    const november = screen.getByTestId('pilot-month-2026-11');
    expect(november.getAttribute('data-state')).toBe('inProgress');
    expect(within(november).getByText('en curso')).toBeTruthy();
    expect(
      within(november).getByRole('progressbar', { name: 'Altas Poliwin: 85 / 729' }),
    ).toBeTruthy();
    expect(within(november).getByTestId('floor-marker').getAttribute('title')).toBe('Piso 662');
    expect(within(screen.getByTestId('pilot-month-2026-12')).getByText('por iniciar')).toBeTruthy();
  });

  it('shows the engine projection on the month in course only, and hides it without one', () => {
    renderPiloto();
    expect(
      within(screen.getByTestId('pilot-month-2026-11')).getByTestId('pilot-projection').textContent,
    ).toBe('Al ritmo actual cierras en 690 altas');
    expect(
      within(screen.getByTestId('pilot-month-2026-12')).queryByTestId('pilot-projection'),
    ).toBeNull();
    cleanup();

    render(
      <PilotoView
        asOfDate="2026-11-01"
        config={configFixture}
        payload={{ ...payloadFixture, proyeccion: null }}
      />,
    );
    expect(screen.queryByTestId('pilot-projection')).toBeNull();
  });

  it('reports the KPIs on October, with the Meta share goal from the config', () => {
    renderPiloto();

    expect(screen.getByText('Costo por alta Oct')).toBeTruthy();
    expect(screen.getByText('Valor de un socio')).toBeTruthy();
    expect(screen.getByText('$4,240')).toBeTruthy();
    expect(screen.getByText(/obj\. ~17%/)).toBeTruthy();
  });

  it('draws both history charts on one axis each, with goal and floor named in the legend', () => {
    renderPiloto();

    expect(
      screen.getByRole('img', { name: 'Altas por mes: historial y metas del piloto' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Costo por alta total' })).toBeTruthy();
    expect(screen.getByText('Piso (mismo mes año pasado)')).toBeTruthy();
    expect(screen.getByText('Techo (piso de altas)')).toBeTruthy();
  });

  it('runs the simulator: the prototype default falls short in words, and switching month resets the budget', () => {
    renderPiloto();
    const simulator = screen.getByTestId('pilot-simulator');
    const verdict = within(simulator).getByTestId('sim-verdict');

    expect(verdict.getAttribute('data-verdict')).toBe('short');
    expect(verdict.textContent).toContain('Lejos (< 80%)');
    expect(verdict.textContent).toContain('para el objetivo de 115');

    fireEvent.click(within(simulator).getByRole('button', { name: 'Diciembre' }));
    expect(within(simulator).getByText('objetivo 90 altas de Meta')).toBeTruthy();

    const annual = within(simulator).getByLabelText(/Contactos con anualidad/);
    fireEvent.change(annual, { target: { value: '100' } });
    expect(within(simulator).getByLabelText(/Contactos con DayPass/)).toHaveProperty('value', '0');
  });

  it('shows the findings from the payload with their severity in words', () => {
    renderPiloto();

    expect(screen.getByText('Crítico · Brecha')).toBeTruthy();
    expect(
      screen.getByText('Al ritmo actual el mes cierra con 63 altas de Meta de 115'),
    ).toBeTruthy();
  });

  it('waits for the config before showing the simulator', () => {
    render(<PilotoView asOfDate="2026-11-01" config={null} payload={payloadFixture} />);

    expect(screen.queryByTestId('pilot-simulator')).toBeNull();
    expect(screen.getByTestId('pilot-month-2026-11')).toBeTruthy();
  });
});
