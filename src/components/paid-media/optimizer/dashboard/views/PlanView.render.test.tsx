import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { configFixture } from '../__fixtures__/easyfitPayload';
import { PlanView } from './PlanView';

afterEach(cleanup);

describe('PlanView', () => {
  it('lists the config plan in order with each action tagged in words', () => {
    render(<PlanView plan={configFixture.plan} />);
    const items = within(screen.getByTestId('plan-actions')).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Oferta')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Medición')).toBeTruthy();
    expect(screen.getByText('Cómo se actualiza')).toBeTruthy();
  });

  it('says so when no plan is written yet', () => {
    render(<PlanView plan={null} />);

    expect(screen.getByText('Todavía no hay acciones escritas para el plan.')).toBeTruthy();
  });
});
