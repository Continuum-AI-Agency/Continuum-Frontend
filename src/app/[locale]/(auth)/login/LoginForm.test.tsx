import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

const sendMagicLink = mock(async () => true);
const signInWithPassword = mock(async () => true);
let isEmailSendHeld = false;
mock.module('@/hooks/useAuth', () => ({
  useAuth: () => ({
    sendMagicLink,
    signInWithPassword,
    signInWithGooglePopup: async () => undefined,
    isPending: false,
    isGooglePending: false,
    isEmailSendHeld,
    error: null,
    clearError: () => undefined,
  }),
}));
mock.module('posthog-js', () => ({ default: { capture: () => undefined } }));

import { LoginForm } from './LoginForm';

afterEach(() => {
  cleanup();
  sendMagicLink.mockClear();
  signInWithPassword.mockClear();
  isEmailSendHeld = false;
});

test('on-demand validation rejects invalid email and preserves the sent-link view', async () => {
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'local@invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  await screen.findByText(/valid email/i);
  expect(sendMagicLink).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'local@continuum.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  await screen.findByRole('button', { name: 'Resend email' });
  expect(screen.getByText('local@continuum.test')).toBeTruthy();
  expect(sendMagicLink).toHaveBeenCalledTimes(1);
});

test('password mode still requires a password before attempting sign-in', async () => {
  render(<LoginForm />);
  fireEvent.click(screen.getByRole('button', { name: 'password login' }));
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'local@continuum.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await screen.findByText(/password.*required|enter.*password/i);
  expect(signInWithPassword).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'bench password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await waitFor(() =>
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'local@continuum.test',
      password: 'bench password',
      redirectTo: undefined,
    }),
  );
});

// A refused send (quota spent) cannot succeed on an immediate retry, so the hold keeps the user
// from spending the project's email budget on resends while password sign-in stays open.
test('an email-send hold disables sending and resending but not password sign-in', async () => {
  const view = render(<LoginForm />);
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'local@continuum.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
  const resend = await screen.findByRole('button', { name: 'Resend email' });
  expect(resend.hasAttribute('disabled')).toBe(false);

  isEmailSendHeld = true;
  view.rerender(<LoginForm />);
  expect(screen.getByRole('button', { name: 'Resend email' }).hasAttribute('disabled')).toBe(true);

  cleanup();
  render(<LoginForm />);
  expect(screen.getByRole('button', { name: 'Send sign-in link' }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'password login' }));
  expect(screen.getByRole('button', { name: 'Sign in', exact: true }).hasAttribute('disabled')).toBe(
    false,
  );
});
