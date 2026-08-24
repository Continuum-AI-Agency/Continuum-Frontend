import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({ elements: [] } as unknown));

mock.module('@/lib/api/http', () => ({
  http: { request: requestMock },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import { Toolbar } from './Toolbar';

const renderToolbar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReactFlowProvider>
          <Toolbar />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

describe('Toolbar', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({ elements: [] } as never);
    useStudioStore.setState({ nodes: [], edges: [], brandId: 'brand-1' });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the run controls', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: 'Run Flow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rerun all' })).toBeTruthy();
  });

  it('does not open the Elements panel until the # button is pressed', () => {
    renderToolbar();

    expect(screen.queryByText('Elements')).toBeNull();
  });

  it('opens the Elements panel from the # button', async () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Elements' }));

    expect(await screen.findByText('No Elements yet')).toBeTruthy();
  });
});
