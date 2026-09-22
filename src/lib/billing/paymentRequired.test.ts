import { describe, expect, test } from 'bun:test';
import {
  notifyPaymentRequiredResponse,
  notifyStreamPaymentRequired,
  parsePaymentRequired,
  paymentRequiredToast,
} from './paymentRequired';

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

  test('credits_exhausted offers Buy credits at the credit-pack section', () => {
    const visited: string[] = [];
    const toast = paymentRequiredToast(
      { error: 'credits_exhausted', product: 'studio', planCode: 'organic_studio' },
      (href) => visited.push(href),
    );
    expect(toast).toMatchObject({
      title: 'Out of Canvas credits',
      description: 'Add a credit pack to keep generating.',
      action: { label: 'Buy credits' },
    });
    toast.action?.onClick();
    expect(visited).toEqual(['/settings?section=billing#credits']);
  });

  test('the buttons remember the page the refusal happened on', () => {
    const visited: string[] = [];
    const navigate = (href: string) => visited.push(href);
    paymentRequiredToast(
      { error: 'credits_exhausted', product: 'studio', planCode: 'organic_studio' },
      navigate,
      '/studio?room=1',
    ).action?.onClick();
    paymentRequiredToast(
      { error: 'product_required', product: 'paid_media', planCode: 'paid_media' },
      navigate,
      '/forge',
    ).action?.onClick();
    expect(visited).toEqual([
      '/settings?section=billing&from=%2Fstudio%3Froom%3D1#credits',
      '/settings?section=billing&need=paid_media&from=%2Fforge',
    ]);
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

describe('raw-fetch and stream refusals', () => {
  const exhausted = { error: 'credits_exhausted', product: 'studio', planCode: 'organic_studio' };

  test('a 402 Response is read from a clone, so the caller can still read the body', async () => {
    const response = new Response(JSON.stringify(exhausted), { status: 402 });
    expect(await notifyPaymentRequiredResponse(response)).toEqual(exhausted);
    expect(await response.json()).toEqual(exhausted);
  });

  test('any other failure is left to the caller', async () => {
    expect(await notifyPaymentRequiredResponse(new Response('boom', { status: 500 }))).toBeNull();
    expect(await notifyPaymentRequiredResponse(new Response('<html>', { status: 402 }))).toBeNull();
  });

  test('a mid-stream billing code is the studio refusal; other codes are not', () => {
    expect(notifyStreamPaymentRequired('credits_exhausted')).toEqual(exhausted);
    expect(notifyStreamPaymentRequired('image_blocked')).toBeNull();
    expect(notifyStreamPaymentRequired(undefined)).toBeNull();
  });
});
