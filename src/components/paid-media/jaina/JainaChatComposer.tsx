"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpIcon } from "@radix-ui/react-icons";
import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import { useForm } from "react-hook-form";

import { jainaChatInputSchema, type JainaChatInputValues } from "@/lib/jaina/schemas";

type JainaChatComposerProps = {
  onSubmit: (values: JainaChatInputValues) => void;
  isStreaming: boolean;
  disabled?: boolean;
  suggestions?: string[];
};

export function JainaChatComposer({
  onSubmit,
  isStreaming,
  disabled,
  suggestions = [],
}: JainaChatComposerProps) {
  const form = useForm<JainaChatInputValues>({
    resolver: zodResolver(jainaChatInputSchema),
    defaultValues: { query: "" },
    mode: "onChange",
  });

  const { register, handleSubmit, formState, reset, setValue } = form;

  const submit = handleSubmit((values) => {
    onSubmit(values);
    reset({ query: "" });
  });

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium">Ask a paid media question</Text>
        <TextArea
          size="3"
          placeholder="What changed last week and what should we do next?"
          disabled={disabled || isStreaming}
          {...register("query")}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {formState.errors.query ? (
          <Text size="1" color="red">
            {formState.errors.query.message}
          </Text>
        ) : null}
      </Flex>

      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Flex gap="2" wrap="wrap">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setValue("query", suggestion, { shouldDirty: true, shouldValidate: true })}
              className="rounded-full border border-white/10 bg-muted/30 px-3 py-1 text-xs text-secondary transition hover:border-brand-primary/40 hover:text-primary"
            >
              {suggestion}
            </button>
          ))}
        </Flex>
        <Button
          type="button"
          disabled={disabled || isStreaming || !formState.isValid}
          onClick={() => void submit()}
          className="gap-2"
        >
          <ArrowUpIcon />
          {isStreaming ? "Streaming…" : "Send"}
        </Button>
      </Flex>
    </Flex>
  );
}
