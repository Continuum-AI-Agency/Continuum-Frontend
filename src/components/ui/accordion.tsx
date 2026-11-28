import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// Radix took `type="single"|"multiple"` (+ `collapsible`) and a string value in single mode.
// Base UI takes `openMultiple` and an array value in both modes. The call sites here are all
// written the Radix way, so the translation lives here rather than in ~10 components.
type AccordionCompatProps = Omit<
  AccordionPrimitive.Root.Props,
  'value' | 'defaultValue' | 'onValueChange'
> & {
  type?: 'single' | 'multiple';
  /** Radix-only; Base UI single-mode accordions are always collapsible. */
  collapsible?: boolean;
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string & string[]) => void;
};

const toAccordionArray = (value: string | string[] | undefined): string[] | undefined =>
  value == null ? undefined : Array.isArray(value) ? value : [value];

function Accordion({
  className,
  type = 'single',
  collapsible: _collapsible,
  value,
  defaultValue,
  onValueChange,
  ...props
}: AccordionCompatProps) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={type === 'multiple'}
      value={toAccordionArray(value)}
      defaultValue={toAccordionArray(defaultValue)}
      onValueChange={(next) => {
        const values = (next as string[]) ?? [];
        onValueChange?.((type === 'multiple' ? values : (values[0] ?? '')) as string & string[]);
      }}
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('not-last:border-b', className)}
      {...props}
    />
  );
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden" />
        <ChevronUp className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          'h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
