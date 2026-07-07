'use client';

import { CheckIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { useCallback, useMemo, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PromptDefinition, PromptFormValue } from '@/lib/organic/prompts';
import { cn } from '@/lib/utils';

type PromptSelectorProps = {
  prompts: PromptDefinition[];
  value: PromptFormValue;
  onChange: (prompt: PromptDefinition) => void;
  onCreatePrompt: (input: {
    name: string;
    description?: string;
    content: string;
    category?: string;
  }) => PromptDefinition;
  onDeletePrompt: (promptId: string) => void;
};

export function PromptSelector({
  prompts,
  value,
  onChange,
  onCreatePrompt,
  onDeletePrompt,
}: PromptSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Custom');
  const [content, setContent] = useState('');

  const groupedPrompts = useMemo(() => {
    return prompts.reduce<Record<string, PromptDefinition[]>>((acc, prompt) => {
      const key = prompt.category ?? 'General';
      if (!acc[key]) acc[key] = [];
      acc[key].push(prompt);
      return acc;
    }, {});
  }, [prompts]);

  const handleSelect = useCallback(
    (prompt: PromptDefinition) => {
      onChange(prompt);
    },
    [onChange],
  );

  const handleCreate = useCallback(() => {
    const newPrompt = onCreatePrompt({ name, description, content, category });
    handleSelect(newPrompt);
    setName('');
    setDescription('');
    setCategory('Custom');
    setContent('');
    setIsCreating(false);
  }, [category, content, description, handleSelect, name, onCreatePrompt]);

  const selectedId = value?.id;

  return (
    <div className="rounded-lg border bg-card text-card-foreground">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Prompt Strategy</h2>
          <Button variant="secondary" size="sm" onClick={() => setIsCreating((prev) => !prev)}>
            <PlusIcon /> {isCreating ? 'Close' : 'Create Prompt'}
          </Button>
        </div>

        {isCreating && (
          <div className="rounded-lg border border-subtle bg-surface">
            <div className="p-3 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="Prompt name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full sm:w-[180px]"
                />
              </div>
              <Input
                placeholder="Short description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <Textarea
                rows={5}
                placeholder="Enter the guiding prompt that the agent should follow."
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button disabled={!name.trim() || !content.trim()} onClick={handleCreate}>
                  <CheckIcon /> Save Prompt
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {Object.entries(groupedPrompts).map(([categoryName, categoryPrompts]) => (
            <div key={categoryName} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{categoryName}</h3>
                <Pill variant="muted">{categoryPrompts.length}</Pill>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {categoryPrompts.map((prompt) => {
                  const isSelected = prompt.id === selectedId;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: selectable card wraps a nested Remove button, so it cannot be a native <button>
                    <div
                      key={prompt.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(prompt)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelect(prompt);
                        }
                      }}
                      className={cn(
                        'cursor-pointer rounded-lg border bg-card text-left transition',
                        isSelected ? 'border-primary shadow-sm' : 'border-border',
                      )}
                    >
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{prompt.name}</span>
                          <Pill variant={prompt.source === 'custom' ? 'violet' : 'muted'}>
                            {prompt.source === 'custom' ? 'Custom' : 'Preset'}
                          </Pill>
                        </div>
                        {prompt.description && (
                          <span className="block text-xs text-muted-foreground">
                            {prompt.description}
                          </span>
                        )}
                        <span className="block text-sm whitespace-pre-wrap">{prompt.content}</span>
                        {prompt.source === 'custom' && (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeletePrompt(prompt.id);
                              }}
                            >
                              <TrashIcon /> Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
