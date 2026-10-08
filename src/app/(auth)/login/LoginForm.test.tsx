import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sendMagicLink = mock(async () => true);
const signInWithPassword = mock(async () => true);
mock.module('@/hooks/useAuth', () => ({
  useAuth: () => ({
    sendMagicLink,
    signInWithPassword,
    signInWithGooglePopup: async () => undefined,
    isPending: false,
    isGooglePending: false,
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
