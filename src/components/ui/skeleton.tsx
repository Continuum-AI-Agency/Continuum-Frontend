import { cn } from '@/lib/utils';

/**
 * A loading placeholder: a field of block shades with a denser band sweeping across
 * (`.dither-skeleton`, globals.css). Size and shape it with utilities like any box.
 * `data-slot="skeleton"` is load-bearing: when one leaves the DOM, useDitherReveal decodes the
 * content that replaced it, and the e2e loading invariants wait for none to be left.
 * `data-ascii-skeleton` keeps that reveal from animating a skeleton that is still loading.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      data-ascii-skeleton=""
      className={cn('dither-skeleton rounded-md', className)}
      {...props}
    />
  );
}

/**
 * A placeholder for one run of text, sized BY text: the children are the words it stands in
 * for, painted transparent, so the bar takes the exact line height of the type it sits in and
 * the width those words would take. A loading row built from these lays out like the row it
 * becomes, and the page does not move when the data lands. Borderless by design: a dither bar,
 * never a card-shaped box.
 */
function SkeletonText({
  className,
  children = ' ',
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
      data-ascii-skeleton=""
      className={cn(
        'select-none rounded-md text-transparent',
        wrap
          ? 'dither-skeleton-inline box-decoration-clone'
          : 'dither-skeleton inline-block max-w-full truncate align-top',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Skeleton, SkeletonText };
