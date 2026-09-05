// The five wired action editors. Each assertion is about the CONFIG that
// reaches `onChange`: the backend adapters validate these at preflight, so a
// shape the schema rejects is a failed run, not a form error. Every written
// config is therefore re-parsed with the contracts node schema here.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type AutomationWorkflowNode, automationWorkflowNodeSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAutomationWorkflowNode } from './automationNodeCatalog';
import { NodeConfigurationEditor } from './NodeConfigurationEditor';
import { chooseOption, installPickerDomGlobals, openSelect } from './pickers/pickerTestHarness';

installPickerDomGlobals();

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const PIPELINE_ID = '22222222-2222-4222-8222-222222222222';
const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function makeNode(type: AutomationWorkflowNode['type']): AutomationWorkflowNode {
  return createAutomationWorkflowNode({ type, id: type, position: { x: 0, y: 0 } });
}

/** Renders the editor with no brand in scope, which is the degraded path every
 *  picker must support: the stored id stays editable as plain text. */
function renderEditor(node: AutomationWorkflowNode, onChange: (config: unknown) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NodeConfigurationEditor
        node={node}
        disabled={false}
        sourceCapabilities={null}
        onChange={onChange as never}
      />
    </QueryClientProvider>,
  );
}

function expectParses(node: AutomationWorkflowNode, config: unknown) {
  const parsed = automationWorkflowNodeSchema.safeParse({ ...node, config });
  expect(parsed.error?.message ?? 'ok').toBe('ok');
}

describe('action.library_save editor', () => {
  test('writes a collection-addressed config and drops the legacy folderId alias', () => {
    const node = makeNode('action.library_save');
    // The catalog seeds `collectionId`, never the retired `folderId` alias —
    // the contracts schema documents that key as parsed-never-authored, and the
    // factory was the one caller making that untrue. Legacy graphs that still
    // carry it keep parsing; nothing new writes it.
    expect('folderId' in node.config).toBe(false);
    expect(node.config).toMatchObject({ collectionId: null });
    const onChange = mock();
    renderEditor(node, onChange);

    fireEvent.change(screen.getByLabelText('Title template'), {
      target: { value: 'Weekly recap' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      collectionId: null,
      titleTemplate: 'Weekly recap',
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });

  test('lists real collections once a brand is in scope', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ collections: [{ id: 'col-1', name: 'Brand assets' }] }),
      } as Response),
    ) as unknown as typeof fetch;

    const node = makeNode('action.library_save');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NodeConfigurationEditor
          node={node}
          disabled={false}
          sourceCapabilities={null}
          onChange={mock()}
          brandId={BRAND_ID}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const trigger = screen.getByRole('combobox', { name: 'Library collection' });
      expect(trigger.getAttribute('disabled')).toBeNull();
    });
    openSelect('Library collection');
    expect(screen.getByRole('option', { name: 'Brand assets' })).toBeTruthy();
  });
});

describe('action.planner_upsert editor', () => {
  test('replaces the retired scheduled-at path with a target, items path and bound', () => {
    const node = makeNode('action.planner_upsert');
    const onChange = mock();
    renderEditor(node, onChange);

    expect(screen.queryByLabelText('Scheduled-at path')).toBeNull();

    fireEvent.change(screen.getByLabelText('Connected account ID'), {
      target: { value: 'ig-main' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      platform: 'instagram',
      accountId: 'ig-main',
      itemsPath: 'items',
      maxDrafts: 10,
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });

  test('clamps the draft bound instead of writing a value the schema rejects', () => {
    const node = makeNode('action.planner_upsert');
    const onChange = mock();
    renderEditor(node, onChange);

    fireEvent.change(screen.getByLabelText('Maximum drafts per run'), { target: { value: '999' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxDrafts: 50 }));
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });
});

describe('action.organic_publish editor', () => {
  test('writes the platform and account together, plus the run bounds', () => {
    const node = makeNode('action.organic_publish');
    const onChange = mock();
    renderEditor(node, onChange);

    // With no brand in scope both halves stay editable, and the placeholder id
    // the catalog seeds reads as unset rather than as a real account.
    const accountField = screen.getByLabelText('Connected account ID') as HTMLInputElement;
    expect(accountField.value).toBe('');

    fireEvent.change(accountField, { target: { value: 'li-page' } });
    expect(onChange).toHaveBeenLastCalledWith({
      platform: 'instagram',
      accountId: 'li-page',
      lookaheadHours: 24,
      maxPosts: 5,
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });
});

describe('action.ai_studio_generate editor', () => {
  test('exposes the generator and output bound rather than a workflow id', () => {
    const node = makeNode('action.ai_studio_generate');
    const onChange = mock();
    renderEditor(node, onChange);

    expect(screen.queryByLabelText(/workflow/i)).toBeNull();

    openSelect('Generator');
    chooseOption('Video');

    expect(onChange).toHaveBeenLastCalledWith({
      roomId: null,
      generator: 'video',
      instructions: 'Generate a creative from the workflow context.',
      maxOutputs: 1,
      pipelineId: null,
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });

  test('choosing a published pipeline pins the output count to one', () => {
    const node = makeNode('action.ai_studio_generate');
    const onChange = mock();
    renderEditor(node, onChange);

    // No brand in scope, so the picker degrades to its raw-id field — the same
    // path an outage takes, and the one place a stored id must stay editable.
    fireEvent.change(screen.getByLabelText('Published pipeline ID'), {
      target: { value: PIPELINE_ID },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      roomId: null,
      generator: 'image',
      instructions: 'Generate a creative from the workflow context.',
      maxOutputs: 1,
      pipelineId: PIPELINE_ID,
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });

  test('a pipeline hides the generator, the output count and the workspace', () => {
    const node = makeNode('action.ai_studio_generate');
    renderEditor(
      { ...node, config: { ...node.config, pipelineId: PIPELINE_ID } } as AutomationWorkflowNode,
      mock(),
    );

    expect(screen.queryByRole('combobox', { name: 'Generator' })).toBeNull();
    expect(screen.queryByLabelText('Outputs per run')).toBeNull();
    expect(screen.queryByLabelText('AI Studio workspace ID')).toBeNull();
    expect(screen.getByLabelText("Text sent to the pipeline's input ports")).toBeTruthy();
  });
});

describe('action.paid_optimizer editor', () => {
  test('is portfolio-addressed and drops the retired entity fields', () => {
    const node = makeNode('action.paid_optimizer');
    // The factory no longer seeds the retired entity fields at all — they survive
    // only as `@deprecated` optionals so configs saved before the retarget keep
    // parsing. A newly dropped node is portfolio-addressed from birth.
    expect('targetId' in node.config).toBe(false);
    expect('targetType' in node.config).toBe(false);
    const onChange = mock();
    renderEditor(node, onChange);

    expect(screen.queryByLabelText('Target ID')).toBeNull();
    expect((screen.getByLabelText('Optimizer portfolio ID') as HTMLInputElement).value).toBe('');

    openSelect('Operation');
    chooseOption('Run an optimization cycle');

    expect(onChange).toHaveBeenLastCalledWith({
      portfolioId: null,
      operation: 'run_cycle',
      maxBudgetDeltaPct: null,
    });
    expectParses(node, onChange.mock.calls.at(-1)?.[0]);
  });

  test('offers only the two operations the optimizer really exposes', () => {
    renderEditor(makeNode('action.paid_optimizer'), mock());

    openSelect('Operation');
    expect(screen.queryByRole('option', { name: /pause/i })).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
