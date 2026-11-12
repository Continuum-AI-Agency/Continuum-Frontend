'use client';

// Order the grid by any custom field. The Library page's URL is its filter state, so the
// choice is written there (?sort=field_asc|field_desc&sortField=<id>) and the grid re-reads
// through the same browse path a navigation takes; media.library_browse_page does the
// ordering (numbers by value, selects and statuses by their option order, a missing value
// last in either direction).

import type { CustomField } from '@continuum/contracts';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ChevronDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations as useUiTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type Direction = 'field_asc' | 'field_desc';

export function SortByFieldPicker({ fields }: { fields: readonly CustomField[] }) {
  const translateUi = useUiTranslations('library');

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sort = params.get('sort');
  const activeDirection: Direction | null =
    sort === 'field_asc' || sort === 'field_desc' ? sort : null;
  const activeField = activeDirection
    ? (fields.find((field) => field.id === params.get('sortField')) ?? null)
    : null;

  const apply = (fieldId: string | null, direction: Direction) => {
    const next = new URLSearchParams(params.toString());
    next.delete('cursor');
    if (fieldId) {
      next.set('sort', direction);
      next.set('sortField', fieldId);
    } else {
      next.delete('sort');
      next.delete('sortField');
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  if (fields.length === 0) return null;
  const direction = activeDirection ?? 'field_asc';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={translateUi('sort_by_field_41fa9060')}
            aria-pressed={activeField !== null}
            className={cn(
              'flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors active:scale-[0.96]',
              activeField
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {direction === 'field_desc' ? (
              <ArrowDownWideNarrow className="size-3.5" />
            ) : (
              <ArrowUpNarrowWide className="size-3.5" />
            )}
            {activeField
              ? translateUi('sorted_by_value0_d7fb564e', { value0: String(activeField.name) })
              : translateUi('sort_by_field_41fa9060')}
            <ChevronDown className="size-3 opacity-60" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        {fields.map((field) => (
          <DropdownMenuItem
            key={field.id}
            className="gap-1.5 text-xs"
            onSelect={() => apply(field.id, direction)}
          >
            <Check
              className={cn('size-3.5', activeField?.id === field.id ? 'opacity-100' : 'opacity-0')}
            />
            {field.name}
          </DropdownMenuItem>
        ))}
        {activeField ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onSelect={() =>
                apply(activeField.id, direction === 'field_asc' ? 'field_desc' : 'field_asc')
              }
            >
              {direction === 'field_asc'
                ? translateUi('descending_79479a6c')
                : translateUi('ascending_77184595')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs text-muted-foreground"
              onSelect={() => apply(null, direction)}
            >
              {' '}
              {translateUi('clear_field_sort_28488781')}{' '}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
