'use client';

import type { Skill, SkillSurface } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createBrandSkill, updateBrandSkill } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  // null/undefined -> create a new skill; a Skill -> edit it in place.
  initial?: Skill | null;
  onCancelAction: () => void;
  onSavedAction: () => void;
};

// Which generator the skill steers. Copy skills surface in the organic composer;
// visual skills surface on the AI Studio canvas; both appear in each.
const SURFACES: { value: SkillSurface; label: string }[] = [
  { value: 'copy', label: 'Copy' },
  { value: 'visual', label: 'Visual' },
  { value: 'both', label: 'Both' },
];

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

// Create/edit form for a brand skill. Saves straight to the database via the
// brand-skill endpoints; library templates are never edited here.
export function SkillForm({ brandId, initial, onCancelAction, onSavedAction }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [surface, setSurface] = useState<SkillSurface>(initial?.surface ?? 'both');
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
          surface,
          description: description.trim() || null,
          directives: directives.trim(),
          tags: parseTags(tags),
        });
      } else {
        await createBrandSkill({
          brandId,
          name: name.trim(),
          kind: 'creative_direction',
          surface,
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
        {SURFACES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSurface(s.value)}
            aria-pressed={surface === s.value}
            className={cn(
              'flex-1 rounded-md border px-2 py-1 text-sm font-medium transition-colors',
              surface === s.value
                ? 'border-transparent bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted/60',
            )}
          >
            {s.label}
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
        <Button variant="ghost" size="sm" onClick={onCancelAction}>
          Cancel
        </Button>
        <Button
          variant="brand"
          size="sm"
          disabled={!canSave}
          aria-busy={saving || undefined}
          onClick={save}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial ? 'Save changes' : 'Create skill'}
        </Button>
      </div>
    </div>
  );
}
