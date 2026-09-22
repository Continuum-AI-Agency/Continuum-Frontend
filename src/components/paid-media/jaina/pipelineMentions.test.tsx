import { afterEach, describe, expect, it, mock } from 'bun:test';
import { type PipelineCapabilityV2, pipelineCapabilityV2Schema } from '@continuum/contracts';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptInput } from '@/components/chat/prompt-input';
import type { AgentMentionProvider } from '@/lib/agent-references';
import { pipelineCapabilitiesQueryKey } from '@/lib/ai-studio/pipelines';
import { PIPELINES_MENTION_FOLDER_KEY, withPipelineMentions } from './pipelineMentions';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= TestResizeObserver as unknown as typeof ResizeObserver;
if (typeof Element !== 'undefined' && !('getAnimations' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}

const BRAND = '22222222-2222-4222-8222-222222222222';

const capability = (id: string, name: string, description?: string): PipelineCapabilityV2 =>
  pipelineCapabilityV2Schema.parse({
    contract_version: 2,
    pipeline_id: id,
    identity: {
      family_id: '11111111-1111-4111-8111-111111111111',
      revision: 1,
      contract_hash: 'a'.repeat(64),
    },
    name,
    ...(description ? { description } : {}),
    source: 'brand',
    inputs: [],
    outputs: [{ output_id: 'hero', kind: 'asset', label: 'Hero', media: 'image', count: 1 }],
    execution_policy: {
      runtime: 'server',
      timeout_seconds: 300,
      max_attempts: 1,
      max_generations: 2,
    },
    cost_policy: {
      currency: 'USD',
      max_amount_minor: null,
      approval: 'within_limit',
      on_exceed: 'refuse',
    },
    quality_policy: { minimum_score: 0.8, required_checks: ['polish'], on_failure: 'refuse' },
  });

const HERO = capability(
  '33333333-3333-4333-8333-333333333333',
  'Product hero stills',
  'Makes 9:16 product hero images for launches.',
);
const UGC = capability('44444444-4444-4444-8444-444444444444', 'Founder UGC');

const campaigns: AgentMentionProvider = {
  getSuggestions: async () => [
    {
      key: 'campaign:c-1',
      label: 'Spring sale',
      type: 'campaign',
      source: 'jaina',
      group: 'Campaigns',
      reference: { id: 'c-1', type: 'campaign', label: 'Spring sale', source: 'jaina' },
    },
  ],
  getChildSuggestions: async (parent) => [
    {
      key: `adset:${parent.key}`,
      label: 'Lookalike 1%',
      type: 'adset',
      source: 'jaina',
      reference: { id: 'as-1', type: 'adset', label: 'Lookalike 1%', source: 'jaina' },
    },
  ],
};

// Seeded under the Library's own key: the picker must read the catalog the Library caches,
// not fetch a second one.
const seededClient = (capabilities: PipelineCapabilityV2[]) => {
  const client = new QueryClient();
  client.setQueryData(pipelineCapabilitiesQueryKey(BRAND), capabilities);
  return client;
};

const setEditorText = (editor: HTMLElement, text: string): void => {
  editor.textContent = text;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editor);
  fireEvent.keyUp(editor, { key: text.at(-1) ?? '' });
};

afterEach(cleanup);

describe('Jaina @-picker Pipelines group', () => {
  it('lists published pipelines in a Pipelines family and tags the picked one', async () => {
    const onSubmit = mock();
    render(
      <PromptInput
        mentionProvider={withPipelineMentions(campaigns, seededClient([HERO, UGC]), BRAND)}
        mentionSource="jaina"
        onSubmit={onSubmit}
      />,
    );

    const editor = screen.getByRole('textbox');
    setEditorText(editor, '@');
    expect(await screen.findByText('Spring sale')).toBeDefined();
    fireEvent.click(await screen.findByText('Pipelines'));
    expect(await screen.findByText('Founder UGC')).toBeDefined();
    fireEvent.click(await screen.findByText('Product hero stills'));
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({
        id: HERO.pipeline_id,
        type: 'pipeline',
        label: 'Product hero stills',
        source: 'jaina',
        metadata: { description: 'Makes 9:16 product hero images for launches.' },
      }),
    ]);
  });

  it('leads a free-text search with matching pipelines, by name or description', async () => {
    const provider = withPipelineMentions(campaigns, seededClient([HERO, UGC]), BRAND);

    const byDescription = await provider.getSuggestions({ query: 'launch' });
    expect(byDescription.map((suggestion) => suggestion.label)).toEqual([
      'Product hero stills',
      'Spring sale',
    ]);
    expect(byDescription[0]?.reference).toEqual({
      id: HERO.pipeline_id,
      type: 'pipeline',
      label: 'Product hero stills',
      source: 'jaina',
      metadata: { description: 'Makes 9:16 product hero images for launches.' },
    });
    // A pipeline with no description carries no metadata hint.
    const [ugc] = await provider.getSuggestions({ query: 'founder' });
    expect(ugc?.reference).toEqual({
      id: UGC.pipeline_id,
      type: 'pipeline',
      label: 'Founder UGC',
      source: 'jaina',
    });
  });

  it('still hands campaign drill-downs to the campaign provider', async () => {
    const provider = withPipelineMentions(campaigns, seededClient([HERO]), BRAND);
    const [campaign] = await campaigns.getSuggestions({ query: '' });

    const children = await provider.getChildSuggestions?.(campaign!, '');

    expect(children?.map((child) => child.label)).toEqual(['Lookalike 1%']);
  });

  it('shows no Pipelines family when the brand has published none', async () => {
    const provider = withPipelineMentions(campaigns, seededClient([]), BRAND);

    const keys = (await provider.getSuggestions({ query: '' })).map((s) => s.key);

    expect(keys).toEqual(['campaign:c-1']);
    expect(keys).not.toContain(PIPELINES_MENTION_FOLDER_KEY);
  });
});
