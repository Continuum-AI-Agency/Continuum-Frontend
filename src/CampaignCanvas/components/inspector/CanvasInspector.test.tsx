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

describe('CanvasInspector — budget mode, bid, schedule, event, URL tags (P5)', () => {
  const campaignNode = (selected: boolean, data: Record<string, unknown> = {}): CampaignCanvasNode => ({
    id: 'campaign',
    type: 'campaign',
    position: { x: 0, y: 0 },
    selected,
    data: {
      label: 'Easy Fit | Summer',
      objective: 'OUTCOME_SALES',
      buyingType: 'AUCTION',
      specialAdCategories: [],
      validationStatus: 'valid',
      ...data,
    },
  });
  const adSetNode = (selected: boolean, data: Record<string, unknown> = {}): CampaignCanvasNode => ({
    id: 'adset',
    type: 'ad-set',
    position: { x: 0, y: 300 },
    selected,
    data: {
      label: 'Prospecting',
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      budgetAmount: 50,
      budgetCurrency: 'USD',
      validationStatus: 'valid',
      ...data,
    },
  });
  const loadGraph = (nodes: CampaignCanvasNode[]) =>
    useCampaignStore.setState({
      nodes,
      edges: [{ id: 'campaign->adset', source: 'campaign', target: 'adset' }],
      history: [],
      redoStack: [],
      hydration: null,
      openAiHydration: null,
      isDirty: false,
      editLocked: false,
    });
  const dataOf = (id: string) =>
    useCampaignStore.getState().nodes.find((node) => node.id === id)?.data as Record<string, unknown>;
  const commit = async (testId: string, value: string) => {
    const input = screen.getByTestId(testId) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    });
  };

  afterEach(() => cleanup());

  it('switches the campaign to CBO and takes its daily budget, each marked as the person’s', async () => {
    loadGraph([campaignNode(true), adSetNode(false)]);
    await renderInspector();
    expect(screen.queryByTestId('inspector-field-campaignBudgetAmount')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Campaign budget (CBO)' }));
    });
    expect(dataOf('campaign').budgetMode).toBe('cbo');
    // CBO without a budget is refused at save; the inspector says so where it is fixed.
    expect(screen.getByTestId('inspector-field-issues').textContent).toContain(
      'needs a campaign daily budget',
    );
    await commit('inspector-field-campaignBudgetAmount', '120');
    expect(dataOf('campaign')).toMatchObject({
      campaignBudgetAmount: 120,
      fieldProvenance: {
        budget_mode: 'user_gave',
        campaign_daily_budget_minor_units: 'user_gave',
      },
    });
    expect(screen.queryByTestId('inspector-field-issues')).toBeNull();
  });

  it('under ABO edits the ad set’s bid amount and names a capped strategy left without one', async () => {
    loadGraph([campaignNode(false), adSetNode(true, { bidStrategy: 'COST_CAP' })]);
    await renderInspector();
    expect(screen.getByTestId('inspector-field-issues').textContent).toContain(
      'needs a bid amount',
    );
    await commit('inspector-field-bidAmount', '15');
    expect(dataOf('adset')).toMatchObject({
      bidAmount: 15,
      fieldProvenance: { bid_amount_minor_units: 'user_gave' },
    });
    expect(screen.queryByTestId('inspector-field-issues')).toBeNull();
  });

  it('under CBO hides the ad set budget and strategy, keeping its own cap when the campaign is capped', async () => {
    loadGraph([
      campaignNode(false, { budgetMode: 'cbo', campaignBudgetAmount: 120, bidStrategy: 'COST_CAP', bidAmount: 18 }),
      adSetNode(true),
    ]);
    await renderInspector();
    expect(screen.queryByTestId('inspector-field-budgetAmount')).toBeNull();
    expect(screen.getByTestId('inspector-field-budgetHeld').textContent).toContain(
      'Campaign budget (CBO)',
    );
    expect(screen.queryByTestId('inspector-field-bidStrategy')).toBeNull();
    await commit('inspector-field-bidAmount', '12');
    expect(dataOf('adset').bidAmount).toBe(12);
  });

  it('sends the schedule as ISO-8601 with the browser offset, and takes a pixel id', async () => {
    loadGraph([campaignNode(false), adSetNode(true)]);
    await renderInspector();
    await commit('inspector-field-startTime', '2099-11-01T09:00');
    const start = dataOf('adset').startTime as string;
    expect(start).toMatch(/^2099-11-01T09:00:00[+-]\d\d:\d\d$/);
    expect(Date.parse(start)).toBe(new Date('2099-11-01T09:00').getTime());
    expect((screen.getByTestId('inspector-field-startTime') as HTMLInputElement).value).toBe(
      '2099-11-01T09:00',
    );

    await commit('inspector-field-endTime', '2099-10-01T09:00');
    expect(screen.getByTestId('inspector-field-issues').textContent).toContain(
      'ends at or before it starts',
    );

    await commit('inspector-field-pixelId', ' 123456789012 ');
    expect(dataOf('adset')).toMatchObject({
      pixelId: '123456789012',
      fieldProvenance: { start_time: 'user_gave', end_time: 'user_gave', pixel_id: 'user_gave' },
    });
  });

  it('edits the ad’s URL tags and refuses a leading "?" inline', async () => {
    load([adNode('ad-1', true)]);
    await renderInspector();
    await commit('inspector-field-urlTags', '?utm_source=meta');
    expect(screen.getByTestId('inspector-field-issues').textContent).toContain('bare query string');
    await commit('inspector-field-urlTags', 'utm_source=meta&utm_medium=paid');
    expect((useCampaignStore.getState().nodes[0]?.data as AdData).urlTags).toBe(
      'utm_source=meta&utm_medium=paid',
    );
    expect(useCampaignStore.getState().nodes[0]?.data.fieldProvenance).toEqual({
      url_tags: 'user_gave',
    });
    expect(screen.queryByTestId('inspector-field-issues')).toBeNull();
  });
});
