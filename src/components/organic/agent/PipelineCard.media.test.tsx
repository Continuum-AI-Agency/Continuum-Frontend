import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import type { PipelineCardState } from './types';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// Every sign POST answers with a URL derived from the durable path, so a re-signed tile is
// recognisable on sight.
const requestMock = mock((args: { path: string; body?: unknown }) => {
  const body = args.body as { path?: string } | undefined;
  return Promise.resolve({
    signedUrl: `https://fresh/${body?.path ?? 'unknown'}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

// Everything with runtime imports loads AFTER the mocks: a module first loaded for real
// and then mocked in place is not handed back by mock.restore().
const { PipelineCard } = await import('./PipelineCard');
const { PIPELINE_STAGES } = await import('./types');
// The real calendar store: the card reads it exactly as it does in the planner.
const { useCalendarStore } = await import('@/lib/organic/store');
const setStoreDays = (days: { slots: OrganicCalendarDraft[] }[]) =>
  useCalendarStore.setState({ days } as never);
const { resetSignedUrlCache } = await import('@/lib/organic/hyperframeSign');
const { resetDraftFetches } = await import('../hooks/useDraftStoryboard');

const draft = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: 'fe-1', backendDraftId: 'draft-1', mediaCount: 0, ...over }) as OrganicCalendarDraft;

const card = (over: Partial<PipelineCardState> = {}): PipelineCardState => ({
  jobId: 'job-1',
  platform: 'instagram',
  stages: PIPELINE_STAGES.map((stage) => ({ stage, status: 'done' as const })),
  status: 'completed',
  draftId: 'draft-1',
  checkpoint: { textReady: true, blueprintReady: true },
  ...over,
});

const storyboardDraft = draft({
  mediaSuggestion: {
    storyboard: [
      { role: 'primary', bucket: 'b', storagePath: 'sb/1.png', storageUrl: 'https://resigned/sb' },
    ],
  },
});

const imageSrcs = (container: HTMLElement) =>
  [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));

// Module mocks are process-wide in bun: hand the next spec the real modules back.
afterAll(() => mock.restore());

describe('PipelineCard media ranking', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      days: [],
      backlogDrafts: [],
      accountContext: { accountIds: {}, accountOptions: {}, brandId: 'brand-1' },
    } as never);
    requestMock.mockClear();
    resetSignedUrlCache();
    resetDraftFetches();
  });
  afterEach(() => cleanup());

  it('a restored (stale) preview loses to the draft storyboard re-signed on load', () => {
    setStoreDays([{ slots: [storyboardDraft] }]);
    const { container } = render(
      <PipelineCard
        card={card({
          preview: {
            caption: null,
            imageUrl: null,
            images: ['https://expired/persisted'],
            format: 'post',
          },
          previewStale: true,
        })}
      />,
    );
    expect(imageSrcs(container)).toEqual(['https://resigned/sb']);
  });

  it('a live preview frame still wins over the storyboard', () => {
    setStoreDays([{ slots: [storyboardDraft] }]);
    const { container } = render(
      <PipelineCard
        card={card({
          preview: {
            caption: null,
            imageUrl: null,
            images: ['https://live/frame'],
            format: 'post',
          },
        })}
      />,
    );
    expect(imageSrcs(container)).toEqual(['https://live/frame']);
  });

  it('shows a finished reel as video with its poster, not a dropped image', () => {
    setStoreDays([
      {
        slots: [
          draft({
            mediaSuggestion: {
              mediaStatus: 'ready',
              reel: { thumbnailUrl: 'https://signed/poster.jpg' },
            },
            publishingAssets: [
              {
                role: 'primary',
                kind: 'video',
                storagePath: 'reel.mp4',
                storageUrl: 'https://signed/reel.mp4',
              },
            ],
          }),
        ],
      },
    ]);
    const { container } = render(
      <PipelineCard card={card({ checkpoint: { mediaStatus: 'ready' } })} />,
    );
    const video = container.querySelector('video');
    expect(video?.getAttribute('poster')).toBe('https://signed/poster.jpg');
    // A hover-play tile holds its bytes until the pointer arrives.
    expect(video?.getAttribute('src')).toBeNull();
    expect(video?.getAttribute('preload')).toBe('none');
  });

  it('a tile whose URL expired asks the draft for a fresh one and retries', async () => {
    setStoreDays([
      {
        slots: [
          draft({
            mediaSuggestion: {
              storyboard: [
                {
                  role: 'primary',
                  bucket: 'b',
                  storagePath: 'sb/9.png',
                  storageUrl: 'https://expired/sb',
                },
              ],
            },
          }),
        ],
      },
    ]);
    const { container } = render(<PipelineCard card={card()} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://expired/sb');

    fireEvent.error(img);
    await waitFor(() => expect(imageSrcs(container)).toEqual(['https://fresh/sb/9.png']));
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('holds the 220px well while a preview is being made, so its arrival shifts nothing', () => {
    const reserved = (container: HTMLElement) =>
      container.querySelector('[aria-hidden="true"].h-\\[220px\\]');
    const running = render(
      <PipelineCard card={card({ status: 'running', checkpoint: { textReady: true } })} />,
    );
    expect(reserved(running.container)).not.toBeNull();
    cleanup();

    // A run that stopped at copy has no media coming: no empty box.
    const stopped = render(<PipelineCard card={card({ checkpoint: { textReady: true } })} />);
    expect(reserved(stopped.container)).toBeNull();
    cleanup();

    // A finished card whose draft is still being looked up holds the well too.
    const lookingUp = render(<PipelineCard card={card()} />);
    expect(reserved(lookingUp.container)).not.toBeNull();
  });
});
