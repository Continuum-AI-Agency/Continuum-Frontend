import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { PipelineItem } from '@/lib/ai-studio/pipelines';
import { PipelinePicker } from './PipelinePicker';
import { chooseOption, installPickerDomGlobals, openSelect, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const PIPELINE_ID = '22222222-2222-4222-8222-222222222222';

const pipelines: PipelineItem[] = [
  {
    id: PIPELINE_ID,
    name: 'Concept art',
    inputPorts: [
      { id: 'brief', nodeRef: 'gen', handleId: 'prompt', dataType: 'text', origin: 'open' },
    ],
    outputPorts: [
      { id: 'out', nodeRef: 'gen', handleId: 'image', dataType: 'image', origin: 'terminal' },
    ],
  },
];

describe('PipelinePicker', () => {
  test('offers published pipelines plus an explicit plain-generator option', () => {
    render(
      <PipelinePicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: pipelines })}
      />,
    );

    openSelect('Published pipeline');
    expect(screen.getByRole('option', { name: 'No pipeline — plain generator' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Concept art/ })).toBeTruthy();
  });

  test('writes the pipeline id, and null when the plain generator is chosen', () => {
    const onChange = mock();
    const { rerender } = render(
      <PipelinePicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: pipelines })}
      />,
    );

    openSelect('Published pipeline');
    chooseOption(/Concept art/);
    expect(onChange).toHaveBeenLastCalledWith(PIPELINE_ID);

    rerender(
      <PipelinePicker
        brandId={BRAND_ID}
        value={PIPELINE_ID}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: pipelines })}
      />,
    );
    openSelect('Published pipeline');
    chooseOption('No pipeline — plain generator');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('says so when the brand has published nothing, rather than showing an empty list', () => {
    render(
      <PipelinePicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: [] })}
      />,
    );

    expect(screen.getByText(/no published pipelines/i)).toBeTruthy();
  });

  test('degrades to the raw pipeline id when the source errors', () => {
    render(
      <PipelinePicker
        brandId={BRAND_ID}
        value={PIPELINE_ID}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ isError: true })}
      />,
    );

    expect((screen.getByLabelText('Published pipeline ID') as HTMLInputElement).value).toBe(
      PIPELINE_ID,
    );
  });
});
