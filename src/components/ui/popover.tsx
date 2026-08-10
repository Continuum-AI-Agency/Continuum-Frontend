'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useRender } from '@base-ui/react/use-render';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

// Base UI has no Anchor part — its Positioner takes an `anchor` element instead. Three call sites
// (CalendarDraftCard x2, MediaSelectPopover) anchor a popover to something other than its trigger,
// and the test suite mocks PopoverAnchor by name, so the part is kept and wired to `anchor` here.
const PopoverAnchorContext = createContext<{
  anchor: Element | null;
  setAnchor: (element: Element | null) => void;
} | null>(null);

function Popover({ children, ...props }: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchorState] = useState<Element | null>(null);
  // mergeProps composes the ref into a fresh function each render, so React detaches (null) and
  // reattaches (element) every pass. Storing the null would flip state each cycle and spin
  // forever; ignoring it lets the repeat attach hit React's Object.is bail-out instead.
  const setAnchor = useCallback((element: Element | null) => {
    if (element) setAnchorState(element);
  }, []);
  const value = useMemo(() => ({ anchor, setAnchor }), [anchor, setAnchor]);
  return (
    <PopoverAnchorContext.Provider value={value}>
      <PopoverPrimitive.Root data-slot="popover" {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverAnchorContext.Provider>
  );
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverAnchor({ render, ...props }: useRender.ComponentProps<'div'>) {
  const context = useContext(PopoverAnchorContext);
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>({ ref: context?.setAnchor }, props),
    render,
    state: { slot: 'popover-anchor' },
  });
}

type PopoverPositionerProps = Pick<
  PopoverPrimitive.Positioner.Props,
  | 'align'
  | 'alignOffset'
  | 'side'
  | 'sideOffset'
  | 'collisionPadding'
  | 'collisionBoundary'
  | 'sticky'
>;

function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  collisionPadding,
  collisionBoundary,
  sticky,
  ...props
}: PopoverPrimitive.Popup.Props & PopoverPositionerProps) {
  const context = useContext(PopoverAnchorContext);
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionBoundary={collisionBoundary}
        sticky={sticky}
        anchor={context?.anchor ?? undefined}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 w-72 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
