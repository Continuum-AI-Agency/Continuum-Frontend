'use client';

// The weekly story opened: one slide at a time with a numbered list beside it, composed by
// weeklyStory from the Home's reading plus one cheap stored read (the brief, under the same
// React Query key the brief tile and the Optimizer use). "Send as Continuum Report" opens the
// existing report email as is; there is no public share link, so none is offered.

import { ChevronLeftIcon, ChevronRightIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import { SendContinuumReportDialog } from '@/components/dashboard/SendContinuumReportDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HomeBoardContext } from '../../types';
import { briefView } from '../brief/briefModel';
import { useBriefReads } from '../brief/useBriefReads';
import { type StorySlide, weeklyStory } from './storyModel';

function SlideBody({ slide }: { slide: StorySlide }) {
  return (
    <>
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {slide.kicker}
      </p>
      {slide.title ? (
        <p className="break-words font-semibold text-lg leading-snug">{slide.title}</p>
      ) : null}
      {slide.body ? (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed">{slide.body}</p>
      ) : null}
      {slide.list ? (
        <ol className="flex flex-col gap-1.5 text-sm">
          {slide.list.map((item, index) => (
            <li className="flex gap-2" key={item}>
              <span className="font-mono text-muted-foreground text-xs">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

export default function StorySheet({ ctx }: { ctx: HomeBoardContext }) {
  const today = new Date();
  const { reads } = useBriefReads(ctx.brandId, ctx.adAccounts);
  const brief = briefView(reads, today);
  const slides = weeklyStory({
    reading: ctx.reading,
    brief: brief.state === 'ready' ? (brief.entries[0] ?? null) : null,
    today,
  });
  const [index, setIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];
  if (!slide) return null;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="home-story">
      <div aria-hidden className="flex gap-1">
        {slides.map((item, position) => (
          <span
            className={cn(
              'h-1 flex-1 rounded-full',
              position <= current ? 'bg-primary' : 'bg-muted',
            )}
            key={item.key}
          />
        ))}
      </div>
      <article
        aria-live="polite"
        className="flex min-h-48 flex-col gap-2 rounded-xl border bg-primary/5 p-4"
        data-slide={slide.key}
        data-testid="home-story-slide"
      >
        <SlideBody slide={slide} />
      </article>
      <div className="flex items-center justify-between gap-2">
        <Button
          aria-label="Previous slide"
          disabled={current === 0}
          onClick={() => setIndex(current - 1)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="text-muted-foreground text-xs">
          {current + 1} of {slides.length}
        </span>
        <Button
          aria-label="Next slide"
          disabled={current === slides.length - 1}
          onClick={() => setIndex(current + 1)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      <ol aria-label="Slides" className="flex flex-col gap-0.5">
        {slides.map((item, position) => (
          <li key={item.key}>
            <button
              aria-current={position === current ? 'step' : undefined}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
                position === current && 'bg-muted font-medium',
              )}
              data-slide={item.key}
              data-testid="home-story-slide-link"
              onClick={() => setIndex(position)}
              type="button"
            >
              <span className="font-mono text-muted-foreground text-xs">
                {String(position + 1).padStart(2, '0')}
              </span>
              {item.kicker}
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5 border-t pt-4">
        <Button className="self-start" onClick={() => setReportOpen(true)} size="sm" type="button">
          <SendIcon aria-hidden className="size-3.5" /> Send as Continuum Report
        </Button>
        <p className="text-muted-foreground text-xs">
          Emails the brand’s Continuum Report, built from the same accounts, now or on a schedule.
        </p>
      </div>
      <SendContinuumReportDialog
        brandId={ctx.brandId}
        onOpenChange={setReportOpen}
        open={reportOpen}
      />
    </div>
  );
}
