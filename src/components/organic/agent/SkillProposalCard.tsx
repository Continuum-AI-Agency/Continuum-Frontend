'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import {
  AgentButton,
  AgentCardEyebrow,
  AgentCardTitle,
  AgentDecisionCard,
} from '@/components/shared/agent-cards/agentCardKit';
import { createBrandSkill } from '@/lib/organic/skills';
import type { SkillProposalCardData } from './types';

type Props = {
  proposal: SkillProposalCardData;
  onSavedAction?: () => void;
};

// Confirm/edit card for an agent-proposed brand skill. Persistence is user-gated:
// the agent only proposes (ui.skill_proposal); the skill is saved here on Save.
export function SkillProposalCard({ proposal, onSavedAction }: Props) {
  const uiText = useTranslations('organic');
  const [name, setName] = useState(proposal.name);
  const [directives, setDirectives] = useState(proposal.directives);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surfaceLabel = uiText('skillSurface', { surface: proposal.surface });

  async function save() {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      await createBrandSkill({
        brandId: proposal.brandId,
        name: name.trim(),
        kind: proposal.kind,
        surface: proposal.surface,
        description: proposal.description,
        directives: directives.trim(),
        tags: proposal.tags,
      });
      setSaved(true);
      onSavedAction?.();
    } catch {
      setError(uiText('could_not_save_the_skill_try_again_25398f1'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AgentDecisionCard className="p-4">
      <AgentCardEyebrow
        label={uiText('new_skill_9bf06a8')}
        right={<span className="shrink-0 text-xs text-muted-foreground">{surfaceLabel}</span>}
      />
      {editing ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium"
          aria-label={uiText('skill_name_0fbb6f4')}
        />
      ) : (
        <AgentCardTitle>{name}</AgentCardTitle>
      )}
      {proposal.description && !editing && (
        <p className="mt-0.5 text-sm text-muted-foreground">{proposal.description}</p>
      )}

      {editing ? (
        <textarea
          value={directives}
          onChange={(e) => setDirectives(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed"
          aria-label={uiText('skill_directives_39e7b80')}
        />
      ) : (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground">
          {directives}
        </pre>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        {saved ? (
          <span className="text-sm font-medium text-emerald-600">
            {uiText('saved_to_your_brand_skills_2879705')}
          </span>
        ) : (
          <>
            <AgentButton
              variant="primary"
              loading={saving}
              disabled={!name.trim() || !directives.trim()}
              onClick={save}
            >
              {uiText('save_skill_1d92b78')}
            </AgentButton>
            <AgentButton variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? uiText('done_editing_058f24e') : uiText('edit_464c4ff')}
            </AgentButton>
          </>
        )}
      </div>
    </AgentDecisionCard>
  );
}
