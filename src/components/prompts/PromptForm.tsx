'use client';

import type { Prompt } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createBrandPrompt, updateBrandPrompt } from '@/lib/organic/prompts-api';

type Props = {
  brandId: string;
  // null/undefined -> create a new prompt; a Prompt -> edit it in place.
  initial?: Prompt | null;
  onCancelAction: () => void;
  onSavedAction: () => void;
};

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

// Create/edit form for a brand prompt. Saves straight to the database via the
// brand-prompt endpoints — the same shape SkillForm uses, so the two feel identical.
export function PromptForm({ brandId, initial, onCancelAction, onSavedAction }: Props) {
  const uiText = useTranslations('common');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && body.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      body: body.trim(),
      category: category.trim() || undefined,
      tags: parseTags(tags),
    };
    try {
      if (initial) {
        await updateBrandPrompt(initial.id, payload);
      } else {
        await createBrandPrompt({ brandId, ...payload });
      }
      onSavedAction();
    } catch (err) {
      // The backend answers a duplicate name with a real 409, so say the useful thing
      // rather than a generic failure.
      const conflict = err instanceof Error && /409|name_conflict/i.test(err.message);
      setError(
        conflict ? uiText('m_69cf1c5322', { v0: String(name.trim()) }) : uiText('m_825d418b35'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={uiText('m_b180cb61ee')}
        maxLength={120}
        aria-label={uiText('m_b180cb61ee')}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium"
      />

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={uiText('m_b468afcf87')}
        maxLength={500}
        aria-label={uiText('m_ce37cd809e')}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder={uiText('m_14af6fa9c9')}
        aria-label={uiText('m_c38029934e')}
        className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed"
      />

      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder={uiText('m_577f123ae4')}
        maxLength={80}
        aria-label={uiText('m_206c088461')}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />

      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={uiText('m_8c7e01ee22')}
        aria-label={uiText('m_a64d214977')}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="mt-0.5 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancelAction}>
          {uiText('cancel_19766ed')}
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!canSave}
          aria-busy={saving || undefined}
          onClick={save}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial ? uiText('save_changes_dd0ae7a') : uiText('m_c2d17a8fdc')}
        </Button>
      </div>
    </div>
  );
}
