'use client';

import type { Skill, SkillKind } from '@continuum/contracts';
import { useState } from 'react';
import { createBrandSkill, updateBrandSkill } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import { AgentButton } from '../agentCardKit';

type Props = {
  brandId: string;
  // null/undefined -> create a new skill; a Skill -> edit it in place.
  initial?: Skill | null;
  onCancelAction: () => void;
  onSavedAction: () => void;
};

const KINDS: { value: SkillKind; label: string }[] = [
  { value: 'creative_direction', label: 'Creative direction' },
  { value: 'analytic', label: 'Analytic' },
];

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

// Create/edit form for a brand skill. Saves straight to the database via the
// brand-skill endpoints; library templates are never edited here.
export function SkillWizardForm({ brandId, initial, onCancelAction, onSavedAction }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<SkillKind>(initial?.kind ?? 'creative_direction');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [directives, setDirectives] = useState(initial?.directives ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && directives.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        await updateBrandSkill(initial.id, {
          name: name.trim(),
          kind,
          description: description.trim() || null,
          directives: directives.trim(),
          tags: parseTags(tags),
        });
      } else {
        await createBrandSkill({
          brandId,
          name: name.trim(),
          kind,
          description: description.trim() || null,
          directives: directives.trim(),
          tags: parseTags(tags),
        });
      }
      onSavedAction();
    } catch {
      setError('Could not save the skill. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Skill name"
        maxLength={120}
        aria-label="Skill name"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium"
      />

      <div className="flex gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            aria-pressed={kind === k.value}
            className={cn(
              'flex-1 rounded-md border px-2 py-1 text-sm font-medium transition-colors',
              kind === k.value
                ? 'border-transparent bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted/60',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (when to use it)"
        maxLength={500}
        aria-label="Skill description"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />

      <textarea
        value={directives}
        onChange={(e) => setDirectives(e.target.value)}
        rows={6}
        placeholder="Directives — the guidance injected into the agent when this skill is applied."
        aria-label="Skill directives"
        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed"
      />

      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated)"
        aria-label="Skill tags"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="mt-0.5 flex items-center justify-end gap-2">
        <AgentButton variant="ghost" onClick={onCancelAction}>
          Cancel
        </AgentButton>
        <AgentButton variant="primary" loading={saving} disabled={!canSave} onClick={save}>
          {initial ? 'Save changes' : 'Create skill'}
        </AgentButton>
      </div>
    </div>
  );
}
