'use client';

import type { Skill } from '@continuum/contracts';
import { Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';
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

// Authoring lives in Settings, not here — this popover applies skills. The same
// deep-link backs the canvas grounding popover, so the two never drift.
const SKILLS_SETTINGS_HREF = '/settings?section=skills';

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

  // The organic composer steers copy, so only copy/both skills belong here —
  // `visual` skills are for the AI Studio canvas.
  const isCopySurface = (skill: Skill) => skill.surface !== 'visual';
  const copySkills = skills.filter(isCopySurface);
  const copyTemplates = templates.filter(isCopySurface);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Apply a brand skill"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Skills
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Apply a brand skill…" />
          <CommandList>
            <CommandEmpty>
              {isError
                ? "Couldn't load brand skills. Check your connection and try again."
                : 'No skills yet — ask the agent to save one (e.g. “save this as a skill”), or create one in Settings.'}
            </CommandEmpty>
            <CommandGroup heading="Brand skills">
              {copySkills.map((skill) => (
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
            {copyTemplates.length > 0 && (
              <CommandGroup heading="Library">
                {copyTemplates.map((skill) => (
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
            )}
          </CommandList>
        </Command>
        <div className="border-t border-border/60 px-2 py-1.5">
          <Link
            href={SKILLS_SETTINGS_HREF}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Wand2 className="h-3 w-3" />
            Manage skills
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
