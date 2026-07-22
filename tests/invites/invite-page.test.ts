import { describe, expect, it, mock } from 'bun:test';

const redirectSpy = mock((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

mock.module('next/navigation', () => ({
  redirect: redirectSpy,
}));

import InvitePage from '@/app/invite/page';

describe('/invite page', () => {
  it('redirects to dashboard error when token or brand is missing', async () => {
    await expect(
      InvitePage({ searchParams: Promise.resolve({ token: '', brand: 'not-a-uuid' }) }),
    ).rejects.toThrow('REDIRECT:/dashboard?invite=missing_params');
  });

  it('redirects to callback route with normalized invite params', async () => {
    await expect(
      InvitePage({
        searchParams: Promise.resolve({
          token: ' token-abc ',
          brand: 'A90C3556-30A6-4D0D-9A04-1B5C058D05C5',
        }),
      }),
    ).rejects.toThrow(
      'REDIRECT:/invite/callback?token=token-abc&brand=a90c3556-30a6-4d0d-9a04-1b5c058d05c5',
    );
  });
});
