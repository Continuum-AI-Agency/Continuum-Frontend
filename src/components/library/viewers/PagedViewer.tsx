'use client';

// A file that carries its own page previews (InDesign `page_N`), shown page by page: a page
// drawer, arrow keys, jump-to-page. Comments pin on the page they were made on — the image
// stage's own pin and draw tools, with the page added to the annotation — and selecting a
// thread turns to its page.

import type { ViewerPage } from '@continuum/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OverlayPin } from '../detail/AnnotationOverlay';
import { ImageAnnotationLayer } from '../detail/ImageAnnotationLayer';
import type { ViewerAnchor, ViewerReview } from './index';

type Props = {
  pages: ViewerPage[];
  pageCount: number | null;
  label: string;
  review?: ViewerReview;
  onAnchor?: (anchor: ViewerAnchor) => void;
};

/** The page a pin belongs to; a pin made before pages existed sits on the first page. */
export function pinPage(pin: OverlayPin): number {
  return pin.annotation.page ?? 1;
}

export function PagedViewer({ pages, pageCount, label, review, onAnchor }: Props) {
  const [index, setIndex] = useState(0);
  const [jump, setJump] = useState('');
  const page = pages[index] ?? pages[0];
  const pageNumber = page?.page ?? 1;
  const selectedPin = review?.pins.find((pin) => pin.selected);
  const selectedPage = selectedPin ? pinPage(selectedPin) : null;

  useEffect(() => {
    if (selectedPage === null) return;
    const target = pages.findIndex((candidate) => candidate.page === selectedPage);
    if (target >= 0) setIndex(target);
  }, [selectedPage, pages]);

  useEffect(() => {
    onAnchor?.({ page: pageNumber });
  }, [onAnchor, pageNumber]);

  // Turning away from a selected pin's page lets go of its thread, so selecting that thread
  // again turns back to it.
  const latest = useRef({ index, selectedPage, onSelectPin: review?.onSelectPin });
  latest.current = { index, selectedPage, onSelectPin: review?.onSelectPin };
  const turnTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(pages.length - 1, next));
      setIndex(target);
      const { selectedPage: held, onSelectPin } = latest.current;
      if (held !== null && pages[target]?.page !== held) onSelectPin?.(null);
    },
    [pages],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        turnTo(latest.current.index + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        turnTo(latest.current.index - 1);
      } else {
        return;
      }
      // Pages own the plain arrows here: the zoom stage underneath would otherwise pan with them.
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [turnTo]);

  const pagePins = useMemo(
    () => (review?.pins ?? []).filter((pin) => pinPage(pin) === pageNumber),
    [review?.pins, pageNumber],
  );

  if (!page) {
    return (
      <div
        data-testid="paged-viewer-empty"
        className="flex size-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
      >
        {pageCount
          ? `${pageCount} pages, but the file was saved without page previews. Re-save it in InDesign with "Save Preview Images" on.`
          : 'This file carries no page previews.'}
      </div>
    );
  }

  const goTo = (value: string) => {
    const target = pages.findIndex((candidate) => candidate.page === Number(value));
    if (target >= 0) turnTo(target);
    setJump('');
  };

  return (
    <div
      data-testid="paged-viewer"
      data-page={pageNumber}
      data-page-count={pageCount ?? pages.length}
      className="flex size-full min-h-0"
    >
      <nav
        aria-label="Pages"
        className="flex w-28 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-2"
      >
        <div className="sticky top-0 z-10 flex flex-col items-center gap-1 bg-background pb-1">
          <div className="flex items-center">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Previous page"
              disabled={index === 0}
              onClick={() => turnTo(index - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {pageNumber} / {pageCount ?? pages.length}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Next page"
              disabled={index >= pages.length - 1}
              onClick={() => turnTo(index + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              goTo(jump);
            }}
          >
            <input
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              inputMode="numeric"
              placeholder="Go to"
              aria-label="Go to page"
              data-testid="paged-viewer-jump"
              className="h-7 w-20 rounded-md border border-border bg-background px-2 text-xs"
            />
          </form>
        </div>
        {pages.map((candidate, position) => (
          <button
            key={candidate.page}
            type="button"
            data-testid={`paged-viewer-thumb-${candidate.page}`}
            aria-current={position === index ? 'page' : undefined}
            onClick={() => turnTo(position)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md p-1 text-2xs text-muted-foreground hover:bg-muted',
              position === index && 'bg-muted text-foreground ring-1 ring-primary',
            )}
          >
            {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next asset */}
            <img
              src={candidate.url}
              alt=""
              loading="lazy"
              className="max-h-24 w-full object-contain"
            />
            {candidate.page}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {review ? (
            <ImageAnnotationLayer
              key={page.url}
              src={page.url}
              alt={`${label} · page ${pageNumber}`}
              pins={pagePins}
              onSelectPin={review.onSelectPin}
              posting={review.posting}
              brandId={review.brandId}
              onPostAnnotated={(body, annotation, extras) =>
                review.onPostAnnotated(
                  body,
                  annotation.kind === 'box' ||
                    annotation.kind === 'point' ||
                    annotation.kind === 'freehand'
                    ? { ...annotation, page: pageNumber }
                    : annotation,
                  extras,
                )
              }
            />
          ) : (
            <div className="flex size-full items-center justify-center p-4">
              {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a Next asset */}
              <img
                src={page.url}
                alt={`${label} · page ${pageNumber}`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
