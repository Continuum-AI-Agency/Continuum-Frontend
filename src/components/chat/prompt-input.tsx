'use client';

import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  type AgentMentionProvider,
  type AgentMentionReference,
  type AgentMentionSuggestion,
  createMentionToken,
} from '@/lib/agent-references';
import { streamJainaSpeechToText } from '@/lib/jaina/speech';
import { cn } from '@/lib/utils';
import { type Attachment, Attachments } from './attachments';
import { MentionPickerMenu, type MentionPlatformOption } from './mention-picker-menu';
import type { MentionAnalyticsContext } from './mention-suggestion-hover';
import { SpeechInput } from './speech-input';
import { ACCEPTED_ATTACHMENT_TYPES, type ChatAttachmentsController } from './useChatAttachments';

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const CHIP_ATTR = 'data-mention-chip';
const CHIP_REF_ATTR = 'data-mention-ref-key';

function extractLinkReferences(
  text: string,
  source: AgentMentionReference['source'],
): AgentMentionReference[] {
  const matches = [...text.matchAll(new RegExp(URL_RE.source, 'g'))];
  return [...new Set(matches.map((m) => m[0]))].map((url) => ({
    id: url,
    type: 'link' as const,
    label: url,
    source,
    metadata: { url },
  }));
}

type PromptInputProps = {
  onSubmit: (value: string, attachments: Attachment[], references: AgentMentionReference[]) => void;
  // Attachment state lives with the surface, which owns the brand and session that decide where an
  // upload lands. The composer only drives it. Build one with useChatAttachments.
  attachments?: ChatAttachmentsController;
  attachmentOnlyPrompt?: string;
  variant?: 'chat' | 'canvas';
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  actions?: React.ReactNode;
  className?: string;
  mentionProvider?: AgentMentionProvider;
  mentionSource?: AgentMentionReference['source'];
  queuedMentionSuggestions?: AgentMentionSuggestion[];
  onQueuedMentionSuggestionsConsumed?: () => void;
  /**
   * Plain text to drop into the editor at the caret — the prompt library's channel.
   * A saved prompt is text the user would otherwise have typed, so it lands as ordinary
   * editable text rather than as a chip: there is no reference for the Backend to resolve.
   */
  queuedText?: string | null;
  onQueuedTextConsumed?: () => void;
  /**
   * When the user selects a multi-ref pack (e.g. KPIs › Packs › Grow followers),
   * expand it into concrete metric chips instead of inserting a single pack atom.
   * Return null/empty to fall through to normal single-chip insert.
   */
  expandPackSuggestion?: (
    suggestion: AgentMentionSuggestion,
  ) => AgentMentionSuggestion[] | null | undefined;
  /** Enables KPI/pack hover charts in the context grabber. */
  mentionAnalytics?: MentionAnalyticsContext | null;
  /** Connected platforms for the in-menu platform filter widget. */
  mentionPlatforms?: MentionPlatformOption[];
  mentionPlatform?: string | null;
  onMentionPlatformChange?: (platformId: string) => void;
  // While a turn is streaming, the submit button becomes a stop button that
  // calls onStop (the consumer aborts its stream). Stays enabled so the user
  // can always interrupt a running turn.
  isStreaming?: boolean;
  onStop?: () => void;
};

type ActiveMention = {
  /** Character offset of `@` within the serialized plain text. */
  start: number;
  end: number;
  query: string;
};

type TrackedReference = AgentMentionReference & {
  token: string;
  preview?: AgentMentionSuggestion['preview'];
  /** Stable key tying the chip DOM node to this reference instance. */
  refKey: string;
};

function appendTranscript(base: string, incoming: string): string {
  const normalizedIncoming = incoming.trim();
  if (!normalizedIncoming) return base;
  if (!base.trim()) return normalizedIncoming;
  return `${base.trimEnd()} ${normalizedIncoming}`.replace(/\s+/g, ' ');
}

