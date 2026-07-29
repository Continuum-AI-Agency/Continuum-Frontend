'use client';

// A date-range picker over PLAIN ISO dates (YYYY-MM-DD), not Date objects.
//
// The repo had this pattern inlined in PaidMediaDashboard and again in TimelineContainer,
// both times as a raw Popover + <Calendar mode="range"> with their own Date<->string
// plumbing. This is that pattern extracted once. It speaks ISO date strings on purpose: the
// values it edits are calendar dates that get stored in `date` columns and compared as
// strings, and round-tripping them through a local-timezone Date is exactly how a flight
// that starts on the 21st gets saved as the 20th.

import { CalendarIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type DateRangeValue = { from: string | null; to: string | null };

type DateRangeFieldProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Show a clear affordance once a range is set. */
  clearable?: boolean;
  className?: string;
  id?: string;
};

const LABEL_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** ISO date -> a Date pinned to UTC noon, so no local offset can shift the calendar day. */
function toDate(iso: string | null): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  return new Date(`${iso}T12:00:00Z`);
}

/** A calendar day back to an ISO date, read in the same UTC frame it was written. */
function toIso(date: Date | undefined): string | null {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateRange(value: DateRangeValue, placeholder = 'Not set'): string {
  const from = toDate(value.from);
  const to = toDate(value.to);
  if (!from && !to) return placeholder;
  if (from && !to) return `${LABEL_FMT.format(from)} → …`;
  if (!from && to) return `… → ${LABEL_FMT.format(to)}`;
  return `${LABEL_FMT.format(from as Date)} → ${LABEL_FMT.format(to as Date)}`;
}

export function DateRangeField({
  value,
  onChange,
  placeholder = 'Not set',
  disabled,
  clearable = true,
  className,
  id,
}: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo<DateRange | undefined>(() => {
    const from = toDate(value.from);
    const to = toDate(value.to);
    return from || to ? { from, to } : undefined;
  }, [value.from, value.to]);

  const hasValue = Boolean(value.from || value.to);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              'h-9 min-w-[220px] justify-start gap-1.5 text-left font-normal text-xs',
              open && 'border-primary/60 bg-primary/5 text-primary ring-1 ring-primary/20',
              !hasValue && 'text-muted-foreground',
            )}
            disabled={disabled}
            id={id}
            size="sm"
            variant="outline"
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatDateRange(value, placeholder)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            defaultMonth={toDate(value.from)}
            initialFocus
            mode="range"
            numberOfMonths={2}
            onSelect={(range) => onChange({ from: toIso(range?.from), to: toIso(range?.to) })}
            selected={selected}
          />
        </PopoverContent>
      </Popover>
      {clearable && hasValue ? (
        <Button
          aria-label="Clear date range"
          className="size-8 shrink-0 text-muted-foreground"
          disabled={disabled}
          onClick={() => onChange({ from: null, to: null })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
