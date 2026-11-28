'use client';

// H14 Ask Home: a question bar above the tiles, with three or four questions read from the Home's
// reading. Asking opens Jaina with the question written in her composer (the same deep link the
// Optimizer's "Ask Jaina" chips use: /scale?tab=jaina&new=1&prompt=…); Jaina pre-fills it and
// waits for the person to send it. Nothing is asked, and no model runs, from the Home.

import { ArrowRightIcon, SparklesIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import type { HomeBoardContext } from '../../types';
import { askSuggestions } from './askModel';

export default function AskBar({ ctx }: { ctx: HomeBoardContext }) {
  const uiText = useTranslations('dashboard');
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const suggestions = useMemo(
    () => askSuggestions(ctx.reading, ctx.board),
    [ctx.reading, ctx.board],
  );
  const typed = question.trim();

  const openJaina = (prompt: string) => {
    router.push(jainaPromptHref(prompt, null, { newConversation: true }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typed) openJaina(typed);
  };

  return (
    <section
      aria-label={uiText('ask_jaina_0d70d16')}
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4"
      data-testid="home-ask"
    >
      <form className="flex min-w-0 items-center gap-2" onSubmit={onSubmit}>
        <SparklesIcon aria-hidden className="size-4 shrink-0 text-primary" />
        <Input
          aria-label={uiText('ask_jaina_about_this_brand_92fd972')}
          className="h-9 min-w-0 flex-1"
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={uiText('ask_jaina_about_this_brand_66df6f8')}
          value={question}
        />
        <Button aria-label={uiText('ask_jaina_0d70d16')} disabled={!typed} size="sm" type="submit">
          {uiText('ask_b8c209c')} <ArrowRightIcon aria-hidden className="size-3.5" />
        </Button>
      </form>
      {suggestions.length > 0 ? (
        <ul
          aria-label={uiText('suggested_questions_823a7e3')}
          className="flex min-w-0 flex-wrap gap-1.5"
          data-ask-suggestions=""
        >
          {suggestions.map((suggestion) => (
            <li className="min-w-0 max-w-full" key={suggestion.key}>
              <button
                className="block max-w-full truncate rounded-full bg-primary/10 px-3 py-1 text-left text-primary-ink text-xs transition-colors hover:bg-primary/15"
                data-testid="home-ask-suggestion"
                onClick={() => openJaina(suggestion.question)}
                title={suggestion.question}
                type="button"
              >
                {suggestion.question}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {uiText('opens_jaina_with_the_question_written_in_noth_de7dc82')}
      </p>
    </section>
  );
}
