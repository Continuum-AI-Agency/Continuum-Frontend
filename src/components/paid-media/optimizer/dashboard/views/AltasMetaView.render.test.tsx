import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { AltasMetaView } from './AltasMetaView';

afterEach(cleanup);

const thresholds = chipThresholds(configFixture);

describe('AltasMetaView', () => {
  it('charts Meta sign-ups and their cost against the goal', () => {
    render(<AltasMetaView payload={payloadFixture} thresholds={thresholds} />);

    expect(
      screen.getByRole('heading', { name: 'Altas que vienen de anuncios de Meta' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Altas de Meta y su objetivo' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Costo por alta de Meta' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Altas de Meta con plan anual' })).toBeTruthy();
  });

  it('colours the fortnight cost per Meta sign-up with a red chip above $1,500', () => {
    render(<AltasMetaView payload={payloadFixture} thresholds={thresholds} />);
    const table = screen.getByRole('table', { name: 'Último mes por quincena' });

    const late = within(table).getByText('15–31 oct').closest('tr');
    expect(late).toBeTruthy();
    const chip = within(late as HTMLElement).getByText('$2,344');
    expect(chip.getAttribute('data-tone')).toBe('bad');
  });
});