function newRefKey(): string {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Serializes the contenteditable DOM into plain text (chips → `@label`) and the
 * ordered list of structured references still present as chips.
 */
function serializeEditor(
  root: HTMLElement,
  catalog: Map<string, TrackedReference>,
): { text: string; references: TrackedReference[] } {
  let text = '';
  const references: TrackedReference[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.getAttribute(CHIP_ATTR) === 'true') {
      const key = el.getAttribute(CHIP_REF_ATTR) ?? '';
      const tracked = catalog.get(key);
      if (tracked) {
        text += tracked.token;
        references.push(tracked);
      } else {
        text += el.getAttribute('data-mention-label')
          ? createMentionToken(el.getAttribute('data-mention-label') ?? '')
          : '';
      }
      return;
    }
    if (el.tagName === 'BR') {
      text += '\n';
      return;
    }
    if (el.tagName === 'DIV' || el.tagName === 'P') {
      // Block boundaries become newlines (except leading).
      if (text.length > 0 && !text.endsWith('\n')) text += '\n';
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  // contenteditable often ends with a trailing newline from a final empty block.
  return { text: text.replace(/\u00a0/g, ' '), references };
}

function findActiveMentionInText(
  value: string,
  caret: number,
  completedTokens: string[] = [],
): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  // Walk every `@` before the caret from right to left; skip ones that start a
  // completed chip token (`@Label`) so typing after an existing chip does not
  // reopen the picker on that chip's token.
  let searchFrom = beforeCaret.length;
  while (searchFrom > 0) {
    const atIndex = beforeCaret.lastIndexOf('@', searchFrom - 1);
    if (atIndex < 0) return null;
    const isCompleted = completedTokens.some(
      (token) => value.slice(atIndex, atIndex + token.length) === token,
    );
    if (isCompleted) {
      searchFrom = atIndex;
      continue;
    }
    const previous = atIndex > 0 ? beforeCaret[atIndex - 1] : '';
    if (previous && !/[\s([{,;:]/.test(previous)) {
      searchFrom = atIndex;
      continue;
    }
    const query = beforeCaret.slice(atIndex + 1);
    if (query.includes('\n') || query.length > 80) {
      searchFrom = atIndex;
      continue;
    }
    return { start: atIndex, end: caret, query };
  }
  return null;
}

/**
 * Maps a plain-text caret offset (as produced by serializeEditor) back to a
 * DOM selection point inside the contenteditable.
 */
function setCaretFromPlainOffset(root: HTMLElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  let remaining = Math.max(0, targetOffset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  // TreeWalker starts at root; advance into children.
  node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.getAttribute(CHIP_ATTR) === 'true') {
        const tokenLen = (el.getAttribute('data-mention-token') ?? '').length;
        if (remaining <= tokenLen) {
          // Place caret after the chip when landing inside its token span.
          const range = document.createRange();
          range.setStartAfter(el);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        remaining -= tokenLen;
        // Skip chip's descendants.
        walker.nextSibling();
        node = walker.nextNode();
        continue;
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= len;
    }
    node = walker.nextNode();
  }

  // Fallback: end of editor.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function plainOffsetFromSelection(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;

  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);

  // Count text + chip tokens in the pre-caret fragment.
  const frag = pre.cloneContents();
  const holder = document.createElement('div');
  holder.appendChild(frag);
  // Chips in the fragment still carry data-mention-token.
  let offset = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.getAttribute(CHIP_ATTR) === 'true') {
      offset += (el.getAttribute('data-mention-token') ?? '').length;
      return;
    }
    if (el.tagName === 'BR') {
      offset += 1;
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };
  for (const child of Array.from(holder.childNodes)) walk(child);
  return offset;
}

/** Builds a contentEditable=false chip element for a tracked reference. */
function buildChipElement(tracked: TrackedReference): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute(CHIP_ATTR, 'true');
  chip.setAttribute(CHIP_REF_ATTR, tracked.refKey);
  chip.setAttribute('data-mention-token', tracked.token);
  chip.setAttribute('data-mention-label', tracked.label);
  chip.setAttribute('contenteditable', 'false');
  chip.setAttribute('role', 'inline');
  chip.className = 'inline-mention-chip';
  chip.title = `${tracked.type}: ${tracked.label}`;

  // Thumb
  const thumb = document.createElement('span');
  thumb.className = 'inline-mention-chip__thumb';
  if (tracked.preview?.url) {
    const img = document.createElement('img');
    img.src = tracked.preview.url;
    img.alt = '';
    img.className = 'inline-mention-chip__img';
    thumb.appendChild(img);
  } else {
    thumb.classList.add('inline-mention-chip__thumb--icon');
    thumb.textContent =
      tracked.type === 'skill'
        ? '✦'
        : tracked.type === 'document'
          ? '◈'
          : tracked.type === 'creative_insight' ||
              tracked.type === 'organic_insight' ||
              tracked.type === 'kpi'
            ? '↗'
            : tracked.type === 'trend' || tracked.type === 'event'
              ? '△'
              : '●';
  }
  chip.appendChild(thumb);

  const label = document.createElement('span');
  label.className = 'inline-mention-chip__label';
  label.textContent = tracked.label;
  chip.appendChild(label);

  return chip;
}

function insertChipAtSelection(
  root: HTMLElement,
  tracked: TrackedReference,
  replaceFromPlainOffset: number | null,
  replaceToPlainOffset: number | null,
): void {
  root.focus();
  if (replaceFromPlainOffset != null && replaceToPlainOffset != null) {
    setCaretFromPlainOffset(root, replaceFromPlainOffset);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      // Extend selection to cover the @query span.
      const startRange = selection.getRangeAt(0);
      setCaretFromPlainOffset(root, replaceToPlainOffset);
      const endRange = selection.getRangeAt(0);
      startRange.setEnd(endRange.startContainer, endRange.startOffset);
      selection.removeAllRanges();
      selection.addRange(startRange);
      startRange.deleteContents();
    }
  }

  const selection = window.getSelection();
  const range =
    selection && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : (() => {
          const r = document.createRange();
          r.selectNodeContents(root);
          r.collapse(false);
          return r;
        })();

  const chip = buildChipElement(tracked);
  range.insertNode(chip);

  // Trailing space after chip so typing continues cleanly.
  const space = document.createTextNode('\u00a0');
  chip.after(space);

  const after = document.createRange();
  after.setStartAfter(space);
  after.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(after);
}

