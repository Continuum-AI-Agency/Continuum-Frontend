'use client';

// The skills browser for Settings → Skills — the one place skills are authored.
// Home for the creative-direction skills the AI Studio canvas (visual surface) and
// the organic agent (copy surface) apply. The agent chat only *applies* skills
// (composer picker / @-mention) and deep-links here to manage them.

import type { Skill } from '@continuum/contracts';
import { ChevronLeft, Lock } from 'lucide-react';
import { useState } from 'react';
import { SkillForm } from '@/components/skills/SkillForm';
import { SkillList } from '@/components/skills/SkillList';
import { archiveBrandSkill, useBrandSkills } from '@/lib/organic/skills';

type Screen =
  | { kind: 'list' }
  | { kind: 'form'; skill: Skill | null }
  | { kind: 'template'; skill: Skill };

export function SkillsSettingsSection({ brandId }: { brandId: string }) {
  const { skills, templates, isLoading, refresh } = useBrandSkills(brandId);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  const openSkill = (skill: Skill) =>
    setScreen(skill.isTemplate ? { kind: 'template', skill } : { kind: 'form', skill });

  return (
    <div className="max-w-2xl">
      {screen.kind !== 'list' && (
        <button
          type="button"
          onClick={() => setScreen({ kind: 'list' })}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to skills
        </button>
      )}

      {screen.kind === 'list' &&
        (isLoading ? (
          <p className="text-sm text-muted-foreground">Loading skills…</p>
        ) : (
          <SkillList
            skills={skills}
            templates={templates}
            onNewAction={() => setScreen({ kind: 'form', skill: null })}
            onEditAction={openSkill}
            onArchiveAction={async (skill) => {
              await archiveBrandSkill(skill.id);
              refresh();
            }}
          />
        ))}

      {screen.kind === 'form' && (
        <SkillForm
          brandId={brandId}
          initial={screen.skill}
          onCancelAction={() => setScreen({ kind: 'list' })}
          onSavedAction={() => {
            refresh();
            setScreen({ kind: 'list' });
          }}
        />
      )}

      {screen.kind === 'template' && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            First-party library skill — read-only. Apply it from a canvas node or the agent.
          </p>
          <span className="text-sm font-medium">{screen.skill.name}</span>
          {screen.skill.description && (
            <p className="text-sm text-muted-foreground">{screen.skill.description}</p>
          )}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground">
            {screen.skill.directives}
          </pre>
        </div>
      )}
    </div>
  );
}
