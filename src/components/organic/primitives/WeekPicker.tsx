'use client';

import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import type { CalendarState } from '@/components/kibo-ui/calendar';
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarDatePicker,
  CalendarHeader,
  CalendarMonthPicker,
  CalendarProvider,
  CalendarYearPicker,
  useCalendarMonth,
  useCalendarYear,
} from '@/components/kibo-ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type WeekPickerProps = {
  value: Date;
  rangeLabel: string;
  onChange: (date: Date) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
};

export function WeekPicker({
  value,
  rangeLabel,
  onChange,
  onPreviousWeek,
  onNextWeek,
}: WeekPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [, setMonth] = useCalendarMonth();
  const [, setYear] = useCalendarYear();
  const currentYear = new Date().getFullYear();

  React.useEffect(() => {
    setMonth(value.getMonth() as CalendarState['month']);
    setYear(value.getFullYear());
  }, [setMonth, setYear, value]);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        className="border-slate-400/80 bg-white/90 text-slate-900 hover:bg-slate-100"
        onClick={onPreviousWeek}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className="gap-2 border-slate-400/80 bg-white/90 text-slate-900 hover:bg-slate-100"
            >
              <CalendarIcon className="h-4 w-4 text-slate-900" />
              <span className="text-sm font-semibold text-slate-900">{rangeLabel}</span>
            </Button>
          }
        />
        <PopoverContent className="w-[22rem] border-slate-400/80 bg-white p-2" align="end">
          <CalendarProvider
            className="overflow-hidden rounded-lg border border-slate-300/90 bg-white"
            startDay={1}
          >
            <CalendarDate>
              <CalendarDatePicker className="gap-1">
                <CalendarMonthPicker className="w-36 border-slate-400/80 bg-white text-xs text-slate-900" />
                <CalendarYearPicker
                  className="w-24 border-slate-400/80 bg-white text-xs text-slate-900"
                  start={currentYear - 2}
                  end={currentYear + 2}
                />
              </CalendarDatePicker>
              <CalendarDatePagination className="gap-1" />
            </CalendarDate>
            <CalendarHeader className="border-y border-slate-300/90 bg-slate-100/80" />
            <CalendarBody
              features={[]}
              onSelectDate={(date) => {
                onChange(date);
                setOpen(false);
              }}
              selectedDate={value}
            />
          </CalendarProvider>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon-sm"
        className="border-slate-400/80 bg-white/90 text-slate-900 hover:bg-slate-100"
        onClick={onNextWeek}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
