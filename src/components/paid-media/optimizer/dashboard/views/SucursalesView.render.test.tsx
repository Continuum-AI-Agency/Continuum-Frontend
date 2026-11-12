import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { SucursalesView } from './SucursalesView';

afterEach(cleanup);

const thresholds = chipThresholds(configFixture);

describe('SucursalesView', () => {
  it('orders branches by cost per Meta sign-up, cheapest first', () => {
    render(<SucursalesView payload={payloadFixture} thresholds={thresholds} />);
    const table = screen.getByRole('table', {
      name: 'Altas totales, altas de Meta y costo',
    });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);
    const expected = [...payloadFixture.sucursales]
      .sort((a, b) => (a.cpa_meta ?? 0) - (b.cpa_meta ?? 0))
      .map((branch) => branch.nombre);

    expect(names).toEqual(expected);
  });

  it('writes the ad-branch × tour-branch matrix as row percentages', () => {
    render(<SucursalesView payload={payloadFixture} thresholds={thresholds} />);
    const matrix = screen.getByRole('table', {
      name: 'Anuncio de una sucursal, tour en otra',
    });
    const { filas, valores } = payloadFixture.cruce_sucursal;
    const firstRow = within(matrix)
      .getByRole('rowheader', { name: filas[0] })
      .closest('tr') as HTMLElement;
    const values = valores[0] ?? [];
    const total = values.reduce((sum, value) => sum + value, 0);

    expect(within(firstRow).getAllByRole('cell')[0]?.textContent).toBe(
      `${Math.round((100 * (values[0] ?? 0)) / total)}%`,
    );
  });
});
