'use client';

// H15 Weekly story: a button in the board's header that opens the brand's week as a few slides.
// The sheet's content is its own lazy chunk, so the story (and its one read) downloads only when
// someone opens it.

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useState } from 'react';
import { BookOpen } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomeBoardContext } from '../../types';

const StorySheet = lazy(() => import('./StorySheet'));

export default function StoryButton({ ctx }: { ctx: HomeBoardContext }) {
  const uiText = useTranslations('dashboard');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="h-8 gap-1.5 text-xs"
        data-testid="home-story-open"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <BookOpen aria-hidden className="size-3.5" /> {uiText('weekly_story_bc91068')}
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
          data-testid="home-story-sheet"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>{uiText('weekly_story_bc91068')}</SheetTitle>
            <SheetDescription>
              {ctx.brandName
                ? uiText('brand_this_week_from_what_continuum_already_r_303c131', {
                    brand: ctx.brandName,
                  })
                : uiText('this_brand_this_week_from_what_continuum_alre_b74028e')}
            </SheetDescription>
          </SheetHeader>
          <div className="min-w-0 px-4 pb-6">
            {open ? (
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <StorySheet ctx={ctx} />
              </Suspense>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
