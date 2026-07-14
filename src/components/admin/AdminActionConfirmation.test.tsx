import { afterEach, describe, expect, it, vi } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { AdminActionConfirmation } from './AdminActionConfirmation';

Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
});

describe('AdminActionConfirmation', () => {
  afterEach(cleanup);

  it('requires the exact target email for high-risk actions', () => {
    const confirm = vi.fn();
    render(
      <AdminActionConfirmation
        trigger={<Button>Make admin</Button>}
        title="Grant admin access?"
        description="This takes effect immediately."
        confirmLabel="Make admin"
        targetEmail="member@example.com"
        requireTypedEmail
        onConfirm={confirm}
      />,
    );

    fireEvent.click(screen.getByText('Make admin'));
    const finalAction = screen.getAllByText('Make admin').at(-1) as HTMLButtonElement;
    expect(finalAction.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type member@example.com to confirm'), {
      target: { value: 'member@example.com' },
    });
    expect(finalAction.disabled).toBe(false);
    fireEvent.click(finalAction);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('supports an explicit confirmation without typed input', () => {
    render(
      <AdminActionConfirmation
        trigger={<Button>Impersonate</Button>}
        title="Impersonate this user?"
        description="A sign-in link will be generated."
        confirmLabel="Generate link"
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Impersonate'));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect((screen.getByText('Generate link') as HTMLButtonElement).disabled).toBe(false);
  });
});
