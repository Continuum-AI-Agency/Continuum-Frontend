import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { PlannerPlatform } from './planner-platforms';
import type { OrganicCalendarDraft } from './types';

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

const { PlannerCell } = await import('./PlannerCell');

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
  readOnlyNotice?: string;
}) {
  return render(
    <PlannerCell
      dayId="2026-08-03"
      platform={options.platform ?? instagram}
      drafts={options.drafts ?? []}
      postedContent={[]}
      selectedDraftId={null}
      selectedDraftIdSet={new Set()}
      showGhosts={false}
      isLastColumn={false}
      isLastRow={false}
      readOnlyNotice={options.readOnlyNotice}
      onSelectDraft={NOOP}
      onToggleSelection={NOOP}
      onRegenerate={NOOP}
      onCreatePost={NOOP}
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

  it('offers the SAME labelled Create on a cell that already holds a post', () => {
    renderCell({ drafts: [draft()] });

    expect(screen.getByTestId('draft-card')).toBeTruthy();
    expect(createButton().textContent).toContain('Create');
  });

  it('never hides the affordance outright — an occupied cell dims it, it does not vanish', () => {
    renderCell({ drafts: [draft()] });

    const className = createButton().className;
    expect(className).not.toContain('opacity-0');
    expect(className).toContain('opacity-60');
    expect(className).toContain('group-hover:opacity-100');
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
