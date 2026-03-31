"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { ArrowUpIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Paperclip } from "lucide-react";

import { Attachments, type Attachment } from "./attachments";
import { SpeechInput } from "./speech-input";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { streamJainaSpeechToText } from "@/lib/jaina/speech";

type PromptInputProps = {
  onSubmit: (value: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  actions?: React.ReactNode;
};

function appendTranscript(base: string, incoming: string): string {
  const normalizedIncoming = incoming.trim();
  if (!normalizedIncoming) return base;
  if (!base.trim()) return normalizedIncoming;
  return `${base.trimEnd()} ${normalizedIncoming}`.replace(/\s+/g, " ");
}

export function PromptInput({
  onSubmit,
  disabled,
  placeholder,
  actions,
}: PromptInputProps) {
  const [value, setValue] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [isListening, setIsListening] = React.useState(false);
  const [isSpeechProcessing, setIsSpeechProcessing] = React.useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const canSubmit = useMemo(
    () => Boolean(value.trim()) || attachments.length > 0,
    [attachments.length, value]
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit || disabled) return;
      onSubmit(value, attachments);
      setValue("");
      setAttachments([]);
    },
    [attachments, canSubmit, disabled, onSubmit, value]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const newAttachments = Array.from(event.target.files).map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: file.type,
    }));
    setAttachments((previous) => [...previous, ...newAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== id));
  }, []);

  const handleSpeechResult = useCallback((transcript: string) => {
    setValue((previous) => appendTranscript(previous, transcript));
  }, []);

  const handleAudioRecorded = useCallback(async (audioBlob: Blob) => {
    setIsSpeechProcessing(true);
    try {
      return await streamJainaSpeechToText({
        audioBlob,
        languageCode: "en-US",
        model: "chirp_3",
      });
    } finally {
      setIsSpeechProcessing(false);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 md:px-6 lg:px-8">
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {attachments.length > 0 ? (
            <motion.div
              key="attachments"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            >
              <Attachments files={attachments} onRemove={removeAttachment} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <InputGroup
          className={cn(
            "border-border/70 bg-card/75 backdrop-blur-sm",
            "shadow-[0_10px_30px_-22px_color-mix(in_oklch,var(--color-indigo-600)_45%,transparent)]"
          )}
          isProcessing={isSpeechProcessing}
          isRecording={isListening}
        >
          <InputGroupTextarea
            aria-label="Message Jaina Analyst"
            className={cn(
              "min-h-[74px] border-none bg-transparent py-3.5 text-sm leading-6 focus-visible:ring-0",
              "placeholder:text-muted-foreground/85"
            )}
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Ask Jaina..."}
            value={value}
          />
          <InputGroupAddon
            align="block-end"
            className="w-full border-t border-border/60 py-2.5"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <div className="min-h-5">
                <AnimatePresence initial={false}>
                  {isListening ? (
                    <motion.div
                      key="listening"
                      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                    >
                      <InputGroupText className="text-[11px] uppercase tracking-[0.12em] text-rose-500">
                        Recording
                      </InputGroupText>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <motion.div
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
              >
                {actions}

                <SpeechInput
                  aria-label="Dictate message"
                  className={cn(
                    "h-8 w-8 border border-border/65 bg-background text-foreground hover:bg-accent",
                    "focus-visible:ring-2 focus-visible:ring-ring/40"
                  )}
                  onAudioRecorded={handleAudioRecorded}
                  onListeningChange={setIsListening}
                  onTranscriptionChange={handleSpeechResult}
                  preferStreamingTranscription
                  size="icon"
                  type="button"
                  variant="ghost"
                />

                <input
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  type="file"
                />
                <InputGroupButton
                  aria-label="Attach files"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Paperclip className="size-4" />
                </InputGroupButton>

                <Button
                  aria-label="Send message"
                  className="h-8 rounded-lg px-2.5"
                  disabled={!canSubmit || disabled}
                  size="icon"
                  type="submit"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              </motion.div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
