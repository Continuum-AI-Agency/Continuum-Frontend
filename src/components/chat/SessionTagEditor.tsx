'use client';

import { AGENT_SESSION_MAX_TAGS, normalizeAgentSessionTags } from '@continuum/contracts';
import { TagIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Per-row tag editor for a conversation. The write is the caller's (each agent
// has its own PATCH route); this component only decides what the tag set becomes.

export type SessionTagEditorProps = {
  sessionId: string;
  tags: string[];
  disabled?: boolean;
  onChange: (sessionId: string, tags: string[]) => void | Promise<void>;
  className?: string;
};

export function SessionTagEditor({
  sessionId,
  tags,
  disabled = false,
  onChange,
  className,
}: SessionTagEditorProps) {
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const commit = async (next: string[]) => {
    setIsSaving(true);
    try {
      await onChange(sessionId, next);
    } finally {
      setIsSaving(false);
    }
  };

  const addDraftTag = async () => {
    const [normalized] = normalizeAgentSessionTags([draft]);
    if (!normalized || tags.includes(normalized)) {
      setDraft('');
      return;
    }
    setDraft('');
    await commit([...tags, normalized]);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={`Edit tags for conversation ${sessionId}`}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
              className,
            )}
          >
            <TagIcon className="size-3.5" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 space-y-2 p-2">
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <span className="text-2xs text-muted-foreground">No tags yet</span>
          ) : (
            tags.map((tag) => (
              <Pill key={tag} variant="secondary" className="gap-1">
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  disabled={isSaving}
                  onClick={() => void commit(tags.filter((item) => item !== tag))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="size-3" />
                </button>
              </Pill>
            ))
          )}
        </div>
        <Input
          value={draft}
          disabled={isSaving || tags.length >= AGENT_SESSION_MAX_TAGS}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void addDraftTag();
          }}
          placeholder={
            tags.length >= AGENT_SESSION_MAX_TAGS ? 'Tag limit reached' : 'Add tag + Enter'
          }
          aria-label="Add tag"
          className="h-7 text-xs"
        />
      </PopoverContent>
    </Popover>
  );
}
