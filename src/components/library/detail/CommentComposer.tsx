'use client';

// Shared comment input: sidebar bottom composer, annotation popover on the
// image stage, reply boxes, and the video time-pin strip all render this.
//
// Typing "@" opens the brand-member mention picker; picking someone splices a
// @[Label](continuum-user://<id>) token into the text. The token rides inside
// the body, so every surface (edge lifecycle SQL included) parses mentions
// from the same source of truth.

import { buildMentionToken } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { loadMentionTargets, type MentionTarget } from './useMentionTargets';

type Props = {
  placeholder: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  /** Brand context enables @mention autocomplete over brand members. */
  brandId?: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  /** Optional annotation context (e.g. a timecode chip) shown above the actions. */
  annotationChip?: React.ReactNode;
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
}: Props) {
  const [body, setBody] = useState('');
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

  const submit = () => {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
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
      <div className="flex items-center gap-2">
        {annotationChip}
        <div className="ml-auto flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button type="button" size="sm" onClick={submit} disabled={!trimmed || busy}>
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
