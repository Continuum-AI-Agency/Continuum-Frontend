import { describe, expect, it, mock } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarBody, CalendarProvider } from '@/components/kibo-ui/calendar';

import { WeekPicker } from './WeekPicker';

describe('WeekPicker', () => {
  it('triggers previous and next week handlers', () => {
    const onChange = mock();
    const onPreviousWeek = mock();
    const onNextWeek = mock();

    render(
      <WeekPicker
        value={new Date('2026-02-16T00:00:00.000Z')}
        rangeLabel="Feb 16 – Feb 22"
        onChange={onChange}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
      />,
    );

    fireEvent.click(screen.getByLabelText('Previous week'));
    fireEvent.click(screen.getByLabelText('Next week'));

    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });

  it('selects a day from the kibo calendar body', () => {
    const onSelectDate = mock();

    render(
      <CalendarProvider>
        <CalendarBody features={[]} onSelectDate={onSelectDate} />
      </CalendarProvider>,
    );

    const dayButton = document.querySelector("[data-slot='kibo-calendar-day']");
    if (!dayButton) {
      throw new Error('Expected calendar day button');
    }

    fireEvent.click(dayButton);
    expect(onSelectDate).toHaveBeenCalledTimes(1);
  });
});
