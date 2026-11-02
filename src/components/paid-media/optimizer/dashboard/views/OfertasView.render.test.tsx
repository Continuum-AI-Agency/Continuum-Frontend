import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { OfertasView } from './OfertasView';

afterEach(cleanup);

describe('OfertasView', () => {
  it('ranks offers with their estimated cost chip', () => {
    render(
      <OfertasView
        offers={configFixture.ofertas}
        payload={payloadFixture}
        thresholds={chipThresholds(configFixture)}
      />,
    );
    const table = screen.getByRole('table', { name: 'Altas por oferta' });
    const annual = within(table).getByText('Anualidad (descuento)').closest('tr') as HTMLElement;

    expect(within(annual).getByText('$571').getAttribute('data-tone')).toBe('good');
  });

  it("joins this month's promotions to their historical rates", () => {
    render(
      <OfertasView
        offers={configFixture.ofertas}
        payload={payloadFixture}
        thresholds={chipThresholds(configFixture)}
      />,
    );
    const promos = screen.getByRole('table', { name: 'Promociones del mes' });
    const dayPass = within(promos).getByText('DayPass 3 días').closest('tr') as HTMLElement;

    expect(within(dayPass).getByText('Day pass y días gratis')).toBeTruthy();
    expect(within(dayPass).getByText('5.0')).toBeTruthy();
    expect(within(dayPass).getByText('Vigencia: todo noviembre')).toBeTruthy();
  });

  it('lists at most 20 ads, biggest spend first, and hides promotions until the config arrives', () => {
    render(
      <OfertasView
        offers={null}
        payload={payloadFixture}
        thresholds={chipThresholds(configFixture)}
      />,
    );
    const ads = screen.getByRole('table', { name: 'Anuncios con inversión en el mes' });

    expect(within(ads).getAllByRole('row')).toHaveLength(21);
    expect(screen.queryByRole('table', { name: 'Promociones del mes' })).toBeNull();
  });
});
