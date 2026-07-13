'use client';

// Shared comment input: sidebar bottom composer, annotation popover on the
// image stage, reply boxes, and the video time-pin strip all render this.

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  placeholder: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  /** Optional annotation context (e.g. a timecode chip) shown above the actions. */
  annotationChip?: React.ReactNode;
};

export function CommentComposer({
  placeholder,
  submitLabel = 'Post',
  busy = false,
  autoFocus = false,
  onSubmit,
  onCancel,
  annotationChip,
}: Props) {
  const [body, setBody] = useState('');
  const trimmed = body.trim();

  const submit = () => {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setBody('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        // biome-ignore lint/a11y/noAutofocus: the composer opens from an explicit user action (drawing a box / clicking Reply) and focus should land in it
        autoFocus={autoFocus}
        disabled={busy}
        className="min-h-16 resize-none text-sm"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
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
