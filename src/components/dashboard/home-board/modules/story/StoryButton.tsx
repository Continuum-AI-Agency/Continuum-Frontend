'use client';

// H15 Weekly story: a button in the board's header that opens the brand's week as a few slides.
// The sheet's content is its own lazy chunk, so the story (and its one read) downloads only when
// someone opens it.

import { BookOpenIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
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
        <BookOpenIcon aria-hidden className="size-3.5" /> Weekly story
      </Button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-lg"
          data-testid="home-story-sheet"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>Weekly story</SheetTitle>
            <SheetDescription>
              {ctx.brandName ?? 'This brand'} this week, from what Continuum already read.
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
