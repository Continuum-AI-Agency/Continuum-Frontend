'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Radix modelled the third state as checked="indeterminate"; Base UI has a separate
// `indeterminate` boolean. Call sites still pass the Radix shape.
//
// Base UI renders a button plus a hidden native input, so under happy-dom a click on the button
// ALSO activates an enclosing <label> and the checkbox toggles twice. Real browsers skip label
// activation when the click target is interactive content, so this is a test-environment gap -
// specs that drove these rows now click the row label, which is what a user does anyway.
// Confirm in a real browser before trusting either behaviour.
function Checkbox({
  className,
  checked,
  ...props
}: Omit<CheckboxPrimitive.Root.Props, 'checked'> & {
  checked?: boolean | 'indeterminate';
}) {
  const isIndeterminate = checked === 'indeterminate';
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={isIndeterminate ? false : checked}
      indeterminate={isIndeterminate}
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <Check />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
