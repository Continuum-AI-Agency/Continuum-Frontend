"use client";

import React from "react";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Popover,
  ScrollArea,
  Text,
  TextArea,
  TextField,
  Dialog,
} from "@radix-ui/themes";
import {
  BookmarkIcon,
  Pencil2Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from "@/lib/schemas/promptTemplates";

const EMPTY_FORM = {
  name: "",
  prompt: "",
} as const;

type PromptTemplatePickerProps = {
  templates: PromptTemplate[];
  isLoading?: boolean;
  currentPrompt: string;
  onSelect: (template: PromptTemplate) => void;
  onCreate: (input: Omit<PromptTemplateCreateInput, "brandProfileId">) => Promise<void>;
  onUpdate: (input: PromptTemplateUpdateInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

type FormState = {
  mode: "create" | "edit";
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
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [formState, setFormState] = React.useState<FormState>({
    mode: "create",
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
      mode: "create",
      name: "",
      prompt: currentPrompt?.trim() ? currentPrompt : "",
    });
    setDialogOpen(true);
  }, [currentPrompt]);

  const openEdit = React.useCallback((template: PromptTemplate) => {
    setError(null);
    setOpen(false);
    setFormState({
      mode: "edit",
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
      if (formState.mode === "create") {
        await onCreate({ name: formState.name, prompt: formState.prompt });
      } else if (formState.id) {
        await onUpdate({ id: formState.id, name: formState.name, prompt: formState.prompt });
      }
      setDialogOpen(false);
      setFormState({ mode: "create", ...EMPTY_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template");
    } finally {
      setIsSaving(false);
    }
  }, [formState, onCreate, onUpdate]);

  const handleDelete = React.useCallback(
    async (template: PromptTemplate) => {
      if (template.source === "preset") return;
      setIsDeleting(template.id);
      try {
        await onDelete(template.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to delete template");
      } finally {
        setIsDeleting(null);
      }
    },
    [onDelete]
  );

  const handleSelect = React.useCallback(
    (template: PromptTemplate) => {
      onSelect(template);
      show({ title: "Template applied", description: template.name, variant: "success" });
    },
    [onSelect, show]
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <IconButton
          size="1"
          variant="ghost"
          aria-label="Prompt templates"
          disabled={isLoading}
        >
          <BookmarkIcon />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content className="w-80 p-3">
        <Flex align="center" justify="between" mb="2">
          <Text weight="medium">Prompt templates</Text>
          <IconButton size="1" variant="soft" aria-label="Create template" onClick={openCreate}>
            <PlusIcon />
          </IconButton>
        </Flex>

        <TextField.Root
          size="2"
          placeholder="Search templates"
          value={query}
          aria-label="Search templates"
          onChange={(event) => setQuery(event.target.value)}
        />

        <Box mt="2">
          <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 260 }}>
            <Flex direction="column" gap="2">
              {isLoading ? (
                <Text size="1" color="gray">Loading templates…</Text>
              ) : filtered.length === 0 ? (
                <Text size="1" color="gray">No templates yet.</Text>
              ) : (
                filtered.map((template) => (
                  <Flex key={template.id} align="center" justify="between" className="rounded-md px-2 py-1 hover:bg-white/5">
                    <Popover.Close>
                      <Button
                        size="1"
                        variant="ghost"
                        className="justify-start"
                        onClick={() => handleSelect(template)}
                      >
                        {template.name}
                      </Button>
                    </Popover.Close>
                    <Flex gap="1">
                      <IconButton
                        size="1"
                        variant="ghost"
                        aria-label={`Edit ${template.name}`}
                        disabled={template.source === "preset"}
                        onClick={() => openEdit(template)}
                      >
                        <Pencil2Icon />
                      </IconButton>
                      <IconButton
                        size="1"
                        variant="ghost"
                        aria-label={`Delete ${template.name}`}
                        color="red"
                        disabled={template.source === "preset" || isDeleting === template.id}
                        onClick={() => handleDelete(template)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </Flex>
                  </Flex>
                ))
              )}
            </Flex>
          </ScrollArea>
        </Box>
      </Popover.Content>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: 520 }}>
          <Dialog.Title>{formState.mode === "create" ? "Create template" : "Edit template"}</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            Save a prompt you can reuse later in AI Studio.
          </Dialog.Description>

          <Flex direction="column" gap="3" mt="3">
            <label className="space-y-1">
              <Text size="1" color="gray">Name</Text>
              <TextField.Root
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Product glamour shot"
              />
            </label>
            <label className="space-y-1">
              <Text size="1" color="gray">Prompt</Text>
              <TextArea
                value={formState.prompt}
                onChange={(event) => setFormState((prev) => ({ ...prev, prompt: event.target.value }))}
                rows={6}
                placeholder="Describe the prompt"
              />
            </label>
            {error ? (
              <Text size="1" color="red">{error}</Text>
            ) : null}
          </Flex>

          <Flex justify="end" gap="2" mt="4">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Popover.Root>
  );
}
