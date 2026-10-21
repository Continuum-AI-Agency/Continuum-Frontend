import { describe, expect, it } from 'bun:test';
import {
  buildCheckoutReturnUrls,
  parseCheckoutReturnStatus,
  stripCheckoutReturnParams,
} from './checkoutReturn';

describe('checkoutReturn', () => {
  it('parses success and cancel flags', () => {
    expect(parseCheckoutReturnStatus(new URLSearchParams('billing=success'))).toBe('success');
    expect(parseCheckoutReturnStatus(new URLSearchParams('billing=cancel'))).toBe('cancel');
    expect(parseCheckoutReturnStatus(new URLSearchParams('billing=nope'))).toBeNull();
    expect(parseCheckoutReturnStatus(new URLSearchParams(''))).toBeNull();
  });

  it('strips return flags and keeps billing section', () => {
    const next = stripCheckoutReturnParams(
      new URLSearchParams('section=billing&billing=success&session_id=cs_test_1&foo=1'),
    );
    expect(next.get('section')).toBe('billing');
    expect(next.get('billing')).toBeNull();
    expect(next.get('session_id')).toBeNull();
    expect(next.get('foo')).toBe('1');
  });

  it('builds Stripe success/cancel URLs with session placeholder', () => {
    const urls = buildCheckoutReturnUrls({
      origin: 'https://app.trycontinuum.ai',
      pathname: '/settings',
      search: '?section=general',
    });
    expect(urls.successUrl).toContain('section=billing');
    expect(urls.successUrl).toContain('billing=success');
    expect(urls.successUrl).toContain('session_id={CHECKOUT_SESSION_ID}');
    expect(urls.cancelUrl).toContain('billing=cancel');
    expect(urls.cancelUrl).not.toContain('session_id=');
  });
});
