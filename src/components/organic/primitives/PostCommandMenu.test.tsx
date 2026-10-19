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
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

  const base = () => ({
    onEditCreativeDirection: mock(),
    onEditHashtags: mock(),
    onShowDetails: mock(),
    onDelete: mock(),
  });

  it('fires the editor-open callbacks', () => {
    const props = base();
    const onPlatformOptions = mock();
    render(<PostCommandMenu {...props} onPlatformOptions={onPlatformOptions} />);
    fireEvent.click(screen.getByText('Creative direction'));
    expect(props.onEditCreativeDirection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Hashtags'));
    expect(props.onEditHashtags).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Platform options'));
    expect(onPlatformOptions).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Details'));
    expect(props.onShowDetails).toHaveBeenCalledTimes(1);
  });

  it('fires delete', () => {
    const props = base();
    render(<PostCommandMenu {...props} />);
    fireEvent.click(screen.getByText('Delete draft'));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  // The footer owns Approve and Publish. A second copy in the menu is the duplication the
  // header redesign removed; this fails if either comes back.
  it('never offers Approve or Publish', () => {
    render(
      <PostCommandMenu
        {...base()}
        onOpenInStudio={{ label: 'Open in AI Studio', onSelect: mock() }}
        mediaAction={{ label: 'Generate media', onSelect: mock() }}
        onMoveBackToDraft={mock()}
      />,
    );
    expect(screen.queryByText(/approve/i)).toBeNull();
    expect(screen.queryByText(/publish/i)).toBeNull();
  });

  it('shows why a create action is unavailable, as text in the item', () => {
    const onSelect = mock();
    render(
      <PostCommandMenu
        {...base()}
        mediaAction={{
          label: 'Generate media',
          onSelect,
          disabledReason: 'Save the draft first.',
        }}
      />,
    );
    const item = screen.getByText('Generate media').closest('button') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain('Save the draft first.');
  });

  it('offers Move back to draft only when the parent passes it', () => {
    const { rerender } = render(<PostCommandMenu {...base()} />);
    expect(screen.queryByText('Move back to draft')).toBeNull();
    const onMoveBackToDraft = mock();
    rerender(<PostCommandMenu {...base()} onMoveBackToDraft={onMoveBackToDraft} />);
    fireEvent.click(screen.getByText('Move back to draft'));
    expect(onMoveBackToDraft).toHaveBeenCalledTimes(1);
  });

  // L-03: Duplicate existed on the calendar card but not here, so an editorial calendar's
  // most routine action was missing from the post's own command menu.
  it('duplicates onto the day chosen in the shared picker', () => {
    const onDuplicate = mock((_dayId: string) => undefined);
    render(
      <PostCommandMenu
        onEditCreativeDirection={mock()}
        onEditHashtags={mock()}
        onShowDetails={mock()}
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
        onShowDetails={mock()}
        onDelete={mock()}
      />,
    );
    expect(screen.queryByText('Duplicate…')).toBeNull();
  });
});
