'use client';

import type { Skill } from '@continuum/contracts';
import { Archive, Lock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  skills: Skill[];
  templates: Skill[];
  onNewAction: () => void;
  onEditAction: (skill: Skill) => void;
  onArchiveAction: (skill: Skill) => Promise<void> | void;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

// Browse list for the skills browser: the brand's own skills (editable /
// archivable) and the read-only first-party library.
export function SkillList({
  skills,
  templates,
  onNewAction,
  onEditAction,
  onArchiveAction,
}: Props) {
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function archive(skill: Skill) {
    setArchivingId(skill.id);
    try {
      await onArchiveAction(skill);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="brand" size="sm" className="w-full justify-center" onClick={onNewAction}>
        <Plus className="h-3.5 w-3.5" />
        New skill
      </Button>

      <div className="flex flex-col gap-1.5">
        <SectionLabel>Your skills</SectionLabel>
        {skills.length === 0 ? (
          <p className="px-0.5 text-sm text-muted-foreground">
            No skills yet — create one or ask the agent to save one.
          </p>
        ) : (
          skills.map((skill) => (
            <div
              key={skill.id}
              className="group flex items-start justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => onEditAction(skill)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{skill.name}</span>
                {skill.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Edit ${skill.name}`}
                  onClick={() => onEditAction(skill)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Archive ${skill.name}`}
                  disabled={archivingId === skill.id}
                  onClick={() => archive(skill)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>Library</SectionLabel>
          {templates.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => onEditAction(skill)}
              className="flex items-start justify-between gap-2 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{skill.name}</span>
                {skill.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                )}
              </span>
              <Lock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/70" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
