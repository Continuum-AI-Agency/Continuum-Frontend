import { describe, expect, it } from 'bun:test';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { ApiError, markRetried } from '@/lib/api/errors';
import { RequestTimeoutError } from '@/lib/api/timeout';
import { retryUnlessTimeout } from './retry';

describe('retryUnlessTimeout', () => {
  const retry = retryUnlessTimeout(1);

  it('retries a server error once, then stops', () => {
    const error = Object.assign(new Error('boom'), { status: 500 });
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
  });

  it('never retries a timeout, bare or wrapped by supabase-js, or reduced to its message', () => {
    const timeout = new RequestTimeoutError('https://x/rest/v1/a', 10_000);
    expect(retry(0, timeout)).toBe(false);
    expect(retry(0, new FunctionsFetchError(timeout))).toBe(false);
    expect(retry(0, { message: timeout.message, details: '', hint: '', code: '' })).toBe(false);
    expect(retry(0, { name: 'TimeoutError' })).toBe(false);
  });

  it('never retries a payment refusal: the plan answers the same way twice', () => {
    // PP-DT-C-unpaid-brand-polls-402-on-every-page: a brand without the plan got every 402 twice.
    expect(retry(0, new ApiError('Organic Plus is required', 402, 'product_required'))).toBe(false);
    expect(retry(0, Object.assign(new Error('Payment Required'), { status: 402 }))).toBe(false);
  });

  it('never retries an error the call already retried itself: one retry layer, not two', () => {
    const cut = markRetried(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    expect(retry(0, cut)).toBe(false);
  });
});
