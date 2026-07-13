import { beforeEach, describe, expect, it } from 'bun:test';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
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

  it('supports complete_with_errors grid status', () => {
    useCalendarStore.getState().setGridStatus('complete_with_errors');
    expect(useCalendarStore.getState().gridStatus).toBe('complete_with_errors');
  });

  it('clears the entire calendar', () => {
    const d1 = createDraft('d1');
    useCalendarStore.getState().addDraft('day-1', d1);
    useCalendarStore.getState().setGridStatus('complete');

    useCalendarStore.getState().clearCalendar();

    const state = useCalendarStore.getState();
    expect(state.days[0]?.slots).toHaveLength(0);
    expect(state.gridStatus).toBe('idle');
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
});
