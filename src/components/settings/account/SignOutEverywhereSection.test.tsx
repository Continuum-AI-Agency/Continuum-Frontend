import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Settings → Profile: Sign out in the sidebar ends only this browser; this control ends every
// session of the account, behind a confirmation. A session opened from an impersonation link
// never gets it (PP-DT-C-signout-ends-every-device, Ramiro's decision 1).

const logoutEverywhere = mock(async () => true);
let authError: string | null = null;

mock.module('@/hooks/useAuth', () => ({
  useAuth: () => ({ logoutEverywhere, isPending: false, error: authError }),
}));

import { SignOutEverywhereSection } from './SignOutEverywhereSection';

beforeEach(() => {
  logoutEverywhere.mockClear();
  authError = null;
});

afterEach(cleanup);

describe('SignOutEverywhereSection', () => {
  it('signs out of all devices only after the confirmation', async () => {
    render(<SignOutEverywhereSection impersonating={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));

    expect(await screen.findByText('Sign out of all devices?')).toBeTruthy();
    expect(logoutEverywhere).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));

    await waitFor(() => expect(logoutEverywhere).toHaveBeenCalledTimes(1));
  });

  it('signs nothing out when the confirmation is cancelled', async () => {
    render(<SignOutEverywhereSection impersonating={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Sign out of all devices?')).toBeNull());
    expect(logoutEverywhere).not.toHaveBeenCalled();
  });

  it('under an impersonation link, withholds the control and says why', () => {
    render(<SignOutEverywhereSection impersonating />);

    expect(screen.queryByRole('button', { name: /all devices/i })).toBeNull();
    expect(screen.getByText(/impersonation link/)).toBeTruthy();
    expect(screen.getByText(/Sign out ends only this browser/)).toBeTruthy();
  });

  it('shows why a sign-out of all devices did not happen', () => {
    authError = 'Network error. Please check your connection and try again';

    render(<SignOutEverywhereSection impersonating={false} />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Network error. Please check your connection and try again',
    );
  });
});
