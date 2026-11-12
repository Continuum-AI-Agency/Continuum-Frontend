'use client';
import { useTranslations } from 'next-intl';

// A question Jaina asked back, as the whole of her turn.
//
// The question IS the answer here, so it is the card's body, set at the answer's size and in the
// language Jaina asked it in — never relabelled. The one piece of chrome is the small English label
// that says what kind of turn this is; it used to be a second "Clarification needed" beside a
// question that had been replaced by the same words.
//
// Offered answers are real controls: choosing one sends it as the reply, through the same path as
// the composer, so the run pairs it with the pending question exactly as a typed reply would be.

import { JAINA_TYPE } from '../reading';

type ClarificationCardProps = {
  question: string;
  options?: string[];
  /** Sends an offered answer as the reply — the composer's own submit path. */
  onSelectOption?: (option: string) => void;
  onFocusInput?: () => void;
  disabled?: boolean;
};

export function ClarificationCard({
  question,
  options = [],
  onSelectOption,
  onFocusInput,
  disabled = false,
}: ClarificationCardProps) {
  const uiText = useTranslations('scale');
  const selectableOptions = onSelectOption ? options : [];
  return (
    <section
      className="space-y-3 rounded-xl border border-amber-300/30 border-l-2 border-l-amber-400/60 bg-amber-50/8 px-4 py-3"
      data-testid="jaina-clarification"
      aria-label={uiText('jaina_needs_your_input_8dc43e1')}
    >
      <span className={`${JAINA_TYPE.label} block text-amber-700 dark:text-amber-300`}>
        {uiText('needs_your_input_b677d37')}
      </span>
      {question ? (
        <p className={JAINA_TYPE.answer} data-testid="jaina-clarification-question">
          {question}
        </p>
      ) : null}
      {selectableOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="jaina-clarification-options">
          {selectableOptions.map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onSelectOption?.(option)}
              className="inline-flex cursor-pointer items-center rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
      {onFocusInput ? (
        <button
          type="button"
          onClick={onFocusInput}
          className="inline-flex cursor-pointer items-center text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {selectableOptions.length > 0
            ? uiText('or_type_your_own_answer_8248fd8')
            : uiText('reply_to_this_482349c')}
        </button>
      ) : null}
    </section>
  );
}
