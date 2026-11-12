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
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { useBrandStyles } from '@/hooks/useStylesShelf';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';

/** How far (px, with a flick's velocity counted in) a card travels before it counts. */
const SWIPE_THRESHOLD = 140;

const CATEGORY_LABEL = {
  camera: 'reviewCategoryCamera',
  film: 'reviewCategoryFilm',
  retro: 'reviewCategoryRetro',
  lens: 'reviewCategoryLens',
  print: 'reviewCategoryPrint',
  grade: 'reviewCategoryGrade',
} as const satisfies Record<HeadlessEffect['category'], string>;

const DONE = {
  approve: 'reviewDoneApprove',
  skip: 'reviewDoneSkip',
  revise: 'reviewDoneRevise',
} as const satisfies Record<ReviewDecision['decision'], string>;

const FAILED = {
  approve: 'reviewApproveFailed',
  skip: 'reviewSkipFailed',
  revise: 'reviewReviseFailed',
} as const satisfies Record<ReviewDecision['decision'], string>;

function conceptLabel(item: ReviewQueueItem): string {
  return headlessConcept(item.creative.concept).label;
}

function effectLabel(
  effectId: string | undefined,
  brandEffects: readonly HeadlessEffect[],
  noEffect: string,
) {
  if (!effectId) return noEffect;
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
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
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
      aria-roledescription={uiText('reviewCardRole')}
      aria-label={uiText('reviewCardInstructions', {
        concept: conceptLabel(item),
        effect: effectName,
      })}
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
          <Badge variant="muted">{new Date(item.scheduledAt).toLocaleString(uiLocale)}</Badge>
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
  const uiText = useTranslations('organic');
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
      aria-label={uiText('describe_a_change_8612ced')}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3"
    >
      <label htmlFor={noteId} className="text-sm font-medium">
        {uiText('describe_a_change_8612ced')}
      </label>
      <textarea
        id={noteId}
        // biome-ignore lint/a11y/noAutofocus: opening the form is the user's request to type here.
        autoFocus
        rows={3}
        maxLength={400}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={uiText('open_on_the_product_not_the_gym_floor_d3717fe')}
        className="rounded-md border bg-background p-2 text-sm"
      />
      <label htmlFor={effectFieldId} className="text-sm font-medium">
        {uiText('re_style_with_an_effect_185b8e5')}
      </label>
      <select
        id={effectFieldId}
        value={effectId}
        onChange={(event) => setEffectId(event.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">{uiText('keep_the_current_look_fac831f')}</option>
        {brandEffects.length > 0 && (
          <optgroup label={uiText('your_effects_c64f1f1')}>
            {brandEffects.map((effect) => (
              <option key={effect.id} value={effect.id}>
                {effect.label}
              </option>
            ))}
          </optgroup>
        )}
        {Object.entries(CATEGORY_LABEL).map(([category, label]) => (
          <optgroup key={category} label={uiText(label)}>
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
        {uiText('an_effect_alone_re_styles_the_same_takes_at_n_1c7378d')}
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!trimmed && !effectId}>
          {uiText('send_change_2b77183')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {uiText('cancel_19766ed')}
        </Button>
      </div>
    </form>
  );
}

/** The swipe review queue: right approves onto its schedule, left skips, a tap describes a change
 *  or re-styles it with an effect. Every decision leaves the deck at once and returns if refused. */
export function ReviewQueue({ brandId }: { brandId: string }) {
  const uiText = useTranslations('organic');
  const formatUiError = useUiErrorMessage();
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
      setAnnouncement(uiText(DONE[decision.decision]));
    } catch (cause) {
      const localizedReason =
        cause instanceof ApiError && cause.payload?.reason === 'account_missing'
          ? uiText('reviewAccountRequired')
          : formatUiError(cause);
      setAnnouncement(uiText(FAILED[decision.decision], { reason: localizedReason }));
    }
  };

  return (
    <section
      aria-label={uiText('review_queue_3e1654b')}
      className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col gap-3 overflow-y-auto pb-6"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{uiText('review_aff0766')}</h2>
        <span className="text-xs text-muted-foreground">
          {uiText.rich('sentence_586535cdc400', { count: items.length })}
        </span>
      </header>
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
        {announcement}
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{uiText('loading_the_queue_7a0ee88')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {uiText('reviewQueueFailed', { reason: formatUiError(error) })}
        </p>
      ) : !top ? (
        <p className="text-sm text-muted-foreground">
          {uiText('nothing_to_review_new_posts_land_here_once_a__b030a92')}
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
              effectName={effectLabel(
                top.creative.effectId,
                brandEffects,
                uiText('reviewNoEffect'),
              )}
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
              {uiText('skip_4de3209')}
            </Button>
            <Button
              variant="secondary"
              aria-keyshortcuts="Enter"
              aria-expanded={revising}
              onClick={() => setRevising((open) => !open)}
            >
              {uiText('change_c0bf75b')}
            </Button>
            <Button
              variant="success"
              aria-keyshortcuts="ArrowRight"
              onClick={() => send(top, { decision: 'approve' })}
            >
              {uiText('approve_50944ec')}
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
