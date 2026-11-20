import { beforeEach, describe, expect, it, mock } from 'bun:test';

// /open/integrations is where the MCP's integrations_connect link lands: it must switch
// the web app to the brand the agent is working on before showing the connect buttons,
// or an agency with several brands connects/assigns on whichever brand was last open.

const BRAND = 'd0028c83-1e1a-467e-bc81-36e72fb98f10';
const OTHER = '877bee6d-7ffc-40ef-9f73-5a254f30e6be';

class Redirect extends Error {}
class NotFound extends Error {}

const setActiveBrandPreference = mock(async (_brandId: string) => {});
const redirect = mock((href: string) => {
  throw new Redirect(href);
});
const notFound = mock(() => {
  throw new NotFound();
});

mock.module('next/navigation', () => ({ redirect, notFound }));
mock.module('@/lib/brands/preferences', () => ({ setActiveBrandPreference }));
mock.module('@/lib/brands/active-brand-context', () => ({
  getActiveBrandContext: async () => ({
    brandSummaries: [
      { id: BRAND, isPending: false },
      { id: OTHER, isPending: true },
    ],
    permissions: [{ brand_profile_id: BRAND }, { brand_profile_id: OTHER }],
  }),
}));

const { default: IntegrationsHandoffPage } = await import('./page');

function open(brandId: string) {
  return IntegrationsHandoffPage({ searchParams: Promise.resolve({ brandId }) });
}

describe('/open/integrations', () => {
  beforeEach(() => {
    setActiveBrandPreference.mockClear();
  });

  it('switches to the brand, then lands on the connections settings', async () => {
    await expect(open(BRAND)).rejects.toThrow(new Redirect('/settings?section=connections'));
    expect(setActiveBrandPreference).toHaveBeenCalledWith(BRAND);
  });

  it('404s without touching the preference for a brand the user cannot open', async () => {
    await expect(open(OTHER)).rejects.toBeInstanceOf(NotFound);
    await expect(open('not-a-brand')).rejects.toBeInstanceOf(NotFound);
    expect(setActiveBrandPreference).not.toHaveBeenCalled();
  });
});
