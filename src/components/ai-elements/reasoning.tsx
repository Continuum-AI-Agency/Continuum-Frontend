'use client';

// House-modified: diverged from the upstream ai-elements component of the same name.
// Re-running the ai-elements CLI would overwrite this file by filename and lose the changes.
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDownIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';

type ReasoningProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  isStreaming?: boolean;
};

export function Reasoning({ children, defaultOpen = false }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="w-full">
      <div className="overflow-hidden rounded-lg border bg-muted/40">{children}</div>
    </Collapsible.Root>
  );
}

export function ReasoningTrigger({ children }: { children: ReactNode }) {
  return (
    <Collapsible.Trigger
      render={
        <div className="flex cursor-pointer items-center justify-between p-2 transition-colors hover:bg-muted/40">
          <div className="flex items-center gap-2">
            <InfoCircledIcon className="text-secondary" aria-hidden="true" />
            <span className="text-sm font-medium text-secondary">{children}</span>
          </div>
          <Button variant="ghost" size="icon-sm">
            <ChevronDownIcon className="transition-transform duration-200" aria-hidden="true" />
          </Button>
        </div>
      }
    />
  );
}

export function ReasoningContent({ children }: { children: ReactNode }) {
  return (
    <Collapsible.Panel>
      <div className="space-y-2 border-t p-3">{children}</div>
    </Collapsible.Panel>
  );
}
