'use client';

import {
  decisionsFor,
  groupMappingNeeds,
  KEEP_AS_DESIGNED,
  suggestedAnswer,
  type TemplateForgeNeed,
} from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The questions a build stopped on, answered where they are asked. The grouping and the
// suggested answer live in @continuum/contracts so the Backend autopilot takes the same answer.

const KEEP = KEEP_AS_DESIGNED;

export function MappingQuestions({
  needs,
  busy,
  onAnswer,
}: {
  needs: readonly TemplateForgeNeed[];
  busy: boolean;
  onAnswer: (decisions: ReturnType<typeof decisionsFor>) => Promise<void>;
}) {
  const questions = groupMappingNeeds(needs);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions.flatMap((question) => {
        const answer = suggestedAnswer(question);
        return answer ? [[question.key, answer]] : [];
      }),
    ),
  );
  if (questions.length === 0) return null;
  const unanswered = questions.filter((question) => !answers[question.key]).length;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5" aria-label="Questions">
        {questions.map((question) => (
          <li key={question.key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{question.label}</span>
              {question.needs.length > 1 ? (
                <span className="text-muted-foreground"> · {question.needs.length} formats</span>
              ) : null}
              {question.reason ? (
                <span className="block text-2xs text-muted-foreground">{question.reason}</span>
              ) : null}
            </span>
            <Select
              disabled={busy}
              value={answers[question.key] ?? null}
              onValueChange={(value) =>
                value && setAnswers((current) => ({ ...current, [question.key]: String(value) }))
              }
            >
              <SelectTrigger size="sm" className="w-56" aria-label={`Field for ${question.label}`}>
                <SelectValue placeholder="Choose a field">
                  {(value: string) =>
                    value === KEEP
                      ? 'Keep as designed'
                      : (question.options.find((option) => option.fieldPath === value)?.label ??
                        'Choose a field')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {question.options.map((option) => (
                  <SelectItem key={option.fieldPath} value={option.fieldPath}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value={KEEP}>Keep as designed</SelectItem>
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          disabled={busy || unanswered > 0}
          onClick={() => void onAnswer(decisionsFor(questions, answers))}
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          Apply answers
        </Button>
        <span className="text-muted-foreground">
          {unanswered > 0
            ? `${unanswered} still to answer. "Keep as designed" renders what the file already shows.`
            : 'The build carries on from here.'}
        </span>
      </div>
    </div>
  );
}
