import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { CampanasView } from './CampanasView';

afterEach(cleanup);

const thresholds = chipThresholds(configFixture);

describe('CampanasView', () => {
  it('lists Meta campaign types, the lead form by month and Google campaigns', () => {
    render(<CampanasView payload={payloadFixture} thresholds={thresholds} />);

    const types = screen.getByRole('table', { name: 'Meta: tipo de campaña' });
    expect(within(types).getAllByRole('row')).toHaveLength(payloadFixture.tipo_campana.length + 1);
    expect(screen.getByText(/92 altas más vienen de anuncios borrados/)).toBeTruthy();

    const form = screen.getByRole('table', { name: 'Formulario mes a mes' });
    expect(within(form).getAllByRole('row')).toHaveLength(payloadFixture.formulario_mes.length + 1);

    const google = screen.getByRole('table', { name: 'Google Ads' });
    expect(within(google).getByText('Search · Leads formulario')).toBeTruthy();
  });

  it('names the unconnected 0434 account and its contacts', () => {
    render(<CampanasView payload={payloadFixture} thresholds={thresholds} />);

    expect(screen.getByText('Anuncios de una cuenta no conectada (0434)')).toBeTruthy();
    expect(screen.getByText(/Trajeron 1,906 contactos/)).toBeTruthy();
  });
});
