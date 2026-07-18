import { beforeEach, describe, expect, it, mock } from 'bun:test';

type SignInArgs = { email: string; password: string };

type FakeState = {
  signInCalls: SignInArgs[];
  signInError: { message: string } | null;
  revalidateCalls: string[];
};

const state: FakeState = {
  signInCalls: [],
  signInError: null,
  revalidateCalls: [],
};

mock.module('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidateCalls.push(path);
  },
}));

mock.module('next/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));

mock.module('next/headers', () => ({
  cookies: async () => ({ delete: () => {} }),
  headers: async () => new Headers({ host: 'app.trycontinuum.ai', 'x-forwarded-proto': 'https' }),
}));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: async (args: SignInArgs) => {
        state.signInCalls.push(args);
        return state.signInError ? { error: state.signInError } : { error: null };
      },
    },
  }),
}));

const { signInWithPasswordAction } = await import('./actions');

beforeEach(() => {
  state.signInCalls = [];
  state.signInError = null;
  state.revalidateCalls = [];
});

describe('signInWithPasswordAction', () => {
  it('signs in and returns the default redirect path', async () => {
    const result = await signInWithPasswordAction({
      email: 'reviewer@test.com',
      password: 'correct horse',
    });

    expect(result).toEqual({ success: true, data: { redirectPath: '/dashboard' } });
    expect(state.signInCalls).toEqual([{ email: 'reviewer@test.com', password: 'correct horse' }]);
  });

  it('honours a safe relative redirect', async () => {
    const result = await signInWithPasswordAction({
      email: 'reviewer@test.com',
      password: 'correct horse',
      redirectTo: '/organic',
    });

    expect(result).toEqual({ success: true, data: { redirectPath: '/organic' } });
  });

  // The redirect is attacker-controllable via ?redirectTo=, so an off-origin
  // target must never survive into the post-login navigation.
  it('refuses an off-origin redirect and falls back to the dashboard', async () => {
    const result = await signInWithPasswordAction({
      email: 'reviewer@test.com',
      password: 'correct horse',
      redirectTo: 'https://evil.example.com/steal',
    });

    expect(result).toEqual({ success: true, data: { redirectPath: '/dashboard' } });
  });

  it('maps invalid credentials to a safe message and never signals success', async () => {
    state.signInError = { message: 'Invalid login credentials' };

    const result = await signInWithPasswordAction({
      email: 'reviewer@test.com',
      password: 'wrong',
    });

    expect(result).toEqual({ success: false, error: 'Invalid email or password' });
  });

  it('rejects a malformed email before touching Supabase', async () => {
    const result = await signInWithPasswordAction({ email: 'not-an-email', password: 'x' });

    expect(result).toEqual({ success: false, error: 'Invalid email address' });
    expect(state.signInCalls).toEqual([]);
  });

  it('rejects an empty password before touching Supabase', async () => {
    const result = await signInWithPasswordAction({ email: 'reviewer@test.com', password: '' });

    expect(result).toEqual({ success: false, error: 'Password is required' });
    expect(state.signInCalls).toEqual([]);
  });
});
