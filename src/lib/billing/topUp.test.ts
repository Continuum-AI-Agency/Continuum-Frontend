import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_TOP_UP_PACKS,
  openTopUp,
  registerTopUpHost,
  topUpPackPresets,
  topUpReturnUrls,
  withoutCheckoutReturn,
} from './topUp';

describe('topUpReturnUrls', () => {
  test('returns to the exact page the pack was bought from, never Billing', () => {
    const { successUrl, cancelUrl } = topUpReturnUrls(
      'https://app.trycontinuum.ai/studio?room=abc#node-1',
      2000,
    );
    expect(successUrl).toBe(
      'https://app.trycontinuum.ai/studio?room=abc&checkout=success&balance=2000',
    );
    expect(cancelUrl).toBe('https://app.trycontinuum.ai/studio?room=abc&checkout=cancel');
  });

  test('on Billing it keeps the page section and from=, so Billing handles its own return', () => {
    const { successUrl } = topUpReturnUrls(
      'http://localhost:3000/settings?section=billing&from=%2Fstudio',
      0,
    );
    expect(successUrl).toBe(
      'http://localhost:3000/settings?section=billing&from=%2Fstudio&checkout=success&balance=0',
    );
  });

  test('a stale return on the page is replaced, not stacked', () => {
    const { successUrl } = topUpReturnUrls(
      'http://localhost:3000/studio?checkout=cancel&balance=5&room=1',
      10,
    );
    expect(successUrl).toBe('http://localhost:3000/studio?room=1&checkout=success&balance=10');
  });
});

describe('withoutCheckoutReturn', () => {
  test('drops only the return params', () => {
    expect(withoutCheckoutReturn('room=1&checkout=success&balance=0')).toBe('?room=1');
    expect(withoutCheckoutReturn('checkout=cancel')).toBe('');
    expect(withoutCheckoutReturn('room=1&checkout=success&balance=0&session_id=cs_test_a1')).toBe(
      '?room=1',
    );
    expect(
      withoutCheckoutReturn('section=billing&checkout=success&plan=paid_media&from=/x', ['from']),
    ).toBe('?section=billing');
  });
});

describe('topUpPackPresets', () => {
  test('1, 5 and 10 packs, with 5 pre-selected', () => {
    expect(topUpPackPresets()).toEqual([1, 5, 10]);
    expect(DEFAULT_TOP_UP_PACKS).toBe(5);
  });

  test('never offers more packs than the offer allows', () => {
    expect(topUpPackPresets({ credits: 1000, priceUsd: 10, maxPacks: 5 })).toEqual([1, 5]);
  });
});

describe('openTopUp', () => {
  test('with no dialog mounted, the fallback runs', () => {
    let fellBack = false;
    openTopUp('toast', () => {
      fellBack = true;
    });
    expect(fellBack).toBe(true);
  });

  test('a mounted dialog opens instead of the fallback', () => {
    const opened: string[] = [];
    const unregister = registerTopUpHost((source) => {
      opened.push(source);
      return true;
    });
    let fellBack = false;
    openTopUp('node', () => {
      fellBack = true;
    });
    unregister();
    expect(opened).toEqual(['node']);
    expect(fellBack).toBe(false);
  });

  test('a dialog that cannot sell here (not metered) falls back', () => {
    const unregister = registerTopUpHost(() => false);
    let fellBack = false;
    openTopUp('sidebar', () => {
      fellBack = true;
    });
    unregister();
    expect(fellBack).toBe(true);
  });
});
