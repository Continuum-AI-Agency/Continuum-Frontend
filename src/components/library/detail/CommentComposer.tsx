'use client';

// Shared comment input: sidebar bottom composer, annotation popover on the
// image stage, reply boxes, and the video time-pin strip all render this.
//
// Typing "@" opens the brand-member mention picker; picking someone splices a
// @[Label](continuum-user://<id>) token into the text. The token rides inside
// the body, so every surface (edge lifecycle SQL included) parses mentions
// from the same source of truth.
//
// With `reviewOptions`, the composer also carries the Library review metadata:
// the lock toggle (internal-only vs. shown to share-link recipients) and file
// attachments, uploaded as ordinary Library assets through the same upload path
// as the grid, so a comment only ever references assets the team can open.

import {
  buildMentionToken,
  type CommentAttachment,
  MAX_COMMENT_ATTACHMENTS,
} from '@continuum/contracts';
import { Globe, Loader2, Lock, Paperclip, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { cn } from '@/lib/utils';
import { loadMentionTargets, type MentionTarget } from './useMentionTargets';

export type CommentVisibilityChoice = 'internal' | 'shared';

export type ComposerExtras = {
  visibility: CommentVisibilityChoice;
  attachments: CommentAttachment[];
};

type PendingAttachment = {
  key: string;
  name: string;
  previewUrl: string | null;
  mimeType: string;
  status: 'uploading' | 'ready' | 'failed';
  attachment: CommentAttachment | null;
};

type Props = {
  placeholder: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  /** Brand context enables @mention autocomplete over brand members. */
  brandId?: string;
  onSubmit: (body: string, extras: ComposerExtras) => void;
  onCancel?: () => void;
  /** Optional annotation context (e.g. a timecode chip) shown above the actions. */
  annotationChip?: React.ReactNode;
  /** Show the lock toggle and attachments (Library review surfaces; needs brandId). */
  reviewOptions?: boolean;
  /** Hold posting until the host has something to attach the comment to. */
  submitDisabled?: boolean;
};

const MENTION_TRIGGER = /(^|\s)@([A-Za-z0-9._+-]*)$/;
const MAX_VISIBLE_TARGETS = 6;

function detectMentionTrigger(textUpToCaret: string): { start: number; query: string } | null {
  const match = MENTION_TRIGGER.exec(textUpToCaret);
  if (!match || match.index === undefined) return null;
  return { start: match.index + match[1].length, query: match[2] };
}

export function CommentComposer({
  placeholder,
  submitLabel = 'Post',
  busy = false,
  autoFocus = false,
  brandId,
  onSubmit,
  onCancel,
  annotationChip,
  reviewOptions = false,
  submitDisabled = false,
}: Props) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibilityChoice>('internal');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = pending.some((item) => item.status === 'uploading');
  const [targets, setTargets] = useState<MentionTarget[] | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = body.trim();

  // The open picker state is derived: a trigger before the caret plus at least
  // one filtered target. Closing it is just moving the caret or deleting the "@".
  const trigger = textareaRef.current
    ? detectMentionTrigger(body.slice(0, textareaRef.current.selectionStart ?? body.length))
    : null;
  const visibleTargets = useMemo(() => {
    if (!trigger || !targets) return [];
    const query = trigger.query.toLowerCase();
    return targets
      .filter(
        (t) => t.label.toLowerCase().includes(query) || t.email?.toLowerCase().includes(query),
      )
      .slice(0, MAX_VISIBLE_TARGETS);
  }, [trigger, targets]);
  const pickerOpen = Boolean(trigger) && visibleTargets.length > 0;

  const refreshTargets = () => {
    if (!brandId || targets) return;
    void loadMentionTargets(brandId)
      .then(setTargets)
      .catch(() => setTargets(null));
  };

  const applyMention = (target: MentionTarget) => {
    if (!trigger || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? body.length;
    const next = `${body.slice(0, trigger.start)}${buildMentionToken(target.userId, target.label)} ${body.slice(caret)}`;
    setBody(next);
    setHighlightIndex(0);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const addFiles = (files: FileList | null) => {
    if (!files || !brandId) return;
    const room = MAX_COMMENT_ATTACHMENTS - pending.length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = crypto.randomUUID();
      const previewable = file.type.startsWith('image/') || file.type.startsWith('video/');
      setPending((prev) => [
        ...prev,
        {
          key,
          name: file.name,
          mimeType: file.type,
          previewUrl: previewable ? URL.createObjectURL(file) : null,
          status: 'uploading',
          attachment: null,
        },
      ]);
      void uploadMediaAsset({ file, brandId })
        .then((result) =>
          setPending((prev) =>
            prev.map((item) =>
              item.key === key
                ? {
                    ...item,
                    status: 'ready',
                    attachment: { assetId: result.assetId, versionId: result.versionId },
                  }
                : item,
            ),
          ),
        )
        .catch((error: unknown) => {
          console.error('[CommentComposer] attachment upload failed', error);
          setPending((prev) =>
            prev.map((item) => (item.key === key ? { ...item, status: 'failed' } : item)),
          );
        });
    }
  };

  const removeAttachment = (key: string) =>
    setPending((prev) => {
      const item = prev.find((candidate) => candidate.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((candidate) => candidate.key !== key);
    });

  const submit = () => {
    if (!trimmed || busy || uploading || submitDisabled) return;
    onSubmit(trimmed, {
      visibility,
      attachments: pending.flatMap((item) => (item.attachment ? [item.attachment] : [])),
    });
    for (const item of pending) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setPending([]);
    setBody('');
    setHighlightIndex(0);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            refreshTargets();
            setHighlightIndex(0);
          }}
          placeholder={placeholder}
          // biome-ignore lint/a11y/noAutofocus: the composer opens from an explicit user action (drawing a box / clicking Reply) and focus should land in it
          autoFocus={autoFocus}
          disabled={busy}
          className="min-h-16 resize-none text-sm"
          onKeyDown={(e) => {
            if (pickerOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              const delta = e.key === 'ArrowDown' ? 1 : -1;
              setHighlightIndex((i) => (i + delta + visibleTargets.length) % visibleTargets.length);
              return;
            }
            if (pickerOpen && (e.key === 'Enter' || e.key === 'Tab')) {
              e.preventDefault();
              const target = visibleTargets[highlightIndex];
              if (target) applyMention(target);
              return;
            }
            // Escape closes an open picker first; only then does it cancel.
            if (e.key === 'Escape' && onCancel && !pickerOpen) {
              e.preventDefault();
              onCancel();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {pickerOpen && (
          <div className="absolute inset-x-0 bottom-full z-20 mb-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            {visibleTargets.map((target, index) => (
              <button
                key={target.userId}
                type="button"
                className={cnHighlight(index === highlightIndex)}
                onMouseDown={(e) => {
                  // mousedown so the caret/selection in the textarea survives.
                  e.preventDefault();
                  applyMention(target);
                }}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                <span className="font-medium">{target.label}</span>
                {target.email && (
                  <span className="text-muted-foreground">{` · ${target.email}`}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {reviewOptions && pending.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attachments">
          {pending.map((item) => (
            <li
              key={item.key}
              data-testid="composer-attachment"
              data-status={item.status}
              className={cn(
                'relative flex h-12 max-w-40 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-muted/40 pr-6 text-2xs',
                item.status === 'failed' && 'border-destructive text-destructive',
              )}
            >
              {item.previewUrl && item.mimeType.startsWith('image/') ? (
                // biome-ignore lint/performance/noImgElement: local object URL preview of a file being uploaded
                <img src={item.previewUrl} alt="" className="h-full w-12 object-cover" />
              ) : item.previewUrl ? (
                <video src={item.previewUrl} muted className="h-full w-12 object-cover" />
              ) : (
                <Paperclip className="ml-2 size-3.5 shrink-0" />
              )}
              <span className="truncate">{item.name}</span>
              {item.status === 'uploading' && (
                <Loader2 className="absolute right-1.5 top-1.5 size-3 animate-spin" />
              )}
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={() => removeAttachment(item.key)}
                className="absolute bottom-1 right-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {annotationChip}
        {reviewOptions && brandId && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              data-testid="comment-visibility-toggle"
              data-visibility={visibility}
              aria-pressed={visibility === 'internal'}
              aria-label={
                visibility === 'internal'
                  ? 'Internal only — hidden from share links. Click to show to reviewers.'
                  : 'Visible to share-link reviewers. Click to make internal.'
              }
              title={visibility === 'internal' ? 'Internal only' : 'Visible to reviewers'}
              onClick={() => setVisibility((v) => (v === 'internal' ? 'shared' : 'internal'))}
              disabled={busy}
            >
              {visibility === 'internal' ? (
                <Lock className="size-3.5" />
              ) : (
                <Globe className="size-3.5 text-primary" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || pending.length >= MAX_COMMENT_ATTACHMENTS}
            >
              <Paperclip className="size-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              data-testid="comment-attach-input"
              accept="image/*,video/*,audio/*,application/pdf"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!trimmed || busy || uploading || submitDisabled}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cnHighlight(active: boolean): string {
  return [
    'flex w-full items-baseline gap-1 px-2.5 py-1.5 text-left text-xs',
    active ? 'bg-accent' : 'bg-transparent',
  ].join(' ');
}
