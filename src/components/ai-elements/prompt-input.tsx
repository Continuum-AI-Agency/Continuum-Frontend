"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { ArrowUpIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, ImageIcon, Paperclip, Video, Workflow, X } from "lucide-react";

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
import {
  createMentionToken,
  type AgentMentionProvider,
  type AgentMentionReference,
  type AgentMentionSuggestion,
} from "@/lib/agent-references";

const URL_RE = /https?:\/\/[^\s<>"]+/g;

// All user-supplied strings are run through escapeHtml before entering the
// HTML string, so dangerouslySetInnerHTML on the mirror div is XSS-safe.
// Only hardcoded class names and <mark>/<br> tags are injected by this code.
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function processTextSegment(text: string): string {
  const urlParts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return urlParts
    .map((part, i) =>
      i % 2 === 1
        ? `<mark class="link-token">${escapeHtml(part)}</mark>`
        : escapeHtml(part).replace(/\n/g, "<br>")
    )
    .join("");
}

function buildHighlightHtml(value: string, tokens: string[]): string {
  if (tokens.length === 0) return processTextSegment(value);
  const pattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return value
    .split(new RegExp(`(${pattern})`, "g"))
    .map((part, i) =>
      i % 2 === 1
        ? `<mark class="mention-token">${escapeHtml(part)}</mark>`
        : processTextSegment(part)
    )
    .join("");
}

function extractLinkReferences(
  text: string,
  source: AgentMentionReference["source"]
): AgentMentionReference[] {
  const matches = [...text.matchAll(new RegExp(URL_RE.source, "g"))];
  return [...new Set(matches.map((m) => m[0]))].map((url) => ({
    id: url,
    type: "link" as const,
    label: url,
    source,
    metadata: { url },
  }));
}

type PromptInputProps = {
  onSubmit: (
    value: string,
    attachments: Attachment[],
    references: AgentMentionReference[]
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  actions?: React.ReactNode;
  className?: string;
  mentionProvider?: AgentMentionProvider;
  mentionSource?: AgentMentionReference["source"];
  queuedMentionSuggestions?: AgentMentionSuggestion[];
  onQueuedMentionSuggestionsConsumed?: () => void;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type TrackedReference = AgentMentionReference & {
  token: string;
  preview?: AgentMentionSuggestion["preview"];
};

function appendTranscript(base: string, incoming: string): string {
  const normalizedIncoming = incoming.trim();
  if (!normalizedIncoming) return base;
  if (!base.trim()) return normalizedIncoming;
  return `${base.trimEnd()} ${normalizedIncoming}`.replace(/\s+/g, " ");
}

function findActiveMention(value: string, caret: number): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;
  const previous = atIndex > 0 ? beforeCaret[atIndex - 1] : "";
  if (previous && !/[\s([{,;:]/.test(previous)) return null;
  const query = beforeCaret.slice(atIndex + 1);
  if (query.includes("\n")) return null;
  if (query.length > 80) return null;
  return { start: atIndex, end: caret, query };
}

function pruneReferencesForValue(
  references: TrackedReference[],
  value: string
): TrackedReference[] {
  const counts = new Map<string, number>();
  for (const reference of references) {
    const escaped = reference.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = value.match(new RegExp(escaped, "g"));
    counts.set(reference.token, matches?.length ?? 0);
  }

  const used = new Map<string, number>();
  return references.filter((reference) => {
    const current = used.get(reference.token) ?? 0;
    const available = counts.get(reference.token) ?? 0;
    if (current >= available) return false;
    used.set(reference.token, current + 1);
    return true;
  });
}

function ReferencePreviewThumb({
  preview,
  label,
  className,
}: {
  preview?: AgentMentionSuggestion["preview"];
  label: string;
  className?: string;
}) {
  const baseClass = cn(
    "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground",
    className
  );

  if (preview?.url && preview.kind === "video") {
    return (
      <video
        aria-label={label}
        className={cn(baseClass, "object-cover")}
        muted
        playsInline
        preload="metadata"
        src={preview.url}
      />
    );
  }

  if (preview?.url) {
    return (
      <span className={cn(baseClass, "relative")}>
        <Image
          alt={label}
          className="object-cover"
          fill
          sizes="36px"
          src={preview.url}
          unoptimized
        />
      </span>
    );
  }

  if (preview?.kind === "video") return <span className={baseClass}><Video className="size-4" /></span>;
  if (preview?.kind === "canvas") return <span className={baseClass}><Workflow className="size-4" /></span>;
  return <span className={baseClass}><ImageIcon className="size-4" /></span>;
}

function ReferencePreviewChips({
  references,
  onRemove,
}: {
  references: TrackedReference[];
  onRemove: (reference: TrackedReference) => void;
}) {
  if (references.length === 0) return null;

  return (
    <motion.div
      key="references"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-md border border-border/60 bg-card/80 p-2"
    >
      {references.map((reference, index) => (
        <span
          key={`${reference.type}:${reference.id}:${index}`}
          className="flex min-w-0 max-w-[15rem] items-center gap-2 rounded-md border border-border/60 bg-background/85 px-2 py-1.5"
        >
          <ReferencePreviewThumb
            preview={reference.preview}
            label={reference.preview?.label ?? reference.label}
          />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-foreground">{reference.label}</span>
            <span className="block text-[10px] uppercase text-muted-foreground">{reference.type}</span>
          </span>
          <button
            type="button"
            aria-label={`Remove ${reference.label}`}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => onRemove(reference)}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </motion.div>
  );
}

export function PromptInput({
  onSubmit,
  disabled,
  placeholder,
  actions,
  className,
  mentionProvider,
  mentionSource = "organic",
  queuedMentionSuggestions,
  onQueuedMentionSuggestionsConsumed,
}: PromptInputProps) {
  const [value, setValue] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [references, setReferences] = React.useState<TrackedReference[]>([]);
  const [activeMention, setActiveMention] = React.useState<ActiveMention | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = React.useState<AgentMentionSuggestion[]>([]);
  const [mentionParent, setMentionParent] = React.useState<AgentMentionSuggestion | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = React.useState(0);
  const [isListening, setIsListening] = React.useState(false);
  const [isSpeechProcessing, setIsSpeechProcessing] = React.useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const canSubmit = useMemo(
    () => Boolean(value.trim()) || attachments.length > 0,
    [attachments.length, value]
  );

  const highlightHtml = useMemo(() => {
    const tokens = [...new Set(references.map((r) => r.token))];
    return buildHighlightHtml(value, tokens);
  }, [value, references]);

  const syncMirrorScroll = useCallback(() => {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit || disabled) return;
      const trimmedValue = value.trim();
      const validReferences = pruneReferencesForValue(references, trimmedValue);
      const linkReferences = extractLinkReferences(trimmedValue, mentionSource);
      onSubmit(
        trimmedValue,
        attachments,
        [
          ...validReferences.map(({ token: _token, preview: _preview, ...reference }) => reference),
          ...linkReferences,
        ]
      );
      setValue("");
      setAttachments([]);
      setReferences([]);
      setActiveMention(null);
      setMentionParent(null);
      setMentionSuggestions([]);
    },
    [attachments, canSubmit, disabled, mentionSource, onSubmit, references, value]
  );

  useEffect(() => {
    let cancelled = false;
    if (!mentionProvider || !activeMention) {
      setMentionSuggestions([]);
      return;
    }

    const load = async () => {
      const nextSuggestions = mentionParent
        ? mentionProvider.getChildSuggestions
          ? await mentionProvider.getChildSuggestions(mentionParent, activeMention.query)
          : []
        : await mentionProvider.getSuggestions({ query: activeMention.query });

      if (cancelled) return;
      setMentionSuggestions(nextSuggestions.slice(0, 12));
      setHighlightedMentionIndex(0);
    };

    void load().catch(() => {
      if (!cancelled) setMentionSuggestions([]);
    });

    return () => {
      cancelled = true;
    };
  }, [activeMention, mentionParent, mentionProvider]);

  const updateValue = useCallback((nextValue: string, caret?: number) => {
    setValue(nextValue);
    setReferences((previous) => pruneReferencesForValue(previous, nextValue));
    const nextCaret = caret ?? textareaRef.current?.selectionStart ?? nextValue.length;
    const nextMention = findActiveMention(nextValue, nextCaret);
    setActiveMention(nextMention);
    if (!nextMention) {
      setMentionParent(null);
    }
  }, []);

  const appendMentionSuggestion = useCallback((suggestion: AgentMentionSuggestion) => {
    if (!suggestion.reference) return;
    const reference = suggestion.reference;
    const token = createMentionToken(reference.label);
    setValue((previous) => {
      const prefix = previous.trimEnd();
      const nextValue = `${prefix}${prefix ? " " : ""}${token} `;
      setReferences((current) =>
        pruneReferencesForValue(
          [...current, { ...reference, token, preview: suggestion.preview }],
          nextValue
        )
      );
      return nextValue;
    });
    setActiveMention(null);
    setMentionParent(null);
    setMentionSuggestions([]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!queuedMentionSuggestions?.length) return;
    queuedMentionSuggestions.forEach(appendMentionSuggestion);
    onQueuedMentionSuggestionsConsumed?.();
  }, [appendMentionSuggestion, onQueuedMentionSuggestionsConsumed, queuedMentionSuggestions]);

  const insertMention = useCallback(
    (suggestion: AgentMentionSuggestion) => {
      if (!activeMention || !suggestion.reference) return;
      const reference = suggestion.reference;
      const token = createMentionToken(reference.label);
      const afterMention = value.slice(activeMention.end);
      const insertedToken = `${token}${afterMention.length === 0 || !/^[\s.,;:!?)]/.test(afterMention) ? " " : ""}`;
      const nextValue = `${value.slice(0, activeMention.start)}${insertedToken}${afterMention}`;
      const nextCaret = activeMention.start + insertedToken.length;
      setValue(nextValue);
      setReferences((previous) =>
        pruneReferencesForValue(
          [...previous, { ...reference, token, preview: suggestion.preview }],
          nextValue
        )
      );
      setActiveMention(null);
      setMentionParent(null);
      setMentionSuggestions([]);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [activeMention, value]
  );

  const removeReference = useCallback((reference: TrackedReference) => {
    const escaped = reference.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenPattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
    const nextValue = value.replace(tokenPattern, " ").replace(/\s{2,}/g, " ").trimStart();
    let removed = false;
    const nextReferences = references.filter((candidate) => {
      if (!removed && candidate.id === reference.id && candidate.type === reference.type && candidate.token === reference.token) {
        removed = true;
        return false;
      }
      return true;
    });
    setValue(nextValue);
    setReferences(pruneReferencesForValue(nextReferences, nextValue));
    setActiveMention(null);
    setMentionParent(null);
  }, [references, value]);

  const selectMentionSuggestion = useCallback(
    (suggestion: AgentMentionSuggestion) => {
      if (suggestion.childrenLabel && mentionProvider?.getChildSuggestions) {
        setMentionParent(suggestion);
        setMentionSuggestions([]);
        setHighlightedMentionIndex(0);
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      insertMention(suggestion);
    },
    [insertMention, mentionProvider]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (activeMention && mentionSuggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlightedMentionIndex((current) => (current + 1) % mentionSuggestions.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlightedMentionIndex((current) =>
            current === 0 ? mentionSuggestions.length - 1 : current - 1
          );
          return;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          event.preventDefault();
          selectMentionSuggestion(mentionSuggestions[highlightedMentionIndex] ?? mentionSuggestions[0]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (mentionParent) {
            setMentionParent(null);
            return;
          }
          setActiveMention(null);
          setMentionSuggestions([]);
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [
      activeMention,
      handleSubmit,
      highlightedMentionIndex,
      mentionParent,
      mentionSuggestions,
      selectMentionSuggestion,
    ]
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
    setValue((previous) => {
      const nextValue = appendTranscript(previous, transcript);
      setReferences((current) => pruneReferencesForValue(current, nextValue));
      return nextValue;
    });
    setActiveMention(null);
    setMentionParent(null);
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
    <div className={cn("mx-auto w-full max-w-[1600px] px-4 md:px-6 lg:px-8", className)}>
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {references.length > 0 ? (
            <ReferencePreviewChips references={references} onRemove={removeReference} />
          ) : null}
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
          <div className="relative w-full">
            <div
              ref={mirrorRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3.5 text-sm leading-6 text-transparent"
              dangerouslySetInnerHTML={{ __html: highlightHtml }}
            />
            <InputGroupTextarea
              aria-label="Message Jaina Analyst"
              className={cn(
                "relative min-h-[74px] max-h-[160px] overflow-y-auto border-none bg-transparent py-3.5 text-sm leading-6 focus-visible:ring-0",
                "placeholder:text-muted-foreground/85"
              )}
              disabled={disabled}
              onChange={(event) => updateValue(event.target.value, event.target.selectionStart)}
              onKeyDown={handleKeyDown}
              onScroll={syncMirrorScroll}
              onSelect={(event) => {
                const target = event.currentTarget;
                setActiveMention(findActiveMention(target.value, target.selectionStart));
              }}
              placeholder={placeholder ?? "Ask Jaina..."}
              ref={textareaRef}
              value={value}
            />
          </div>
          {activeMention && mentionProvider && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-full max-w-[42rem] overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-xl">
              {mentionParent ? (
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{mentionParent.label}</div>
                    <div className="text-[11px] text-muted-foreground">{mentionParent.childrenLabel}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setMentionParent(null)}
                  >
                    Back
                  </button>
                </div>
              ) : null}
              <div className="max-h-72 overflow-y-auto p-1">
                {mentionSuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No references found.
                  </div>
                ) : (
                  mentionSuggestions.map((suggestion, index) =>
                    suggestion.isFolder ? (
                      <button
                        key={suggestion.key}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-left text-sm",
                          index === highlightedMentionIndex
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/70"
                        )}
                        onMouseEnter={() => setHighlightedMentionIndex(index)}
                        onClick={() => selectMentionSuggestion(suggestion)}
                      >
                        <span className="font-medium">{suggestion.label}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          {suggestion.childrenLabel}
                          <ChevronRight className="size-3" />
                        </span>
                      </button>
                    ) : (
                      <button
                        key={suggestion.key}
                        type="button"
                        className={cn(
                          "flex w-full items-start justify-between gap-3 rounded px-2.5 py-2 text-left text-sm",
                          index === highlightedMentionIndex
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/70"
                        )}
                        onMouseEnter={() => setHighlightedMentionIndex(index)}
                        onClick={() => selectMentionSuggestion(suggestion)}
                      >
                        <span className="flex min-w-0 flex-1 items-start gap-2">
                          {suggestion.preview ? (
                            <ReferencePreviewThumb
                              className="h-8 w-8"
                              label={suggestion.preview.label ?? suggestion.label}
                              preview={suggestion.preview}
                            />
                          ) : null}
                          <span className="min-w-0">
                          <span className="block truncate font-medium">{suggestion.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {suggestion.description ?? suggestion.group ?? suggestion.type}
                          </span>
                          </span>
                        </span>
                        <span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {suggestion.badge ?? suggestion.childrenLabel ?? suggestion.type}
                        </span>
                      </button>
                    )
                  )
                )}
              </div>
            </div>
          )}
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
