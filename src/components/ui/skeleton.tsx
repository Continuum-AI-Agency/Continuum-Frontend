import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-md bg-gradient-to-r from-slate-200/70 via-slate-100 to-slate-200/70 [background-size:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite] motion-reduce:animate-pulse motion-reduce:bg-muted/70 motion-reduce:bg-none',
        className,
      )}
      {...props}
    />
  );
}

/**
 * A placeholder for one run of text, sized BY text: the children are the words it stands in
 * for, painted transparent, so the bar takes the exact line height of the type it sits in and
 * the width those words would take. A loading row built from these lays out like the row it
 * becomes, and the page does not move when the data lands. Borderless by design: a muted bar,
 * never a card-shaped box.
 */
function SkeletonText({
  className,
  children = '\u00a0',
  wrap = false,
  ...props
}: React.ComponentProps<'span'> & {
  /** Let the bar break across lines the way its words would (a sentence), instead of one
   *  unbreakable bar (a label or a figure). */
  wrap?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="skeleton-text"
      className={cn(
        'select-none rounded-md bg-muted/70 text-transparent motion-safe:animate-pulse',
        wrap ? 'box-decoration-clone' : 'inline-block max-w-full truncate align-top',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Skeleton, SkeletonText };
