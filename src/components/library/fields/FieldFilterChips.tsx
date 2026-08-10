'use client';

// One chip per custom field, sitting in the same row as the source/kind/tag
// chips and composing with them (they AND together server-side). A chip reads
// like the tag chips do: inert until it holds a filter, then it names what it is
// filtering to.
//
// The operators a chip can express are the three the contract defines, and they
// are mutually exclusive per field: pick options ("any of"), match a literal
// ("is"), or find the assets nobody has filled in ("is empty"). The mutation
// helpers in customFieldFilters own that rule; this component only renders it.

import type { CustomField, CustomFieldFilter } from '@continuum/contracts';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  activeFilterFor,
  clearFieldFilter,
  fieldFilterSummary,
  setLiteralFilter,
  toggleEmptyFilter,
  toggleSelectFilterValue,
} from '@/lib/library/customFieldFilters';
import { cn } from '@/lib/utils';

export type FieldFilterChipsProps = {
  fields: readonly CustomField[];
  filters: readonly CustomFieldFilter[];
  onChange: (filters: CustomFieldFilter[]) => void;
  variant?: 'page' | 'compact';
};

function chipClass(active: boolean, compact: boolean): string {
  return cn(
    'flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-medium',
    'transition-colors active:scale-[0.96]',
    compact
      ? active
        ? 'bg-white/15 text-white shadow-sm'
        : 'text-white/55 hover:text-white/80'
      : active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
  );
}

export function FieldFilterChips({
  fields,
  filters,
  onChange,
  variant = 'page',
}: FieldFilterChipsProps) {
  if (fields.length === 0) return null;
  const compact = variant === 'compact';

  return (
    <fieldset
      aria-label="Filter by custom field"
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-2xl p-0.5',
        compact ? 'bg-white/5' : 'bg-muted/60',
      )}
    >
      {fields.map((field) => {
        const filter = activeFilterFor(filters, field.id);
        const summary = fieldFilterSummary(field, filter);
        const isSelect = field.type === 'single_select' || field.type === 'multi_select';
        return isSelect ? (
          <SelectFieldChip
            key={field.id}
            field={field}
            filter={filter}
            summary={summary}
            compact={compact}
            filters={filters}
            onChange={onChange}
          />
        ) : (
          <LiteralFieldChip
            key={field.id}
            field={field}
            filter={filter}
            summary={summary}
            compact={compact}
            filters={filters}
            onChange={onChange}
          />
        );
      })}
    </fieldset>
  );
}

type ChipProps = {
  field: CustomField;
  filter: CustomFieldFilter | null;
  summary: string;
  compact: boolean;
  filters: readonly CustomFieldFilter[];
  onChange: (filters: CustomFieldFilter[]) => void;
};

function ChipLabel({ field, summary }: { field: CustomField; summary: string }) {
  return (
    <>
      <span>{field.name}</span>
      {summary ? <span className="text-muted-foreground">{summary}</span> : null}
      <ChevronDown className="size-3 opacity-60" />
    </>
  );
}

function SelectFieldChip({ field, filter, summary, compact, filters, onChange }: ChipProps) {
  const selected = filter?.operator === 'any_of' ? filter.values : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-pressed={filter !== null}
          className={chipClass(filter !== null, compact)}
        >
          <ChipLabel field={field} summary={summary} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {field.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={selected.includes(option.id)}
            onSelect={(event) => {
              // Keep the menu open: picking several options is one gesture.
              event.preventDefault();
              onChange(toggleSelectFilterValue(filters, field.id, option.id));
            }}
            className="text-xs"
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filter?.operator === 'is_empty'}
          onSelect={(event) => {
            event.preventDefault();
            onChange(toggleEmptyFilter(filters, field.id));
          }}
          className="text-xs text-muted-foreground"
        >
          Is empty
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function LiteralFieldChip({ field, filter, summary, compact, filters, onChange }: ChipProps) {
  const [open, setOpen] = useState(false);
  const literal = filter?.operator === 'is' ? (filter.values[0] ?? '') : '';
  const [draft, setDraft] = useState(literal);
  const isEmptyActive = filter?.operator === 'is_empty';

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Re-sync the draft with the committed filter each time it opens, so a
        // typed-but-abandoned literal does not linger.
        if (next) setDraft(literal);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-pressed={filter !== null}
            className={chipClass(filter !== null, compact)}
          >
            <ChipLabel field={field} summary={summary} />
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-2">
        {field.type === 'date' ? (
          <Calendar
            mode="single"
            selected={literal ? new Date(`${literal}T00:00:00`) : undefined}
            onSelect={(date) => {
              onChange(setLiteralFilter(filters, field.id, date ? toIsoDay(date) : null));
              setOpen(false);
            }}
          />
        ) : (
          <Input
            value={draft}
            autoFocus
            placeholder={`${field.name} is…`}
            aria-label={`Filter ${field.name}`}
            className="h-8 w-56 text-xs"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onChange(setLiteralFilter(filters, field.id, draft));
              setOpen(false);
            }}
          />
        )}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-6 px-1.5 text-2xs', isEmptyActive && 'text-foreground')}
            aria-pressed={isEmptyActive}
            onClick={() => {
              onChange(toggleEmptyFilter(filters, field.id));
              setOpen(false);
            }}
          >
            Is empty
          </Button>
          {filter ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-2xs text-muted-foreground"
              onClick={() => {
                onChange(clearFieldFilter(filters, field.id));
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
