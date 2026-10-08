// The review step before negatives are approved: one row per search term, each with a checkbox,
// and a confirm button that says how many terms it adds. Nothing here writes — the caller gets
// the chosen terms and routes them to the approval it already owns.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '../../format';
import { negativesLabel } from '../platformCards/platformCardModel';
import {
  allChosen,
  chosenSpend,
  chosenTerms,
  type ReviewTerm,
  toggleTerm,
} from './negativeTermsReviewModel';

export function NegativeTermsReview({
  terms,
  currency,
  windowDays,
  onConfirm,
  onCancel,
}: {
  terms: readonly ReviewTerm[];
  currency: string | null;
  windowDays: number;
  onConfirm: (terms: string[]) => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState(() => allChosen(terms));
  const picked = chosenTerms(terms, chosen);

  return (
    <fieldset
      className="space-y-2 rounded-md border border-border/60 p-3"
      data-testid="negative-terms-review"
    >
      <legend className="px-1 font-medium text-foreground text-sm">
        Choose which terms become negatives
      </legend>
      <ul className="space-y-1">
        {terms.map((row) => (
          <li key={row.term}>
            <div
              className="flex items-center gap-2 text-sm"
              data-testid="negative-terms-review-row"
            >
              <Checkbox
                aria-label={`Add "${row.term}" as a negative`}
                checked={chosen.has(row.term)}
                data-testid="negative-terms-review-checkbox"
                onCheckedChange={() => setChosen((current) => toggleTerm(current, row.term))}
              />
              <span className="text-foreground">"{row.term}"</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCurrency(row.spend, currency)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs" data-testid="negative-terms-review-spend">
        The chosen terms spent {formatCurrency(chosenSpend(terms, chosen), currency)} in{' '}
        {windowDays} days.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="negative-terms-review-confirm"
          disabled={picked.length === 0}
          onClick={() => onConfirm(picked)}
          size="sm"
          type="button"
        >
          {negativesLabel(picked.length)}
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
