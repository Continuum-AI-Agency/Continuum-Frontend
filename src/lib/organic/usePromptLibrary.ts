"use client";

import { useCallback, useMemo } from "react";
import { z } from "zod";

import { usePersistentState } from "@/lib/usePersistentState";
import {
  DEFAULT_PROMPTS,
  promptDefinitionSchema,
  type PromptDefinition,
  type PromptFormValue,
  toPromptFormValue,
} from "./prompts";

const customPromptSchema = promptDefinitionSchema.extend({
  source: z.literal("custom"),
});

const customPromptArraySchema = z.array(customPromptSchema);

export type PromptInput = {
  name: string;
  description?: string;
  content: string;
  category?: string;
};

export function useOrganicPromptLibrary(brandProfileId: string) {
  const storageKey = `continuum.organic.prompts.${brandProfileId}`;
  const [customPrompts, setCustomPrompts] = usePersistentState<PromptDefinition[]>(
    storageKey,
    [],
    customPromptArraySchema
  );

  const prompts = useMemo<PromptDefinition[]>(
    () => [...DEFAULT_PROMPTS, ...customPrompts],
    [customPrompts]
  );

  const addCustomPrompt = useCallback(
    (input: PromptInput): PromptDefinition => {
      const trimmedName = input.name.trim();
      const trimmedContent = input.content.trim();
      if (!trimmedName || !trimmedContent) {
        throw new Error("Prompt name and content are required.");
      }

      const newPrompt: PromptDefinition = {
        id: `custom-${Date.now()}`,
        name: trimmedName,
        description: input.description?.trim() || undefined,
        content: trimmedContent,
        category: input.category?.trim() || "Custom",
        source: "custom",
      };

      setCustomPrompts((current) => [...current, newPrompt]);
      return newPrompt;
    },
    [setCustomPrompts]
  );

  const removeCustomPrompt = useCallback(
    (promptId: string) => {
      setCustomPrompts((current) => current.filter((prompt) => prompt.id !== promptId));
    },
    [setCustomPrompts]
  );

  const findPromptById = useCallback(
    (promptId: string): PromptDefinition | undefined =>
      prompts.find((prompt) => prompt.id === promptId),
    [prompts]
  );

  const defaultPrompt: PromptFormValue = useMemo(() => {
    const first = prompts[0];
    return toPromptFormValue(first);
  }, [prompts]);

  return {
    prompts,
    customPrompts,
    addCustomPrompt,
    removeCustomPrompt,
    findPromptById,
    defaultPrompt,
  };
}
