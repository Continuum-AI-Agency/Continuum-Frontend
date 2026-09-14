// base-nova (Base UI) button. `success` and `cta` are Continuum variants with no upstream
// equivalent; everything else tracks the shadcn base-nova registry so future `shadcn add` diffs stay small.
//
// Filled variants are quiet at rest — a 14% tint, a hairline, and a coloured label — and a
// muted brand colour blooms in from the pointer on hover. See `@utility btn-fill` in
// globals.css for the choreography and `PointerOrigin` for the bloom's origin. `cta` is the
// one exception: marketing CTAs stay solid at rest, so the bloom only deepens them.
//
// Every mix target here is hue-neutral (#808080, black, white) on purpose. Mixing toward
// `--muted-foreground` or light-mode `--foreground` LOOKS equivalent and is not: both carry
// violet chroma, and in oklch that rotates hue — it turned the destructive fill pink and the
// success fill teal. Dark mode's `--foreground` is near-neutral, so it is safe there only.
//
// Two label colours here look wrong and are not. `text-primary` and `text-secondary` are
// CUSTOM utilities in globals.css (near-black and grey); the Tailwind token utilities of the
// same name lose to them. A variant that wants the actual brand hue must spell it
// `text-[var(--primary)]` or the label silently renders as body text.
//
// `--primary-foreground` is #0b1020 in dark, not white: white on dark `--primary` (#7c6fff)
// measures 3.77:1 against a 4.5:1 floor. That is fixed at the token in globals.css, so every
// `bg-primary` surface inherits it — this file needs no per-variant dark override.
//
// The disabled fade is gated on `not-aria-busy`. Element-wide opacity dims a filled button's
// label and its fill together, so their contrast with each other collapses toward 1:1 — at 40%
// the brand button's white-on-violet label measured 1.96:1 (light) / 2.67:1 (dark) against a
// 4.5:1 floor. That is acceptable for an inactive control (WCAG 1.4.3 exempts them) and wrong
// for a BUSY one, whose label is live status the user has to read. A busy button therefore keeps
// full opacity and signals its state with its spinner and `aria-busy`, not by fading out.

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap btn-fill outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:not-aria-busy:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-primary/20 bg-primary/14 text-[color-mix(in_oklch,var(--primary),var(--foreground)_22%)] [--btn-fill:color-mix(in_oklch,var(--primary),#808080_22%)] hover:text-primary-foreground',
        outline:
          'border-border bg-background [--btn-fill:var(--muted)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30',
        secondary:
          'border-secondary/20 bg-secondary/14 text-[color-mix(in_oklch,var(--secondary),var(--foreground)_40%)] [--btn-fill:color-mix(in_oklch,var(--secondary),#808080_22%)] hover:text-secondary-foreground aria-expanded:bg-secondary/14',
        ghost:
          '[--btn-fill:var(--muted)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'border-destructive/20 bg-destructive/14 text-[color-mix(in_oklch,var(--destructive),black_26%)] [--btn-fill:color-mix(in_oklch,color-mix(in_oklch,var(--destructive),#808080_22%),black_14%)] hover:text-destructive-foreground focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:text-[color-mix(in_oklch,var(--destructive),var(--foreground)_18%)] dark:[--btn-fill:color-mix(in_oklch,var(--destructive),#808080_22%)] dark:focus-visible:ring-destructive/40',
        success:
          'border-success/20 bg-success/14 text-[color-mix(in_oklch,var(--success),black_22%)] [--btn-fill:color-mix(in_oklch,color-mix(in_oklch,var(--success),#808080_22%),black_14%)] hover:text-success-foreground dark:text-[color-mix(in_oklch,var(--success),var(--foreground)_18%)] dark:[--btn-fill:color-mix(in_oklch,var(--success),#808080_22%)]',
        link: 'text-[var(--primary)] underline-offset-4 hover:underline',
        cta: 'bg-primary text-primary-foreground [--btn-fill:color-mix(in_oklch,var(--primary),black_10%)] dark:[--btn-fill:color-mix(in_oklch,var(--primary),white_10%)]',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

// For a link that merely LOOKS like a button, put `buttonVariants()` on the Link/anchor directly —
// do not route it through this component. Base UI's Button is for elements that BEHAVE as buttons:
// `nativeButton={false}` injects role="button" (which destroys an anchor's link semantics) and
// `nativeButton` left true injects type="button" plus a dev warning.
function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
