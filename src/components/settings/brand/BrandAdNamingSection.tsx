"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Flex, Text, TextField } from "@radix-ui/themes";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import type { AdNamingSchemaConfig } from "@continuum/contracts";
import { updateBrandAdNamingSchemaAction } from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";

type AdNamingPlatform = "meta" | "google" | "all";

type BrandAdNamingSectionProps = {
  brandId: string;
  platform?: AdNamingPlatform;
  initial: AdNamingSchemaConfig | null;
  canEdit: boolean;
};

// Field labels are edited in place, so each needs a stable key independent of
// its (mutable) value — hence the { id, value } wrapper rather than a raw
// string list keyed by index.
type FieldItem = { id: string; value: string };

function makeFieldItem(value: string): FieldItem {
  return { id: Math.random().toString(36).slice(2), value };
}

export function BrandAdNamingSection({
  brandId,
  platform = "meta",
  initial,
  canEdit,
}: BrandAdNamingSectionProps) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [delimiter, setDelimiter] = useState(initial?.delimiter ?? "|");
  const [items, setItems] = useState<FieldItem[]>(() => (initial?.fields ?? []).map(makeFieldItem));

  const cleanedFields = items.map((item) => item.value.trim()).filter((value) => value.length > 0);
  const preview = cleanedFields.join(` ${delimiter} `);

  const updateItem = (id: string, value: string) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, value } : item)));
  const addItem = () => setItems((prev) => [...prev, makeFieldItem("")]);
  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const handleSave = () => {
    const trimmedDelimiter = delimiter.trim();
    if (!trimmedDelimiter) {
      show({ title: "Delimiter required", description: "Enter a delimiter such as | or _.", variant: "error" });
      return;
    }
    if (cleanedFields.length === 0) {
      show({ title: "Fields required", description: "Add at least one naming field.", variant: "error" });
      return;
    }
    if (new Set(cleanedFields).size !== cleanedFields.length) {
      show({ title: "Duplicate fields", description: "Each naming field must be unique.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        await updateBrandAdNamingSchemaAction({
          brandId,
          platform,
          delimiter: trimmedDelimiter,
          fields: cleanedFields,
        });
        show({
          title: "Naming convention saved",
          description: "Your ad naming taxonomy was updated.",
          variant: "success",
        });
      } catch (error) {
        show({
          title: "Save failed",
          description: error instanceof Error ? error.message : "Unable to save naming convention.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Flex direction="column" gap="4">
      <Text size="2" color="gray">
        Declare how you name ads on this platform — a delimiter plus an ordered list of field labels.
        Paid-media rows are parsed against it so insights can read an ad by its named parts.
      </Text>

      <Flex direction="column" gap="1" className="max-w-[160px]">
        <Text size="1" color="gray" weight="medium">
          Delimiter
        </Text>
        <TextField.Root
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value)}
          placeholder="|"
          disabled={!canEdit}
        />
      </Flex>

      <Flex direction="column" gap="2">
        <Flex align="center" justify="between">
          <Text size="1" color="gray" weight="medium">
            Fields (in order)
          </Text>
          <Button type="button" size="1" variant="soft" onClick={addItem} disabled={!canEdit}>
            <PlusIcon /> Add field
          </Button>
        </Flex>
        {items.length === 0 ? (
          <Text size="2" color="gray">
            No fields yet. Add labels like funnel, format, audience.
          </Text>
        ) : (
          items.map((item, index) => (
            <Flex key={item.id} align="center" gap="2">
              <Text size="1" color="gray" className="w-5 tabular-nums">
                {index + 1}
              </Text>
              <TextField.Root
                value={item.value}
                onChange={(event) => updateItem(item.id, event.target.value)}
                placeholder="Field label"
                className="flex-1"
                disabled={!canEdit}
              />
              <Button
                type="button"
                size="1"
                variant="ghost"
                color="red"
                onClick={() => removeItem(item.id)}
                disabled={!canEdit}
              >
                <TrashIcon /> Remove
              </Button>
            </Flex>
          ))
        )}
      </Flex>

      <Flex direction="column" gap="1">
        <Text size="1" color="gray" weight="medium">
          Preview
        </Text>
        <Text size="2" color="gray" className="font-mono">
          {preview || "—"}
        </Text>
      </Flex>

      <Flex>
        <Button type="button" onClick={handleSave} disabled={isPending || !canEdit}>
          Save naming convention
        </Button>
      </Flex>

      {!canEdit ? (
        <Callout.Root color="amber">
          <Callout.Text>Only brand owners or admins can edit the ad naming convention.</Callout.Text>
        </Callout.Root>
      ) : null}
    </Flex>
  );
}
