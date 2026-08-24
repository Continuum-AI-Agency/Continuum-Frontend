// The header's own logic is the apply-back block: whether it renders at all, what the
// readiness pill says, and when the Apply button is live. Every heavy child (rooms tabs,
// sync status, presence, the two workflow dialogs, the library, the toolbar) is stubbed
// so a failure here means the header, not one of them.
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

mock.module('@/components/ai-studio/CanvasRoomsTabs', () => ({
  CanvasRoomsTabs: () => <div data-testid="stub-rooms-tabs" />,
}));
mock.module('@/components/ai-studio/CanvasSyncStatus', () => ({
  CanvasSyncStatus: () => <div data-testid="stub-sync-status" />,
}));
mock.module('@/components/ai-studio/WorkflowLibrary', () => ({
  WorkflowLibrary: () => <div data-testid="stub-workflow-library" />,
}));
mock.module('@/components/presence/ActiveUsersStack', () => ({
  ActiveUsersStack: () => <div data-testid="stub-active-users" />,
}));
mock.module('./LoadWorkflowDialog', () => ({
  LoadWorkflowDialog: () => <div data-testid="stub-load-workflow-dialog" />,
}));
mock.module('./SaveWorkflowDialog', () => ({
  SaveWorkflowDialog: () => <div data-testid="stub-save-workflow-dialog" />,
}));
mock.module('./Toolbar', () => ({
  Toolbar: () => <div data-testid="stub-toolbar" />,
}));

const { StudioCanvasHeader } = await import('./StudioCanvasHeader');

type HeaderProps = Parameters<typeof StudioCanvasHeader>[0];
type ApplyProp = HeaderProps['apply'];
type RealtimeProp = HeaderProps['realtime'];

afterEach(() => {
  cleanup();
});

const realtime = {
  status: 'connected',
  dbStatus: 'idle',
  isSaving: false,
  isCollaborative: true,
  onlineUsers: [],
} as unknown as RealtimeProp;

function buildApply(overrides: Partial<ApplyProp> = {}): ApplyProp {
  return {
    enabled: true,
    applyReadiness: {
      ready: true,
      completed: 1,
      total: 2,
      label: '1/2 slides ready',
      detail: 'Generate one more slide to apply.',
    },
    workflowSummaryLabel: 'Carousel - 2 slides',
    requiresExplicitSelection: false,
    linkedinImageCandidates: [],
    selectedLinkedinNodeId: null,
    setSelectedLinkedinNodeId: mock(() => {}),
    isApplyingBack: false,
    onReturnToPlanner: mock(() => {}),
    onApplyBack: mock(async () => {}),
    ...overrides,
  } as unknown as ApplyProp;
}

function renderHeader(apply: ApplyProp) {
  return render(
    <StudioCanvasHeader
      brandProfileId="brand-1"
      activeRoomId="room-1"
      onRoomChange={mock(() => {})}
      roomsLoading={false}
      realtime={realtime}
      apply={apply}
    />,
  );
}

describe('StudioCanvasHeader', () => {
  it('marks the whole header row with its test id', () => {
    const { getByTestId } = renderHeader(buildApply({ enabled: false }));

    expect(getByTestId('studio-canvas-header')).toBeDefined();
  });

  it('hides both planner buttons when apply is not enabled', () => {
    const { queryByText } = renderHeader(buildApply({ enabled: false }));

    expect(queryByText('Back to Planner')).toBeNull();
    expect(queryByText('Apply Back to Planner')).toBeNull();
  });

  it('shows both planner buttons when apply is enabled', () => {
    const { getByText } = renderHeader(buildApply());

    expect(getByText('Back to Planner')).toBeDefined();
    expect(getByText('Apply Back to Planner')).toBeDefined();
  });

  it('renders the readiness pill from the workflow summary, label and detail', () => {
    const { getByText } = renderHeader(buildApply());

    expect(getByText('Carousel - 2 slides')).toBeDefined();
    expect(getByText('1/2 slides ready')).toBeDefined();
    expect(getByText('Generate one more slide to apply.')).toBeDefined();
  });

  it('drives the progress bar from completed / total', () => {
    const { container } = renderHeader(buildApply());

    const progress = container.querySelector('[data-slot="progress"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('drops the readiness pill when there is no workflow summary label', () => {
    const { container, queryByText } = renderHeader(buildApply({ workflowSummaryLabel: null }));

    expect(container.querySelector('[data-slot="progress"]')).toBeNull();
    expect(queryByText('1/2 slides ready')).toBeNull();
  });

  it('renders the output picker only when an explicit selection is required', () => {
    const withoutPicker = renderHeader(buildApply());
    expect(withoutPicker.queryByText('Pick one output to apply')).toBeNull();
    cleanup();

    const withPicker = renderHeader(
      buildApply({
        requiresExplicitSelection: true,
        linkedinImageCandidates: [
          { nodeId: 'node-a', kind: 'image' },
          { nodeId: 'node-b', kind: 'image' },
        ] as unknown as ApplyProp['linkedinImageCandidates'],
      }),
    );
    expect(withPicker.getByText('Pick one output to apply')).toBeDefined();
  });

  it('disables Apply while an apply is in flight, and says so', () => {
    const { getByText } = renderHeader(buildApply({ isApplyingBack: true }));

    const button = getByText('Applying...').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('disables Apply when the readiness is not ready', () => {
    const { getByText } = renderHeader(
      buildApply({
        applyReadiness: {
          ready: false,
          completed: 0,
          total: 2,
          label: '0/2 slides ready',
          detail: 'Generate the slides to apply.',
        } as unknown as ApplyProp['applyReadiness'],
      }),
    );

    const button = getByText('Apply Back to Planner').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('enables Apply and calls onApplyBack when ready and idle', () => {
    const apply = buildApply();
    const { getByText } = renderHeader(apply);

    const button = getByText('Apply Back to Planner').closest('button');
    expect(button?.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button as HTMLButtonElement);
    expect(apply.onApplyBack).toHaveBeenCalledTimes(1);
  });

  it('returns to the planner when Back to Planner is clicked', () => {
    const apply = buildApply();
    const { getByText } = renderHeader(apply);

    fireEvent.click(getByText('Back to Planner'));

    expect(apply.onReturnToPlanner).toHaveBeenCalledTimes(1);
  });
});
