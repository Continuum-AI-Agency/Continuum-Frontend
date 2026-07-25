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

// Bug #220. The report was "the image stays frozen … can't make anything": a card that
// announced "Awaiting media choice" and offered nothing to click. Generate media needs
// the previewRevision approval token (the Backend rejects an absent/stale one), so the
// fix cannot be to drop that gate — the card must fall back to the re-expand action,
// which stamps a fresh token. This describe block IS the invariant.
describe('PipelineCard awaiting-media-choice invariant', () => {
  afterEach(() => cleanup());

  const affordances = () => screen.queryAllByRole('button');

  it('offers the re-expand recovery when the blueprint landed without an approval token', () => {
    const onEnrichDraft = mock(() => {});
    const onGenerateMedia = mock(() => {});
    render(
      <PipelineCard
        card={card({
          textReady: true,
          blueprintReady: true,
          mediaStatus: 'pending',
          awaitingMediaChoice: true,
        })}
        onEnrichDraft={onEnrichDraft}
        onGenerateMedia={onGenerateMedia}
      />,
    );

    // No token, so approval must NOT be offered — clicking it would only ever return
    // preview_approval_required.
    expect(screen.queryByRole('button', { name: /Generate media/ })).toBeNull();
    const recovery = screen.getByRole('button', { name: /Rebuild preview/ });
    fireEvent.click(recovery);
    expect(onEnrichDraft).toHaveBeenCalledWith('draft-1');
    expect(onGenerateMedia).not.toHaveBeenCalled();
  });

  it('never renders an awaiting-choice card with zero affordances', () => {
    // Every unsettled checkpoint shape the reducer, restoreSession and the durable
    // hydration path can produce for a draft that is waiting on the user.
    const awaitingShapes: CheckpointState[] = [
      { textReady: true },
      { textReady: true, mediaStatus: 'pending' },
      { textReady: true, blueprintReady: true },
      { textReady: true, blueprintReady: true, mediaStatus: 'pending' },
      { textReady: true, blueprintReady: true, mediaStatus: 'pending', awaitingMediaChoice: true },
      {
        textReady: true,
        blueprintReady: true,
        mediaStatus: 'pending',
        awaitingMediaChoice: true,
        previewRevision: 'revision-1',
      },
    ];

    for (const checkpoint of awaitingShapes) {
      render(
        <PipelineCard
          card={card(checkpoint)}
          onEnrichDraft={mock(() => {})}
          onGenerateMedia={mock(() => {})}
        />,
      );
      expect(affordances().length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('offers approval — not the recovery — once the token is present', () => {
    render(
      <PipelineCard
        card={card({
          textReady: true,
          blueprintReady: true,
          mediaStatus: 'pending',
          awaitingMediaChoice: true,
          previewRevision: 'revision-9',
        })}
        onEnrichDraft={mock(() => {})}
        onGenerateMedia={mock(() => {})}
      />,
    );

    expect(screen.getByRole('button', { name: /Generate media/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rebuild preview/ })).toBeNull();
  });
});

// The status badge must only turn green once media actually settled. A completed
// run that stopped at copy or blueprint is still mid-ladder, so it keeps the
// amber working tone alongside its truthful outcome label.
describe('PipelineCard outcome tone', () => {
  afterEach(() => cleanup());

  // The StatusLabel badge is the only element carrying the tabular-nums class,
  // which disambiguates it from checkpoint step labels with the same text.
  const statusBadge = (label: string) =>
    screen.getAllByText(label).find((el) => el.className.includes('tabular-nums'));

  it('stays green for a completed card whose media is ready', () => {
    render(
      <PipelineCard card={card({ textReady: true, blueprintReady: true, mediaStatus: 'ready' })} />,
    );

    const badge = statusBadge('Fully fleshed out');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('text-emerald-600');
  });

  it('stays green for a completed card with user-supplied media', () => {
    render(
      <PipelineCard
        card={card({ textReady: true, blueprintReady: true, mediaStatus: 'user_supplied' })}
      />,
    );

    const badge = statusBadge('Fully fleshed out');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('text-emerald-600');
  });

  it('keeps the working tone for a completed blueprint-only card', () => {
    render(
      <PipelineCard
        card={card({ textReady: true, blueprintReady: true, mediaStatus: 'pending' })}
      />,
    );

    const badge = statusBadge('Preview ready');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('text-amber-600');
    expect(badge?.className).not.toContain('text-emerald-600');
  });

  it('keeps the working tone for a completed text-only card', () => {
    render(<PipelineCard card={card({ textReady: true })} />);

    const badge = statusBadge('Copy ready');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('text-amber-600');
    expect(badge?.className).not.toContain('text-emerald-600');
  });

  it('leaves the failed tone untouched', () => {
    render(<PipelineCard card={card({ textReady: true }, { status: 'failed' })} />);

    const badge = statusBadge('Failed');
    expect(badge).toBeTruthy();
    expect(badge?.className).toContain('text-destructive');
  });
});
