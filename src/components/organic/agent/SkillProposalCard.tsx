'use client';

import { useState } from 'react';
import { createBrandSkill } from '@/lib/organic/skills';
import { AgentButton, AgentCardEyebrow, AgentCardTitle, AgentDecisionCard } from './agentCardKit';
import type { SkillProposalCardData } from './types';

type Props = {
  proposal: SkillProposalCardData;
  onSavedAction?: () => void;
};

// Confirm/edit card for an agent-proposed brand skill. Persistence is user-gated:
// the agent only proposes (ui.skill_proposal); the skill is saved here on Save.
export function SkillProposalCard({ proposal, onSavedAction }: Props) {
  const [name, setName] = useState(proposal.name);
  const [directives, setDirectives] = useState(proposal.directives);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindLabel = proposal.kind === 'analytic' ? 'Analytic' : 'Creative direction';

  async function save() {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      await createBrandSkill({
        brandId: proposal.brandId,
        name: name.trim(),
        kind: proposal.kind,
        description: proposal.description,
        directives: directives.trim(),
        tags: proposal.tags,
      });
      setSaved(true);
      onSavedAction?.();
    } catch {
      setError('Could not save the skill. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AgentDecisionCard className="p-4">
      <AgentCardEyebrow
        label="New skill"
        right={<span className="shrink-0 text-[11px] text-muted-foreground">{kindLabel}</span>}
      />
      {editing ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium"
          aria-label="Skill name"
        />
      ) : (
        <AgentCardTitle>{name}</AgentCardTitle>
      )}
      {proposal.description && !editing && (
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{proposal.description}</p>
      )}

      {editing ? (
        <textarea
          value={directives}
          onChange={(e) => setDirectives(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] leading-relaxed"
          aria-label="Skill directives"
        />
      ) : (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
          {directives}
        </pre>
      )}

      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        {saved ? (
          <span className="text-[12.5px] font-medium text-emerald-600">
            Saved to your brand skills
          </span>
        ) : (
          <>
            <AgentButton
              variant="primary"
              loading={saving}
              disabled={!name.trim() || !directives.trim()}
              onClick={save}
            >
              Save skill
            </AgentButton>
            <AgentButton variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done editing' : 'Edit'}
            </AgentButton>
          </>
        )}
      </div>
    </AgentDecisionCard>
  );
}
