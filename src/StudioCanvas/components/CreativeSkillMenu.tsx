'use client';

// Per-node creative-skill picker rendered as a context-menu submenu on the image
// and video generation blocks. Lists the brand's active creative_direction skills
// (own + first-party library); selected ids are stored on node data and the
// Backend folds their directives into the generation prompt.

import React from 'react';
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { useBrandSkills } from '@/lib/organic/skills';

// Pure toggle used by each node's updateNode callback. Exported for unit testing.
export function toggleSkillId(skillIds: string[] | undefined, skillId: string): string[] {
  const current = skillIds ?? [];
  return current.includes(skillId)
    ? current.filter((id) => id !== skillId)
    : [...current, skillId];
}

export function CreativeSkillMenu({
  brandId,
  selectedSkillIds,
  onToggle,
}: {
  brandId?: string;
  selectedSkillIds: string[];
  onToggle: (skillId: string) => void;
}) {
  const { all, isLoading } = useBrandSkills(brandId);
  const creativeSkills = React.useMemo(
    () => all.filter((skill) => skill.kind === 'creative_direction' && skill.status === 'active'),
    [all],
  );

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        Creative skills{selectedSkillIds.length > 0 ? ` (${selectedSkillIds.length})` : ''}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-72 w-56 overflow-y-auto">
        {isLoading ? (
          <ContextMenuItem disabled>Loading…</ContextMenuItem>
        ) : creativeSkills.length === 0 ? (
          <ContextMenuItem disabled>No creative skills yet</ContextMenuItem>
        ) : (
          creativeSkills.map((skill) => (
            <ContextMenuCheckboxItem
              key={skill.id}
              checked={selectedSkillIds.includes(skill.id)}
              onSelect={(event) => {
                event.preventDefault();
                onToggle(skill.id);
              }}
            >
              {skill.name}
              {skill.isTemplate ? ' · Library' : ''}
            </ContextMenuCheckboxItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
