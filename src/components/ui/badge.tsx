// Rehomed from @radix-ui/react-slot to Base UI's useRender. The variant set is Continuum's own
// (violet/teal/success/warning/muted have no base-nova analog), so the styling is unchanged.

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,background-color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'border-border text-foreground [a&]:hover:bg-foreground/5',
        destructive:
          'border-destructive/30 text-red-700 dark:text-red-300 [a&]:hover:bg-destructive/10 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        violet: 'border-primary/30 text-primary [a&]:hover:bg-primary/10',
        teal: 'border-secondary/30 text-sky-700 dark:text-sky-300 [a&]:hover:bg-secondary/10',
        success:
          'border-success/30 text-emerald-700 dark:text-emerald-300 [a&]:hover:bg-success/10',
        warning: 'border-warning/30 text-amber-800 dark:text-amber-300 [a&]:hover:bg-warning/10',
        muted: 'border-border/60 text-muted-foreground [a&]:hover:bg-foreground/5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: 'badge' },
  });
}

export { Badge, badgeVariants };
