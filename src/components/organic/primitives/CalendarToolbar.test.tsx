import { afterEach, describe, expect, it, mock } from 'bun:test';
import * as radixIcons from '@radix-ui/react-icons';
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

// mock.module is process-wide in bun, so replacing this module outright starves every
// OTHER spec in the run of the icons it imports (PlayIcon, etc.). Spread the real module
// and override only the icons this file asserts on. A sync factory over a static import
// is required: an async importActual factory deadlocks bun's module registry.
mock.module('@radix-ui/react-icons', () => ({
  ...radixIcons,
  CheckIcon: () => <span data-testid="check-icon" />,
  Cross2Icon: () => <span data-testid="cross-icon" />,
  ExclamationTriangleIcon: () => <span data-testid="warning-icon" />,
  LightningBoltIcon: () => <span data-testid="lightning-icon" />,
  PlusIcon: () => <span data-testid="plus-icon" />,
  TrashIcon: () => <span data-testid="trash-icon" />,
}));

mock.module('@/components/ui/button', () => ({
  buttonVariants: () => '',
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

// PopoverAnchor is unused here but IS used by specs that share this process (mock.module
// is process-wide). Omitting it would make their imports fail to resolve.
mock.module('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock() }),
  useToastContext: () => ({ show: mock() }),
  // Same reason: sibling specs wrap their tree in the real provider.
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module('@/components/ui/progress', () => ({
  Progress: ({ value }: { value?: number }) => <div data-testid="progress" data-value={value} />,
}));

mock.module('@/components/ui/separator', () => ({
  Separator: () => <span aria-hidden="true" />,
}));

mock.module('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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
    isGenerating: false,
    onOpenTrends: mock(),
    onCreatePost: mock(),
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

  // Generation is a per-draft action now (the enrichment ladder), not a whole-week
  // toolbar button that only ever acted on trend-seeded placeholders.
  it('has no whole-week Generate button', () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />);

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.find((b) => b.textContent?.trim() === 'Generate')).toBeUndefined();
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

  it('explains why Clear is disabled when there are no drafts', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ draftsCount: 0 })} />);
    expect(container.textContent).toContain('There are no drafts on the calendar to clear yet.');
  });

  it('explains that controls are paused while generation is running', () => {
    const { container } = render(<CalendarToolbar {...defaultProps({ isGenerating: true })} />);
    expect(container.textContent).toContain('Adding placeholders is paused until it finishes.');
  });

  it('shows no disabled reason when Clear is actionable', () => {
    const { container } = render(<CalendarToolbar {...defaultProps()} />);
    expect(container.textContent).not.toContain('no drafts on the calendar');
    expect(container.textContent).not.toContain('paused until it finishes');
  });

  it('shows planning-mode guidance when the calendar is empty and idle', () => {
    const { container } = render(
      <CalendarToolbar
        {...defaultProps({
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

  it('offers one clearly named content creation action', () => {
    const onCreatePost = mock();
    const { container } = render(<CalendarToolbar {...defaultProps({ onCreatePost })} />);
    const createActions = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Create content',
    );
    expect(createActions.length).toBeGreaterThan(0);
    fireEvent.click(createActions.at(-1)!);
    expect(onCreatePost).toHaveBeenCalledWith({
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });
});
