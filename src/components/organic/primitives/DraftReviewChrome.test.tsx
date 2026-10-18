import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

describe('ReviewIdentityRow', () => {
  it('names the real account and the format and time, with only menu and close as controls', () => {
    render(
      <ReviewIdentityRow
        account={{ handle: '@vivo47.fit', avatarUrl: null }}
        platform="instagram"
        summary="Carousel · Tue Oct 13, 10:00 AM PDT"
        menu={<button type="button">Post actions</button>}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('heading').textContent).toContain('@vivo47.fit');
    expect(screen.getByText('Carousel · Tue Oct 13, 10:00 AM PDT')).toBeTruthy();
    expect(
      screen
        .getAllByRole('button')
        .map((button) => button.textContent || button.getAttribute('aria-label')),
    ).toEqual(['Post actions', 'Close preview']);
  });

  it('says so when no account resolves', () => {
    render(
      <ReviewIdentityRow
        account={{ handle: null, avatarUrl: null }}
        platform="tiktok"
        summary="Reel"
        menu={null}
      />,
    );
    expect(screen.getByRole('heading').textContent).toContain('No account connected');
  });
});
