import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { isValidElement } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
));
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('list-none', className)} {...props} />
  ),
);
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = React.ComponentProps<'a'> & {
  isActive?: boolean;
  size?: 'default' | 'icon';
  disabled?: boolean;
  asChild?: boolean;
};

function PaginationLink({
  className,
  isActive,
  size = 'icon',
  disabled,
  asChild = false,
  ...props
}: PaginationLinkProps) {
  // Base UI has no Slot; useRender is its equivalent. The `asChild` API is kept so the
  // call sites are unchanged - the child element receives the merged props exactly as before.
  const { children, ...rest } = props;
  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>(
      {
        'aria-current': isActive ? 'page' : undefined,
        'aria-disabled': disabled ? true : undefined,
        tabIndex: disabled ? -1 : props.tabIndex,
        className: cn(
          buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }),
          disabled && 'pointer-events-none opacity-50',
          className,
        ),
      },
      asChild ? rest : props,
    ),
    render: asChild && isValidElement(children) ? children : undefined,
  });
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn('gap-1 pl-2.5', className)}
      {...props}
    >
      <ChevronLeft className="size-4" />
      <span>Previous</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn('gap-1 pr-2.5', className)}
      {...props}
    >
      <span>Next</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      className={cn('flex size-9 items-center justify-center text-muted-foreground', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
