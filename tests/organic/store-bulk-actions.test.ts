import { beforeEach, expect, test } from 'bun:test';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { UNSCHEDULED_DAY_ID } from '@/components/organic/primitives/calendar-utils';
import { useCalendarStore } from '@/lib/organic/store';

const mockDrafts: OrganicCalendarDraft[] = [
  {
    id: 'draft-1',
    title: 'Draft 1',
    summary: 'Summary 1',
    timeLabel: '9:00 AM',
    dateLabel: 'Monday',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Retention',
    captionPreview: 'Caption 1',
    tags: [],
    mediaCount: 1,
  },
  {
    id: 'draft-2',
    title: 'Draft 2',
    summary: 'Summary 2',
    timeLabel: '10:00 AM',
    dateLabel: 'Monday',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'Retention',
    captionPreview: 'Caption 2',
    tags: [],
    mediaCount: 1,
  },
];

const mockDays: OrganicCalendarDay[] = [
  {
    id: 'day-1',
    label: 'Monday',
    dateLabel: 'Jan 1',
    suggestedTimes: ['9:00 AM'],
    slots: [mockDrafts[0]],
  },
  {
    id: 'day-2',
    label: 'Tuesday',
    dateLabel: 'Jan 2',
    suggestedTimes: ['9:00 AM'],
    slots: [mockDrafts[1]],
  },
];

// The store used to keep a separate `unscheduledDrafts` array with its own
// `setUnscheduledDrafts` setter. `feat(organic): support slot-level generation failures
// and retry flows` (e5b5d212) folded it into `days` as the `UNSCHEDULED_DAY_ID` sentinel
// day, so an undated draft is an ordinary slot on one more day and every mover, deleter
// and updater works on it without a second code path.
beforeEach(() => {
  useCalendarStore.getState().setDays(mockDays);
});

test('bulkMoveDrafts moves multiple drafts to a target day', () => {
  const store = useCalendarStore.getState();

  store.bulkMoveDrafts(['draft-1', 'draft-2'], 'day-2');

  const updatedDays = useCalendarStore.getState().days;
  const day1 = updatedDays.find((d) => d.id === 'day-1')!;
  const day2 = updatedDays.find((d) => d.id === 'day-2')!;

  expect(day1.slots.length).toBe(0);
  expect(day2.slots.length).toBe(2);
  expect(day2.slots.map((s) => s.id)).toContain('draft-1');
  expect(day2.slots.map((s) => s.id)).toContain('draft-2');
});

test('bulkDeleteDrafts removes multiple drafts', () => {
  const store = useCalendarStore.getState();

  store.bulkDeleteDrafts(['draft-1', 'draft-2']);

  const updatedDays = useCalendarStore.getState().days;
  expect(updatedDays.every((d) => d.slots.length === 0)).toBe(true);
});

test('bulkMoveDrafts to unscheduled', () => {
  const store = useCalendarStore.getState();

  store.bulkMoveDrafts(['draft-1'], UNSCHEDULED_DAY_ID);

  const state = useCalendarStore.getState();
  expect(state.days.find((d) => d.id === 'day-1')!.slots.length).toBe(0);
  const unscheduled = state.days.find((d) => d.id === UNSCHEDULED_DAY_ID);
  expect(unscheduled?.slots.length).toBe(1);
  expect(unscheduled?.slots[0]?.id).toBe('draft-1');
});
