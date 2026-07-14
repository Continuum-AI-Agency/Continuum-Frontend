'use client';

import type { Prompt } from '@continuum/contracts';
import { BookText, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Same split skills use: apply here, author in Settings.
const PROMPTS_SETTINGS_HREF = '/settings?section=prompts';

type Props = {
  prompts: Prompt[];
  onPickAction: (prompt: Prompt) => void;
  isError?: boolean;
};

// Sibling of SkillPickerButton in the composer toolbar, but a different KIND of thing:
// picking a prompt TYPES ITS TEXT into the composer. It is an input, not an annotation
// — there is nothing for the Backend to resolve afterwards, which is why a prompt is
// deliberately not an agent mention reference the way a skill is. The user can edit the
// text before sending, and that is the point.
export function PromptPickerButton({ prompts, onPickAction, isError = false }: Props) {
  const [open, setOpen] = useState(false);

  // Prompts carry a free-text category; group by it so a growing library stays browsable
  // without inventing a second taxonomy.
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Prompt[]>();
    for (const prompt of prompts) {
      const bucket = byCategory.get(prompt.category) ?? [];
      bucket.push(prompt);
      byCategory.set(prompt.category, bucket);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [prompts]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Insert a saved prompt"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <BookText className="h-3.5 w-3.5" />
          Prompts
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Insert a saved prompt…" />
          <CommandList>
            <CommandEmpty>
              {isError
                ? "Couldn't load saved prompts. Check your connection and try again."
                : 'No saved prompts yet — save one in Settings to reuse it here.'}
            </CommandEmpty>
            {grouped.map(([category, items]) => (
              <CommandGroup key={category} heading={category}>
                {items.map((prompt) => (
                  <CommandItem
                    key={prompt.id}
                    value={`${prompt.name} ${prompt.description ?? ''} ${prompt.category}`}
                    onSelect={() => {
                      onPickAction(prompt);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{prompt.name}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {prompt.description ?? prompt.body}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="border-t border-border/60 px-2 py-1.5">
          <Link
            href={PROMPTS_SETTINGS_HREF}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Wand2 className="h-3 w-3" />
            Manage prompts
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
