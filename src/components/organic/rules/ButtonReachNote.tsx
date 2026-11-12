'use client';

import { useTranslations } from 'next-intl';

// Where a button appears, and where it does not.
//
// It sits beside the button-text field rather than under it because the answer
// is three paragraphs and the field needs one line. Someone choosing between a
// button and a link in the text is making a reach-versus-looks decision, and
// until this existed the product gave them no way to know that.
//
// Everything stated here was OBSERVED, not inferred, and the wording must not
// drift past it:
// - The button renders in the Instagram app on a phone.
// - It does NOT render on instagram.com, from a computer OR from a phone
//   browser. Both were checked; an earlier version of this note hedged with
//   "may not" because only the computer had been tried.
// - It is Meta's limit, not a mistake of ours: structured templates are
//   documented as unsupported on desktop, quick replies are app-only, and the
//   paid tools in this market have the same complaint open with Meta support.
//
// It says "in a browser", never "instagram.com". The domain is our word for it;
// a reader can take it to mean Instagram as a whole, which is both wider than
// the truth and the opposite of reassuring.

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ButtonReachNote() {
  const uiText = useTranslations('organic');
  return (
    <Popover>
      <PopoverTrigger
        aria-label={uiText('where_the_button_appears_2e451d3')}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info className="size-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-3">
        <div className="flex flex-col gap-2 text-2xs leading-snug">
          <p className="text-xs font-semibold leading-none">
            {uiText('where_the_button_appears_2e451d3')}
          </p>
          <p className="text-muted-foreground">
            {uiText('a_button_looks_better_than_a_link_sitting_in__cc7ae19')}
          </p>
          <p className="text-muted-foreground">
            {uiText('it_does_not_appear_when_someone_reads_the_mes_dbbc39f')}
          </p>
          <p className="text-muted-foreground">
            {uiText('most_people_read_their_messages_in_the_app_so_c8d9048')}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
