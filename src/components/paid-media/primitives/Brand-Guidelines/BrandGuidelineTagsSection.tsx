"use client";

import { Controller, useFieldArray, type Control, type FieldArrayPath } from "react-hook-form";
import { Badge, Button, Card, Flex, Grid, Text, TextArea, TextField } from "@radix-ui/themes";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";

import type { BrandGuidelineDraft } from "@/lib/schemas/brandGuidelines";

const TAG_LIMIT = 5;

type BrandGuidelineTagsSectionProps = {
  title: string;
  helper?: string;
  name: FieldArrayPath<BrandGuidelineDraft>;
  control: Control<BrandGuidelineDraft>;
};

export function BrandGuidelineTagsSection({ title, helper, name, control }: BrandGuidelineTagsSectionProps) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const count = fields.length;

  return (
    <Card variant="surface" className="border border-[var(--glass-border)]">
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" wrap="wrap" gap="2">
          <Flex align="center" gap="2">
            <Text weight="medium">{title} tags</Text>
            <Badge radius="full" variant="surface" color="gray">
              {count}/{TAG_LIMIT}
            </Badge>
          </Flex>
          <Button
            type="button"
            size="1"
            variant="soft"
            onClick={() => append({ label: "", description: "" })}
            disabled={count >= TAG_LIMIT}
          >
            <PlusIcon /> Add tag
          </Button>
        </Flex>
        {helper ? (
          <Text size="1" color="gray">
            {helper}
          </Text>
        ) : null}
        {count === 0 ? (
          <Text size="2" color="gray">
            No tags yet. Add 3-5 curated tags for this section.
          </Text>
        ) : (
          <Grid columns={{ initial: "1", md: "2" }} gap="3">
            {fields.map((field, index) => (
              <Card
                key={field.id}
                variant="surface"
                className="border border-[var(--glass-border)] p-3"
              >
                <Flex direction="column" gap="2">
                  <Flex align="center" justify="between">
                    <Text size="2" weight="medium">
                      Tag {index + 1}
                    </Text>
                    <Button
                      type="button"
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => remove(index)}
                    >
                      <TrashIcon /> Remove
                    </Button>
                  </Flex>
                  <Controller
                    control={control}
                    name={`${name}.${index}.label` as const}
                    render={({ field: input }) => (
                      <TextField.Root
                        {...input}
                        placeholder="Tag label"
                        value={input.value ?? ""}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`${name}.${index}.description` as const}
                    render={({ field: input }) => (
                      <TextArea
                        {...input}
                        placeholder="Longer description for semantic retrieval"
                        value={input.value ?? ""}
                        rows={3}
                      />
                    )}
                  />
                </Flex>
              </Card>
            ))}
          </Grid>
        )}
      </Flex>
    </Card>
  );
}
