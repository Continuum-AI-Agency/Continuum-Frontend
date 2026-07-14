'use client';

// The prompt browser for Settings → Prompts — the one place prompts are authored.
// The composer only *applies* a prompt (picking one types its text into the box) and
// deep-links here to manage them, exactly as skills do.

import type { Prompt } from '@continuum/contracts';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { PromptForm } from '@/components/prompts/PromptForm';
import { PromptList } from '@/components/prompts/PromptList';
import { archiveBrandPrompt, useBrandPrompts } from '@/lib/organic/prompts-api';

type Screen = { kind: 'list' } | { kind: 'form'; prompt: Prompt | null };

export function PromptsSettingsSection({ brandId }: { brandId: string }) {
  const { prompts, isLoading, refresh } = useBrandPrompts(brandId);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  return (
    <div className="max-w-2xl">
      {screen.kind !== 'list' && (
        <button
          type="button"
          onClick={() => setScreen({ kind: 'list' })}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to prompts
        </button>
      )}

      {screen.kind === 'list' &&
        (isLoading ? (
          <p className="text-sm text-muted-foreground">Loading prompts…</p>
        ) : (
          <PromptList
            prompts={prompts}
            onNewAction={() => setScreen({ kind: 'form', prompt: null })}
            onEditAction={(prompt) => setScreen({ kind: 'form', prompt })}
            onArchiveAction={async (prompt) => {
              await archiveBrandPrompt(prompt.id);
              refresh();
            }}
          />
        ))}

      {screen.kind === 'form' && (
        <PromptForm
          brandId={brandId}
          initial={screen.prompt}
          onCancelAction={() => setScreen({ kind: 'list' })}
          onSavedAction={() => {
            refresh();
            setScreen({ kind: 'list' });
          }}
        />
      )}
    </div>
  );
}
