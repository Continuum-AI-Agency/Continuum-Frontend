import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { SLACK_CONNECT_ERROR_CODES } from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';

// The real slackWorkspaces client and contract schemas run; only the HTTP transport, the
// session read and the router are replaced.

const BRAND_A = '00000000-0000-4000-8000-00000000000a';
const BRAND_B = '00000000-0000-4000-8000-00000000000b';

type RequestOptions = {
  path: string;
  method?: string;
  body?: unknown;
  schema?: { parse: (value: unknown) => unknown };
};

let accessToken: string | null = 'token';
let previewBody: unknown;
let redeemResult: unknown;

const requestMock = mock(async (options: RequestOptions) => {
  if (options.method === 'POST') {
    if (redeemResult instanceof Error) throw redeemResult;
    return options.schema ? options.schema.parse(redeemResult) : redeemResult;
  }
  if (previewBody instanceof Error) throw previewBody;
  return options.schema ? options.schema.parse(previewBody) : previewBody;
});
const replaceMock = mock((_href: string) => {});

mock.module('@/lib/api/http', () => ({ http: { request: requestMock } }));
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: () => Promise.resolve(accessToken),
}));
mock.module('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: mock(), refresh: mock() }),
  usePathname: () => '/slack/connect',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
  notFound: () => {},
}));

import { SlackConnectClaim } from './SlackConnectClaim';

const preview = (overrides: Record<string, unknown> = {}) => ({
  teamId: 'T0QA',
  teamName: 'Continuum QA',
  brandId: BRAND_B,
  returnTo: null,
  brands: [
    { id: BRAND_A, name: 'Acme' },
    { id: BRAND_B, name: 'StarCraft' },
  ],
  ...overrides,
});

const redeemed = (returnTo: string | null) => ({
  brandId: BRAND_B,
  teamId: 'T0QA',
  teamName: 'Continuum QA',
  returnTo,
});

beforeEach(() => {
  accessToken = 'token';
  previewBody = preview();
  redeemResult = redeemed(null);
  requestMock.mockClear();
  replaceMock.mockClear();
  window.history.replaceState(null, '', '/slack/connect?claim=signed.claim');
});

afterEach(cleanup);

