'use client';

import {
  HEADLESS_EFFECTS,
  type HeadlessEffect,
  headlessConcept,
  headlessEffect,
  type ReviewDecision,
  type ReviewQueueItem,
} from '@continuum/contracts';
import { motion, type PanInfo, useMotionValue, useTransform } from 'motion/react';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { useBrandStyles } from '@/hooks/useStylesShelf';
import { ApiError } from '@/lib/api/errors';

/** How far (px, with a flick's velocity counted in) a card travels before it counts. */
const SWIPE_THRESHOLD = 140;

const CATEGORY_LABEL: Record<HeadlessEffect['category'], string> = {
  camera: 'Camera',
  film: 'Film',
  retro: 'Retro video',
  lens: 'Lens',
  print: 'Print',
  grade: 'Grade',
};

const DONE: Record<ReviewDecision['decision'], string> = {
  approve: 'Approved: it is on the schedule',
  skip: 'Skipped',
  revise: 'Sent back with your change',
};

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const reason = typeof error.payload?.reason === 'string' ? error.payload.reason : null;
    if (reason === 'account_missing') return 'connect a social account for this platform first';
    return reason ? `${error.message} (${reason})` : error.message;
  }
  return error instanceof Error ? error.message : 'something went wrong';
}

function conceptLabel(item: ReviewQueueItem): string {
  return headlessConcept(item.creative.concept).label;
}

function effectLabel(effectId: string | undefined, brandEffects: readonly HeadlessEffect[]) {
  if (!effectId) return 'No effect';
  return (
    headlessEffect(effectId)?.label ??
    brandEffects.find((effect) => effect.id === effectId)?.label ??
    effectId
  );
}

type CardProps = {
  item: ReviewQueueItem;
  effectName: string;
  /** The last card was decided from the keyboard, so this one takes focus. */
  autoFocus: boolean;
  onDecide: (decision: 'approve' | 'skip', fromKeyboard: boolean) => void;
  onRevise: () => void;
};

function SwipeCard({ item, effectName, autoFocus, onDecide, onRevise }: CardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-8, 8]);
  const dragged = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const travel = info.offset.x + info.velocity.x * 0.2;
    if (travel > SWIPE_THRESHOLD) onDecide('approve', false);
    else if (travel < -SWIPE_THRESHOLD) onDecide('skip', false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') onDecide('approve', true);
    else if (event.key === 'ArrowLeft') onDecide('skip', true);
    else if (event.key === 'Enter') onRevise();
    else return;
    event.preventDefault();
  };

  return (
    <motion.div
      ref={ref}
      data-review-card={item.draftId}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the card is the keyboard target for ←/→/Enter; the buttons below are the pointer and screen-reader equivalents.
      tabIndex={0}
      role="group"
      aria-roledescription="review card"
      aria-label={`${conceptLabel(item)}, ${effectName}. Right arrow approves, left arrow skips, Enter describes a change.`}
      aria-keyshortcuts="ArrowRight ArrowLeft Enter"
      drag="x"
      dragSnapToOrigin
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!dragged.current) onRevise();
        dragged.current = false;
      }}
      onKeyDown={onKeyDown}
      style={{ x, rotate }}
      className="relative z-10 flex w-full cursor-grab touch-pan-y flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      {item.media.kind === 'video' ? (
        <video
          src={item.media.url}
          poster={item.media.posterUrl ?? undefined}
          muted
          loop
          autoPlay
          playsInline
          className="pointer-events-none aspect-[9/16] max-h-[60vh] w-full rounded-lg bg-muted object-contain"
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: a signed media URL from the review route.
        <img
          src={item.media.url}
          alt=""
          draggable={false}
          className="pointer-events-none aspect-[9/16] max-h-[60vh] w-full rounded-lg bg-muted object-contain"
        />
      )}
      <div className="flex flex-wrap gap-1">
        <Badge variant="violet">{conceptLabel(item)}</Badge>
        <Badge variant="teal">{effectName}</Badge>
        <Badge variant="muted">{item.platform}</Badge>
        {item.scheduledAt && (
          <Badge variant="muted">{new Date(item.scheduledAt).toLocaleString()}</Badge>
        )}
      </div>
      {item.caption && <p className="line-clamp-3 text-sm">{item.caption}</p>}
    </motion.div>
  );
}

type ReviseFormProps = {
  item: ReviewQueueItem;
  brandEffects: readonly HeadlessEffect[];
  onSubmit: (change: { note?: string; effectId?: string }) => void;
  onCancel: () => void;
};

