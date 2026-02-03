"use client";

import React, { useRef } from "react";
import { Button, TextArea, Box, Flex, IconButton } from "@radix-ui/themes";
import { ArrowUpIcon } from "@radix-ui/react-icons";
import { Paperclip } from "lucide-react";
import { Attachments, type Attachment } from "./attachments";

type PromptInputProps = {
  onSubmit: (value: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function PromptInput({ onSubmit, disabled, placeholder }: PromptInputProps) {
  const [value, setValue] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!value.trim() && attachments.length === 0) || disabled) return;
    onSubmit(value, attachments);
    setValue("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAttachments = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + " KB",
        type: file.type,
      }));
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <Box className="w-full max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8">
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
        <Attachments files={attachments} onRemove={removeAttachment} />
        
        <div className="relative">
          <TextArea
            size="3"
            variant="surface"
            placeholder={placeholder ?? "Ask Jaina..."}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="min-h-[56px] w-full resize-none rounded-2xl pr-24 pt-3 pb-3 text-white focus:ring-2 focus:ring-purple-500/20"
            aria-label="Message Jaina Analyst"
          />
          <Box className="absolute bottom-2 right-2 flex items-center gap-2">
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
            >
              <Paperclip width={18} height={18} />
            </IconButton>
            <Button
              size="2"
              variant="soft"
              color="purple"
              disabled={(!value.trim() && attachments.length === 0) || disabled}
              className="rounded-xl px-2 shadow-sm transition-all active:scale-95"
              aria-label="Send message"
            >
              <ArrowUpIcon width={18} height={18} />
            </Button>
          </Box>
        </div>
      </form>
    </Box>
  );
}