// Inserts plain text at the caret, falling back to the end of the editor when the caret
// is elsewhere on the page (the picker's popover steals focus, so that is the common case).
function insertTextAtSelection(root: HTMLElement, text: string): void {
  root.focus();
  const selection = window.getSelection();
  const caretIsInEditor =
    selection && selection.rangeCount > 0 && root.contains(selection.anchorNode);
  const range = caretIsInEditor
    ? selection.getRangeAt(0)
    : (() => {
        const r = document.createRange();
        r.selectNodeContents(root);
        r.collapse(false);
        return r;
      })();

  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);

  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(after);
}

export function PromptInput({
  onSubmit,
  attachments,
  disabled,
  placeholder,
  ariaLabel = 'Message input',
  actions,
  className,
  mentionProvider,
  mentionSource = 'organic',
  queuedMentionSuggestions,
  onQueuedMentionSuggestionsConsumed,
  queuedText,
  onQueuedTextConsumed,
  expandPackSuggestion,
  mentionAnalytics,
  mentionPlatforms,
  mentionPlatform,
  onMentionPlatformChange,
  isStreaming = false,
  onStop,
  variant = 'chat',
  attachmentOnlyPrompt,
}: PromptInputProps) {
  const [plainValue, setPlainValue] = React.useState('');
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [references, setReferences] = React.useState<TrackedReference[]>([]);
  const referencesRef = useRef<Map<string, TrackedReference>>(new Map());
  const [activeMention, setActiveMention] = React.useState<ActiveMention | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = React.useState<AgentMentionSuggestion[]>([]);
  // A stack so nested folders (e.g. Media > Media library > Uploads) can pop
  // back one level at a time instead of jumping straight to the root.
  const [mentionParentStack, setMentionParentStack] = React.useState<AgentMentionSuggestion[]>([]);
  const mentionParent = mentionParentStack[mentionParentStack.length - 1] ?? null;
  const [highlightedMentionIndex, setHighlightedMentionIndex] = React.useState(0);
  const [isListening, setIsListening] = React.useState(false);
  const [isSpeechProcessing, setIsSpeechProcessing] = React.useState(false);
  const [isEmpty, setIsEmpty] = React.useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const syncFromEditor = useCallback(() => {
    const root = editorRef.current;
    if (!root) return { text: '', references: [] as TrackedReference[] };
    const serialized = serializeEditor(root, referencesRef.current);
    // Drop catalog entries for chips that were deleted.
    const liveKeys = new Set(serialized.references.map((r) => r.refKey));
    for (const key of Array.from(referencesRef.current.keys())) {
      if (!liveKeys.has(key)) referencesRef.current.delete(key);
    }
    setPlainValue(serialized.text);
    setReferences(serialized.references);
    setIsEmpty(serialized.text.trim().length === 0 && serialized.references.length === 0);
    return serialized;
  }, []);

  // Holding submit until every upload settles is what stops the old failure: a chip whose file was
  // never uploaded serialized to an attachment with no url, and the agent silently received none.
  const canSubmit = useMemo(
    () =>
      !(attachments?.isUploading ?? false) &&
      !(attachments?.hasErrors ?? false) &&
      (Boolean(plainValue.trim()) || (attachments?.files.length ?? 0) > 0 || references.length > 0),
    [
      attachments?.files.length,
      attachments?.hasErrors,
      attachments?.isUploading,
      plainValue,
      references.length,
    ],
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      if (!canSubmit || disabled) return;
      const serialized = syncFromEditor();
      const trimmedValue = serialized.text.trim();
      const submittedAttachments = attachments?.files ?? [];
      const submittedValue =
        trimmedValue ||
        (submittedAttachments.some((attachment) => attachment.status === 'ready')
          ? (attachmentOnlyPrompt ?? '')
          : '');
      const linkReferences = extractLinkReferences(submittedValue, mentionSource);
      onSubmit(submittedValue, submittedAttachments, [
        ...serialized.references.map(({ token: _t, preview, refKey: _k, ...reference }) => {
          // Fold composer preview into metadata so history can render inline media
          // thumbs + hover cards without a re-fetch.
          if (!preview?.url) return reference;
          return {
            ...reference,
            metadata: {
              ...reference.metadata,
              previewUrl: preview.url,
              previewKind: preview.kind ?? reference.metadata?.kind ?? null,
            },
          };
        }),
        ...linkReferences,
      ]);
      attachments?.clear();
      setReferences([]);
      referencesRef.current.clear();
      setPlainValue('');
      setIsEmpty(true);
      setActiveMention(null);
      setMentionParentStack([]);
      setMentionSuggestions([]);
      if (editorRef.current) editorRef.current.innerHTML = '';
    },
    [
      attachmentOnlyPrompt,
      attachments,
      canSubmit,
      disabled,
      mentionSource,
      onSubmit,
      syncFromEditor,
    ],
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
    // mentionPlatform is intentional: KPI/insights re-fetch when the filter chip changes.
  }, [activeMention, mentionParent, mentionPlatform, mentionProvider]);

  const refreshActiveMention = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const serialized = syncFromEditor();
    const caret = plainOffsetFromSelection(root);
    const completedTokens = serialized.references.map((r) => r.token);
    const next = findActiveMentionInText(serialized.text, caret, completedTokens);
    setActiveMention(next);
    if (!next) setMentionParentStack([]);
  }, [syncFromEditor]);

  const insertTrackedMention = useCallback(
    (suggestion: AgentMentionSuggestion, replaceActive: boolean) => {
      if (!suggestion.reference || !editorRef.current) return;
      const reference = suggestion.reference;
      const token = createMentionToken(reference.label);
      const refKey = newRefKey();
      const tracked: TrackedReference = {
        ...reference,
        token,
        preview: suggestion.preview,
        refKey,
      };
      referencesRef.current.set(refKey, tracked);

      const active = replaceActive ? activeMention : null;
      insertChipAtSelection(editorRef.current, tracked, active?.start ?? null, active?.end ?? null);

      setActiveMention(null);
      setMentionParentStack([]);
      setMentionSuggestions([]);
      syncFromEditor();
      requestAnimationFrame(() => editorRef.current?.focus());
    },
    [activeMention, syncFromEditor],
  );

  const appendMentionSuggestion = useCallback(
    (suggestion: AgentMentionSuggestion) => {
      insertTrackedMention(suggestion, false);
    },
    [insertTrackedMention],
  );

  useEffect(() => {
    if (!queuedMentionSuggestions?.length) return;
    queuedMentionSuggestions.forEach(appendMentionSuggestion);
    onQueuedMentionSuggestionsConsumed?.();
  }, [appendMentionSuggestion, onQueuedMentionSuggestionsConsumed, queuedMentionSuggestions]);

  useEffect(() => {
    if (!queuedText || !editorRef.current) return;
    insertTextAtSelection(editorRef.current, queuedText);
    syncFromEditor();
    onQueuedTextConsumed?.();
  }, [queuedText, onQueuedTextConsumed, syncFromEditor]);

  const selectMentionSuggestion = useCallback(
    (suggestion: AgentMentionSuggestion) => {
      if (suggestion.childrenLabel && mentionProvider?.getChildSuggestions) {
        setMentionParentStack((stack) => [...stack, suggestion]);
        setMentionSuggestions([]);
        setHighlightedMentionIndex(0);
        requestAnimationFrame(() => editorRef.current?.focus());
        return;
      }
      const expanded = expandPackSuggestion?.(suggestion);
      if (expanded && expanded.length > 0) {
        // Multi-insert pack: clear the @query once, then append each metric chip.
        for (const item of expanded) {
          insertTrackedMention(item, item === expanded[0]);
        }
        setActiveMention(null);
        setMentionParentStack([]);
        setMentionSuggestions([]);
        return;
      }
      insertTrackedMention(suggestion, true);
    },
    [expandPackSuggestion, insertTrackedMention, mentionProvider],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (activeMention && mentionSuggestions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setHighlightedMentionIndex((current) => (current + 1) % mentionSuggestions.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setHighlightedMentionIndex((current) =>
            current === 0 ? mentionSuggestions.length - 1 : current - 1,
          );
          return;
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          event.preventDefault();
          selectMentionSuggestion(
            mentionSuggestions[highlightedMentionIndex] ?? mentionSuggestions[0],
          );
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (mentionParent) {
            setMentionParentStack((stack) => stack.slice(0, -1));
            return;
          }
          setActiveMention(null);
          setMentionSuggestions([]);
          return;
        }
      }

      if (event.key === 'Enter' && !event.shiftKey) {
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
    ],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      attachments?.add(event.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [attachments],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (pasted.length === 0) return;
      // A pasted screenshot must not also land in the contenteditable as an <img> node.
      event.preventDefault();
      if (attachments) attachments.add(pasted);
      else event.preventDefault();
    },
    [attachments],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLFormElement>) => {
      if (!attachments || disabled || !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      setIsDraggingOver(true);
    },
    [attachments, disabled],
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLFormElement>) => {
    // Ignore the flurry of leave events fired while crossing child nodes.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLFormElement>) => {
      if (!attachments || disabled) return;
      const dropped = Array.from(event.dataTransfer.files ?? []);
      event.preventDefault();
      setIsDraggingOver(false);
      if (dropped.length > 0) attachments.add(dropped);
    },
    [attachments, disabled],
  );

  const handleSpeechResult = useCallback(
    (transcript: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.focus();
      const selection = window.getSelection();
      const text = appendTranscript('', transcript);
      // Append at caret (or end).
      if (selection && selection.rangeCount > 0 && root.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.insertNode(document.createTextNode(text.startsWith(' ') ? text : ` ${text}`));
        range.collapse(false);
      } else {
        root.appendChild(document.createTextNode(text));
      }
      syncFromEditor();
      setActiveMention(null);
      setMentionParentStack([]);
    },
    [syncFromEditor],
  );

  const handleAudioRecorded = useCallback(async (audioBlob: Blob) => {
    setIsSpeechProcessing(true);
    try {
      return await streamJainaSpeechToText({
        audioBlob,
        languageCode: 'en-US',
        model: 'chirp_3',
      });
    } finally {
      setIsSpeechProcessing(false);
    }
  }, []);

  return (
    <div
      className={cn(
        variant === 'canvas' ? 'w-full' : 'mx-auto w-full max-w-[1600px] px-4 md:px-6 lg:px-8',
        className,
      )}
    >
      <form
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {(attachments?.files.length ?? 0) > 0 ? (
            <motion.div
              key="attachments"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            >
              <Attachments
                files={attachments?.files ?? []}
                onRemove={attachments?.remove ?? (() => undefined)}
                onRetry={(id) => void attachments?.retry(id)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <InputGroup
          className={cn(
            'border-border/70 bg-card/75 backdrop-blur-sm',
            'shadow-[0_10px_30px_-22px_color-mix(in_oklch,var(--color-indigo-600)_45%,transparent)]',
            isDraggingOver && 'border-primary/70 ring-2 ring-primary/30',
          )}
          isProcessing={isSpeechProcessing}
          isRecording={isListening}
        >
          <div className="relative w-full">
            {/* Placeholder overlay when editor is empty */}
            {isEmpty ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 px-3 py-3.5 text-sm leading-6 text-muted-foreground/85"
              >
                {placeholder ?? 'Send a message…'}
              </div>
            ) : null}
            {/* contenteditable is required for Grok-style inline mention chips;
                a native textarea cannot host non-editable chip elements mid-flow. */}
            {/* biome-ignore lint/a11y/useSemanticElements: contenteditable host for inline chips */}
            <div
              ref={editorRef}
              aria-label={ariaLabel}
              aria-multiline="true"
              className={cn(
                'relative max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words',
                variant === 'canvas' ? 'min-h-11' : 'min-h-[74px]',
                'px-3 py-3.5 text-sm leading-6 text-foreground outline-none',
                'focus-visible:ring-0',
                disabled && 'pointer-events-none opacity-60',
              )}
              contentEditable={!disabled}
              data-slot="input-group-control"
              onInput={() => {
                refreshActiveMention();
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={() => refreshActiveMention()}
              onMouseUp={() => refreshActiveMention()}
              onPaste={handlePaste}
              role="textbox"
              suppressContentEditableWarning
              tabIndex={disabled ? -1 : 0}
            />
          </div>
          {activeMention && mentionProvider ? (
            <MentionPickerMenu
              suggestions={mentionSuggestions}
              highlightedIndex={highlightedMentionIndex}
              parentStack={mentionParentStack}
              activeQuery={activeMention.query}
              onHighlight={setHighlightedMentionIndex}
              onSelect={selectMentionSuggestion}
              onBack={() => setMentionParentStack((stack) => stack.slice(0, -1))}
              analytics={mentionAnalytics}
              platforms={mentionPlatforms}
              selectedPlatform={mentionPlatform}
              onPlatformChange={onMentionPlatformChange}
            />
          ) : null}
          <InputGroupAddon align="block-end" className="w-full border-t border-border/60 py-2.5">
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
                      <InputGroupText className="text-xs uppercase tracking-[0.12em] text-rose-500">
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
                    'h-8 w-8 border border-border/65 bg-background text-foreground hover:bg-accent',
                    'focus-visible:ring-2 focus-visible:ring-ring/40',
                  )}
                  onAudioRecorded={handleAudioRecorded}
                  onListeningChange={setIsListening}
                  onTranscriptionChange={handleSpeechResult}
                  preferStreamingTranscription
                  size="icon"
                  type="button"
                  variant="ghost"
                />

                {attachments ? (
                  <>
                    <input
                      accept={ACCEPTED_ATTACHMENT_TYPES}
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
                  </>
                ) : null}

                {isStreaming ? (
                  <Button
                    aria-label="Stop generating"
                    className="h-8 rounded-lg px-2.5"
                    onClick={onStop}
                    size="icon"
                    type="button"
                  >
                    <Square className="size-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    aria-label="Send message"
                    className="h-8 rounded-lg px-2.5"
                    disabled={!canSubmit || disabled}
                    size="icon"
                    type="submit"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </motion.div>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
