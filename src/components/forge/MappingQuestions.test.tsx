import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateForgeNeed } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  decisionsFor,
  groupMappingNeeds,
  MappingQuestions,
  suggestedAnswer,
} from './MappingQuestions';

afterEach(cleanup);

const need = (
  comp: string,
  stableKey: string,
  label: string,
  options: Array<{ fieldPath: string; label?: string; score?: number }>,
  kind = 'mapping',
): TemplateForgeNeed => ({
  id: `${comp}:${stableKey}`,
  kind,
  comp,
  slot: { stableKey, type: 'textSource', label },
  reason: 'Only type compatibility distinguishes the candidates.',
  options,
});

const FIELDS = [
  { fieldPath: 'template_field_1', label: 'Template field 1', score: 0 },
  { fieldPath: 'template_field_2', label: 'Template field 2', score: 0 },
];

// KAMAY: the same URL field authored in two ratio comps, plus one question the name answers.
const NEEDS = [
  need('SPONSOR_9-16', 'text-11', 'URL (kamaycode.com - <textSource>)', FIELDS),
  need('SPONSOR_16-9', 'text-42', 'URL (kamaycode.com - <textSource>)', FIELDS),
  need('SPONSOR_9-16', 'text-12', 'Fecha', [
    { fieldPath: 'fecha', label: 'Fecha', score: 1 },
    { fieldPath: 'template_field_1', label: 'Template field 1', score: 0 },
  ]),
  need('SPONSOR_9-16', 'img-3', 'Logo', [], 'asset'),
];

describe('groupMappingNeeds', () => {
  test('asks once per field, not once per comp, and leaves asset needs to the Variables tab', () => {
    const questions = groupMappingNeeds(NEEDS);
    expect(questions.map((question) => [question.label, question.needs.length])).toEqual([
      ['URL (kamaycode.com - <textSource>)', 2],
      ['Fecha', 1],
    ]);
  });
});

describe('suggestedAnswer', () => {
  test('starts from the top option only when its name matched and nothing tied it', () => {
    const [url, fecha] = groupMappingNeeds(NEEDS);
    expect(suggestedAnswer(url!)).toBeUndefined();
    expect(suggestedAnswer(fecha!)).toBe('fecha');
  });
});

describe('decisionsFor', () => {
  test('sends one entry per comp that asked, keyed by comp', () => {
    const [url, fecha] = groupMappingNeeds(NEEDS);
    expect(
      decisionsFor([url!, fecha!], { [url!.key]: 'template_field_2', [fecha!.key]: '__keep' }),
    ).toEqual({
      mappings: {
        'SPONSOR_9-16': [
          { slotStableKey: 'text-11', fieldPath: 'template_field_2' },
          {
            slotStableKey: 'text-12',
            action: 'leaveStatic',
            reason: 'kept as designed by a person',
          },
        ],
        'SPONSOR_16-9': [{ slotStableKey: 'text-42', fieldPath: 'template_field_2' }],
      },
    });
  });
});

describe('MappingQuestions', () => {
  test('Apply waits until every question has an answer', () => {
    const onAnswer = mock(async () => undefined);
    render(<MappingQuestions needs={NEEDS} busy={false} onAnswer={onAnswer} />);

    expect(screen.getByText('1 still to answer.', { exact: false })).toBeTruthy();
    const apply = screen.getByRole('button', { name: 'Apply answers' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  test('a build whose questions all have a named answer can be applied at once', () => {
    const onAnswer = mock(async () => undefined);
    render(<MappingQuestions needs={[NEEDS[2]!]} busy={false} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply answers' }));
    expect(onAnswer).toHaveBeenCalledWith({
      mappings: { 'SPONSOR_9-16': [{ slotStableKey: 'text-12', fieldPath: 'fecha' }] },
    });
  });
});
