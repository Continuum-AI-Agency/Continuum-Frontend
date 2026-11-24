// A send the email provider refused (quota spent, rate limit) cannot succeed on an immediate retry,
// and a delivered one cannot be repeated inside auth's per-address window, so both hold the send
// buttons for EMAIL_SEND_HOLD_MS. Other failures leave the user free to correct and resend.

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act, cleanup } from '@testing-library/react';
import { renderHook } from '@/i18n/__tests__/render';
import * as navigation from '@/i18n/navigation';
import * as actions from '@/lib/auth/actions';
import { EMAIL_SEND_HOLD_MS, useAuth } from './useAuth';

// spyOn rather than mock.module: a module mock outlives this file and would replace the real
// actions under actions.sign-in.test.ts whenever both run in one process.
type SendResult = Awaited<ReturnType<typeof actions.sendMagicLinkAction>>;

const restores: Array<() => void> = [];

let holdTimers: Array<() => void> = [];

beforeEach(() => {
  holdTimers = [];
  const realSetTimeout = globalThis.setTimeout;
  const router = spyOn(navigation, 'useRouter').mockReturnValue({
    push: () => undefined,
    refresh: () => undefined,
  } as unknown as ReturnType<typeof navigation.useRouter>);
  const timers = spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    delay?: number,
  ) => {
    if (delay === EMAIL_SEND_HOLD_MS) {
      holdTimers.push(callback);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(callback, delay);
  }) as typeof setTimeout);
  restores.push(
    () => router.mockRestore(),
    () => timers.mockRestore(),
  );
});

afterEach(() => {
  for (const restore of restores.splice(0)) restore();
  cleanup();
});

async function send(result: SendResult) {
  const action = spyOn(actions, 'sendMagicLinkAction').mockResolvedValue(result);
  restores.push(() => action.mockRestore());
  const hook = renderHook(() => useAuth());
  let sent = false;
  await act(async () => {
    sent = await hook.result.current.sendMagicLink({ email: 'reader@continuum.test' });
  });
  return { hook, sent };
}

test('a delivered email holds resending until the window passes', async () => {
  const { hook, sent } = await send({ success: true, data: undefined });

  expect(sent).toBe(true);
  expect(hook.result.current.isEmailSendHeld).toBe(true);
  expect(holdTimers).toHaveLength(1);

  act(() => holdTimers[0]?.());
  expect(hook.result.current.isEmailSendHeld).toBe(false);
});

test('a send the provider refused holds sending and shows its message', async () => {
  const { hook, sent } = await send({
    success: false,
    error: "We couldn't send the sign-in email.",
    retryLater: true,
  });

  expect(sent).toBe(false);
  expect(hook.result.current.error).toBe("We couldn't send the sign-in email.");
  expect(hook.result.current.isEmailSendHeld).toBe(true);
});

test('any other failure leaves sending open', async () => {
  const { hook, sent } = await send({ success: false, error: 'Invalid email address' });

  expect(sent).toBe(false);
  expect(hook.result.current.error).toBe('Invalid email address');
  expect(hook.result.current.isEmailSendHeld).toBe(false);
  expect(holdTimers).toHaveLength(0);
});
