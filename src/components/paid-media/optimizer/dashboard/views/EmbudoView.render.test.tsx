import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { configFixture, payloadFixture } from '../__fixtures__/easyfitPayload';
import { chipThresholds } from '../dashboardModel';
import { EmbudoView } from './EmbudoView';

afterEach(cleanup);

const thresholds = chipThresholds(configFixture);

describe('EmbudoView', () => {
  it('marks the click cohorts still maturing and leaves their cost open', () => {
    render(<EmbudoView payload={payloadFixture} thresholds={thresholds} />);
    const table = screen.getByRole('table', {
      name: 'Cohortes por mes de clic',
    });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(payloadFixture.cohortes.length);
    const october = rows[rows.length - 1] as HTMLElement;
    expect(within(october).getByText('madurando')).toBeTruthy();
    expect(within(october).getByText('abierto')).toBeTruthy();
    const july = rows[0] as HTMLElement;
    expect(within(july).queryByText('madurando')).toBeNull();
  });

  it('shows the tour lever and the three timing charts', () => {
    render(<EmbudoView payload={payloadFixture} thresholds={thresholds} />);

    expect(screen.getByText('10.8%')).toBeTruthy();
    expect(screen.getByText('1.5%')).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: 'Tours: dos lecturas de Peaking y lo que recibe Meta',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Del clic al alta' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Del clic al tour' })).toBeTruthy();
  });
});
