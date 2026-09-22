import { describe, expect, test } from 'bun:test';
import { parsePaymentRequired, paymentRequiredToast } from './paymentRequired';

describe('parsePaymentRequired', () => {
  test('reads the contracts 402 body', () => {
    expect(
      parsePaymentRequired(402, {
        error: 'product_required',
        product: 'paid_media',
        planCode: 'paid_media',
      }),
    ).toEqual({ error: 'product_required', product: 'paid_media', planCode: 'paid_media' });
  });

  test('ignores anything that is not a billing 402', () => {
    const body = { error: 'product_required', product: 'paid_media', planCode: 'paid_media' };
    expect(parsePaymentRequired(403, body)).toBeNull();
    expect(parsePaymentRequired(402, { error: 'payment_required' })).toBeNull();
    expect(parsePaymentRequired(402, undefined)).toBeNull();
  });
});

describe('paymentRequiredToast', () => {
  test('product_required offers Upgrade to Billing with the product as need=', () => {
    const visited: string[] = [];
    const toast = paymentRequiredToast(
      { error: 'product_required', product: 'paid_media', planCode: 'paid_media' },
      (href) => visited.push(href),
    );
    expect(toast).toMatchObject({
      title: "Paid media isn't on your plan",
      description: 'Upgrade to Performance Plus to use it.',
      action: { label: 'Upgrade' },
    });
    toast.action?.onClick();
    expect(visited).toEqual(['/settings?section=billing&need=paid_media']);
  });

  test('credits_exhausted offers Buy credits at the credit-pack section, naming auto-billing', () => {
    const visited: string[] = [];
    const toast = paymentRequiredToast(
      { error: 'credits_exhausted', product: 'studio', planCode: 'organic_studio' },
      (href) => visited.push(href),
    );
    expect(toast).toMatchObject({
      title: 'Out of Canvas credits',
      description: 'Buy a credit pack, or turn on auto-billing, to keep generating.',
      action: { label: 'Buy credits' },
    });
    toast.action?.onClick();
    expect(visited).toEqual(['/settings?section=billing#credits']);
  });

  test('a product no plan sells has nothing to buy, so no button', () => {
    const toast = paymentRequiredToast(
      { error: 'product_required', product: 'trends', planCode: null },
      () => {},
    );
    expect(toast.action).toBeUndefined();
    expect(toast.description).toBe('Ask your Continuum team to turn it on for this brand.');
  });
});
