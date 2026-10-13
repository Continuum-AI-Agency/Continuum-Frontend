import { describe, expect, test } from 'bun:test';
import { billingPaymentRequiredOf } from '@continuum/contracts';
import {
  notifyPaymentRequiredResponse,
  notifyStreamPaymentRequired,
  PaymentRequiredError,
  parsePaymentRequired,
  paymentRequiredFetch,
  paymentRequiredToast,
  readPaymentRequired,
} from './paymentRequired';
import { registerTopUpHost } from './topUp';

// The bodies the Backend's gates send, composed the way they compose them.
const paidMedia = billingPaymentRequiredOf({
  error: 'product_required',
  product: 'paid_media',
  planCode: 'paid_media',
  brandId: '321edd11-0000-4000-8000-000000000000',
});
const exhausted = billingPaymentRequiredOf({
  error: 'credits_exhausted',
  product: 'studio',
  planCode: 'organic_studio',
});
const unsold = billingPaymentRequiredOf({
  error: 'product_required',
  product: 'mcp',
  planCode: null,
});

describe('parsePaymentRequired', () => {
  test('reads the contracts 402 body', () => {
    expect(parsePaymentRequired(402, paidMedia)).toEqual(paidMedia);
  });

  test('ignores anything that is not a billing 402, including the pre-contract three-field body', () => {
    expect(parsePaymentRequired(403, paidMedia)).toBeNull();
    expect(parsePaymentRequired(402, { error: 'payment_required' })).toBeNull();
    expect(
      parsePaymentRequired(402, {
        error: 'product_required',
        product: 'paid_media',
        planCode: 'paid_media',
      }),
    ).toBeNull();
    expect(parsePaymentRequired(402, undefined)).toBeNull();
  });
});

describe('paymentRequiredToast', () => {
  test('product_required says the body sentence and offers Upgrade to Billing with the product as need=', () => {
    const visited: string[] = [];
    const toast = paymentRequiredToast(paidMedia, (href) => visited.push(href));
    expect(toast).toMatchObject({
      title: "Paid media isn't on your plan",
      description: paidMedia.message,
      action: { label: 'Upgrade' },
    });
    expect(paidMedia.message).toContain('Performance Plus');
    toast.action?.onClick();
    expect(visited).toEqual(['/settings?section=billing&need=paid_media']);
  });

  test('credits_exhausted offers Buy credits at the credit-pack section', () => {
    const visited: string[] = [];
    const toast = paymentRequiredToast(exhausted, (href) => visited.push(href));
    expect(toast).toMatchObject({
      title: 'Out of Canvas credits',
      description: exhausted.message,
      action: { label: 'Buy credits' },
    });
    toast.action?.onClick();
    expect(visited).toEqual(['/settings?section=billing#credits']);
  });

  test('the buttons remember the page the refusal happened on', () => {
    const visited: string[] = [];
    const navigate = (href: string) => visited.push(href);
    paymentRequiredToast(exhausted, navigate, '/studio?room=1').action?.onClick();
    paymentRequiredToast(paidMedia, navigate, '/forge').action?.onClick();
    expect(visited).toEqual([
      '/settings?section=billing&from=%2Fstudio%3Froom%3D1#credits',
      '/settings?section=billing&need=paid_media&from=%2Fforge',
    ]);
  });

  test('Buy credits opens the Top up dialog where the refusal happened, when one is mounted', () => {
    const visited: string[] = [];
    const opened: string[] = [];
    const unregister = registerTopUpHost((source) => {
      opened.push(source);
      return true;
    });
    paymentRequiredToast(
      exhausted,
      (href) => visited.push(href),
      '/studio?room=1',
    ).action?.onClick();
    unregister();
    expect(opened).toEqual(['toast']);
    expect(visited).toEqual([]);
  });

  test('a product no plan sells has nothing to buy, so no button, and says who to ask', () => {
    const toast = paymentRequiredToast(unsold, () => {});
    expect(toast.action).toBeUndefined();
    expect(toast.description).toBe(unsold.message);
    expect(unsold.message).toContain('Contact us');
  });
});

describe('raw-fetch and stream refusals', () => {
  test('a 402 Response is read from a clone, so the caller can still read the body', async () => {
    const response = new Response(JSON.stringify(exhausted), { status: 402 });
    expect(await notifyPaymentRequiredResponse(response)).toEqual(exhausted);
    expect(await response.json()).toEqual(exhausted);
  });

  test('any other failure is left to the caller', async () => {
    expect(await notifyPaymentRequiredResponse(new Response('boom', { status: 500 }))).toBeNull();
    expect(await notifyPaymentRequiredResponse(new Response('<html>', { status: 402 }))).toBeNull();
  });

  test('a mid-stream billing code is the studio refusal, composed through the contracts; other codes are not', () => {
    expect(notifyStreamPaymentRequired('credits_exhausted')).toEqual(exhausted);
    expect(notifyStreamPaymentRequired('image_blocked')).toBeNull();
    expect(notifyStreamPaymentRequired(undefined)).toBeNull();
  });
});

describe('paymentRequiredFetch', () => {
  const withFetch = async (response: Response, run: () => Promise<void>) => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = original;
    }
  };

  test('a billing 402 becomes PaymentRequiredError carrying the body, with the body sentence as message', async () => {
    await withFetch(new Response(JSON.stringify(paidMedia), { status: 402 }), async () => {
      let caught: unknown = null;
      try {
        await paymentRequiredFetch('http://backend/api/agents/jaina/chat/stream', {
          method: 'POST',
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PaymentRequiredError);
      expect(readPaymentRequired(caught)).toEqual(paidMedia);
      expect((caught as Error).message).toBe(paidMedia.message);
    });
  });

  test('every other response passes through untouched, including a 402 that is not the contracts body', async () => {
    await withFetch(new Response('ok', { status: 200 }), async () => {
      const response = await paymentRequiredFetch('http://backend/x');
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('ok');
    });
    await withFetch(new Response('<html>', { status: 402 }), async () => {
      const response = await paymentRequiredFetch('http://backend/x');
      expect(response.status).toBe(402);
    });
    expect(readPaymentRequired(new Error('plain'))).toBeNull();
  });
});
