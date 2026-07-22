import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PipelineCard } from './PipelineCard';
import type { CheckpointState, PipelineCardState } from './types';
import { PIPELINE_STAGES } from './types';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

function card(
  checkpoint: CheckpointState,
  overrides: Partial<PipelineCardState> = {},
): PipelineCardState {
  return {
    jobId: 'job-1',
    brandId: 'brand-1',
    platform: 'instagram',
    stages: PIPELINE_STAGES.map((stage) => ({ stage, status: 'done' as const })),
    status: 'completed',
    draftId: 'draft-1',
    checkpoint,
    ...overrides,
  };
}

describe('PipelineCard media actions', () => {
  afterEach(() => cleanup());

  it('labels a completed blueprint as awaiting choice instead of fully fleshed out', () => {
    render(
      <PipelineCard
        card={card({
          textReady: true,
          blueprintReady: true,
          mediaStatus: 'pending',
          awaitingMediaChoice: true,
        })}
        onGenerateMedia={mock(() => {})}
      />,
    );

    expect(screen.getByText('Preview ready')).toBeTruthy();
    expect(screen.getByText('Awaiting your choice')).toBeTruthy();
    expect(screen.getAllByText('Fully fleshed out')).toHaveLength(1);
  });

  it('shows Enrich for a text-ready card and dispatches with the draft id', () => {
    const onEnrichDraft = mock(() => {});
    render(<PipelineCard card={card({ textReady: true })} onEnrichDraft={onEnrichDraft} />);

    const button = screen.getByRole('button', { name: /Enrich/ });
    fireEvent.click(button);

    expect(onEnrichDraft).toHaveBeenCalledWith('draft-1');
    // The latch blocks a double dispatch.
    fireEvent.click(button);
    expect(onEnrichDraft).toHaveBeenCalledTimes(1);
  });

  it('shows Generate media once the blueprint is ready and passes the format', () => {
    const onEnrichDraft = mock(() => {});
    const onGenerateMedia = mock(() => {});
    render(
      <PipelineCard
        card={card(
          { textReady: true, blueprintReady: true, previewRevision: 'revision-1' },
          { preview: { caption: null, imageUrl: null, format: 'carousel' } },
        )}
        onEnrichDraft={onEnrichDraft}
        onGenerateMedia={onGenerateMedia}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enrich/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Generate media/ }));

    expect(onGenerateMedia).toHaveBeenCalledWith('draft-1', 'carousel', 'revision-1');
  });

  it('hides both actions once media is settled', () => {
    render(
      <PipelineCard
        card={card({ textReady: true, blueprintReady: true, mediaStatus: 'ready' })}
        onEnrichDraft={mock(() => {})}
        onGenerateMedia={mock(() => {})}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enrich/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate media/ })).toBeNull();
  });

  it('renders no actions when handlers are not wired (non-chat surfaces)', () => {
    render(<PipelineCard card={card({ textReady: true, blueprintReady: true })} />);

    expect(screen.queryByRole('button', { name: /Enrich/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate media/ })).toBeNull();
  });

  it('requires a draftId before offering either action', () => {
    render(
      <PipelineCard
        card={card({ textReady: true }, { draftId: null })}
        onEnrichDraft={mock(() => {})}
        onGenerateMedia={mock(() => {})}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enrich/ })).toBeNull();
  });
});
