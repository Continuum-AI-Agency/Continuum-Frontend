import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { PlannerPlatform } from './planner-platforms';
import type { OrganicCalendarDraft, OrganicCalendarPostedContent } from './types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
}));

mock.module('@/lib/organic/store', () => createCalendarStoreStub({}));

// Both create surfaces are pass-through wrappers here: the claim is about which
// affordance the cell RENDERS, not about the menu it opens.
mock.module('./AddPostMenu', () => ({
  AddPostMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./AddPostContextMenu', () => ({
  AddPostContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module('./DraggableDraftCard', () => ({
  DraggableDraftCard: ({ draft }: { draft: OrganicCalendarDraft }) => (
    <div data-testid="draft-card">{draft.title}</div>
  ),
}));

afterAll(() => mock.restore());

const { PlannerCell, metricsPostHref } = await import('./PlannerCell');

const instagram: PlannerPlatform = {
  key: 'instagram',
  label: 'Instagram',
  shortLabel: 'IG',
  Icon: () => <svg aria-hidden />,
  canCreate: true,
};

const facebook: PlannerPlatform = {
  key: 'facebook',
  label: 'Facebook',
  shortLabel: 'FB',
  Icon: () => <svg aria-hidden />,
  canCreate: false,
};

function draft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'A post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Aug 3',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Engagement',
    captionPreview: '',
    tags: [],
    mediaCount: 0,
    ...overrides,
  } as OrganicCalendarDraft;
}

const NOOP = () => undefined;

function renderCell(options: {
  platform?: PlannerPlatform;
  drafts?: OrganicCalendarDraft[];
  postedContent?: OrganicCalendarPostedContent[];
  readOnlyNotice?: string;
  selectedPostId?: string | null;
  onSelectPost?: (post: OrganicCalendarPostedContent, metricsHref: string | null) => void;
}) {
  return render(
    <PlannerCell
      dayId="2026-08-03"
      platform={options.platform ?? instagram}
      drafts={options.drafts ?? []}
      postedContent={options.postedContent ?? []}
      selectedDraftId={null}
      selectedDraftIdSet={new Set()}
      selectedPostId={options.selectedPostId}
      showGhosts={false}
      isLastColumn={false}
      isLastRow={false}
      readOnlyNotice={options.readOnlyNotice}
      onSelectDraft={NOOP}
      onToggleSelection={NOOP}
      onRegenerate={NOOP}
      onCreatePost={NOOP}
      onSelectPost={options.onSelectPost ?? NOOP}
    />,
  );
}

describe('PlannerCell create affordance', () => {
  afterEach(cleanup);

  const createButton = () => screen.getByRole('button', { name: /Add post for/ });

  // L-02: the labelled "+ Create" rendered only for EMPTY cells, and an occupied cell got
  // an icon-only button at `opacity-0`. In a week where only the weekend was empty that
  // read as day-of-week conditional.
  it('offers the labelled Create on an empty cell', () => {
    renderCell({});
    expect(createButton().textContent).toContain('Create');
  });

  // A filled cell keeps the SAME named affordance, as a corner "+": the full-width row under
  // the cards cost every filled week row its height, and five platforms no longer fit 900px.
  it('offers the same named create action on a cell that already holds a post, in its corner', () => {
    renderCell({ drafts: [draft()] });

    expect(screen.getByTestId('draft-card')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Add post for/ })).toHaveLength(1);
    expect(createButton().getAttribute('aria-label')).toBe('Add post for 2026-08-03 Instagram');
    expect(createButton().textContent).not.toContain('Create');
    expect(createButton().className).toContain('absolute');
  });

  it('never hides the affordance outright — an occupied cell dims it, it does not vanish', () => {
    renderCell({ drafts: [draft()] });

    const className = createButton().className;
    expect(className).not.toContain('opacity-0');
    expect(className).toContain('opacity-80');
    expect(className).toContain('group-hover:opacity-100');
  });

  it('sizes a filled cell to its cards, with no viewport-height floor', () => {
    const { container } = renderCell({ drafts: [draft()] });
    const cell = container.querySelector('[data-planner-cell]');
    expect(cell?.className).not.toContain('dvh');
  });

  it('offers no create affordance on a read-only channel', () => {
    renderCell({ platform: facebook });
    expect(screen.queryByRole('button', { name: /Add post for/ })).toBeNull();
  });

  // L-01: the read-only row's only content was the word "view" in the rail, so an empty
  // Facebook row looked like a rendering bug.
  it('explains itself when a read-only row is empty', () => {
    renderCell({
      platform: facebook,
      readOnlyNotice: 'Facebook is not connected for publishing.',
    });

    expect(screen.getByText('Facebook is not connected for publishing.')).toBeTruthy();
  });

  it('drops the notice once the read-only row has content to show', () => {
    renderCell({
      platform: facebook,
      drafts: [draft({ platforms: ['facebook'] })],
      readOnlyNotice: 'Facebook is not connected for publishing.',
    });

    expect(screen.queryByText('Facebook is not connected for publishing.')).toBeNull();
  });
});

describe('PlannerCell published posts', () => {
  afterEach(cleanup);

  const post = (overrides: Partial<OrganicCalendarPostedContent> = {}) =>
    ({
      id: 'post-1',
      source: 'instagram',
      platform: 'instagram',
      timestamp: '2026-08-03T14:00:00.000Z',
      dayId: '2026-08-03',
      timeLabel: '2:00 PM',
      title: 'Launch recap',
      integrationAccountId: 'acct-1',
      externalPostId: 'ext-9',
      ...overrides,
    }) as OrganicCalendarPostedContent;

  it('names the chip by its visible time and "Posted", platform and title, keyed for focus return', () => {
    renderCell({ postedContent: [post()] });
    const chip = screen.getByRole('button', {
      name: '2:00 PM Posted on Instagram: Launch recap',
    });
    expect(chip.getAttribute('data-post-id')).toBe('post-1');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.textContent).toContain('2:00 PM');
    expect(chip.textContent).toContain('Launch recap');
  });

  it('opens the post in the preview with its metrics link, not a popover', () => {
    const onSelectPost = mock(
      (_post: OrganicCalendarPostedContent, _metricsHref: string | null) => undefined,
    );
    const published = post();
    renderCell({ postedContent: [published], onSelectPost });

    fireEvent.click(screen.getByRole('button', { name: /Launch recap/ }));

    expect(onSelectPost).toHaveBeenCalledWith(
      published,
      '?tab=metrics&platform=instagram&accountId=acct-1&postId=ext-9',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks the open post pressed', () => {
    renderCell({ postedContent: [post(), post({ id: 'post-2' })], selectedPostId: 'post-1' });
    const [open, other] = screen.getAllByRole('button', { name: /Posted on Instagram/ });

    expect(open?.getAttribute('aria-pressed')).toBe('true');
    expect(open?.className).toContain('outline-primary!');
    expect(other?.getAttribute('aria-pressed')).toBe('false');
  });

  it('has no metrics link for a post without its account and external ids', () => {
    expect(metricsPostHref(post({ externalPostId: undefined }))).toBeNull();
  });
});
