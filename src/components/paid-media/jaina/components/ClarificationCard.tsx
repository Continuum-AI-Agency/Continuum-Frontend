'use client';

// A question Jaina asked back, as the whole of her turn, on TuffUI's AgentQuestion.
//
// The question IS the answer here, so it is the card's heading, in the language Jaina asked it
// in — never relabelled. The one piece of chrome is the small "Needs your input" cue that says
// what kind of turn this is.
//
// Offered answers are real controls: one click sends the option as the reply, through the same
// path as the composer, so the run pairs it with the pending question exactly as a typed reply
// would be. "Something else…" sends free text down that same path. Nothing is offered as Undo:
// a sent reply has already started the next turn. With no way to send, the card shows only the
// question and, when the composer can be focused, a "Reply to this" link.

import { AgentQuestion } from '@/components/ui/agent-question';
import { JAINA_TYPE } from '../reading';

/**
 * A label id derived from the question, not from React's render order: the same turn must render
 * the same DOM whether it streamed in or was read back from history.
 */
const questionIdOf = (question: string): string =>
  `jaina-clarification-${Array.from(question)
    .reduce((hash, char) => (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0, 7)
    .toString(36)}`;

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
  return (
    <section data-testid="jaina-clarification" aria-label="Jaina needs your input">
      <AgentQuestion
        className="max-w-none"
        id={questionIdOf(question)}
        agent="Jaina"
        label={
          <span className={`${JAINA_TYPE.label} text-amber-700 dark:text-amber-300`}>
            Needs your input
          </span>
        }
        data={{
          question,
          // An option's text is its id: the reply Jaina receives is the words she offered.
          options: onSelectOption ? options.map((option) => ({ id: option, label: option })) : [],
          allowOther: Boolean(onSelectOption),
        }}
        disabled={disabled}
        testIds={{
          question: 'jaina-clarification-question',
          options: 'jaina-clarification-options',
        }}
        onSubmit={(answer) => {
          const reply = answer.optionIds[0] ?? answer.other;
          if (reply) onSelectOption?.(reply);
        }}
      />
      {!onSelectOption && onFocusInput ? (
        <button
          type="button"
          onClick={onFocusInput}
          className="mt-2 inline-flex cursor-pointer items-center text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Reply to this
        </button>
      ) : null}
    </section>
  );
}
