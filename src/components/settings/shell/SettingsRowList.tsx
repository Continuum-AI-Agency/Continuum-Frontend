'use client';

// The settings row list: a bounded, scrollable list whose rows show each entity's data at a
// glance under shared column headers and open to the rest. How-to text sits behind a
// SettingsInfoHint in the section header instead of under the list.

import { ChevronRight, Info } from 'lucide-react';
import { type ComponentProps, createContext, type ReactNode, useContext } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type RowListLayout = { grid: string; columns: readonly string[] };

const RowListLayoutContext = createContext<RowListLayout>({ grid: '', columns: [] });

/**
 * `grid` sets the columns for the header and every row, e.g.
 * `grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem]`. `columns` names them in order:
 * the row title first, then one per cell, then the actions column ('' when unlabelled). Give the
 * actions column a fixed width: the header's empty slot would size an `auto` column to zero and
 * pull every header off its column.
 */
export function SettingsRowList({
  grid,
  columns,
  children,
  className,
  ...props
}: RowListLayout & ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'max-h-[min(28rem,calc(100vh-20rem))] overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-card/20',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className={cn(
          'sticky top-0 z-10 hidden items-center gap-x-4 border-b border-border/60 bg-card/95 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur sm:grid',
          grid,
        )}
      >
        {columns.map((column, index) => (
          <span key={`${column}-${index}`} className={index === 0 ? 'pl-6' : undefined}>
            {column}
          </span>
        ))}
      </div>
      <RowListLayoutContext.Provider value={{ grid, columns }}>
        <ul className="divide-y divide-border/60">{children}</ul>
      </RowListLayoutContext.Provider>
    </div>
  );
}

export function SettingsRow({
  title,
  subtitle,
  cells,
  actions,
  detail,
  ...props
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  cells: readonly ReactNode[];
  actions?: ReactNode;
  detail: ReactNode;
} & Omit<ComponentProps<'li'>, 'title'>) {
  const { grid, columns } = useContext(RowListLayoutContext);
  return (
    <li {...props}>
      <Collapsible>
        <div className={cn('grid items-center gap-x-4 gap-y-2 px-3 py-2.5', grid)}>
          <CollapsibleTrigger
            data-testid="settings-row-toggle"
            className="group col-span-full flex min-w-0 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-1"
          >
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              {subtitle ? (
                <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
              ) : null}
            </span>
          </CollapsibleTrigger>
          {cells.map((cell, index) => (
            <div key={columns[index + 1] ?? index} className="min-w-0 pl-6 sm:pl-0">
              <span className="block text-xs text-muted-foreground sm:sr-only">
                {columns[index + 1]}
              </span>
              {cell}
            </div>
          ))}
          {actions ? (
            <div className="col-span-full flex items-center gap-1 pl-6 sm:col-span-1 sm:justify-end sm:pl-0">
              {actions}
            </div>
          ) : null}
        </div>
        <CollapsibleContent className="space-y-3 border-t border-border/60 bg-muted/20 px-3 py-3 sm:pl-9">
          {detail}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

/** ⓘ hint: opens on hover, and on click or keyboard for touch and keyboard users. */
export function SettingsInfoHint({
  label,
  contentClassName,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  contentClassName?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        openOnHover
        delay={150}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'gap-1.5 text-muted-foreground',
        )}
      >
        <Info aria-hidden />
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          'max-h-[min(36rem,var(--available-height))] w-96 overflow-y-auto',
          contentClassName,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
