'use client';
import { Bookmark, Plus, SquarePen, Trash2 } from 'lucide-react';

import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from '@/lib/schemas/promptTemplates';

const EMPTY_FORM = {
  name: '',
  prompt: '',
} as const;

type PromptTemplatePickerProps = {
  templates: PromptTemplate[];
  isLoading?: boolean;
  currentPrompt: string;
  onSelect: (template: PromptTemplate) => void;
  onCreate: (input: Omit<PromptTemplateCreateInput, 'brandProfileId'>) => Promise<void>;
  onUpdate: (input: PromptTemplateUpdateInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type FormState = {
  mode: 'create' | 'edit';
  id?: string;
  name: string;
  prompt: string;
};

export function PromptTemplatePicker({
  templates,
  isLoading = false,
  currentPrompt,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: PromptTemplatePickerProps) {
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [formState, setFormState] = React.useState<FormState>({
    mode: 'create',
    ...EMPTY_FORM,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return templates;
    const q = query.toLowerCase();
    return templates.filter((template) => template.name.toLowerCase().includes(q));
  }, [query, templates]);

  const openCreate = React.useCallback(() => {
    setError(null);
    setOpen(false);
    setFormState({
      mode: 'create',
      name: '',
      prompt: currentPrompt?.trim() ? currentPrompt : '',
    });
    setDialogOpen(true);
  }, [currentPrompt]);

  const openEdit = React.useCallback((template: PromptTemplate) => {
    setError(null);
    setOpen(false);
    setFormState({
      mode: 'edit',
      id: template.id,
      name: template.name,
      prompt: template.prompt,
    });
    setDialogOpen(true);
  }, []);

  const handleSave = React.useCallback(async () => {
    setError(null);
    setIsSaving(true);
    try {
      if (formState.mode === 'create') {
        await onCreate({ name: formState.name, prompt: formState.prompt });
      } else if (formState.id) {
        await onUpdate({ id: formState.id, name: formState.name, prompt: formState.prompt });
      }
      setDialogOpen(false);
      setFormState({ mode: 'create', ...EMPTY_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setIsSaving(false);
    }
  }, [formState, onCreate, onUpdate]);

  const handleDelete = React.useCallback(
    async (template: PromptTemplate) => {
      if (template.source === 'preset') return;
      setIsDeleting(template.id);
      try {
        await onDelete(template.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to delete template');
      } finally {
        setIsDeleting(null);
      }
    },
    [onDelete],
  );

  const handleSelect = React.useCallback(
    (template: PromptTemplate) => {
      onSelect(template);
      show({ title: 'Template applied', description: template.name, variant: 'success' });
    },
    [onSelect, show],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Prompt templates" disabled={isLoading}>
            <Bookmark />
          </Button>
        }
      />
      <PopoverContent className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Prompt templates</span>
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label="Create template"
            onClick={openCreate}
          >
            <Plus />
          </Button>
        </div>

        <Input
          placeholder="Search templates"
          value={query}
          aria-label="Search templates"
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="mt-2">
          <ScrollArea style={{ maxHeight: 260 }}>
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <span className="text-xs text-muted-foreground">Loading templates…</span>
              ) : filtered.length === 0 ? (
                <span className="text-xs text-muted-foreground">No templates yet.</span>
              ) : (
                filtered.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted"
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="justify-start"
                      onClick={() => {
                        handleSelect(template);
                        setOpen(false);
                      }}
                    >
                      {template.name}
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Edit ${template.name}`}
                        disabled={template.source === 'preset'}
                        onClick={() => openEdit(template)}
                      >
                        <SquarePen />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${template.name}`}
                        disabled={template.source === 'preset' || isDeleting === template.id}
                        onClick={() => handleDelete(template)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogTitle>
            {formState.mode === 'create' ? 'Create template' : 'Edit template'}
          </DialogTitle>
          <DialogDescription>Save a prompt you can reuse later in AI Studio.</DialogDescription>

          <div className="mt-3 flex flex-col gap-3">
            <label className="space-y-1" htmlFor="prompt-template-name">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                id="prompt-template-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Product glamour shot"
              />
            </label>
            <label className="space-y-1" htmlFor="prompt-template-prompt">
              <span className="text-xs text-muted-foreground">Prompt</span>
              <Textarea
                id="prompt-template-prompt"
                value={formState.prompt}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, prompt: event.target.value }))
                }
                rows={6}
                placeholder="Describe the prompt"
              />
            </label>
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <DialogClose render={<Button variant="secondary">Cancel</Button>} />
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
