'use client';

// One calendar primitive for the whole product, styled for react-day-picker v9.
//
// v9 renamed nearly every class slot (head_row → weekdays, head_cell → weekday,
// row → week, cell → day, day → day_button, nav_button_* → button_*, day_selected →
// selected …). The previous version of this file still passed the v8 names, which v9
// silently ignores — so the weekday header rendered as an unstyled table row while the
// day grid was flex, and "Su MoTuWeThFrSa" ran together in every date picker. The header
// and the week rows now share one layout (flex, 2rem cells), so they cannot drift again.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex flex-col gap-4',
        month_caption: 'relative flex h-7 items-center justify-center pt-1',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous: cn(
          buttonVariants({ variant: 'outline', size: 'icon-sm' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline', size: 'icon-sm' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 rounded-md text-center font-normal text-[0.75rem] text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: cn(
          'relative h-8 w-8 p-0 text-center text-sm focus-within:relative focus-within:z-20',
          '[&:has([aria-selected])]:bg-primary/10',
          '[&:has([aria-selected].day-outside)]:bg-primary/5',
          props.mode === 'range'
            ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
            : '[&:has([aria-selected])]:rounded-md',
        ),
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'h-8 w-8 p-0 font-normal aria-selected:opacity-100',
        ),
        range_start: 'day-range-start rounded-l-md',
        range_end: 'day-range-end rounded-r-md',
        selected:
          'rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-accent font-semibold text-accent-foreground',
        outside:
          'day-outside text-muted-foreground opacity-40 aria-selected:bg-primary/5 aria-selected:text-muted-foreground aria-selected:opacity-30',
        disabled: 'text-muted-foreground opacity-30',
        range_middle: 'rounded-none aria-selected:bg-primary/10 aria-selected:text-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ className, ...props }) => {
          if (props.orientation === 'left') {
            return <ChevronLeft className={cn('h-4 w-4', className)} {...props} />;
          }
          return <ChevronRight className={cn('h-4 w-4', className)} {...props} />;
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
