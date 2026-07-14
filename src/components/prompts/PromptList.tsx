'use client';

import type { Prompt } from '@continuum/contracts';
import { Archive, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  prompts: Prompt[];
  onNewAction: () => void;
  onEditAction: (prompt: Prompt) => void;
  onArchiveAction: (prompt: Prompt) => Promise<void> | void;
};

// Browse list for the prompt library. Unlike skills there is no first-party template
// tier — a prompt is whatever this brand decided is worth typing twice.
export function PromptList({ prompts, onNewAction, onEditAction, onArchiveAction }: Props) {
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function archive(prompt: Prompt) {
    setArchivingId(prompt.id);
    try {
      await onArchiveAction(prompt);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="brand" size="sm" className="w-full justify-center" onClick={onNewAction}>
        <Plus className="h-3.5 w-3.5" />
        New prompt
      </Button>

      <div className="flex flex-col gap-1.5">
        <p className="px-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Saved prompts
        </p>
        {prompts.length === 0 ? (
          <p className="px-0.5 text-sm text-muted-foreground">
            No saved prompts yet. Save a prompt you keep retyping, then pick it from the composer.
          </p>
        ) : (
          prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="group flex items-start justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => onEditAction(prompt)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{prompt.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {prompt.description ?? prompt.body}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Edit ${prompt.name}`}
                  onClick={() => onEditAction(prompt)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Archive ${prompt.name}`}
                  disabled={archivingId === prompt.id}
                  onClick={() => archive(prompt)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
