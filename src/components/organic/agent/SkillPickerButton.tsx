'use client';

import type { Skill } from '@continuum/contracts';
import { Sparkles } from 'lucide-react';
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

type Props = {
  skills: Skill[];
  templates?: Skill[];
  onPickAction: (skill: Skill) => void;
  isError?: boolean;
};

// Composer-adjacent picker so users can browse and apply brand skills (and the
// first-party library) without typing "@". Selecting a skill adds it as a chat
// reference (same channel the @-mention uses), so it is loaded into the agent's
// context for the next turn.
export function SkillPickerButton({
  skills,
  templates = [],
  onPickAction,
  isError = false,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Apply a brand skill"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Skills
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Apply a brand skill…" />
          <CommandList>
            <CommandEmpty>
              {isError
                ? "Couldn't load brand skills. Check your connection and try again."
                : 'No skills yet — ask the agent to save one (e.g. “save this as a skill”).'}
            </CommandEmpty>
            <CommandGroup heading="Brand skills">
              {skills.map((skill) => (
                <CommandItem
                  key={skill.id}
                  value={`${skill.name} ${skill.description ?? ''}`}
                  onSelect={() => {
                    onPickAction(skill);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{skill.name}</span>
                    {skill.description && (
                      <span className="text-xs text-muted-foreground">{skill.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {templates.length > 0 && (
              <CommandGroup heading="Library">
                {templates.map((skill) => (
                  <CommandItem
                    key={skill.id}
                    value={`${skill.name} ${skill.description ?? ''}`}
                    onSelect={() => {
                      onPickAction(skill);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{skill.name}</span>
                      {skill.description && (
                        <span className="text-xs text-muted-foreground">
                          {skill.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
