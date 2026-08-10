'use client';

import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import { createContext, useContext, useMemo } from 'react';

import { cn } from '@/lib/utils';

// Base UI's equivalent of Radix HoverCard is PreviewCard, but the delay props moved: Radix took
// openDelay/closeDelay on the Root, Base UI takes delay/closeDelay on the Trigger. 28 call sites
// tune these deliberately (dense tables and pannable canvases pick larger opens to avoid flicker),
// and three ai-elements components re-export them as their own props. Rather than rewrite all of
// them, the Root keeps accepting the pair and hands it down to the Trigger.
type HoverCardDelays = { delay?: number; closeDelay?: number };

const HoverCardDelayContext = createContext<HoverCardDelays>({});

function HoverCard({
  openDelay,
  closeDelay,
  ...props
}: PreviewCardPrimitive.Root.Props & { openDelay?: number; closeDelay?: number }) {
  const delays = useMemo(() => ({ delay: openDelay, closeDelay }), [openDelay, closeDelay]);
  return (
    <HoverCardDelayContext.Provider value={delays}>
      <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
    </HoverCardDelayContext.Provider>
  );
}

function HoverCardTrigger({ delay, closeDelay, ...props }: PreviewCardPrimitive.Trigger.Props) {
  const inherited = useContext(HoverCardDelayContext);
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      delay={delay ?? inherited.delay}
      closeDelay={closeDelay ?? inherited.closeDelay}
      {...props}
    />
  );
}

type HoverCardPositionerProps = Pick<
  PreviewCardPrimitive.Positioner.Props,
  | 'align'
  | 'alignOffset'
  | 'side'
  | 'sideOffset'
  | 'collisionPadding'
  | 'collisionBoundary'
  | 'anchor'
  | 'sticky'
>;

function HoverCardContent({
  className,
  side = 'bottom',
  sideOffset = 8,
  align = 'center',
  alignOffset = 0,
  collisionPadding,
  collisionBoundary,
  anchor,
  sticky,
  ...props
}: PreviewCardPrimitive.Popup.Props & HoverCardPositionerProps) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionBoundary={collisionBoundary}
        anchor={anchor}
        sticky={sticky}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            'z-50 w-80 origin-(--transform-origin) rounded-xl border border-subtle bg-popover p-4 text-popover-foreground shadow-xl outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
