'use client';

import type { Skill } from '@continuum/contracts';
import { Sparkles, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SkillConfigPreview } from '@/components/brand/GenerationConfigPreview';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { describeSkillForGeneration } from '@/lib/brands/generationConfigPresentation';

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
  const uiText = useTranslations('organic');
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
            aria-label={uiText('apply_a_brand_skill_fa6183a')}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {uiText('skills_66d0f52')}
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={uiText('apply_a_brand_skill_e45a84a')} />
          <CommandList>
            <CommandEmpty>
              {isError
                ? uiText('couldn_t_load_brand_skills_check_your_connect_0aabf21')
                : uiText('no_skills_yet_ask_the_agent_to_save_one_e_g_s_5a34c70')}
            </CommandEmpty>
            <CommandGroup heading={uiText('brand_skills_06012ba')}>
              {copySkills.map((skill) => (
                <CommandItem
                  key={skill.id}
                  value={`${skill.name} ${describeSkillForGeneration(skill)}`}
                  onSelect={() => {
                    onPickAction(skill);
                    setOpen(false);
                  }}
                >
                  <SkillConfigPreview skill={skill} />
                  <div className="min-w-0 flex flex-col">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {describeSkillForGeneration(skill)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {copyTemplates.length > 0 && (
              <CommandGroup heading={uiText('library_dc20b3d')}>
                {copyTemplates.map((skill) => (
                  <CommandItem
                    key={skill.id}
                    value={`${skill.name} ${describeSkillForGeneration(skill)}`}
                    onSelect={() => {
                      onPickAction(skill);
                      setOpen(false);
                    }}
                  >
                    <SkillConfigPreview skill={skill} />
                    <div className="min-w-0 flex flex-col">
                      <span className="text-sm font-medium">{skill.name}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {describeSkillForGeneration(skill)}
                      </span>
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
            {uiText('manage_skills_f360071')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
