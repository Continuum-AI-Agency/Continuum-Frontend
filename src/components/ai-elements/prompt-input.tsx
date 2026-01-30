"use client";

import React from "react";
import { Button, TextArea, Box, Flex } from "@radix-ui/themes";
import { ArrowUpIcon } from "@radix-ui/react-icons";

type PromptInputProps = {
  onSubmit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function PromptInput({ onSubmit, disabled, placeholder }: PromptInputProps) {
  const [value, setValue] = React.useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Box className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <TextArea
          size="3"
          variant="surface"
          placeholder={placeholder ?? "Ask Jaina..."}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="min-h-[56px] w-full resize-none rounded-2xl pr-12 pt-3 pb-3 text-white focus:ring-2 focus:ring-purple-500/20"
        />
        <Box className="absolute bottom-2 right-2">
          <Button
            size="2"
            variant="soft"
            color="purple"
            disabled={!value.trim() || disabled}
            className="rounded-xl px-2 shadow-sm transition-all active:scale-95"
          >
            <ArrowUpIcon width={18} height={18} />
          </Button>
        </Box>
      </form>
    </Box>
  );
}
