import { beforeEach, describe, expect, it, mock } from 'bun:test';

type SignInArgs = { email: string; password: string };
type VerifyOtpArgs = { email: string; token: string; type: string };

type FakeState = {
  signInCalls: SignInArgs[];
  signInError: { message: string } | null;
  verifyCalls: VerifyOtpArgs[];
  verifyError: { message: string } | null;
  revalidateCalls: string[];
};

const state: FakeState = {
  signInCalls: [],
  signInError: null,
  verifyCalls: [],
  verifyError: null,
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
      verifyOtp: async (args: VerifyOtpArgs) => {
        state.verifyCalls.push(args);
        return state.verifyError ? { error: state.verifyError } : { error: null };
      },
    },
  }),
}));

const { signInWithPasswordAction, verifyEmailCodeAction } = await import('./actions');

beforeEach(() => {
  state.signInCalls = [];
  state.signInError = null;
  state.verifyCalls = [];
  state.verifyError = null;
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

describe('verifyEmailCodeAction', () => {
  it('redeems the emailed code as an email OTP and returns the default redirect path', async () => {
    const result = await verifyEmailCodeAction({ email: 'founder@test.com', token: '123456' });

    expect(result).toEqual({ success: true, data: { redirectPath: '/dashboard' } });
    expect(state.verifyCalls).toEqual([
      { email: 'founder@test.com', token: '123456', type: 'email' },
    ]);
    expect(state.revalidateCalls).toEqual(['/']);
  });

  it('trims a pasted code', async () => {
    await verifyEmailCodeAction({ email: 'founder@test.com', token: ' 12345678 ' });

    expect(state.verifyCalls[0]?.token).toBe('12345678');
  });

  it('keeps an invite callback as the post-login destination', async () => {
    const result = await verifyEmailCodeAction({
      email: 'founder@test.com',
      token: '123456',
      redirectTo: '/invite/callback?token=abc&brand=def',
    });

    expect(result).toEqual({
      success: true,
      data: { redirectPath: '/invite/callback?token=abc&brand=def' },
    });
  });

  it('refuses an off-origin redirect and falls back to the dashboard', async () => {
    const result = await verifyEmailCodeAction({
      email: 'founder@test.com',
      token: '123456',
      redirectTo: 'https://evil.example.com/steal',
    });

    expect(result).toEqual({ success: true, data: { redirectPath: '/dashboard' } });
  });

  it('maps a wrong or spent code to a message that points at the newest email', async () => {
    state.verifyError = { message: 'Token has expired or is invalid' };

    const result = await verifyEmailCodeAction({ email: 'founder@test.com', token: '000000' });

    expect(result).toEqual({
      success: false,
      error:
        'That code is wrong or has expired. Use the code from the newest email, or send a new one.',
    });
    expect(state.revalidateCalls).toEqual([]);
  });

  it('rejects a code that is not digits before touching Supabase', async () => {
    const result = await verifyEmailCodeAction({ email: 'founder@test.com', token: 'abc123' });

    expect(result).toEqual({ success: false, error: 'Enter the code from your email' });
    expect(state.verifyCalls).toEqual([]);
  });
});
