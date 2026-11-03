import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { AudienciasView } from './AudienciasView';

afterEach(cleanup);

const thresholds = chipThresholds(configFixture);

describe('AudienciasView', () => {
  it('lists every audience and charts age spend against age sign-ups', () => {
    render(<AudienciasView payload={payloadFixture} thresholds={thresholds} />);
    const table = screen.getByRole('table', { name: 'Costo por alta por audiencia' });

    expect(within(table).getAllByRole('row')).toHaveLength(payloadFixture.audiencias.length + 1);
    expect(screen.getByRole('img', { name: 'Edad: inversión vs altas' })).toBeTruthy();
    expect(screen.getByText('% de la inversión')).toBeTruthy();
    expect(screen.getByText('% de las altas de Meta')).toBeTruthy();
  });
});
