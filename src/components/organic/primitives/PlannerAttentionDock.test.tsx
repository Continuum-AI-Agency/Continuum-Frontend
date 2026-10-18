import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UNSCHEDULED_DAY_ID } from './calendar-utils';
import type { CreatePostOptions, PlannerPlatform } from './planner-platforms';
import { derivePlannerDock } from './plannerIntelligence';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const draggedIds: string[] = [];
let dragging = false;
mock.module('./useDraftDragHandle', () => ({
  useDraftDragHandle: (draftId: string) => {
    draggedIds.push(draftId);
    return {
      setNodeRef: () => undefined,
      listeners: {},
      attributes: {
        role: 'button',
        tabIndex: 0,
        'aria-roledescription': 'draggable',
        'data-drag-handle': draftId,
      },
      isDragging: dragging,
      style: {},
    };
  },
}));

afterAll(() => mock.restore());

const { PlannerAttentionDock } = await import('./PlannerAttentionDock');

function draft(id: string, overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id,
    title: `Title ${id}`,
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: '',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 1,
    mediaStage: 'realized',
    ...overrides,
  } as OrganicCalendarDraft;
}

const day = (id: string, slots: OrganicCalendarDraft[]): OrganicCalendarDay =>
  ({ id, slots }) as OrganicCalendarDay;

const platform = (key: PlannerPlatform['key'], label: string): PlannerPlatform => ({
  key,
  label,
  Icon: ({ className }) => <svg data-brand-icon={key} className={className} aria-hidden />,
  canCreate: true,
});
const PLATFORMS = [platform('instagram', 'Instagram'), platform('facebook', 'Facebook')];
// Wednesday; the lookahead starts on Monday Oct 12.
const TODAY = '2026-10-14';

function renderDock(days: OrganicCalendarDay[], { showAttention = true } = {}) {
  const onSelectDraft = mock((_id: string) => undefined);
  const onAddMedia = mock((_id: string) => undefined);
  const onCreatePost = mock((_options: CreatePostOptions) => undefined);
  render(
    <PlannerAttentionDock
      dock={derivePlannerDock({
        todayId: TODAY,
        attentionDays: days,
        allDays: days,
        postedContent: [],
        platforms: PLATFORMS,
      })}
      showAttention={showAttention}
      platforms={PLATFORMS}
      onSelectDraft={onSelectDraft}
      onAddMedia={onAddMedia}
      onCreatePost={onCreatePost}
    />,
  );
  const dock = screen.getByTestId('planner-attention-dock');
  return { onSelectDraft, onAddMedia, onCreatePost, dock };
}

const section = (dock: HTMLElement, name: string) =>
  dock.querySelector<HTMLElement>(`[data-dock-section="${name}"]`);

