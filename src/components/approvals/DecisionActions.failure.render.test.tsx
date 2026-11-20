import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ToastOptions } from '@/components/ui/ToastProvider';
import { registerToastSink } from '@/components/ui/toast-imperative';
import { render } from '@/i18n/__tests__/render';
import type { RuleAction } from '@/lib/approvals/types';

// PP-DT-C-approve-failure-toast-raw-edge-string: an Approve whose call never left the browser
// said "Approve failed · Failed to send a request to the Edge Function" — supabase-js's own
// words — while the same page words its queue read failure ("no connection to the server"). A
// failed decision is told in the product's words, and an Approve that never reached the server
// says nothing changed on the platform.

/** The client wraps the library's error with it as the cause, exactly as `invoke` does. */
const asClientError = (libraryError: Error) =>
  new Error(libraryError.message, { cause: libraryError });

let approveFailure: Error = asClientError(
  new FunctionsFetchError(new TypeError('Failed to fetch')),
);
const approveAction = mock(async () => {
  throw approveFailure;
});
mock.module('@/lib/approvals/client', () => ({
  approveAction,
  rejectAction: mock(async () => ({ ok: true })),
  getAction: mock(async () => ({})),
  listActions: mock(async () => ({ actions: [], total: 0 })),
  getDryRunMode: mock(async () => ({ dryRun: false })),
}));

const { DecisionActions } = await import('./DecisionActions');

const action: RuleAction = {
  id: 'ra-1',
  status: 'PENDING',
  action_type: 'PAUSE_ADSET',
  scope_type: 'ADSET',
  scope_id: 'adset-1',
  action_payload: {},
  rule_name: 'CPA guard',
  created_at: '2026-10-31T10:00:00.000Z',
};

let toasts: ToastOptions[] = [];
let unregister: () => void = () => {};

const toastText = () =>
  toasts.map((toast) => `${toast.title} ${toast.description ?? ''}`).join(' | ');

function renderActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DecisionActions action={action} brandId="brand-1" onAdvance={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  toasts = [];
  unregister = registerToastSink((options) => toasts.push(options));
  approveAction.mockClear();
});

afterEach(() => {
  unregister();
  cleanup();
});

describe('a failed Approve is told in the product words', () => {
  it('names a dropped connection and says nothing changed on the platform', async () => {
    approveFailure = asClientError(new FunctionsFetchError(new TypeError('Failed to fetch')));
    const { getByRole } = renderActions();
    fireEvent.click(getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toasts[0]?.variant).toBe('error');
    expect(toastText()).toContain('no connection to the server');
    expect(toastText()).toContain('Nothing changed on the platform');
    expect(toastText()).not.toMatch(/Edge Function|Failed to fetch/);
  });

  it('names a server error without the library string, and claims nothing about the platform', async () => {
    approveFailure = asClientError(
      new FunctionsHttpError(new Response('{"error":"boom"}', { status: 500 })),
    );
    const { getByRole } = renderActions();
    fireEvent.click(getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    expect(toastText()).toContain('the service answered with an error');
    expect(toastText()).not.toMatch(/Edge Function|non-2xx/);
    expect(toastText()).not.toContain('Nothing changed on the platform');
  });
});
