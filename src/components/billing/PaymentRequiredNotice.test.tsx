import { afterEach, describe, expect, it } from 'bun:test';
import { billingPaymentRequiredOf } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { PaymentRequiredNotice, SUPPORT_HREF } from './PaymentRequiredNotice';

afterEach(cleanup);

// The three bodies the Backend's gates compose (billingPaymentRequiredOf): a product a plan
// sells, a product no plan sells, and a spent balance.
describe('PaymentRequiredNotice', () => {
  it('upgrade_plan: prints the body sentence and links to Billing with the plan highlighted', () => {
    const body = billingPaymentRequiredOf({
      error: 'product_required',
      product: 'paid_media',
      planCode: 'paid_media',
      brandId: '321edd11-0000-4000-8000-000000000000',
    });
    const { getByRole, getByTestId, getByText } = render(
      <PaymentRequiredNotice body={body} from="/scale?tab=jaina" />,
    );
    expect(getByRole('alert').getAttribute('data-action')).toBe('upgrade_plan');
    expect(getByText(body.message)).toBeTruthy();
    const link = getByTestId('payment-required-upgrade-plan');
    expect(link.textContent).toBe('Add Performance Plus');
    expect(link.getAttribute('href')).toContain('section=billing');
    expect(link.getAttribute('href')).toContain('need=paid_media');
    expect(link.getAttribute('href')).toContain('from=');
  });

  it('contact_us: a product no plan sells offers the support page, not a purchase', () => {
    const body = billingPaymentRequiredOf({
      error: 'product_required',
      product: 'mcp',
      planCode: null,
    });
    const { getByRole, getByTestId, queryByTestId } = render(<PaymentRequiredNotice body={body} />);
    expect(getByRole('alert').getAttribute('data-action')).toBe('contact_us');
    expect(getByTestId('payment-required-contact-us').getAttribute('href')).toBe(SUPPORT_HREF);
    expect(queryByTestId('payment-required-upgrade-plan')).toBeNull();
    expect(queryByTestId('payment-required-buy-credits')).toBeNull();
  });

  it('buy_credits: a spent balance offers the credit pack', () => {
    const body = billingPaymentRequiredOf({
      error: 'credits_exhausted',
      product: 'studio',
      planCode: 'organic_studio',
    });
    const { getByRole, getByTestId, getByText } = render(<PaymentRequiredNotice body={body} />);
    expect(getByRole('alert').getAttribute('data-action')).toBe('buy_credits');
    expect(getByText(body.message)).toBeTruthy();
    expect(getByTestId('payment-required-buy-credits').textContent).toBe('Buy credits');
  });
});
