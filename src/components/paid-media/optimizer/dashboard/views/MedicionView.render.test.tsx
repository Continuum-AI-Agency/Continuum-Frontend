import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { payloadFixture } from '../__fixtures__/easyfitPayload';
import { MedicionView } from './MedicionView';

afterEach(cleanup);

describe('MedicionView', () => {
  it('states the pilot rules and the measurement gaps', () => {
    render(<MedicionView payload={payloadFixture} />);

    expect(screen.getByText('Poliwin, por fecha de alta')).toBeTruthy();
    expect(screen.getByText('El Purchase de Meta es la etiqueta Agendó Day Pass')).toBeTruthy();
  });

  it('stacks weekly contacts by account and compares account quality', () => {
    render(<MedicionView payload={payloadFixture} />);

    expect(screen.getByRole('img', { name: 'Contactos por cuenta publicitaria' })).toBeTruthy();
    const quality = screen.getByRole('table', {
      name: 'Calidad: cuenta Easyfit vs la otra cuenta',
    });
    expect(within(quality).getByText('Cuenta Easyfit')).toBeTruthy();
    expect(within(quality).getByText('Otra cuenta (0434)')).toBeTruthy();
  });
});
