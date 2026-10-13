import { describe, expect, it } from 'bun:test';
import {
  backendTimeoutPolicy,
  fetchWithTimeout,
  isRequestTimeout,
  LONG_OPERATION_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  RequestTimeoutError,
  supabaseTimeoutPolicy,
  withTimeout,
} from './timeout';

const SUPABASE = 'https://nkejqgyushulohxwtytl.supabase.co';

describe('supabaseTimeoutPolicy', () => {
  it('bounds every read at the read budget: REST, RPC, auth and reporting edge functions', () => {
    expect(supabaseTimeoutPolicy(`${SUPABASE}/rest/v1/jaina_dashboards?select=*`, 'GET')).toBe(
      READ_TIMEOUT_MS,
    );
    expect(supabaseTimeoutPolicy(`${SUPABASE}/rest/v1/rpc/optimizer_list_portfolios`, 'POST')).toBe(
      READ_TIMEOUT_MS,
    );
    expect(
      supabaseTimeoutPolicy(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, 'POST'),
    ).toBe(READ_TIMEOUT_MS);
    expect(supabaseTimeoutPolicy(`${SUPABASE}/functions/v1/optimizer-status`, 'POST')).toBe(
      READ_TIMEOUT_MS,
    );
    expect(
      supabaseTimeoutPolicy(
        `${SUPABASE}/functions/v1/paid-media-reporting/campaigns?brandId=b`,
        'POST',
      ),
    ).toBe(READ_TIMEOUT_MS);
    expect(
      supabaseTimeoutPolicy(`${SUPABASE}/functions/v1/fetch-rule-action-logs?brandId=b`, 'GET'),
    ).toBe(READ_TIMEOUT_MS);
  });

  it('gives jobs the long budget and storage none', () => {
    expect(supabaseTimeoutPolicy(`${SUPABASE}/functions/v1/optimizer-run`, 'POST')).toBe(
      LONG_OPERATION_TIMEOUT_MS,
    );
    expect(supabaseTimeoutPolicy(`${SUPABASE}/functions/v1/library-upload`, 'POST')).toBe(
      LONG_OPERATION_TIMEOUT_MS,
    );
    expect(
      supabaseTimeoutPolicy(
        `${SUPABASE}/functions/v1/paid-media-reporting/campaigns?refresh=true`,
        'POST',
      ),
    ).toBe(LONG_OPERATION_TIMEOUT_MS);
    expect(
      supabaseTimeoutPolicy(`${SUPABASE}/storage/v1/object/media/clip.mp4`, 'POST'),
    ).toBeNull();
  });

  it('the Backend policy: a GET is a read, anything else may be a job', () => {
    expect(backendTimeoutPolicy('http://localhost:4000/api/x', 'GET')).toBe(READ_TIMEOUT_MS);
    expect(backendTimeoutPolicy('http://localhost:4000/api/x', 'POST')).toBe(
      LONG_OPERATION_TIMEOUT_MS,
    );
  });
});

describe('fetchWithTimeout', () => {
  const hang = (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
    });

  it('rejects with RequestTimeoutError once the policy budget passes', async () => {
    const bounded = fetchWithTimeout(() => 20, hang);
    let caught: unknown = null;
    try {
      await bounded('https://x.supabase.co/rest/v1/rpc/optimizer_list_portfolios', {
        method: 'POST',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RequestTimeoutError);
    expect(isRequestTimeout(caught)).toBe(true);
    expect((caught as RequestTimeoutError).url).toContain('optimizer_list_portfolios');
    expect((caught as Error).message).toBe("The server didn't answer in 0 s.");
  });

  it("reports the caller's own abort as its abort, never as a timeout", async () => {
    const bounded = fetchWithTimeout(() => 10_000, hang);
    const controller = new AbortController();
    const pending = bounded('https://x.supabase.co/rest/v1/a', { signal: controller.signal });
    controller.abort();
    let caught: unknown = null;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect(isRequestTimeout(caught)).toBe(false);
    expect((caught as Error).name).toBe('AbortError');
  });

  it('passes a null-bound request straight through, and a fast response untouched', async () => {
    const seen: Array<RequestInit | undefined> = [];
    const base = (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response('ok'));
    };
    const bounded = fetchWithTimeout((url) => (url.includes('/storage/') ? null : 50), base);
    await bounded('https://x.supabase.co/storage/v1/object/a');
    expect(seen[0]?.signal).toBeUndefined();
    const response = await bounded('https://x.supabase.co/rest/v1/a');
    expect(await response.text()).toBe('ok');
    expect(seen[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('withTimeout and isRequestTimeout', () => {
  it('bounds a promise and names the read', async () => {
    let caught: unknown = null;
    try {
      await withTimeout(new Promise(() => {}), 10, 'optimizer-status');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RequestTimeoutError);
    expect(await withTimeout(Promise.resolve(1), 10, 'x')).toBe(1);
  });

  it('recognises the platform TimeoutError and nothing else', () => {
    expect(isRequestTimeout({ name: 'TimeoutError' })).toBe(true);
    expect(isRequestTimeout(new Error('timeout'))).toBe(false);
    expect(isRequestTimeout(null)).toBe(false);
  });

  it('still recognises a bound after supabase-js wrapped it or kept only its message', () => {
    const timeout = new RequestTimeoutError('https://x/rest/v1/a', 10_000);
    // functions-js: FunctionsFetchError(context = the fetch error)
    expect(
      isRequestTimeout({
        name: 'FunctionsFetchError',
        message: 'Failed to send',
        context: timeout,
      }),
    ).toBe(true);
    // postgrest-js (no throwOnError): { message, details, hint, code }
    expect(isRequestTimeout({ message: timeout.message, details: '', hint: '', code: '' })).toBe(
      true,
    );
    // an Error a client threw with the library error as its cause
    expect(
      isRequestTimeout(new Error('rule-actions failed', { cause: { context: timeout } })),
    ).toBe(true);
    expect(isRequestTimeout({ message: 'the server answered 500' })).toBe(false);
  });

  it('is an abort to postgrest-js, which would otherwise retry a failed GET three times', () => {
    expect(new RequestTimeoutError('https://x/rest/v1/a', 10_000).code).toBe('ABORT_ERR');
  });
});
