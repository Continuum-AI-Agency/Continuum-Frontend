import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useCampaignStore } from '../../stores/useCampaignStore';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import type { AdData, CampaignCanvasNode } from '../../types';
import { CanvasInspector } from './CanvasInspector';

const adNode = (id: string, selected: boolean): CampaignCanvasNode => ({
  id,
  type: 'ad',
  position: { x: 0, y: 0 },
  selected,
  data: {
    label: `Ad ${id}`,
    adFormat: 'IMAGE',
    primaryText: 'Body',
    headline: 'Old headline',
    callToAction: 'LEARN_MORE',
    validationStatus: 'valid',
  },
});

const load = (nodes: CampaignCanvasNode[]) =>
  useCampaignStore.setState({
    nodes,
    edges: [],
    history: [],
    redoStack: [],
    hydration: null,
    openAiHydration: null,
    isDirty: false,
  });

const renderInspector = async () => {
  await act(async () => {
    render(
      <ReactFlowProvider>
        <CanvasInspector />
      </ReactFlowProvider>,
    );
  });
};

const headlineOf = (id: string) =>
  (useCampaignStore.getState().nodes.find((node) => node.id === id)?.data as AdData).headline;

describe('CanvasInspector', () => {
  beforeEach(() => load([adNode('ad-1', true), adNode('ad-2', false)]));
  afterEach(() => cleanup());

  it('opens for exactly one selected node', async () => {
    await renderInspector();
    expect(screen.getByTestId('canvas-inspector').getAttribute('data-node-id')).toBe('ad-1');

    cleanup();
    load([adNode('ad-1', true), adNode('ad-2', true)]);
    await renderInspector();
    expect(screen.queryByTestId('canvas-inspector')).toBeNull();
  });

  it('commits a text field on blur as one undoable edit', async () => {
    await renderInspector();
    const headline = screen.getByTestId('inspector-field-headline') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(headline, { target: { value: 'New headline' } });
    });
    // Nothing is written while typing.
    expect(headlineOf('ad-1')).toBe('Old headline');

    await act(async () => {
      fireEvent.blur(headline);
    });
    expect(headlineOf('ad-1')).toBe('New headline');
    expect(useCampaignStore.getState().history).toHaveLength(1);

    await act(async () => {
      useCampaignStore.getState().undo();
    });
    expect(headlineOf('ad-1')).toBe('Old headline');
    expect((screen.getByTestId('inspector-field-headline') as HTMLInputElement).value).toBe(
      'Old headline',
    );
  });

  it('abandons a draft on Escape and refuses a blank name', async () => {
    await renderInspector();
    const headline = screen.getByTestId('inspector-field-headline') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(headline, { target: { value: 'Draft' } });
      fireEvent.keyDown(headline, { key: 'Escape' });
      fireEvent.blur(headline);
    });
    expect(headlineOf('ad-1')).toBe('Old headline');

    const name = screen.getByTestId('inspector-field-label') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(name, { target: { value: '   ' } });
      fireEvent.blur(name);
    });
    expect(useCampaignStore.getState().nodes[0]?.data.label).toBe('Ad ad-1');
    expect(name.value).toBe('Ad ad-1');
  });

  it('shows an audience name read-only on a saved scaffold, where a rename would be lost at save', async () => {
    const audience: CampaignCanvasNode = {
      id: 'audience-1',
      type: 'audience',
      position: { x: 0, y: 0 },
      selected: true,
      data: { label: 'Lapsed buyers', mode: 'broad', locations: ['MX'], validationStatus: 'valid' },
    };
    cleanup();
    load([audience]);
    await renderInspector();
    expect(screen.getByTestId('inspector-field-label')).toBeTruthy();

    cleanup();
    load([audience]);
    useCampaignStore.setState({ hydration: {} as CanvasHydration });
    await renderInspector();
    expect(screen.queryByTestId('inspector-field-label')).toBeNull();
    expect(screen.getByTestId('inspector-field-label-fixed').textContent).toBe('Lapsed buyers');
  });

  it('disables every field while a save is in flight', async () => {
    useCampaignStore.setState({ editLocked: true });
    await renderInspector();
    const headline = screen.getByTestId('inspector-field-headline') as HTMLInputElement;
    expect(headline.closest('fieldset')?.disabled).toBe(true);
    useCampaignStore.setState({ editLocked: false });
  });

  it('closes by deselecting the node', async () => {
    await renderInspector();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close ad' }));
    });
    expect(useCampaignStore.getState().nodes[0]?.selected).toBe(false);
    expect(screen.queryByTestId('canvas-inspector')).toBeNull();
  });
});
