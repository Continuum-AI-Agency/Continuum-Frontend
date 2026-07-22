import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { AdSetData, CampaignNodeProps } from '../types';
import { AdSetNode } from './AdSetNode';

const updateNodeData = mock();
let originalUpdateNodeData: ReturnType<typeof useCampaignStore.getState>['updateNodeData'];

const buildProps = (overrides: Partial<AdSetData> = {}) =>
  ({
    id: 'adset-1',
    data: {
      label: 'Prospecting Ad Set',
      validationStatus: 'valid',
      optimizationGoal: 'CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      budgetAmount: 150,
      budgetCurrency: 'USD',
      ...overrides,
    },
    selected: false,
    type: 'ad-set',
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: '',
  }) as unknown as CampaignNodeProps<'ad-set'>;

const renderNode = async (props: CampaignNodeProps<'ad-set'>) => {
  await act(async () => {
    render(
      <ReactFlowProvider>
        <AdSetNode {...props} />
      </ReactFlowProvider>,
    );
  });
};

describe('AdSetNode budget controls', () => {
  beforeEach(() => {
    originalUpdateNodeData = useCampaignStore.getState().updateNodeData;
    useCampaignStore.setState({ updateNodeData });
    updateNodeData.mockClear();
  });

  afterEach(() => {
    useCampaignStore.setState({ updateNodeData: originalUpdateNodeData });
    cleanup();
  });

  it('defaults budget type to daily', async () => {
    await renderNode(buildProps());

    expect(screen.getByRole('button', { name: 'Daily' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Lifetime' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('updates budget type when lifetime is selected', async () => {
    await renderNode(buildProps());
    updateNodeData.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Lifetime' }));
    });

    expect(updateNodeData).toHaveBeenCalledWith('adset-1', { budgetType: 'LIFETIME' });
  });
});
