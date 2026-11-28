// TUFFUI (https://tuffui.com) · MIT License · Copyright (c) 2026 TUFFUI contributors
// Free to use. If it helps you, you can support it: https://ko-fi.com/yurigokoryan
'use client';

import {
  ArrowCounterClockwise,
  ArrowUUpLeft,
  Check,
  Copy,
  ThumbsDown,
  ThumbsUp,
} from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { type MouseEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/action-button';
import { Panel, Shell } from '@/components/ui/surface';
import { TextArea } from '@/components/ui/text-field';
import { EASE_OUT, enter, exit, spring } from '@/lib/motion-tokens';
import { cn } from '@/lib/utils';

/** `up` / `down` from the thumbs, or 1–5 from the detailed rating. */
export type FeedbackRating = 'up' | 'down' | 1 | 2 | 3 | 4 | 5;

export type Feedback = {
  rating: FeedbackRating | null;
  reasons: string[];
  note: string;
  /** `open` shows the reasons form, `sent` the thank-you. */
  status: 'idle' | 'open' | 'sent';
};

export type ResponseFeedbackProps = {
  /** Controlled state. Leave it out and the component keeps its own. */
  value?: Feedback;
  onValueChange?: (value: Feedback) => void;
  /** Called on a thumbs up, or when a down vote or a 1–5 rating is chosen. */
  onRate?: (rating: FeedbackRating) => void;
  onSubmit?: (feedback: { rating: FeedbackRating; reasons: string[]; note: string }) => void;
  /** Shown for `undoMs` after a submit. */
  onUndo?: () => void;
  undoMs?: number;
  onCopy?: () => void;
  onRegenerate?: () => void;
  reasons?: string[];
  /** `inline` thumbs under an answer; `detailed` a 1–5 rating with reasons always shown. */
  variant?: 'inline' | 'detailed';
  className?: string;
};

const defaultReasons = ['Inaccurate', 'Not helpful', 'Too long', 'Unsafe', 'Other'];
const scale = ['Poor', 'Weak', 'Okay', 'Good', 'Great'];
export const emptyFeedback: Feedback = {
  rating: null,
  reasons: [],
  note: '',
  status: 'idle',
};

const press =
  'transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]';

export function ResponseFeedback({
  value,
  onValueChange,
  onRate,
  onSubmit,
  onUndo,
  undoMs = 5000,
  onCopy,
  onRegenerate,
  reasons = defaultReasons,
  variant = 'inline',
  className,
}: ResponseFeedbackProps) {
  const [own, setOwn] = useState<Feedback>(emptyFeedback);
  const fb = value ?? own;
  const set = (next: Feedback) => {
    if (!value) setOwn(next);
    onValueChange?.(next);
  };
  const reduce = useReducedMotion();
  const radioName = useId();
  const [copied, setCopied] = useState(false);
  const [undoable, setUndoable] = useState(false);
  const [pop, setPop] = useState(0);
  const detailed = variant === 'detailed';
  // The detailed card is a shell; the inline row sits bare under an answer.
  const Root = detailed ? Shell : 'div';

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  useEffect(() => {
    if (!undoable) return;
    const t = setTimeout(() => setUndoable(false), undoMs);
    return () => clearTimeout(t);
  }, [undoable, undoMs]);

  const thumb = (rating: 'up' | 'down', e: MouseEvent) => {
    if (fb.rating === rating && fb.status !== 'open') {
      set(emptyFeedback); // a second press clears the vote
      return;
    }
    if (e.detail !== 0) setPop((n) => n + 1); // no pop from the keyboard
    onRate?.(rating);
    set({ ...emptyFeedback, rating, status: rating === 'down' ? 'open' : 'idle' });
  };
  const toggleReason = (reason: string) =>
    set({
      ...fb,
      reasons: fb.reasons.includes(reason)
        ? fb.reasons.filter((r) => r !== reason)
        : [...fb.reasons, reason],
    });
  const submit = () => {
    if (fb.rating === null) return;
    onSubmit?.({ rating: fb.rating, reasons: fb.reasons, note: fb.note.trim() });
    set({ ...fb, status: 'sent' });
    setUndoable(true);
  };
  const undo = () => {
    set({ ...fb, status: detailed ? 'idle' : 'open' });
    setUndoable(false);
    onUndo?.();
  };

  const open = detailed ? fb.status !== 'sent' : fb.status === 'open';
  const sent = fb.status === 'sent';
  const canSend = fb.rating !== null && (fb.reasons.length > 0 || fb.note.trim() !== '');

  const iconButton = (
    label: string,
    pressed: boolean | undefined,
    onClick: (e: MouseEvent) => void,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-full hover:bg-foreground/[0.06] hover:text-foreground',
        pressed ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground',
        press,
      )}
    >
      {icon}
    </button>
  );

  const popIcon = (Icon: typeof ThumbsUp, on: boolean) => (
    <motion.span
      key={on ? `on-${pop}` : 'off'}
      initial={on && !reduce ? { scale: 0.85 } : false}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', duration: 0.3, bounce: 0.3 }}
      className="flex"
    >
      <Icon weight="fill" className="size-4" aria-hidden="true" />
    </motion.span>
  );

  const form = (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-[0.8125rem] text-muted-foreground">
        {detailed ? 'What stood out?' : 'What went wrong?'}
      </p>
      <fieldset aria-label="Reasons" className="flex min-w-0 flex-wrap gap-1.5">
        {reasons.map((reason) => {
          const on = fb.reasons.includes(reason);
          return (
            <button
              key={reason}
              type="button"
              aria-pressed={on}
              onClick={() => toggleReason(reason)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem]',
                on
                  ? 'bg-foreground text-background'
                  : 'bg-surface-raised hover:bg-[color-mix(in_oklab,var(--surface-raised),var(--foreground)_7%)]',
                press,
              )}
            >
              {on && <Check weight="bold" className="size-3.5" aria-hidden="true" />}
              {reason}
            </button>
          );
        })}
      </fieldset>
      <TextArea
        aria-label="Add a note"
        rows={2}
        value={fb.note}
        onChange={(e) => set({ ...fb, note: e.target.value })}
        placeholder="Add a note (optional)"
      />
      <div className="flex items-center justify-end gap-2">
        {!detailed && (
          <Button variant="quiet" onClick={() => set(emptyFeedback)}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={submit} disabled={!canSend} className="px-4">
          Send feedback
        </Button>
      </div>
    </div>
  );

  const thanks = (
    <motion.div
      key="thanks"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: enter }}
      exit={{ opacity: 0, transition: exit }}
      className="flex items-center gap-2 text-[0.8125rem]"
    >
      <Check weight="bold" className="size-3.5 text-positive" aria-hidden="true" />
      <span>Thanks — we&apos;ll use this to improve.</span>
      {undoable && (
        <Button
          icon={ArrowUUpLeft}
          iconWeight="bold"
          onClick={undo}
          className="h-7 gap-1 px-2.5 text-xs"
        >
          Undo
        </Button>
      )}
    </motion.div>
  );

  const announcement = sent
    ? 'Feedback sent'
    : fb.rating === 'up'
      ? 'Marked as helpful'
      : fb.status === 'open'
        ? 'Tell us what went wrong'
        : '';

  return (
    <MotionConfig reducedMotion="user">
      <Root className={cn('w-full max-w-xl', className)}>
        {detailed ? (
          <Panel className="p-4">
            <AnimatePresence mode="wait" initial={false}>
              {sent ? (
                thanks
              ) : (
                <motion.div key="form" exit={{ opacity: 0, transition: exit }}>
                  <p className="text-[0.9375rem] font-medium">How was this answer?</p>
                  <div
                    role="radiogroup"
                    aria-label="Rating"
                    className="mt-3 grid grid-cols-5 gap-1.5"
                  >
                    {scale.map((label, i) => {
                      const n = (i + 1) as FeedbackRating;
                      const on = fb.rating === n;
                      return (
                        <label
                          key={label}
                          className={cn(
                            'flex cursor-pointer flex-col items-center gap-0.5 rounded-xl py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                            on
                              ? 'bg-foreground text-background'
                              : 'bg-foreground/[0.04] hover:bg-foreground/[0.07]',
                            press,
                          )}
                        >
                          <input
                            type="radio"
                            name={`${radioName}-rating`}
                            value={n}
                            checked={on}
                            onChange={() => {
                              onRate?.(n);
                              set({ ...fb, rating: n });
                            }}
                            className="sr-only"
                          />
                          <span className="font-mono text-sm tabular-nums">{n}</span>
                          <span className={cn('text-[0.6875rem]', !on && 'text-muted-foreground')}>
                            {label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {open && form}
                </motion.div>
              )}
            </AnimatePresence>
          </Panel>
        ) : (
          <>
            <div className="flex min-h-8 items-center gap-0.5">
              <AnimatePresence mode="popLayout" initial={false}>
                {sent ? (
                  thanks
                ) : (
                  <motion.div
                    key="actions"
                    exit={{ opacity: 0, transition: exit }}
                    className="flex items-center gap-0.5"
                  >
                    {iconButton(
                      'Helpful',
                      fb.rating === 'up',
                      (e) => thumb('up', e),
                      popIcon(ThumbsUp, fb.rating === 'up'),
                    )}
                    {iconButton(
                      'Not helpful',
                      fb.rating === 'down',
                      (e) => thumb('down', e),
                      popIcon(ThumbsDown, fb.rating === 'down'),
                    )}
                    {onCopy &&
                      iconButton(
                        copied ? 'Copied' : 'Copy response',
                        undefined,
                        () => {
                          onCopy();
                          setCopied(true);
                        },
                        copied ? (
                          <Check weight="bold" className="size-4" aria-hidden="true" />
                        ) : (
                          <Copy weight="fill" className="size-4" aria-hidden="true" />
                        ),
                      )}
                    {onRegenerate &&
                      iconButton(
                        'Regenerate response',
                        undefined,
                        onRegenerate,
                        <ArrowCounterClockwise
                          weight="bold"
                          className="size-4"
                          aria-hidden="true"
                        />,
                      )}
                    <AnimatePresence initial={false}>
                      {fb.rating === 'up' && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0, transition: enter }}
                          exit={{ opacity: 0, transition: exit }}
                          className="ml-1.5 text-[0.8125rem] text-muted-foreground"
                        >
                          Thanks
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    transition: {
                      height: reduce ? { duration: 0 } : spring,
                      opacity: enter,
                    },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: {
                      height: reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT },
                      opacity: exit,
                    },
                  }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 rounded-2xl bg-surface p-3 pt-0">{form}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </Root>
    </MotionConfig>
  );
}
