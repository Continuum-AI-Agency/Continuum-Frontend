import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the dropdown menu so items become plain clickable buttons (portals/
// animation don't run; onSelect is reachable by visible text).
mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    title,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <button type="button" disabled={disabled} title={title} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <button type="button">{render ?? children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterAll(() => mock.restore());

import { PostCommandMenu } from './PostCommandMenu';

describe('PostCommandMenu', () => {
  beforeEach(() => cleanup());

  it('fires the editor-open callbacks', () => {
    const onEditCreativeDirection = mock();
    const onEditHashtags = mock();
    render(
      <PostCommandMenu
        onEditCreativeDirection={onEditCreativeDirection}
        onEditHashtags={onEditHashtags}
        onDelete={mock()}
      />,
    );
    fireEvent.click(screen.getByText('Creative direction'));
    expect(onEditCreativeDirection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Hashtags'));
    expect(onEditHashtags).toHaveBeenCalledTimes(1);
  });

  it('fires delete', () => {
    const onDelete = mock();
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByText('Delete draft'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables Approve & schedule when not schedulable', () => {
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onApproveSchedule={mock()}
        canSchedule={false}
        onDelete={mock()}
      />,
    );
    const approve = screen.getByText('Approve & schedule').closest('button') as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
  });

  it('hides Publish unless canPublish', () => {
    const { rerender } = render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
      />,
    );
    expect(screen.queryByText('Publish to Instagram')).toBeNull();

    const onPublish = mock();
    rerender(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
        canPublish
        onPublish={onPublish}
      />,
    );
    fireEvent.click(screen.getByText('Publish to Instagram'));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  // M-16: only the preview footer checked readiness, so this menu offered a publish that
  // usePublishDraft now refuses. The refusal has to be visible before the click.
  it('disables Publish with the reason when the draft is not ready', () => {
    const onPublish = mock();
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
        canPublish
        onPublish={onPublish}
        publishBlockedReason="Add a caption and at least one image or video to schedule this post."
      />,
    );

    const item = screen.getByText(/Publish to Instagram/).closest('button') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toContain('Add a caption');

    fireEvent.click(item);
    expect(onPublish).not.toHaveBeenCalled();
  });

  // L-03: Duplicate existed on the calendar card but not here, so an editorial calendar's
  // most routine action was missing from the post's own command menu.
  it('duplicates onto the day chosen in the shared picker', () => {
    const onDuplicate = mock((_dayId: string) => undefined);
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
        onDuplicate={onDuplicate}
      />,
    );

    expect(screen.getByText('Duplicate…')).toBeTruthy();

    // The picker is the calendar card's DuplicateDayPicker: pick a day, then Clone.
    const clone = screen.getByText('Clone').closest('button') as HTMLButtonElement;
    expect(clone.disabled).toBe(true);

    const futureDay = screen
      .getAllByRole('button')
      .find(
        (element) =>
          /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d+$/.test(element.textContent ?? '') &&
          !(element as HTMLButtonElement).disabled,
      );
    if (!futureDay) throw new Error('the duplicate picker rendered no day buttons');
    fireEvent.click(futureDay);
    fireEvent.click(screen.getByText('Clone'));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicate.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('omits Duplicate when the caller cannot duplicate', () => {
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onDelete={mock()}
      />,
    );
    expect(screen.queryByText('Duplicate…')).toBeNull();
  });
});