describe('PlannerAttentionDock — needs attention', () => {
  afterEach(() => {
    cleanup();
    draggedIds.length = 0;
    dragging = false;
  });

  const queue = [
    day('2026-10-14', [
      draft('approve'),
      draft('broken', { status: 'failed', platforms: ['facebook'] }),
      draft('text', { mediaStage: 'text_only' }),
    ]),
    day(UNSCHEDULED_DAY_ID, [draft('loose')]),
  ];

  // A folded dock hides its sections, so the landmark is the inner section, never the
  // outer size container.
  it('labels the section, not the outer box, with the groups’ own counts', () => {
    const { dock } = renderDock(queue);
    expect(dock.tagName).toBe('DIV');
    expect(dock.hasAttribute('data-dock-mode')).toBe(false);
    const region = screen.getByRole('region', {
      name: 'Needs attention · 1 failed · 1 needs media · 1 needs approval · 1 unscheduled',
    });
    expect(region).toBe(section(dock, 'attention') as HTMLElement);
  });

  it('lists the groups in working order, each row keyed by data-dock-draft-id', () => {
    const { dock } = renderDock(queue);
    const lists = Array.from(section(dock, 'attention')?.querySelectorAll('ul') ?? []).map(
      (list) => ({
        label: list.getAttribute('aria-label'),
        ids: Array.from(list.querySelectorAll('[data-dock-item]')).map((item) =>
          item.getAttribute('data-dock-draft-id'),
        ),
      }),
    );
    expect(lists).toEqual([
      { label: 'Failed', ids: ['broken'] },
      { label: 'Needs media', ids: ['text'] },
      { label: 'Needs approval', ids: ['approve'] },
      { label: 'Unscheduled', ids: ['loose'] },
    ]);
    // Focus return re-queries data-draft-id; the dock must never answer for the calendar chip.
    expect(dock.querySelector('[data-draft-id]')).toBeNull();
  });

  it('marks each row with its platform’s brand glyph and shows the full title', () => {
    const { dock } = renderDock(queue);
    const failed = dock.querySelector('[data-dock-draft-id="broken"]');
    expect(failed?.querySelector('[data-brand-icon="facebook"]')).not.toBeNull();
    expect(failed?.textContent).toContain('Facebook');
    expect(failed?.textContent).toContain('Wed 14 · 9:00 AM');
    expect(failed?.textContent).toContain('Title broken');
  });

  it('opens the preview for a row, which is the keyboard path to Approve & Schedule', () => {
    const { onSelectDraft } = renderDock(queue);
    fireEvent.click(screen.getByRole('button', { name: /Title approve/ }));
    expect(onSelectDraft).toHaveBeenCalledWith('approve');
  });

  it('offers Add media on a draft that needs it, and only there', () => {
    const { onAddMedia, onSelectDraft } = renderDock(queue);
    const buttons = screen.getAllByRole('button', { name: /^Add media/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onAddMedia).toHaveBeenCalledWith('text');
    expect(onSelectDraft).not.toHaveBeenCalled();
  });

  it('puts the drag handle on the undated row’s own button: one tab stop', () => {
    const { dock } = renderDock(queue);
    expect(draggedIds).toEqual(['loose']);
    const handle = dock.querySelector('[data-drag-handle]');
    expect(handle?.tagName).toBe('BUTTON');
    expect(handle?.getAttribute('role')).toBeNull();
    expect(handle?.getAttribute('tabindex')).toBeNull();
    expect(handle?.getAttribute('aria-roledescription')).toBe('draggable');
    expect(handle?.closest('[data-dock-item]')?.getAttribute('data-dock-draft-id')).toBe('loose');
    expect(handle?.textContent).toContain('No date');
    expect(handle?.hasAttribute('data-dragging')).toBe(false);
  });

  it('does not open the preview for the click that ends a drag, and says it is dragging', () => {
    dragging = true;
    const { onSelectDraft, dock } = renderDock(queue);
    const handle = dock.querySelector('[data-drag-handle]') as HTMLElement;
    expect(handle.hasAttribute('data-dragging')).toBe(true);
    fireEvent.click(handle);
    expect(onSelectDraft).not.toHaveBeenCalled();
  });
});

describe('PlannerAttentionDock — overdue', () => {
  afterEach(cleanup);

  it('leads with a past-dated draft that never went out, and opens its preview to re-date it', () => {
    const { dock, onSelectDraft } = renderDock([
      day('2026-10-13', [draft('late', { title: 'Missed launch' })]),
      day('2026-10-14', [draft('approve')]),
    ]);
    const lists = section(dock, 'attention')?.querySelectorAll('ul');
    expect(lists?.[0]?.getAttribute('aria-label')).toBe('Overdue');
    expect(lists?.[0]?.querySelector('[data-dock-draft-id]')?.getAttribute('data-dock-draft-id')).toBe(
      'late',
    );
    fireEvent.click(screen.getByRole('button', { name: /Missed launch/ }));
    expect(onSelectDraft).toHaveBeenCalledWith('late');
  });
});

describe('PlannerAttentionDock — lookahead', () => {
  afterEach(cleanup);

  const tiles = (dock: HTMLElement) =>
    Array.from(
      section(dock, 'lookahead')?.querySelectorAll<HTMLButtonElement>('button[data-dock-item]') ??
        [],
    );

  it('draws four Monday-first weeks of day tiles under a weekday header', () => {
    const { dock } = renderDock([day('2026-10-15', [draft('booked', { status: 'scheduled' })])]);
    expect(screen.getByRole('region', { name: 'Next 4 weeks · 25 open days' })).toBe(
      section(dock, 'lookahead') as HTMLElement,
    );
    const days = tiles(dock);
    expect(days).toHaveLength(28);
    expect(days[0]?.getAttribute('data-dock-day')).toBe('2026-10-12');
    expect(days.at(-1)?.getAttribute('data-dock-day')).toBe('2026-11-08');
    expect(section(dock, 'lookahead')?.textContent).toStartWith(
      'Next 4 weeks · 25 open daysMonTueWedThuFriSatSun',
    );
  });

  it('names each day, what is planned and which platforms are still open', () => {
    const { dock } = renderDock([day('2026-10-15', [draft('booked', { status: 'scheduled' })])]);
    const thursday = dock.querySelector('[data-dock-day="2026-10-15"]');
    expect(thursday?.getAttribute('aria-label')).toBe(
      'Plan a post for Thu, Oct 15 · 1 planned · open: Facebook',
    );
    expect(thursday?.textContent).toBe('151');
    // The glyphs are decoration; the label already names the open platforms.
    expect(thursday?.querySelector('[data-brand-icon="facebook"]')?.closest('[aria-hidden]')).not.toBeNull();
    expect(dock.querySelector('[data-dock-day="2026-10-16"]')?.getAttribute('aria-label')).toBe(
      'Plan a post for Fri, Oct 16 · 0 planned · open: Instagram, Facebook',
    );
  });

  it('marks today and disables the days already gone', () => {
    const { dock } = renderDock([]);
    const [monday, tuesday, wednesday] = tiles(dock);
    expect(monday?.disabled).toBe(true);
    expect(tuesday?.disabled).toBe(true);
    expect(wednesday?.disabled).toBe(false);
    expect(wednesday?.getAttribute('aria-current')).toBe('date');
    expect(dock.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('creates a post for that day on its first open platform', () => {
    const { onCreatePost } = renderDock([
      day('2026-10-15', [draft('booked', { status: 'scheduled' })]),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Plan a post for Thu, Oct 15/ }));
    expect(onCreatePost).toHaveBeenCalledWith({
      dayId: '2026-10-15',
      platformKey: 'facebook',
      status: 'draft',
      mode: 'manual',
      format: 'Post',
    });
  });

  // The list view already groups drafts by status, so the dock does not say it twice.
  it('shows only the lookahead in the list view', () => {
    const { dock } = renderDock([day('2026-10-14', [draft('broken', { status: 'failed' })])], {
      showAttention: false,
    });
    expect(section(dock, 'attention')).toBeNull();
    expect(section(dock, 'lookahead')).not.toBeNull();
  });

  it('sits beside the attention list from 48rem wide and stacks under it below', () => {
    const { dock } = renderDock([day('2026-10-14', [draft('broken', { status: 'failed' })])]);
    const sections = section(dock, 'attention')?.parentElement;
    expect(sections?.className).toContain('[@container(width>=48rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(Array.from(sections?.children ?? []).map((child) => child.getAttribute('data-dock-section'))).toEqual([
      'attention',
      'lookahead',
    ]);
  });
});
