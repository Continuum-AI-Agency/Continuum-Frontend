import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readBrand } from '@continuum/contracts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cleanup, render, waitFor } from '@testing-library/react';

// PP-DT-K-home-google-no-access-conflated (deep test 2026-10-31, lane K): on the Home, a
// Google-only brand whose Google reads are refused — a viewer's role, a grant no longer live, a
// login Google refused — read "Couldn't load paid results — the ad platform didn't answer. Try
// again in a minute.", while the Google tab names the cause and its one fix. Nothing failed to
// answer: the edge answered why, and Retry cannot change it. The Home says what the tab says.
//
// The boundary under test is the Supabase client: the edge's real refusal bodies and statuses
// (FunctionsHttpError over a Response, as supabase-js answers), the caller's role from
// brand_profiles.brand_role. Everything between it and the page is the real code.

type Answer = { status: number; body: unknown };
let edgeAnswer: Answer = { status: 200, body: {} };
let role: string | null = 'owner';
const roleReads: string[] = [];

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async () =>
        edgeAnswer.status >= 400
          ? {
              data: null,
              error: new FunctionsHttpError(
                new Response(JSON.stringify(edgeAnswer.body), { status: edgeAnswer.status }),
              ),
            }
          : { data: edgeAnswer.body, error: null },
    },
    schema: () => ({
      rpc: async (fn: string, args: { p_brand_id?: string }) => {
        if (fn === 'brand_role') roleReads.push(args.p_brand_id ?? '');
        return { data: fn === 'brand_role' ? role : null, error: null };
      },
    }),
  }),
}));
mock.module('@/app/(post-auth)/dashboard/actions', () => ({
  saveHomeObjectivesAction: async () => ({ ok: true }),
  resetHomeObjectivesAction: async () => ({ ok: true }),
}));

const { HomeOverview } = await import('./HomeOverview');

const PINK = {
  id: '6619636193',
  name: 'Pink Elephant',
  currency: 'MXN',
  platform: 'google_ads',
} as const;
const reading = readBrand({
  accounts: { ads: 1, organic: 0 },
  savedGoal: null,
  business: null,
  portfolios: [],
  approvalRequired: false,
});

/** The deployed edge's refusal for no access: a 404 with no errorCode (the typed
 *  INTEGRATION_NOT_LINKED arrives with G2's edge). */
const NO_ACCESS: Answer = {
  status: 404,
  body: { error: 'Google Ads account not configured or access token missing' },
};
const LOGIN_REFUSED: Answer = {
  status: 409,
  body: {
    error:
      'Google refused this connection’s login (revoked or expired). Reconnect Google in Settings → Integrations.',
    errorCode: 'TOKEN_EXPIRED',
    platform: 'google',
  },
};
const DIDNT_ANSWER =
  "Couldn't load paid results — the ad platform didn't answer. Try again in a minute.";

function renderHome(brandId: string) {
  return render(
    <HomeOverview
      brandId={brandId}
      adAccounts={[PINK]}
      organicAccounts={[]}
      profileRows={[]}
      reading={reading}
    />,
  );
}

afterEach(() => {
  cleanup();
  roleReads.length = 0;
});

describe('the Home, when every Google read of a Google-only brand is refused', () => {
  it('tells a viewer their role cannot read Google Ads, with no connect link', async () => {
    edgeAnswer = NO_ACCESS;
    role = 'viewer';
    const home = renderHome('brand-pink-viewer');

    await waitFor(() =>
      expect(home.getByText('Your role on this brand can’t read Google Ads')).toBeTruthy(),
    );
    expect(
      home.getByText(
        'Reading Google Ads needs the Operator, Admin or Owner role on this brand, and yours is Viewer. Ask an owner or admin of the brand to change it.',
      ),
    ).toBeTruthy();
    expect(home.queryByText(DIDNT_ANSWER)).toBeNull();
    expect(home.queryByTestId('platform-connect-google_ads')).toBeNull();
  });

  it('tells a role that reads Google that no live grant reaches the account, and links to it', async () => {
    edgeAnswer = NO_ACCESS;
    role = 'owner';
    const home = renderHome('brand-pink-owner');

    await waitFor(() =>
      expect(home.getByText('No live Google grant reaches Pink Elephant')).toBeTruthy(),
    );
    expect(
      home.getByText(
        'This brand lists the account, but no live Google connection grants it to the brand. Grant it again in Settings → Integrations.',
      ),
    ).toBeTruthy();
    expect(home.queryByText(DIDNT_ANSWER)).toBeNull();
    expect(home.getByTestId('platform-connect-google_ads').getAttribute('href')).toBeTruthy();
  });

  it('asks to reconnect a login Google refused, whatever the role, without reading it', async () => {
    edgeAnswer = LOGIN_REFUSED;
    role = 'viewer';
    const home = renderHome('brand-pink-refused');

    await waitFor(() =>
      expect(home.getByText('Google Ads could not be read for Pink Elephant')).toBeTruthy(),
    );
    expect(
      home.getByText(
        'Google refused this connection’s login (revoked or expired). Reconnect Google in Settings → Integrations.',
      ),
    ).toBeTruthy();
    expect(home.queryByText(DIDNT_ANSWER)).toBeNull();
    expect(home.getByTestId('platform-connect-google_ads')).toBeTruthy();
    expect(roleReads).toEqual([]);
  });

  it('still says the platform did not answer when it did not, and offers Retry', async () => {
    edgeAnswer = { status: 502, body: { error: 'Google Ads API unavailable' } };
    role = 'owner';
    const home = renderHome('brand-pink-down');

    await waitFor(() => expect(home.getByText(DIDNT_ANSWER, { exact: false })).toBeTruthy());
    expect(home.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    expect(home.queryByTestId('platform-connect-google_ads')).toBeNull();
  });
});