function ReviseForm({ item, brandEffects, onSubmit, onCancel }: ReviseFormProps) {
  const [note, setNote] = useState('');
  const [effectId, setEffectId] = useState('');
  const noteId = useId();
  const effectFieldId = useId();
  const trimmed = note.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...(trimmed ? { note: trimmed } : {}),
      ...(effectId ? { effectId } : {}),
    });
  };

  return (
    <form
      aria-label="Describe a change"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3"
    >
      <label htmlFor={noteId} className="text-sm font-medium">
        Describe a change
      </label>
      <textarea
        id={noteId}
        // biome-ignore lint/a11y/noAutofocus: opening the form is the user's request to type here.
        autoFocus
        rows={3}
        maxLength={400}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Open on the product, not the gym floor"
        className="rounded-md border bg-background p-2 text-sm"
      />
      <label htmlFor={effectFieldId} className="text-sm font-medium">
        Re-style with an effect
      </label>
      <select
        id={effectFieldId}
        value={effectId}
        onChange={(event) => setEffectId(event.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Keep the current look</option>
        {brandEffects.length > 0 && (
          <optgroup label="Your effects">
            {brandEffects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.label}
              </option>
            ))}
          </optgroup>
        )}
        {Object.entries(CATEGORY_LABEL).map(([category, label]) => (
          <optgroup key={category} label={label}>
            {HEADLESS_EFFECTS.filter((effect) => effect.category === category).map((effect) => (
              <option
                key={effect.id}
                value={effect.id}
                disabled={effect.id === item.creative.effectId}
              >
                {effect.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        An effect alone re-styles the same takes at no cost. A note re-directs the piece with the
        same concept and cast.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!trimmed && !effectId}>
          Send change
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The swipe review queue: right approves onto its schedule, left skips, a tap describes a change
 *  or re-styles it with an effect. Every decision leaves the deck at once and returns if refused. */
export function ReviewQueue({ brandId }: { brandId: string }) {
  const { items, isLoading, error, decide } = useReviewQueue(brandId);
  const { styles } = useBrandStyles(brandId);
  const [revising, setRevising] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const keyboardDecided = useRef(false);
  const brandEffects = styles.flatMap((style) =>
    style.kind === 'effect' && style.status === 'approved' ? [style.spec] : [],
  );
  const [top, next] = items;

  const send = async (item: ReviewQueueItem, decision: ReviewDecision, fromKeyboard = false) => {
    keyboardDecided.current = fromKeyboard;
    setRevising(false);
    try {
      await decide({ draftId: item.draftId, decision });
      setAnnouncement(`${DONE[decision.decision]}.`);
    } catch (cause) {
      setAnnouncement(
        `Couldn't ${decision.decision} this post: ${describeError(cause)}. It is back in the queue.`,
      );
    }
  };

  return (
    <section
      aria-label="Review queue"
      className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col gap-3 overflow-y-auto pb-6"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Review</h2>
        <span className="text-xs text-muted-foreground">{items.length} to review</span>
      </header>
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
        {announcement}
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the queue…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load the queue: {error.message}
        </p>
      ) : !top ? (
        <p className="text-sm text-muted-foreground">
          Nothing to review. New posts land here once a plan's media is made.
        </p>
      ) : (
        <>
          <div className="relative">
            {next && (
              <div
                aria-hidden
                className="absolute inset-x-3 top-2 bottom-0 rounded-xl border bg-card/60"
              />
            )}
            <SwipeCard
              key={top.draftId}
              item={top}
              effectName={effectLabel(top.creative.effectId, brandEffects)}
              autoFocus={keyboardDecided.current}
              onDecide={(decision, fromKeyboard) => send(top, { decision }, fromKeyboard)}
              onRevise={() => setRevising(true)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              aria-keyshortcuts="ArrowLeft"
              onClick={() => send(top, { decision: 'skip' })}
            >
              ← Skip
            </Button>
            <Button
              variant="secondary"
              aria-keyshortcuts="Enter"
              aria-expanded={revising}
              onClick={() => setRevising((open) => !open)}
            >
              Change
            </Button>
            <Button
              variant="success"
              aria-keyshortcuts="ArrowRight"
              onClick={() => send(top, { decision: 'approve' })}
            >
              Approve →
            </Button>
          </div>
          {revising && (
            <ReviseForm
              key={top.draftId}
              item={top}
              brandEffects={brandEffects}
              onCancel={() => setRevising(false)}
              onSubmit={(change) => send(top, { decision: 'revise', ...change })}
            />
          )}
        </>
      )}
    </section>
  );
}
