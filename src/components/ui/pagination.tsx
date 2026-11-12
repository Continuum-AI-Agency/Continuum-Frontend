import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { isValidElement } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  const tUi = useTranslations('common');

  return (
    <nav
      aria-label={tUi('m_31fbb9d2e0')}
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
  const uiText = useTranslations('common');
  return (
    <PaginationLink
      aria-label={uiText('m_8d993b6d88')}
      size="default"
      className={cn('gap-1 pl-2.5', className)}
      {...props}
    >
      <ChevronLeft className="size-4" />
      <span>{uiText('previous_a57b08a')}</span>
    </PaginationLink>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  const uiText = useTranslations('common');
  return (
    <PaginationLink
      aria-label={uiText('m_fd7164f9dd')}
      size="default"
      className={cn('gap-1 pr-2.5', className)}
      {...props}
    >
      <span>{uiText('next_1ff57a2')}</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  const tUi = useTranslations('common');

  return (
    <span
      aria-hidden
      className={cn('flex size-9 items-center justify-center text-muted-foreground', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">{tUi('m_1fd2b5b554')}</span>
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
