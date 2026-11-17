import { beforeEach, describe, expect, it, mock } from 'bun:test';

type SignInArgs = { email: string; password: string };
type VerifyOtpArgs = { email: string; token: string; type: string };
type SignInWithOtpArgs = { email: string; options: Record<string, unknown> };
type FakeAuthError = { name?: string; message: string; status?: number; code?: string };
type LogCall = { level: string; args: unknown[] };

type FakeState = {
  signInCalls: SignInArgs[];
  signInError: { message: string } | null;
  verifyCalls: VerifyOtpArgs[];
  verifyError: { message: string } | null;
  otpCalls: SignInWithOtpArgs[];
  otpError: FakeAuthError | null;
  otpThrow: unknown;
  logCalls: LogCall[];
  revalidateCalls: string[];
};

const state: FakeState = {
  signInCalls: [],
  signInError: null,
  verifyCalls: [],
  verifyError: null,
  otpCalls: [],
  otpError: null,
  otpThrow: undefined,
  logCalls: [],
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

mock.module('@/lib/observability/logger', () => ({
  log: {
    warn: (...args: unknown[]) => state.logCalls.push({ level: 'warn', args }),
    error: (...args: unknown[]) => state.logCalls.push({ level: 'error', args }),
  },
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
      signInWithOtp: async (args: SignInWithOtpArgs) => {
        state.otpCalls.push(args);
        if (state.otpThrow !== undefined) throw state.otpThrow;
        return state.otpError ? { error: state.otpError } : { error: null };
      },
    },
  }),
}));

const { sendMagicLinkAction, signInWithPasswordAction, verifyEmailCodeAction } = await import(
  './actions'
);

const EMAIL_SEND_FAILED =
  "We couldn't send the sign-in email right now. Please try again in a few minutes.";

beforeEach(() => {
  state.signInCalls = [];
  state.signInError = null;
  state.verifyCalls = [];
  state.verifyError = null;
  state.otpCalls = [];
  state.otpError = null;
  state.otpThrow = undefined;
  state.logCalls = [];
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

describe('sendMagicLinkAction', () => {
  it('sends a link that can create the account', async () => {
    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: true, data: undefined });
    expect(state.otpCalls).toEqual([
      {
        email: 'founder@test.com',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/callback?next=%2Fdashboard'),
          shouldCreateUser: true,
        },
      },
    ]);
    expect(state.logCalls).toEqual([]);
  });

  // 2026-11-09: the SMTP provider's daily quota ran out and auth-js surfaced a 500 whose message
  // was just '{}', so the user saw "An unexpected error occurred" and no one could tell why.
  it('explains a provider send failure even when the message is empty', async () => {
    state.otpError = { name: 'AuthRetryableFetchError', message: '{}', status: 500 };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: false, error: EMAIL_SEND_FAILED });
    expect(state.logCalls).toEqual([
      {
        level: 'error',
        args: [
          'auth.email_send_failed',
          undefined,
          {
            reason: 'send_failed',
            status: 500,
            code: undefined,
            errorName: 'AuthRetryableFetchError',
          },
        ],
      },
    ]);
  });

  it('explains an unexpected_failure that names the email send', async () => {
    state.otpError = {
      name: 'AuthApiError',
      message: 'Error sending magic link email',
      status: 400,
      code: 'unexpected_failure',
    };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: false, error: EMAIL_SEND_FAILED });
    expect(state.logCalls[0]?.args[0]).toBe('auth.email_send_failed');
  });

  it('explains a send failure identified only by its message', async () => {
    state.otpError = { name: 'AuthApiError', message: 'Error sending confirmation email' };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: false, error: EMAIL_SEND_FAILED });
  });

  it('explains the email rate limit and logs it as a warning', async () => {
    state.otpError = {
      name: 'AuthApiError',
      message: 'email rate limit exceeded',
      status: 429,
      code: 'over_email_send_rate_limit',
    };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: false, error: EMAIL_SEND_FAILED });
    expect(state.logCalls).toEqual([
      {
        level: 'warn',
        args: [
          'auth.email_send_failed',
          {
            reason: 'rate_limited',
            status: 429,
            code: 'over_email_send_rate_limit',
            errorName: 'AuthApiError',
          },
        ],
      },
    ]);
  });

  // The provider's message can carry the recipient, so the event records the classification only.
  it('never logs the email address or the provider message', async () => {
    state.otpError = {
      name: 'AuthRetryableFetchError',
      message: 'gomail: could not send email to founder@test.com: 550 daily quota',
      status: 500,
    };

    await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(JSON.stringify(state.logCalls)).not.toContain('founder@test.com');
    expect(JSON.stringify(state.logCalls)).not.toContain('gomail');
  });

  it('explains a send failure that is thrown instead of returned', async () => {
    state.otpThrow = Object.assign(new Error('{}'), { status: 503 });

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({ success: false, error: EMAIL_SEND_FAILED });
  });

  it('leaves errors that are not send failures to the generic mapping', async () => {
    state.otpError = {
      name: 'AuthApiError',
      message: 'Signups not allowed for otp',
      status: 422,
      code: 'otp_disabled',
    };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({
      success: false,
      error: 'An unexpected error occurred. Please try again',
    });
    expect(state.logCalls).toEqual([]);
  });

  it('keeps a lost connection as a network error, not a send failure', async () => {
    state.otpError = { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 };

    const result = await sendMagicLinkAction({ email: 'founder@test.com' });

    expect(result).toEqual({
      success: false,
      error: 'Network error. Please check your connection and try again',
    });
  });
});
