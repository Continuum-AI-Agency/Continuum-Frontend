'use client';
import { Layers2 } from 'lucide-react';

// Composer-adjacent picker that drops a saved starter (a captured canvas recipe)
// onto the canvas. Picking one re-applies its subgraph — prompts, models, reference
// roles, and skillIds intact — through the same apply path the Load-workflow dialog
// uses, so the user only has to press Run. Authoring lives on the canvas ("Save
// selection as starter"); this only invokes.

import { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBrandStarters } from '@/lib/ai-studio/starters';
import { useApplyWorkflow } from '@/StudioCanvas/hooks/useApplyWorkflow';

type Props = {
  brandProfileId?: string;
};

export function StarterPickerButton({ brandProfileId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: starters = [], isLoading, isError } = useBrandStarters(brandProfileId);
  const applyWorkflow = useApplyWorkflow();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Add a saved starter"
            className="mb-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Layers2 />
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Add a saved starter…" />
          <CommandList>
            <CommandEmpty>
              {isError
                ? "Couldn't load starters. Check your connection and try again."
                : isLoading
                  ? 'Loading starters…'
                  : 'No starters yet — select nodes on the canvas and choose “Save selection as starter”.'}
            </CommandEmpty>
            <CommandGroup heading="Starters">
              {starters.map((starter) => (
                <CommandItem
                  key={starter.id}
                  value={`${starter.name} ${starter.description ?? ''}`}
                  onSelect={() => {
                    setOpen(false);
                    void applyWorkflow(starter, { toastTitle: 'Starter added' });
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{starter.name}</span>
                    {starter.description && (
                      <span className="text-xs text-muted-foreground">{starter.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
