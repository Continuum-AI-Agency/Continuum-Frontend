"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { TrashIcon, PlusIcon, CheckIcon } from "@radix-ui/react-icons";

import type { PromptDefinition, PromptFormValue } from "@/lib/organic/prompts";

type PromptSelectorProps = {
  prompts: PromptDefinition[];
  value: PromptFormValue;
  onChange: (prompt: PromptDefinition) => void;
  onCreatePrompt: (input: { name: string; description?: string; content: string; category?: string }) => PromptDefinition;
  onDeletePrompt: (promptId: string) => void;
};

export function PromptSelector({ prompts, value, onChange, onCreatePrompt, onDeletePrompt }: PromptSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Custom");
  const [content, setContent] = useState("");

  const groupedPrompts = useMemo(() => {
    return prompts.reduce<Record<string, PromptDefinition[]>>((acc, prompt) => {
      const key = prompt.category ?? "General";
      if (!acc[key]) acc[key] = [];
      acc[key].push(prompt);
      return acc;
    }, {});
  }, [prompts]);

  const handleSelect = useCallback(
    (prompt: PromptDefinition) => {
      onChange(prompt);
    },
    [onChange]
  );

  const handleCreate = useCallback(() => {
    const newPrompt = onCreatePrompt({ name, description, content, category });
    handleSelect(newPrompt);
    setName("");
    setDescription("");
    setCategory("Custom");
    setContent("");
    setIsCreating(false);
  }, [category, content, description, handleSelect, name, onCreatePrompt]);

  const selectedId = value?.id;

  return (
    <Card>
      <Box p="4" className="space-y-4">
        <Flex justify="between" align="center" wrap="wrap" gap="2">
          <Heading size="4">Prompt Strategy</Heading>
          <Button variant="soft" size="1" onClick={() => setIsCreating((prev) => !prev)}>
            <PlusIcon /> {isCreating ? "Close" : "Create Prompt"}
          </Button>
        </Flex>

        {isCreating && (
          <Card variant="surface">
            <Box p="3" className="space-y-3">
              <Flex gap="3" direction={{ initial: "column", sm: "row" }}>
                <TextField.Root
                  placeholder="Prompt name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="flex-1"
                />
                <TextField.Root
                  placeholder="Category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full sm:w-[180px]"
                />
              </Flex>
              <TextField.Root
                placeholder="Short description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <TextArea
                rows={5}
                placeholder="Enter the guiding prompt that the agent should follow."
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <Flex justify="end" gap="2">
                <Button variant="outline" color="gray" size="2" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button
                  size="2"
                  disabled={!name.trim() || !content.trim()}
                  onClick={handleCreate}
                >
                  <CheckIcon /> Save Prompt
                </Button>
              </Flex>
            </Box>
          </Card>
        )}

        <Flex direction="column" gap="4">
          {Object.entries(groupedPrompts).map(([categoryName, categoryPrompts]) => (
            <Box key={categoryName} className="space-y-2">
              <Flex align="center" gap="2">
                <Heading size="3">{categoryName}</Heading>
                <Badge color="gray" size="1">
                  {categoryPrompts.length}
                </Badge>
              </Flex>
              <Grid columns={{ initial: "1", md: "2" }} gap="3">
                {categoryPrompts.map((prompt) => {
                  const isSelected = prompt.id === selectedId;
                  return (
                    <Card
                      key={prompt.id}
                      className={`cursor-pointer transition ${
                        isSelected ? "border-violet-500 shadow-lg" : "border-gray-200 dark:border-gray-800"
                      }`}
                      onClick={() => handleSelect(prompt)}
                    >
                      <Box p="3" className="space-y-2">
                        <Flex justify="between" align="center">
                          <Text weight="medium">{prompt.name}</Text>
                          <Badge color={prompt.source === "custom" ? "violet" : "gray"} size="1">
                            {prompt.source === "custom" ? "Custom" : "Preset"}
                          </Badge>
                        </Flex>
                        {prompt.description && (
                          <Text size="1" color="gray">
                            {prompt.description}
                          </Text>
                        )}
                        <Text size="2" className="whitespace-pre-wrap">
                          {prompt.content}
                        </Text>
                        {prompt.source === "custom" && (
                          <Flex justify="end">
                            <Button
                              size="1"
                              variant="ghost"
                              color="red"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeletePrompt(prompt.id);
                              }}
                            >
                              <TrashIcon /> Remove
                            </Button>
                          </Flex>
                        )}
                      </Box>
                    </Card>
                  );
                })}
              </Grid>
            </Box>
          ))}
        </Flex>
      </Box>
    </Card>
  );
}
