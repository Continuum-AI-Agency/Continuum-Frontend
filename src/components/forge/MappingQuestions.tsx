'use client';

import { readableLayerName, type TemplateForgeNeed } from '@continuum/contracts';
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

// The questions a build stopped on, answered where they are asked.
//
// A multi-ratio template authors each field once per ratio comp, so the forge asks the same
// question once per comp — 43 lines for a 5-comp package that has 9 fields. They are grouped
// here by the slot they name, and one answer is sent for every comp that asked it.

const KEEP = '__keep';

export interface MappingQuestion {
  key: string;
  label: string;
  reason?: string;
  needs: TemplateForgeNeed[];
  /** Ranked by the forge; `score` > 0 means the name itself said something. */
  options: Array<{ fieldPath: string; label: string; score: number }>;
}

/** Mapping needs grouped by the slot they name; asset needs are the Variables tab's to answer. */
export function groupMappingNeeds(needs: readonly TemplateForgeNeed[]): MappingQuestion[] {
  const groups = new Map<string, MappingQuestion>();
  for (const need of needs) {
    if (need.kind !== 'mapping') continue;
    const label = readableLayerName(need.slot?.label ?? need.id);
    const key = `${label}\u0000${need.slot?.type ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.needs.push(need);
      continue;
    }
    groups.set(key, {
      key,
      label,
      ...(need.reason ? { reason: need.reason } : {}),
      needs: [need],
      options: (need.options ?? []).flatMap((option) =>
        typeof option.fieldPath === 'string'
          ? [
              {
                fieldPath: option.fieldPath,
                label: typeof option.label === 'string' ? option.label : option.fieldPath,
                score: typeof option.score === 'number' ? option.score : 0,
              },
            ]
          : [],
      ),
    });
  }
  return [...groups.values()];
}

/**
 * The answer to start from: the top option only when its NAME matched and nothing tied it.
 * A tie ordered alphabetically is not an answer, so those start unanswered.
 */
export function suggestedAnswer(question: MappingQuestion): string | undefined {
  const [top, second] = question.options;
  if (!top) return KEEP;
  return top.score > 0 && (!second || second.score < top.score) ? top.fieldPath : undefined;
}

/** The forge's decisions body: one entry per comp that asked, keyed by comp. */
export function decisionsFor(
  questions: readonly MappingQuestion[],
  answers: Readonly<Record<string, string>>,
): { mappings: Record<string, Array<Record<string, string>>> } {
  const mappings: Record<string, Array<Record<string, string>>> = {};
  for (const question of questions) {
    const answer = answers[question.key];
    if (!answer) continue;
    for (const need of question.needs) {
      const slotStableKey = need.slot?.stableKey;
      if (!slotStableKey) continue;
      const entry: Record<string, string> =
        answer === KEEP
          ? { slotStableKey, action: 'leaveStatic', reason: 'kept as designed by a person' }
          : { slotStableKey, fieldPath: answer };
      (mappings[need.comp ?? ''] ??= []).push(entry);
    }
  }
  return { mappings };
}

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
