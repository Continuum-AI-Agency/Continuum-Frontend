'use client';
import { Bookmark, Plus, SquarePen, Trash2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
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
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

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
      setError(uiErrorText(err));
    } finally {
      setIsSaving(false);
    }
  }, [formState, onCreate, onUpdate, uiErrorText]);

  const handleDelete = React.useCallback(
    async (template: PromptTemplate) => {
      if (template.source === 'preset') return;
      setIsDeleting(template.id);
      try {
        await onDelete(template.id);
      } catch (err) {
        setError(uiErrorText(err));
      } finally {
        setIsDeleting(null);
      }
    },
    [onDelete, uiErrorText],
  );

  const handleSelect = React.useCallback(
    (template: PromptTemplate) => {
      onSelect(template);
      show({
        title: translateUi('template_applied_d71a690c'),
        description: template.name,
        variant: 'success',
      });
    },
    [onSelect, show, translateUi],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={translateUi('prompt_templates_d3a289c7')}
            disabled={isLoading}
          >
            <Bookmark />
          </Button>
        }
      />
      <PopoverContent className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">{translateUi('prompt_templates_d3a289c7')}</span>
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={translateUi('create_template_7dc9c0ad')}
            onClick={openCreate}
          >
            <Plus />
          </Button>
        </div>

        <Input
          placeholder={translateUi('search_templates_04b9835b')}
          value={query}
          aria-label={translateUi('search_templates_04b9835b')}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="mt-2">
          <ScrollArea style={{ maxHeight: 260 }}>
            <div className="flex flex-col gap-2">
              {isLoading ? (
                <span className="text-xs text-muted-foreground">
                  {translateUi('loading_templates_3800ee71')}
                </span>
              ) : filtered.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {translateUi('no_templates_yet_faeba14b')}
                </span>
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
                        aria-label={translateUi('edit_value0_44b87feb', {
                          value0: String(template.name),
                        })}
                        disabled={template.source === 'preset'}
                        onClick={() => openEdit(template)}
                      >
                        <SquarePen />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={translateUi('delete_value0_8782b778', {
                          value0: String(template.name),
                        })}
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
            {formState.mode === 'create'
              ? translateUi('create_template_7dc9c0ad')
              : translateUi('edit_template_708c9a5c')}
          </DialogTitle>
          <DialogDescription>
            {translateUi('save_a_prompt_you_can_reuse_later_i_41294214')}
          </DialogDescription>

          <div className="mt-3 flex flex-col gap-3">
            <label className="space-y-1" htmlFor="prompt-template-name">
              <span className="text-xs text-muted-foreground">{translateUi('name_dcd1d522')}</span>
              <Input
                id="prompt-template-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder={translateUi('e_g_product_glamour_shot_9be71840')}
              />
            </label>
            <label className="space-y-1" htmlFor="prompt-template-prompt">
              <span className="text-xs text-muted-foreground">
                {translateUi('prompt_5c391238')}
              </span>
              <Textarea
                id="prompt-template-prompt"
                value={formState.prompt}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, prompt: event.target.value }))
                }
                rows={6}
                placeholder={translateUi('describe_the_prompt_e382c3b2')}
              />
            </label>
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <DialogClose
              render={<Button variant="secondary">{translateUi('cancel_19766ed6')}</Button>}
            />
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? translateUi('saving_23e39291') : translateUi('save_1509f561')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