describe('SlackConnectClaim', () => {
  it('turns an install callback error into words and a fresh install link', async () => {
    const { findByRole, getByRole } = render(
      <SlackConnectClaim claim={null} error="state_mismatch" />,
    );

    expect((await findByRole('alert')).textContent).toContain('different browser');
    const retry = getByRole('link', { name: 'Install Continuum in Slack again' });
    const href = new URL(retry.getAttribute('href') ?? '');
    expect(href.pathname).toBe('/api/chat/slack/install/start');
    expect(href.searchParams.get('brandId')).toBeNull();
    expect(href.searchParams.get('returnTo')).toBe('/settings?section=integrations');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('has copy for every contract error code, and a generic line for an unknown one', async () => {
    for (const code of SLACK_CONNECT_ERROR_CODES) {
      const { findByRole, unmount } = render(<SlackConnectClaim claim={null} error={code} />);
      expect((await findByRole('alert')).textContent).not.toContain('Something went wrong');
      unmount();
    }
    const { findByRole } = render(<SlackConnectClaim claim={null} error="brand_new_code" />);
    expect((await findByRole('alert')).textContent).toContain('Something went wrong');
  });

  it('signed out, keeps the forwardable link and signs in back to this exact page', async () => {
    accessToken = null;
    const { findByText, getByRole } = render(
      <SlackConnectClaim claim="signed.claim" error={null} />,
    );

    expect(await findByText(/Continuum is installed in your Slack workspace/)).toBeTruthy();
    expect(getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      `/login?redirectTo=${encodeURIComponent('/slack/connect?claim=signed.claim')}`,
    );
    expect(window.location.search).toBe('?claim=signed.claim');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('signed in, names the workspace, pre-selects the claim brand and redeems for the chosen one', async () => {
    const { findByText, getByRole } = render(
      <SlackConnectClaim claim="signed.claim" error={null} />,
    );

    expect(await findByText('Continuum QA')).toBeTruthy();
    expect(requestMock.mock.calls[0]?.[0].path).toBe('/api/chat/slack/claim?claim=signed.claim');
    // The single-use token leaves the address bar as soon as it has been read.
    expect(window.location.search).toBe('');
    const select = getByRole('combobox', { name: 'Brand' }) as HTMLSelectElement;
    expect(select.value).toBe(BRAND_B);

    fireEvent.change(select, { target: { value: BRAND_A } });
    fireEvent.click(getByRole('button', { name: 'Connect workspace' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/settings?section=integrations'));
    expect(requestMock.mock.calls[1]?.[0]).toMatchObject({
      path: '/api/chat/slack/claim',
      method: 'POST',
      body: { claim: 'signed.claim', brandId: BRAND_A },
    });
  });

  it('returns to the in-app returnTo, never an outside one', async () => {
    redeemResult = redeemed('/ai-studio/forge');
    const first = render(<SlackConnectClaim claim="signed.claim" error={null} />);
    fireEvent.click(await first.findByRole('button', { name: 'Connect workspace' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/ai-studio/forge'));
    first.unmount();

    replaceMock.mockClear();
    redeemResult = redeemed('//evil.example/phish');
    const second = render(<SlackConnectClaim claim="signed.claim" error={null} />);
    fireEvent.click(await second.findByRole('button', { name: 'Connect workspace' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/settings?section=integrations'));
  });

  it('explains when the signed-in user is not an owner or admin of any brand', async () => {
    previewBody = preview({ brands: [], brandId: null });
    const { findByText, queryByRole } = render(
      <SlackConnectClaim claim="signed.claim" error={null} />,
    );

    expect(await findByText(/not an owner or admin of any brand/)).toBeTruthy();
    expect(queryByRole('button', { name: 'Connect workspace' })).toBeNull();
  });

  it('a used claim points to Settings; a revoked install asks for a reinstall', async () => {
    redeemResult = new ApiError('claim_used', 409);
    const used = render(<SlackConnectClaim claim="signed.claim" error={null} />);
    fireEvent.click(await used.findByRole('button', { name: 'Connect workspace' }));
    expect((await used.findByRole('alert')).textContent).toContain('already been used');
    expect(used.getByRole('link', { name: 'Open Slack settings' }).getAttribute('href')).toBe(
      '/settings?section=integrations',
    );
    used.unmount();

    redeemResult = new ApiError('installation_revoked', 409);
    const revoked = render(<SlackConnectClaim claim="signed.claim" error={null} />);
    fireEvent.click(await revoked.findByRole('button', { name: 'Connect workspace' }));
    expect((await revoked.findByRole('alert')).textContent).toContain('removed from this Slack');
    expect(revoked.getByRole('link', { name: 'Install Continuum in Slack again' })).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('a forbidden brand keeps the form open so another brand can be picked', async () => {
    redeemResult = new ApiError('forbidden_brand', 403);
    const { findByRole, findByText, getByRole } = render(
      <SlackConnectClaim claim="signed.claim" error={null} />,
    );
    fireEvent.click(await findByRole('button', { name: 'Connect workspace' }));

    expect(await findByText(/owner or admin of that brand/)).toBeTruthy();
    expect((getByRole('button', { name: 'Connect workspace' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('an expired claim on preview shows its copy instead of the form', async () => {
    previewBody = new ApiError('expired_claim', 400);
    const { findByRole, queryByRole } = render(
      <SlackConnectClaim claim="signed.claim" error={null} />,
    );

    expect((await findByRole('alert')).textContent).toContain('more than 24 hours old');
    expect(queryByRole('button', { name: 'Connect workspace' })).toBeNull();
  });
});
