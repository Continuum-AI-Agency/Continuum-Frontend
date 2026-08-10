import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type EditablePopoverProps = {
  /** Single element: it becomes the popover trigger via Base UI `render`. */
  trigger: React.ReactElement;
  content: (close: () => void) => React.ReactNode;
  align?: 'start' | 'center' | 'end';
};

export function EditablePopover({ trigger, content, align = 'start' }: EditablePopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-72 border-[#e5e7eb] p-3">
        {content(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
