'use client';

import type { PresentationDocument } from '@continuum/contracts';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PresentationCanvas } from './PresentationCanvas';
import type { PresentationEngine } from './presentationEngine';

export function PresentationViewer({
  document,
  engine,
  initialSlideId,
  onClose,
}: {
  document: PresentationDocument;
  engine: PresentationEngine | null;
  initialSlideId?: string;
  onClose: () => void;
}) {
  const translateUi = useUiTranslations('forge');

  const [index, setIndex] = useState(
    Math.max(
      0,
      document.slides.findIndex((slide) => slide.id === initialSlideId),
    ),
  );
  const slide = document.slides[index];
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setIndex((current) =>
        Math.max(
          0,
          Math.min(document.slides.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)),
        ),
      );
    };
    window.addEventListener('keydown', navigate, true);
    return () => window.removeEventListener('keydown', navigate, true);
  }, [document.slides.length]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="inset-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col rounded-none p-4 sm:max-w-none sm:p-6">
        <DialogTitle>{translateUi('presentation_preview_4ff250e4')}</DialogTitle>
        <DialogDescription className="sr-only">
          {' '}
          {translateUi('use_the_arrow_keys_to_move_between__da9a481b')}{' '}
        </DialogDescription>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {slide ? (
            <div
              style={{
                width: `min(100%, calc((100dvh - 13rem) * ${document.size.width / document.size.height}))`,
              }}
            >
              <PresentationCanvas document={document} slideId={slide.id} engine={engine} />
            </div>
          ) : null}
        </div>
        <footer className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            aria-label={translateUi('previous_slide_bfb54922')}
            disabled={index === 0}
            onClick={() => setIndex((current) => current - 1)}
          >
            <ArrowLeft />
          </Button>
          <p
            role="status"
            aria-label={translateUi('slide_position_56e0b171')}
            className="text-sm tabular-nums"
          >
            {' '}
            {translateUi('slide_6bb4c117')} {index + 1} {translateUi('of_28391d3b')}{' '}
            {document.slides.length}
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label={translateUi('next_slide_cdc93d1c')}
            disabled={index >= document.slides.length - 1}
            onClick={() => setIndex((current) => current + 1)}
          >
            <ArrowRight />
          </Button>
        </footer>
        {slide?.notes ? (
          <details className="max-h-24 overflow-y-auto text-sm">
            <summary className="cursor-pointer">{translateUi('speaker_notes_29e09472')}</summary>
            <p className="whitespace-pre-wrap py-2 text-muted-foreground">{slide.notes}</p>
          </details>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
