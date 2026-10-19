import { beforeEach, describe, expect, it } from 'bun:test';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { useCalendarStore } from './store';

const createDraft = (id: string): OrganicCalendarDraft => ({
  id,
  title: 'Test Draft',
  summary: 'Test Summary',
  timeLabel: '9:00 AM',
  dateLabel: 'Mon, Jan 1',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Post',
  objective: 'Test',
  captionPreview: 'Test Caption',
  tags: [],
  mediaCount: 1,
});

describe('useCalendarStore', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      days: [
        { id: 'day-1', label: 'Monday', dateLabel: 'Jan 1', suggestedTimes: [], slots: [] },
        { id: 'day-2', label: 'Tuesday', dateLabel: 'Jan 2', suggestedTimes: [], slots: [] },
      ],
      gridStatus: 'idle',
      gridProgress: { percent: 0 },
      gridError: null,
      ghosts: {},
      selectedDraftId: null,
      selectedDraftIds: [],
      pendingServerDeletes: [],
    });
  });

  it('adds a draft to a specific day', () => {
    const draft = createDraft('d1');
    useCalendarStore.getState().addDraft('day-1', draft);

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(1);
    expect(state.days[0]?.slots[0]?.id).toBe('d1');
  });

  it('moves a draft from day to day', () => {
    const draft = createDraft('d1');
    useCalendarStore.getState().addDraft('day-1', draft);

    useCalendarStore.getState().moveDraft('d1', 'day-2');

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.days[1]?.slots).toHaveLength(1);
    expect(state.days[1]?.slots[0]?.id).toBe('d1');
  });

  it('deletes multiple drafts', () => {
    const d1 = createDraft('d1');
    const d2 = createDraft('d2');
    useCalendarStore.getState().addDraft('day-1', d1);
    useCalendarStore.getState().addDraft('day-2', d2);

    useCalendarStore.getState().bulkDeleteDrafts(['d1', 'd2']);

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.days[1]?.slots).toHaveLength(0);
  });

  it('queues backend ids for server deletion and clears them', () => {
    const d1: OrganicCalendarDraft = { ...createDraft('d1'), backendDraftId: 'srv-1' };
    const d2 = createDraft('d2'); // no backendDraftId — local only, nothing to delete server-side
    useCalendarStore.getState().addDraft('day-1', d1);
    useCalendarStore.getState().addDraft('day-2', d2);

    useCalendarStore.getState().bulkDeleteDrafts(['d1', 'd2']);

    expect(useCalendarStore.getState().pendingServerDeletes).toEqual(['srv-1']);

    useCalendarStore.getState().clearPendingServerDeletes(['srv-1']);
    expect(useCalendarStore.getState().pendingServerDeletes).toEqual([]);
  });

  it('queues every member row of a deleted group card, once each', () => {
    const card: OrganicCalendarDraft = {
      ...createDraft('d1'),
      backendDraftId: 'be-ig',
      groupMembers: [
        { backendDraftId: 'be-ig', platform: 'instagram', status: 'draft', accountId: null },
        { backendDraftId: 'be-tt', platform: 'tiktok', status: 'draft', accountId: null },
      ],
    };
    useCalendarStore.getState().addDraft('day-1', card);

    useCalendarStore.getState().bulkDeleteDrafts(['d1']);

    expect(useCalendarStore.getState().pendingServerDeletes).toEqual(['be-ig', 'be-tt']);
  });

  it('duplicates a group card as one new draft on its own platform, outside the group', () => {
    const card: OrganicCalendarDraft = {
      ...createDraft('d1'),
      platforms: ['instagram', 'tiktok'],
      groupId: 'group-1',
      groupMembers: [
        { backendDraftId: 'be-ig', platform: 'instagram', status: 'draft', accountId: null },
        { backendDraftId: 'be-tt', platform: 'tiktok', status: 'draft', accountId: null },
      ],
    };
    useCalendarStore.getState().addDraft('day-1', card);

    useCalendarStore.getState().duplicateDraft('d1');

    const copy = useCalendarStore.getState().days[0]?.slots.find((slot) => slot.id !== 'd1');
    expect(copy?.platforms).toEqual(['instagram']);
    expect(copy?.groupId).toBeUndefined();
    expect(copy?.groupMembers).toBeUndefined();
  });

  // A single-select click clears the multi-selection every time. Notifying with a fresh []
  // when nothing was selected re-rendered every planner cell that reads the set.
  describe('clearDraftSelection', () => {
    it('does not notify subscribers when the multi-selection is already empty', () => {
      const before = useCalendarStore.getState().selectedDraftIds;
      let notifications = 0;
      const unsubscribe = useCalendarStore.subscribe(() => {
        notifications += 1;
      });

      useCalendarStore.getState().clearDraftSelection();
      unsubscribe();

      expect(notifications).toBe(0);
      expect(useCalendarStore.getState().selectedDraftIds).toBe(before);
    });

    it('still clears a non-empty multi-selection', () => {
      useCalendarStore.getState().setSelectedDraftIds(['d1', 'd2']);

      useCalendarStore.getState().clearDraftSelection();

      expect(useCalendarStore.getState().selectedDraftIds).toEqual([]);
    });
  });

  it('supports complete_with_errors grid status', () => {
    useCalendarStore.getState().setGridStatus('complete_with_errors');
    expect(useCalendarStore.getState().gridStatus).toBe('complete_with_errors');
  });

  // "Clear view" is a lens, not a delete. It used to empty `days[].slots`, which read as
  // total loss of work — and reset the workflow rail and the planning banner with it.
  describe('clearView', () => {
    it('hides the view without touching the drafts', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().setGridStatus('complete');

      useCalendarStore.getState().clearView();

      const state = useCalendarStore.getState();
      expect(state.isViewCleared).toBe(true);
      expect(state.days[0]?.slots.map((slot) => slot.id)).toEqual(['d1']);
      expect(state.gridStatus).toBe('complete');
    });

    it('drops the selection, because a hidden draft cannot stay in the preview', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().beginEditingDraft('d1');
      useCalendarStore.getState().setSelectedDraftIds(['d1']);

      useCalendarStore.getState().clearView();

      const state = useCalendarStore.getState();
      expect(state.selectedDraftId).toBeNull();
      expect(state.editingDraftId).toBeNull();
      expect(state.selectedDraftIds).toEqual([]);
    });

    it('is undone by restoreView', () => {
      useCalendarStore.getState().clearView();
      useCalendarStore.getState().restoreView();

      expect(useCalendarStore.getState().isViewCleared).toBe(false);
    });

    it.each([
      ['setDays', () => useCalendarStore.getState().setDays([])],
      ['setDateRange', () => useCalendarStore.getState().setDateRange(null)],
      ['setViewMode', () => useCalendarStore.getState().setViewMode('list')],
      ['resetForBrandSwitch', () => useCalendarStore.getState().resetForBrandSwitch()],
    ])('is reset by %s', (_name, act) => {
      useCalendarStore.getState().clearView();

      act();

      expect(useCalendarStore.getState().isViewCleared).toBe(false);
    });

    // A grid the user hid must come back on reload; a hidden planner that survives a
    // refresh is indistinguishable from a planner that lost its posts.
    it('is absent from the persisted state', () => {
      useCalendarStore.getState().clearView();

      const partialize = useCalendarStore.persist.getOptions().partialize;
      if (!partialize) throw new Error('the calendar store lost its partialize');
      const persisted = partialize(useCalendarStore.getState()) as Record<string, unknown>;

      expect(Object.keys(persisted)).not.toContain('isViewCleared');
    });
  });

  it('strips backendDraftId when duplicating a draft', () => {
    const draft: OrganicCalendarDraft = {
      ...createDraft('d1'),
      backendDraftId: 'supabase-uuid-123',
    };
    useCalendarStore.getState().addDraft('day-1', draft);

    useCalendarStore.getState().duplicateDraft('d1');

    const state = useCalendarStore.getState();
    const slots = state.days[0]?.slots ?? [];
    const copy = slots.find((s) => s.id !== 'd1');
    expect(copy).toBeDefined();
    expect(copy?.backendDraftId).toBeUndefined();
  });

  // The month grid renders days that are not in the loaded set; a "+" on one of them
  // must still land a draft on THAT day rather than silently doing nothing.
  it('materializes a day that is not loaded when a draft is added to it', () => {
    useCalendarStore.getState().addDraft('2026-09-14', createDraft('d-month'));

    const state = useCalendarStore.getState();
    const created = state.days.find((day) => day.id === '2026-09-14');
    expect(created).toBeDefined();
    expect(created?.slots.map((slot) => slot.id)).toEqual(['d-month']);
    expect(state.days.find((day) => day.id === 'day-1')?.slots).toHaveLength(0);
  });

  // Memoised cells compare their day: an edit must not hand every cell a new one.
  describe('updateDraft', () => {
    it('rebuilds only the day that holds the draft', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-2', createDraft('d2'));
      const before = useCalendarStore.getState().days;

      useCalendarStore.getState().updateDraft('d1', (draft) => ({ ...draft, title: 'Edited' }));

      const after = useCalendarStore.getState().days;
      expect(after[0]?.slots[0]?.title).toBe('Edited');
      expect(after[0]).not.toBe(before[0]);
      expect(after[1]).toBe(before[1]);
      expect(after[1]?.slots[0]).toBe(before[1]?.slots[0]);
    });

    it("reaches a group member's own draft by its id, leaving the card's own fields alone", () => {
      const member = {
        ...createDraft('d1::tiktok'),
        platforms: ['tiktok' as const],
        backendDraftId: 'be-tt',
      };
      const card: OrganicCalendarDraft = {
        ...createDraft('d1'),
        backendDraftId: 'be-ig',
        platforms: ['instagram', 'tiktok'],
        groupMembers: [
          { backendDraftId: 'be-ig', platform: 'instagram', status: 'draft', accountId: null },
          {
            backendDraftId: 'be-tt',
            platform: 'tiktok',
            status: 'draft',
            accountId: null,
            draft: member,
          },
        ],
      };
      useCalendarStore.getState().addDraft('day-1', card);
      useCalendarStore.getState().addDraft('day-2', createDraft('d2'));
      const before = useCalendarStore.getState().days;

      useCalendarStore.getState().updateDraft('d1::tiktok', (draft) => ({
        ...draft,
        captionPreview: 'TikTok words',
        status: 'scheduled',
      }));

      const after = useCalendarStore.getState().days;
      const slot = after[0]?.slots[0];
      expect(slot?.captionPreview).toBe('Test Caption');
      expect(slot?.groupMembers?.[1]?.draft?.captionPreview).toBe('TikTok words');
      expect(slot?.groupMembers?.[1]?.status).toBe('scheduled');
      expect(slot?.groupMembers?.[0]).toBe(card.groupMembers?.[0]);
      expect(after[1]).toBe(before[1]);
    });

    it('leaves the state alone when no draft matches', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      const before = useCalendarStore.getState();

      useCalendarStore.getState().updateDraft('missing', (draft) => ({ ...draft, title: 'x' }));

      expect(useCalendarStore.getState()).toBe(before);
      expect(useCalendarStore.getState().days).toBe(before.days);
    });
  });

  // A refetch rebuilds every day from the server. What did not change must keep its object, or
  // each save echo re-renders the whole grid.
  describe('setDays', () => {
    const fromServer = (): OrganicCalendarDay[] =>
      structuredClone(useCalendarStore.getState().days);

    it('keeps the current days when the server sends the same set', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      const before = useCalendarStore.getState().days;

      useCalendarStore.getState().setDays(fromServer());

      expect(useCalendarStore.getState().days).toBe(before);
    });

    it('replaces only the changed draft and its day', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-1', createDraft('d2'));
      useCalendarStore.getState().addDraft('day-2', createDraft('d3'));
      const before = useCalendarStore.getState().days;
      const next = fromServer();
      const edited = next[0]?.slots[0];
      if (!edited) throw new Error('no d1');
      edited.captionPreview = 'Edited elsewhere';

      useCalendarStore.getState().setDays(next);

      const after = useCalendarStore.getState().days;
      expect(after[0]?.slots[0]?.captionPreview).toBe('Edited elsewhere');
      expect(after[0]).not.toBe(before[0]);
      expect(after[0]?.slots[1]).toBe(before[0]?.slots[1]);
      expect(after[1]).toBe(before[1]);
    });

    // A save moves the edited row in the server's order; its neighbours did not change.
    it('keeps unchanged drafts when the server returns a day in a new order', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-1', createDraft('d2'));
      const before = useCalendarStore.getState().days;
      const next = fromServer();
      const [first, second] = next[0]?.slots ?? [];
      if (!first || !second) throw new Error('no d1/d2');
      first.captionPreview = 'Saved';
      if (next[0]) next[0].slots = [second, first];

      useCalendarStore.getState().setDays(next);

      const slots = useCalendarStore.getState().days[0]?.slots ?? [];
      expect(slots.map((slot) => slot.id)).toEqual(['d2', 'd1']);
      expect(slots[0]).toBe(before[0]?.slots[1]);
      expect(slots[1]?.captionPreview).toBe('Saved');
    });

    it('takes a day the store did not hold as it comes', () => {
      const added = {
        id: 'day-3',
        label: 'Wed',
        dateLabel: 'Jan 3',
        suggestedTimes: [],
        slots: [],
      };

      useCalendarStore.getState().setDays([...fromServer(), added]);

      expect(useCalendarStore.getState().days.at(-1)).toBe(added);
    });
  });

  describe('bulkMoveDrafts', () => {
    it('moves all ids to a real target day', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-1', createDraft('d2'));

      useCalendarStore.getState().bulkMoveDrafts(['d1', 'd2'], 'day-2');

      const state = useCalendarStore.getState();
      expect(state.days.find((d) => d.id === 'day-1')?.slots).toHaveLength(0);
      expect(
        state.days
          .find((d) => d.id === 'day-2')
          ?.slots.map((s) => s.id)
          .sort(),
      ).toEqual(['d1', 'd2']);
    });

    // The vanish bug: bulkMoveDrafts to a day outside the loaded set silently dropped
    // the moved drafts. It must materialize the target day exactly like moveDraft.
    it('materializes a not-yet-loaded target day instead of dropping the drafts', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-2', createDraft('d2'));

      useCalendarStore.getState().bulkMoveDrafts(['d1', 'd2'], '2026-09-14');

      const state = useCalendarStore.getState();
      const target = state.days.find((d) => d.id === '2026-09-14');
      expect(target).toBeDefined();
      expect(target?.slots.map((s) => s.id).sort()).toEqual(['d1', 'd2']);
      expect(state.days.find((d) => d.id === 'day-1')?.slots).toHaveLength(0);
      expect(state.days.find((d) => d.id === 'day-2')?.slots).toHaveLength(0);
    });

    it('is a no-op when none of the ids are present', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));

      useCalendarStore.getState().bulkMoveDrafts(['absent-1', 'absent-2'], 'day-2');

      const state = useCalendarStore.getState();
      expect(state.days.find((d) => d.id === 'day-1')?.slots.map((s) => s.id)).toEqual(['d1']);
      expect(state.days.find((d) => d.id === 'day-2')?.slots).toHaveLength(0);
      expect(state.days.some((d) => d.id === 'absent-1')).toBe(false);
    });
  });

  describe('focusedDayId', () => {
    it('defaults to null and records the day the user clicked', () => {
      expect(useCalendarStore.getState().focusedDayId).toBeNull();

      useCalendarStore.getState().setFocusedDayId('2026-07-22');

      expect(useCalendarStore.getState().focusedDayId).toBe('2026-07-22');
    });

    it('clears on brand switch so a stale focus cannot misdirect the next create', () => {
      useCalendarStore.getState().setFocusedDayId('2026-07-22');

      useCalendarStore.getState().resetForBrandSwitch();

      expect(useCalendarStore.getState().focusedDayId).toBeNull();
    });
  });

  describe('editingDraftId', () => {
    beforeEach(() => {
      useCalendarStore.setState({ selectedDraftId: null, editingDraftId: null });
    });

    it('defaults to null — a planner opens read-only', () => {
      expect(useCalendarStore.getState().editingDraftId).toBeNull();
    });

    it('beginEditingDraft selects AND opens the draft for editing in one write', () => {
      useCalendarStore.getState().beginEditingDraft('d1');

      const state = useCalendarStore.getState();
      expect(state.selectedDraftId).toBe('d1');
      expect(state.editingDraftId).toBe('d1');
    });

    it('abandons the edit intent when the selection moves to another draft', () => {
      useCalendarStore.getState().beginEditingDraft('d1');

      useCalendarStore.getState().setSelectedDraftId('d2');

      expect(useCalendarStore.getState().editingDraftId).toBeNull();
    });

    it('keeps the edit intent when the same draft is re-selected', () => {
      useCalendarStore.getState().beginEditingDraft('d1');

      useCalendarStore.getState().setSelectedDraftId('d1');

      expect(useCalendarStore.getState().editingDraftId).toBe('d1');
    });

    it('clears when the draft being edited is deleted', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().beginEditingDraft('d1');

      useCalendarStore.getState().bulkDeleteDrafts(['d1']);

      expect(useCalendarStore.getState().editingDraftId).toBeNull();
    });

    it('survives the deletion of a DIFFERENT draft', () => {
      useCalendarStore.getState().addDraft('day-1', createDraft('d1'));
      useCalendarStore.getState().addDraft('day-1', createDraft('d2'));
      useCalendarStore.getState().beginEditingDraft('d1');

      useCalendarStore.getState().bulkDeleteDrafts(['d2']);

      expect(useCalendarStore.getState().editingDraftId).toBe('d1');
    });

    it('clears on clearView and on a brand switch', () => {
      useCalendarStore.getState().beginEditingDraft('d1');
      useCalendarStore.getState().clearView();
      expect(useCalendarStore.getState().editingDraftId).toBeNull();

      useCalendarStore.getState().beginEditingDraft('d1');
      useCalendarStore.getState().resetForBrandSwitch();
      expect(useCalendarStore.getState().editingDraftId).toBeNull();
    });

    // A restored edit intent would re-open the editor on a draft nobody asked to
    // edit, so it must never reach sessionStorage.
    it('is absent from the persisted state', () => {
      useCalendarStore.getState().beginEditingDraft('d1');

      const partialize = useCalendarStore.persist.getOptions().partialize;
      if (!partialize) throw new Error('the calendar store lost its partialize');
      const persisted = partialize(useCalendarStore.getState()) as Record<string, unknown>;

      expect(Object.keys(persisted)).not.toContain('editingDraftId');
      expect(Object.keys(persisted).sort()).toEqual([
        'backlogDrafts',
        'dateRange',
        'days',
        'persistedWeekStartId',
        'selectedTrendIds',
        'viewMode',
      ]);
    });
  });
});
