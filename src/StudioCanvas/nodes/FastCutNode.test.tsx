import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { CUT_RUNGS_SEC, createNodeData } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useStudioStore } from '../stores/useStudioStore';
import type { FastCutNodeData } from '../types';
import { FastCutNode } from './FastCutNode';
import { fastCutPreview, fastCutSettings } from './fastCutPreview';

const NODE_ID = 'cut-1';

const baseProps: Omit<ComponentProps<typeof FastCutNode>, 'data'> = {
  id: NODE_ID,
  selected: false,
  type: 'fastCut',
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  dragHandle: undefined,
};

const nodeData = () =>
  useStudioStore.getState().nodes.find((node) => node.id === NODE_ID)?.data as FastCutNodeData;

/** React Flow hands a node its data out of the store; so does this. */
function StoreBackedNode() {
  const data = useStudioStore(
    (state) => state.nodes.find((node) => node.id === NODE_ID)?.data,
  ) as FastCutNodeData;
  return <FastCutNode {...baseProps} data={data} />;
}

const renderNode = (data: FastCutNodeData = createNodeData('fastCut').data) => {
  useStudioStore.setState({
    brandId: undefined,
    edges: [],
    nodes: [{ id: NODE_ID, type: 'fastCut', position: { x: 0, y: 0 }, data }],
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReactFlowProvider>
          <StoreBackedNode />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const ladderCounts = () =>
  screen.getAllByTestId('fast-cut-ladder-row').map((row) => ({
    rung: Number(row.getAttribute('data-rung')),
    cuts: Number(row.querySelector('[data-testid="fast-cut-ladder-count"]')?.textContent),
  }));

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

describe('FastCutNode', () => {
  beforeEach(() => {
    useStudioStore.setState({ brandId: undefined, nodes: [], edges: [] });
  });

  afterEach(cleanup);

  it('draws the footage pool and music bed inputs and one video output', () => {
    const { container } = renderNode();
    const handles = [...container.querySelectorAll('.react-flow__handle')].map((handle) => ({
      id: handle.getAttribute('data-handleid'),
      source: handle.classList.contains('source'),
    }));
    expect(handles).toEqual([
      { id: 'media-in', source: false },
      { id: 'audio-in', source: false },
      { id: 'video', source: true },
    ]);
    expect(screen.getByText('Footage pool — clips, stills, Elements')).toBeTruthy();
    expect(screen.getByText('Music bed — one Audio node')).toBeTruthy();
  });

  it('offers the four pacing presets and writes the one picked to the node', () => {
    renderNode();
    for (const name of ['Steady', 'Build', 'Stutter', 'Drop-hit']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(pressed('Build')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Drop-hit' }));

    expect(nodeData().pacing).toBe('drop-hit');
    expect(pressed('Drop-hit')).toBe(true);
    expect(screen.getByTestId('fast-cut-pacing-hint').textContent).toContain('until the drop');
  });

  it('shows the rung control only for steady and stutter', () => {
    renderNode();
    expect(screen.queryByLabelText('Rung')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Steady' }));
    expect(screen.getByLabelText('Rung')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Drop-hit' }));
    expect(screen.queryByLabelText('Rung')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Stutter' }));
    expect(screen.getByLabelText('Rung')).toBeTruthy();
  });

  it('toggles each beat-follow transient and writes them in canonical order', () => {
    renderNode();
    expect(['Punch', 'RGB shift'].every(pressed)).toBe(true);
    expect(pressed('Flash')).toBe(false);
    expect(pressed('Shake')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Flash' }));
    expect(nodeData().transients).toEqual(['flash', 'punch', 'rgb-shift']);

    fireEvent.click(screen.getByRole('button', { name: 'Shake' }));
    expect(nodeData().transients).toEqual(['flash', 'punch', 'rgb-shift', 'shake']);

    fireEvent.click(screen.getByRole('button', { name: 'Flash' }));
    expect(nodeData().transients).toEqual(['punch', 'rgb-shift', 'shake']);
    expect(pressed('Flash')).toBe(false);
  });

  it('previews a cut count for every rung, all of them for build', () => {
    renderNode();
    const counts = ladderCounts();

    expect(counts.map((row) => row.rung)).toEqual([...CUT_RUNGS_SEC]);
    for (const row of counts) expect(row.cuts, `${row.rung} s`).toBeGreaterThan(0);
    const expected = fastCutPreview(fastCutSettings(createNodeData('fastCut').data));
    if (!expected.ok) throw new Error(expected.error);
    expect(counts).toEqual(expected.rungs);
    expect(screen.getByTestId('fast-cut-preview-summary').textContent).toBe(
      `60 fps · 6.4 s · ${expected.totalCuts} cuts`,
    );
    expect(screen.getByText(/assumes 150 BPM/)).toBeTruthy();
  });

  it('previews steady on its chosen rung only', () => {
    renderNode({ ...createNodeData('fastCut').data, pacing: 'steady', rung: 0.2 });

    const counts = ladderCounts();
    expect(counts.filter((row) => row.cuts > 0)).toEqual([{ rung: 0.2, cuts: 32 }]);
    expect(counts).toHaveLength(CUT_RUNGS_SEC.length);
    expect(screen.getByTestId('fast-cut-preview-summary').textContent).toBe(
      '30 fps · 6.4 s · 32 cuts',
    );
  });

  it('says what to wire while nothing has rendered', () => {
    const { container } = renderNode();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText(/footage pool/).textContent).toContain('audio-in');
  });

  it('plays the montage a run filed, captioned with what the server measured', () => {
    const { container } = renderNode({
      ...createNodeData('fastCut').data,
      generatedVideoUrl: 'https://storage.test/cut.mp4?token=t',
      durationSec: 12.8,
      fastCutFps: 60,
      fastCutCuts: 74,
      fastCutBpm: 128.4,
    });

    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://storage.test/cut.mp4?token=t');
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
    expect(screen.getByTestId('fast-cut-result').textContent).toBe(
      '12.8 s · 60 fps · 74 cuts · 128 BPM',
    );
  });

  it("shows the run's failure on the node", () => {
    renderNode({
      ...createNodeData('fastCut').data,
      error: 'fastCut "cut-1" has no music bed — wire one Audio node',
    });
    expect(screen.getByTestId('fast-cut-error').textContent).toContain('no music bed');
  });
});
