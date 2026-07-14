import { expect, mock, setSystemTime, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolvePlannerInitialDates } from './planner-date-anchor';

let capturedClientProps: Record<string, unknown> | null = null;

mock.module('./OrganicCalendarWorkspaceClient', () => ({
  OrganicCalendarWorkspaceClient: (props: Record<string, unknown>) => {
    capturedClientProps = props;
    return null;
  },
}));

const { OrganicCalendarWorkspace } = await import('./OrganicCalendarWorkspace');

test('keeps the no-URL fallback scaffold separate from persisted planner dates', () => {
  const now = new Date(2026, 6, 1, 12);
  setSystemTime(now);
  try {
    renderToStaticMarkup(<OrganicCalendarWorkspace />);
  } finally {
    setSystemTime();
  }

  expect(capturedClientProps).not.toBeNull();
  const props = capturedClientProps as Record<string, unknown>;
  expect(props.initialWeekStart).toBeUndefined();
  expect((props.days as Array<{ id: string }>)[0]?.id).toBe('2026-06-29');

  const dates = resolvePlannerInitialDates({
    initialWeekStart: props.initialWeekStart as string | null | undefined,
    persistedWeekStartId: '2026-06-15',
    now,
  });
  expect(dates.weekStart.getDate()).toBe(15);
  expect(dates.monthAnchorDate.getMonth()).toBe(6);
});
