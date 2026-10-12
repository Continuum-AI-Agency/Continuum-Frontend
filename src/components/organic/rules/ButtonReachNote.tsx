'use client';

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
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Where the button appears"
        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Info className="size-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-3">
        <div className="flex flex-col gap-2 text-2xs leading-snug">
          <p className="text-xs font-semibold leading-none">Where the button appears</p>
          <p className="text-muted-foreground">
            A button looks better than a link sitting in the text, and it is easier to tap. In the
            Instagram app, it works.
          </p>
          <p className="text-muted-foreground">
            It does not appear when someone reads the message in a browser — on a computer or on a
            phone. There the message arrives with your text and nothing to tap. This is a limit of
            Instagram, not of this rule, and it affects every tool that sends buttons.
          </p>
          <p className="text-muted-foreground">
            Most people read their messages in the app, so for most rules this is fine. If you would
            rather nobody can be left without a way through, clear this field: the link then travels
            in the message, which shows everywhere.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
