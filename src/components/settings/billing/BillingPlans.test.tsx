import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { PlanCardView } from '@/lib/billing/billingViewModel';
import { BillingPlans } from './BillingPlans';

const organicPlus: PlanCardView = {
  planCode: 'organic_studio',
  name: 'Organic Plus',
  monthlyPriceUsd: 30,
  priceLabel: '$30',
  features: ['AI Canvas'],
  status: 'active',
  action: 'granted',
  highlighted: false,
};

describe('BillingPlans — a plan Continuum activated', () => {
  afterEach(cleanup);

  test('reads Active and Activated by Continuum, with nothing to buy', () => {
    render(<BillingPlans brandId="brand" plans={[organicPlus]} onPlanChanged={() => {}} />);
    const card = screen.getByRole('listitem', { name: 'Organic Plus' });
    expect(card.textContent).toContain('Active');
    expect(card.textContent).toContain('Activated by Continuum.');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
