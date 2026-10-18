import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type * as React from 'react';
import type { PublishAccount } from '@/lib/organic/publishTargets';
import { ReadinessLine, ReviewFooter, ReviewIdentityRow } from './DraftReviewChrome';

afterEach(cleanup);

describe('ReadinessLine', () => {
  it('says the post is ready when nothing blocks it', () => {
    render(<ReadinessLine items={[]} readyLabel="Ready to schedule" onFix={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Ready to schedule');
  });

  it('numbers each missing item and jumps to its fix', () => {
    const onFix = mock(() => {});
    render(
      <ReadinessLine
        items={[
          { key: 'caption', message: 'Add a caption', fix: 'caption' },
          { key: 'account', message: 'Connect an Instagram account', fix: 'account' },
        ]}
        readyLabel="Ready to schedule"
        onFix={onFix}
      />,
    );
    expect(screen.getByText('2 to fix')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '2. Connect an Instagram account' }));
    expect(onFix).toHaveBeenCalledWith('account');
  });

  it('announces the count, not every fix button, when the list changes', () => {
    render(
      <ReadinessLine
        items={[{ key: 'caption', message: 'Add a caption', fix: 'caption' }]}
        readyLabel="Ready to schedule"
        onFix={() => {}}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('1 to fix');
    expect(status.querySelector('button')).toBeNull();
  });

  it('keeps one live status from blocked to ready, so the change is announced', () => {
    const { rerender } = render(
      <ReadinessLine
        items={[{ key: 'caption', message: 'Add a caption', fix: 'caption' }]}
        readyLabel="Ready to schedule"
        onFix={() => {}}
      />,
    );
    const blocked = screen.getByRole('status');

    rerender(<ReadinessLine items={[]} readyLabel="Ready to schedule" onFix={() => {}} />);

    expect(screen.getByRole('status')).toBe(blocked);
    expect(blocked.textContent).toBe('Ready to schedule');
  });
});

describe('ReviewFooter', () => {
  const action = {
    label: 'Approve & schedule · Tue Oct 13, 10:00 AM PDT',
    busyLabel: 'Approving…',
    busy: false,
    disabledReason: null,
    onClick: () => {},
  };

  it('shows a disabled reason as visible text tied to the button', () => {
    render(
      <ReviewFooter
        primary={{ ...action, disabledReason: 'Add a caption first.' }}
        secondary={null}
      />,
    );
    const button = screen.getByRole('button', { name: /Approve & schedule/ });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // Focusable, so a keyboard user reaches the button and hears the reason.
    expect((button as HTMLButtonElement).disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('Add a caption first.');
  });

  it('a busy action is disabled, says so and does not fire twice', () => {
    const onClick = mock(() => {});
    render(<ReviewFooter primary={{ ...action, busy: true, onClick }} secondary={null} />);
    const button = screen.getByRole('button', { name: 'Approving…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the secondary action beside the primary', () => {
    const publish = mock(() => {});
    render(
      <ReviewFooter
        primary={action}
        secondary={{ ...action, label: 'Publish now', busyLabel: 'Publishing…', onClick: publish }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewFooter — note', () => {
  it('ties a disabled action to the readiness note under it', () => {
    render(
      <ReviewFooter
        primary={{
          label: 'Approve & schedule',
          busyLabel: 'Approving…',
          busy: false,
          disabledReason: 'Add a caption',
          onClick: () => {},
        }}
        secondary={null}
        note={
          <ReadinessLine
            items={[{ key: 'caption', message: 'Add a caption', fix: 'caption' }]}
            readyLabel="Ready to schedule"
            onFix={() => {}}
          />
        }
      />,
    );
    const button = screen.getByRole('button', { name: 'Approve & schedule' });
    const note = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toContain('1. Add a caption');
    // The note replaces the plain reason: the reason is not said twice.
    expect(document.querySelector('[data-footer-reason]')).toBeNull();
  });
});

const ACME_A: PublishAccount = {
  id: 'acct-a',
  platform: 'instagram',
  handle: 'acme_a',
  displayName: 'Acme A',
  avatarUrl: null,
  needsReauth: false,
  isDefault: true,
};
const ACME_B: PublishAccount = {
  ...ACME_A,
  id: 'acct-b',
  handle: 'acme_b',
  displayName: 'Acme B',
  isDefault: false,
};
const ACME_OLD: PublishAccount = {
  ...ACME_A,
  id: 'acct-old',
  handle: 'acme_old',
  displayName: 'Acme Old',
  needsReauth: true,
  isDefault: false,
};

// Base UI mounts a portalled positioner; the first render in a busy run can be slow.
const TIMEOUT_MS = 30_000;

function renderRow(overrides: Partial<React.ComponentProps<typeof ReviewIdentityRow>> = {}) {
  const onSelectAccount = mock((_id: string) => {});
  render(
    <ReviewIdentityRow
      platform="instagram"
      accounts={[ACME_A, ACME_B, ACME_OLD]}
      selectedAccountId="acct-b"
      onSelectAccount={onSelectAccount}
      summary="Carousel · Tue Oct 13, 10:00 AM PDT"
      menu={<button type="button">Post actions</button>}
      onClose={() => {}}
      {...overrides}
    />,
  );
  return { onSelectAccount };
}

function openPicker(name: string | RegExp = /^Instagram account:/) {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('radiogroup', { name: 'Instagram account' });
}

describe('ReviewIdentityRow', () => {
  it(
    "names the frame's stamped account from the candidates, never an id",
    () => {
      renderRow();
      const trigger = screen.getByRole('button', { name: 'Instagram account: @acme_b' });
      expect(trigger.getAttribute('data-account-id')).toBe('acct-b');
      expect(document.querySelector('[data-review-account]')?.textContent).toBe('@acme_b');
      expect(screen.getByText('Carousel · Tue Oct 13, 10:00 AM PDT')).toBeTruthy();
      expect(
        screen
          .getAllByRole('button')
          .map((button) => button.getAttribute('aria-label') ?? button.textContent),
      ).toEqual(['Instagram account: @acme_b', 'Post actions', 'Close preview']);
    },
    TIMEOUT_MS,
  );

  it(
    'asks for a choice when the stamp is not one of the candidates',
    () => {
      renderRow({ selectedAccountId: 'some-foreign-uuid' });
      expect(
        screen.getByRole('button', { name: 'Instagram account: Choose account' }),
      ).toBeTruthy();
      expect(document.querySelector('[data-review-account]')?.textContent).toBe('Choose account');
    },
    TIMEOUT_MS,
  );

  it(
    'says so, and links to Settings, when the platform has no account',
    () => {
      renderRow({ platform: 'tiktok', accounts: [], selectedAccountId: null });
      expect(screen.getByRole('heading').textContent).toContain('No account connected');
      expect(screen.queryByRole('button', { name: /^TikTok account:/ })).toBeNull();
      const connect = screen.getByRole('link', { name: 'Connect' });
      expect(connect.getAttribute('href')).toBe('/settings?section=integrations');
      expect(connect.getAttribute('target')).toBe('_blank');
    },
    TIMEOUT_MS,
  );

  it(
    'never reads "No account connected" while the accounts are still loading',
    () => {
      renderRow({
        platform: 'tiktok',
        accounts: [],
        selectedAccountId: 'acct-tt',
        accountsLoading: true,
      });
      expect(document.querySelector('[data-review-account]')?.textContent).toBe('Loading account…');
      expect(screen.queryByRole('link', { name: 'Connect' })).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    'shows the account without a picker when it cannot be changed',
    () => {
      renderRow({ onSelectAccount: undefined });
      expect(screen.queryByRole('button', { name: /^Instagram account:/ })).toBeNull();
      expect(document.querySelector('[data-review-account]')?.textContent).toBe('@acme_b');
    },
    TIMEOUT_MS,
  );

  it(
    'disables the picker with a visible reason',
    () => {
      renderRow({ pickerDisabledReason: 'Published posts keep their account' });
      const trigger = screen.getByRole('button', { name: 'Instagram account: @acme_b' });
      expect(
        trigger.hasAttribute('disabled') || trigger.getAttribute('aria-disabled') === 'true',
      ).toBe(true);
      expect(screen.getByText('Published posts keep their account')).toBeTruthy();
    },
    TIMEOUT_MS,
  );

  it(
    'lists the candidates as radios, the stamp checked, a reconnect-only one disabled',
    () => {
      renderRow();
      const group = openPicker();
      const radios = within(group).getAllByRole('radio');
      expect(radios).toEqual(
        ['@acme_a', '@acme_b', '@acme_old'].map((name) =>
          within(group).getByRole('radio', { name }),
        ),
      );
      expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
        'false',
        'true',
        'false',
      ]);
      expect(
        within(group).getByRole('radio', { name: '@acme_old' }).getAttribute('aria-disabled'),
      ).toBe('true');
      // The disabled radio says why; the link names the account it reconnects.
      const reauth = within(group).getByRole('radio', { name: '@acme_old' });
      const reason = document.getElementById(reauth.getAttribute('aria-describedby') ?? '');
      expect(reason?.textContent).toBe('Needs reconnecting before it can post');
      const reconnect = within(group).getByRole('link', { name: 'Reconnect @acme_old' });
      expect(reconnect.getAttribute('href')).toBe('/settings?section=integrations');
      expect(reconnect.getAttribute('target')).toBe('_blank');
    },
    TIMEOUT_MS,
  );

  it(
    'picks an account with one click',
    () => {
      const { onSelectAccount } = renderRow();
      const group = openPicker();
      const acmeA = within(group).getByRole('radio', { name: '@acme_a' });
      fireEvent.pointerDown(acmeA);
      fireEvent.click(acmeA);
      expect(onSelectAccount).toHaveBeenCalledTimes(1);
      expect(onSelectAccount).toHaveBeenCalledWith('acct-a');
    },
    TIMEOUT_MS,
  );

  it(
    'never picks an account that needs reconnecting',
    () => {
      const { onSelectAccount } = renderRow();
      const group = openPicker();
      const old = within(group).getByRole('radio', { name: '@acme_old' });
      fireEvent.pointerDown(old);
      fireEvent.click(old);
      expect(onSelectAccount).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  it(
    'Escape backs out: an arrowed-to account is never written',
    async () => {
      const { onSelectAccount } = renderRow({ selectedAccountId: 'acct-a' });
      let group = openPicker();
      fireEvent.keyDown(within(group).getByRole('radio', { name: '@acme_a' }), { key: 'Escape' });
      await act(async () => {});
      expect(onSelectAccount).not.toHaveBeenCalled();

      group = openPicker();
      const acmeA = within(group).getByRole('radio', { name: '@acme_a' });
      acmeA.focus();
      fireEvent.keyDown(acmeA, { key: 'ArrowDown' });
      await act(async () => {});
      fireEvent.keyDown(within(group).getByRole('radio', { name: '@acme_b' }), { key: 'Escape' });
      await act(async () => {});
      expect(onSelectAccount).not.toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  it(
    'moves with the arrow keys and writes once, on Enter',
    async () => {
      const { onSelectAccount } = renderRow({ selectedAccountId: 'acct-a' });
      const group = openPicker();
      const acmeA = within(group).getByRole('radio', { name: '@acme_a' });
      acmeA.focus();
      fireEvent.keyDown(acmeA, { key: 'ArrowDown' });
      // Base UI moves focus (and with it the selection) in a microtask.
      await act(async () => {});
      const acmeB = within(group).getByRole('radio', { name: '@acme_b' });
      expect(acmeB.getAttribute('aria-checked')).toBe('true');
      expect(onSelectAccount).not.toHaveBeenCalled();
      fireEvent.keyDown(acmeB, { key: 'Enter' });
      expect(onSelectAccount).toHaveBeenCalledTimes(1);
      expect(onSelectAccount).toHaveBeenCalledWith('acct-b');
    },
    TIMEOUT_MS,
  );
});
