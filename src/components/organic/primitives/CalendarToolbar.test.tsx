import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { CalendarToolbar as CalendarToolbarType } from './CalendarToolbar';

type CalendarToolbarProps = Parameters<typeof CalendarToolbarType>[0];

// Patch happy-dom window with missing globals that SelectorParser needs
Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

mock.module('@radix-ui/react-icons', () => ({
  CheckIcon: () => <span data-testid="check-icon" />,
  Cross2Icon: () => <span data-testid="cross-icon" />,
  ExclamationTriangleIcon: () => <span data-testid="warning-icon" />,
  LightningBoltIcon: () => <span data-testid="lightning-icon" />,
  PlusIcon: () => <span data-testid="plus-icon" />,
  RocketIcon: () => <span data-testid="rocket-icon" />,
  TrashIcon: () => <span data-testid="trash-icon" />,
}));

mock.module('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    'aria-label'?: string;
    'aria-pressed'?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  ),
}));

mock.module('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

mock.module('@/components/ui/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
  useToastContext: () => ({ show: mock() }),
}));

mock.module('@/components/ui/progress', () => ({
  Progress: ({ value }: { value?: number }) => <div data-testid="progress" data-value={value} />,
}));

mock.module('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuItem: ({
    children,
    onSelect,
    disabled,
    className,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

mock.module('./AddPostMenu', () => ({
  AddPostMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { CalendarToolbar } = await import('./CalendarToolbar');

function defaultProps(overrides?: Partial<CalendarToolbarProps>): CalendarToolbarProps {
  return {
    viewMode: 'week',
    onViewModeChange: mock(),
    dateRange: null,
    onDateRangeChange: mock(),
    selectedTrendCount: 2,
    maxTrendSelections: 5,
    seededDraftCount: 3,
    isGenerating: false,
    onOpenTrends: mock(),
    onCreatePost: mock(),
    onGenerate: mock(),
    onClear: mock(),
    draftsCount: 5,
    slotProgress: null,
    gridProgress: { percent: 0 },
    gridStatus: 'idle',
    gridError: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('CalendarToolbar', () => {
  it('renders view mode buttons for Week, Month, and List', () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />);

    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim());

    expect(labels).toContain('Week');
    expect(labels).toContain('Month');
    expect(labels).toContain('List');
  });

  it('sets aria-pressed on the active view mode button', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ viewMode: 'month' })} />);

    const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
    const weekButton = buttons.find((b) => b.textContent?.trim() === 'Week')!;
    const monthButton = buttons.find((b) => b.textContent?.trim() === 'Month')!;
    const listButton = buttons.find((b) => b.textContent?.trim() === 'List')!;

    expect(monthButton.getAttribute('aria-pressed')).toBe('true');
    expect(weekButton.getAttribute('aria-pressed')).toBe('false');
    expect(listButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onViewModeChange when a view mode button is clicked', () => {
    const onViewModeChange = mock();
    const { container } = render(<CalendarToolbar {...defaultProps({ onViewModeChange })} />);

    const buttons = Array.from(container.querySelectorAll('button[aria-pressed]'));
    const monthButton = buttons.find((b) => b.textContent?.trim() === 'Month')!;
    fireEvent.click(monthButton);

    expect(onViewModeChange).toHaveBeenCalledWith('month');
  });

  it('renders progress bar when slotProgress is provided', () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          slotProgress: { completed: 3, total: 10, failed: 0 },
          gridProgress: { percent: 30 },
        })}
      />,
    );

    expect(container.querySelector("[data-testid='progress']")).toBeTruthy();
    expect(container.textContent).toContain('3/10 completed');
  });

  it('renders status banner for gridStatus=complete', () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          gridStatus: 'complete',
          slotProgress: { completed: 7, total: 7, failed: 0 },
        })}
      />,
    );

    expect(container.textContent).toContain('All 7 posts generated');
  });

  it('renders status banner for gridStatus=error with retry text', () => {
    const onRetryGeneration = mock();
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          gridStatus: 'error',
          gridError: 'Network timeout',
          onRetryGeneration,
        })}
      />,
    );

    expect(container.textContent).toContain('Generation failed: Network timeout');
    expect(container.textContent).toContain('retry');
  });

  it('disables the generate button when seededDraftCount is 0', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ seededDraftCount: 0 })} />);

    const buttons = Array.from(container.querySelectorAll('button'));
    const generateButton = buttons.find((b) => b.textContent?.trim() === 'Generate');

    expect(generateButton).toBeTruthy();
    expect(generateButton!.disabled).toBe(true);
  });

  it('shows the timeframe selector only in list view', () => {
    const week = render(<CalendarToolbar {...defaultProps({ viewMode: 'week' })} />);
    expect(
      Array.from(week.container.querySelectorAll('button')).map((b) => b.textContent?.trim()),
    ).toContain('Planned');
    cleanup();

    const list = render(<CalendarToolbar {...defaultProps({ viewMode: 'list' })} />);
    const labels = Array.from(list.container.querySelectorAll('button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toContain('All');
    expect(labels).toContain('Week');
    expect(labels).toContain('Month');
    expect(labels).not.toContain('Planned');
  });

  it('emits a calendar-month range when the Month preset is clicked', () => {
    const onDateRangeChange = mock();
    const { container } = render(
      <CalendarToolbar {...defaultProps({ viewMode: 'list', onDateRangeChange })} />,
    );
    // "Month" appears twice (view switch + timeframe preset); the timeframe
    // preset is the later one in DOM order.
    const monthButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Month',
    );
    fireEvent.click(monthButtons[monthButtons.length - 1]);
    expect(onDateRangeChange).toHaveBeenCalledTimes(1);
    const range = onDateRangeChange.mock.calls[0][0] as { from: string; to: string };
    expect(range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(range.from <= range.to).toBe(true);
  });

  it('clears the timeframe when the All preset is clicked', () => {
    const onDateRangeChange = mock();
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          viewMode: 'list',
          dateRange: { from: '2026-06-01', to: '2026-06-30' },
          onDateRangeChange,
        })}
      />,
    );
    const allButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'All',
    );
    fireEvent.click(allButton!);
    expect(onDateRangeChange).toHaveBeenCalledWith(null);
  });

  it('explains why Generate is disabled when no placeholders exist', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ seededDraftCount: 0 })} />);
    expect(container.textContent).toContain('Add at least one placeholder to the calendar first.');
    expect(container.querySelector('[aria-describedby]')).toBeTruthy();
  });

  it('explains why Clear is disabled when there are no drafts', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ draftsCount: 0 })} />);
    expect(container.textContent).toContain('There are no drafts on the calendar to clear yet.');
  });

  it('explains that controls are paused while generation is running', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ isGenerating: true })} />);
    expect(container.textContent).toContain('Generation is already running.');
    expect(container.textContent).toContain('Adding placeholders is paused until it finishes.');
  });

  it('shows no disabled reason when Generate and Clear are actionable', () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />);
    expect(container.textContent).not.toContain('Add at least one placeholder');
    expect(container.textContent).not.toContain('no drafts on the calendar');
    expect(container.textContent).not.toContain('Generation is already running');
  });

  it('shows planning-mode guidance when the calendar is empty and idle', () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
          seededDraftCount: 0,
          draftsCount: 0,
          isGenerating: false,
        })}
      />,
    );
    expect(container.textContent).toContain('Planning mode');
    expect(container.textContent).toContain('no account needed');
    expect(container.textContent).toContain('Brand Book');
  });

  it('hides planning-mode guidance once drafts exist', () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />);
    expect(container.textContent).not.toContain('Planning mode');
  });

  it('creates a manual post (not an AI flow) from the New post action', () => {
    const onCreatePost = mock();
    const { container } = render(<CalendarToolbar {...defaultProps({ onCreatePost })} />);
    const newPost = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'New post',
    );
    expect(newPost).toBeTruthy();
    fireEvent.click(newPost!);
    expect(onCreatePost).toHaveBeenCalledWith({
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });
});
