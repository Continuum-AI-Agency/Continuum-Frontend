import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  createEditorProjectV2,
  type VideoEditorOpName,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import { VIDEO_STUDIO_ASSET_DRAG_TYPE, type VideoStudioContext } from '../types';
import { GraphPoolPanel } from './GraphPoolPanel';
import { QuickStartPanel } from './QuickStartPanel';
import { MUSIC_MOODS } from './quickStarts';

afterEach(cleanup);

const TIMEOUT_MS = 30_000;
const pool: VideoEditorPoolAsset[] = [
  { assetId: 'reel', kind: 'video', title: 'Day pass reel', durationSec: 12, origin: 'graph' },
  { assetId: 'still', kind: 'image', title: 'Front desk', origin: 'graph' },
  { assetId: 'made', kind: 'image', title: 'Studio sweep', origin: 'generated' },
  { assetId: 'take', kind: 'video', title: 'Take 1', durationSec: 4, origin: 'project' },
];

const fakeStudio = (responses: Partial<Record<VideoEditorOpName, (input: unknown) => unknown>>) => {
  const calls: Array<{ op: string; input: unknown }> = [];
  const addAssetToTimeline = mock(async () => undefined);
  const refresh = mock(async () => undefined);
  const studio = {
    projectId: '22222222-2222-4222-8222-222222222222',
    brandId: '11111111-1111-4111-8111-111111111111',
    project: createEditorProjectV2({
      projectId: '22222222-2222-4222-8222-222222222222',
      title: 'Edit',
      width: 1080,
      height: 1920,
    }),
    selection: { clipIds: [] },
    playheadSec: 2.5,
    runOp: (async (op: VideoEditorOpName, input: unknown) => {
      calls.push({ op, input });
      const respond = responses[op];
      if (!respond) throw new Error(`unexpected ${op}`);
      return respond(input);
    }) as VideoStudioContext['runOp'],
    refresh,
    seek: () => undefined,
    addAssetToTimeline,
  } satisfies VideoStudioContext;
  return { studio, calls, addAssetToTimeline, refresh };
};

describe('GraphPoolPanel', () => {
  it(
    'groups the pool by origin as draggable cards that carry the asset',
    async () => {
      const { studio, addAssetToTimeline } = fakeStudio({ get_pool: () => ({ assets: pool }) });
      const view = render(<GraphPoolPanel studio={studio} />);
      await waitFor(() =>
        expect(view.container.querySelectorAll('[data-pool-asset]').length).toBe(4),
      );
      const sections = [...view.container.querySelectorAll('[data-pool-section]')].map((node) =>
        node.getAttribute('data-pool-section'),
      );
      expect(sections).toEqual(['graph', 'generated', 'project']);

      const card = view.container.querySelector('[data-pool-asset="reel"]') as HTMLElement;
      expect(card.getAttribute('draggable')).toBe('true');
      const data = new Map<string, string>();
      fireEvent.dragStart(card, {
        dataTransfer: { setData: (type: string, value: string) => data.set(type, value) },
      });
      expect(JSON.parse(data.get(VIDEO_STUDIO_ASSET_DRAG_TYPE) ?? '{}')).toEqual(pool[0]);

      fireEvent.click(view.getByLabelText('Add Day pass reel at the playhead'));
      expect(addAssetToTimeline).toHaveBeenCalledWith(pool[0]);
    },
    TIMEOUT_MS,
  );
});

describe('QuickStartPanel', () => {
  it(
    'runs a quick start at the playhead and turns the finished job into a draggable card',
    async () => {
      const made: VideoEditorPoolAsset = {
        assetId: 'new-still',
        kind: 'image',
        title: 'New still',
        origin: 'generated',
      };
      const { studio, calls, refresh } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: 'job_1', state: 'running' }),
        generate_status: () => ({
          jobId: 'job_1',
          state: 'completed',
          asset: made,
          clipId: 'generated-job_1',
        }),
      });
      const view = render(<QuickStartPanel studio={studio} />);
      expect(view.container.querySelectorAll('[data-quick-start]').length).toBe(9);

      fireEvent.click(
        view.container.querySelector('[data-quick-start="create_image"]') as HTMLElement,
      );
      const prompt = await view.findByLabelText('Prompt');
      fireEvent.change(prompt, { target: { value: 'the front desk at golden hour' } });
      fireEvent.click(view.getByRole('button', { name: 'Generate' }));

      await waitFor(() => expect(calls.some((call) => call.op === 'generate')).toBe(true));
      expect(calls.find((call) => call.op === 'generate')?.input).toEqual({
        quickStart: 'create_image',
        prompt: 'the front desk at golden hour',
        refs: [],
        // A fresh project names no platform preset, so the still is framed to its canvas.
        place: { atSec: 2.5 },
      });
      await waitFor(
        () => expect(view.container.querySelector('[data-pool-asset="new-still"]')).not.toBeNull(),
        { timeout: 8_000 },
      );
      expect(
        view.container.querySelector('[data-generation-job="job_1"]')?.getAttribute('data-state'),
      ).toBe('completed');
      expect(refresh).toHaveBeenCalled();
    },
    TIMEOUT_MS,
  );

  it(
    'a music bed takes a mood chip, follows the timeline and ducks by default, from 0:00',
    async () => {
      const { studio, calls } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: `job_bed_${calls.length}`, state: 'queued' }),
        generate_status: (input) => ({
          jobId: (input as { jobId: string }).jobId,
          state: 'running',
        }),
      });
      studio.project = { ...studio.project, durationSec: 14.25 };
      const view = render(<QuickStartPanel studio={studio} />);
      fireEvent.click(
        view.container.querySelector('[data-quick-start="music_bed"]') as HTMLElement,
      );
      const chip = (await waitFor(() => {
        const found = document.querySelector('[data-music-mood="lofi"]');
        if (!found) throw new Error('no chip');
        return found;
      })) as HTMLElement;
      expect((view.getByLabelText('Length (s)') as HTMLInputElement).value).toBe('14.3');
      expect(view.queryByLabelText('Format')).toBeNull();
      fireEvent.click(chip);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(view.getByRole('button', { name: 'Generate' }));
      await waitFor(() => expect(calls.some((call) => call.op === 'generate')).toBe(true));
      expect(calls.find((call) => call.op === 'generate')?.input).toEqual({
        quickStart: 'music_bed',
        prompt: MUSIC_MOODS[0].prompt,
        refs: [],
        place: { atSec: 0 },
        duck: true,
      });
      // An edited length rides along; the one shown follows the timeline.
      fireEvent.click(
        view.container.querySelector('[data-quick-start="music_bed"]') as HTMLElement,
      );
      const length = (await view.findByLabelText('Length (s)')) as HTMLInputElement;
      fireEvent.change(length, { target: { value: '20' } });
      fireEvent.click(document.querySelector('[data-music-mood="cinematic"]') as HTMLElement);
      fireEvent.click(view.getByRole('button', { name: 'Generate' }));
      await waitFor(() => expect(calls.filter((call) => call.op === 'generate').length).toBe(2));
      expect(calls.filter((call) => call.op === 'generate')[1]?.input).toMatchObject({
        quickStart: 'music_bed',
        durationSec: 20,
      });
    },
    TIMEOUT_MS,
  );

  const startCreateImage = async (view: ReturnType<typeof render>) => {
    fireEvent.click(
      view.container.querySelector('[data-quick-start="create_image"]') as HTMLElement,
    );
    fireEvent.change(await view.findByLabelText('Prompt'), { target: { value: 'a front desk' } });
    fireEvent.click(view.getByRole('button', { name: 'Generate' }));
  };
  const jobRow = (view: ReturnType<typeof render>, jobId: string) =>
    view.container.querySelector(`[data-generation-job="${jobId}"]`);

  it(
    'a status refused for good settles the job as failed instead of generating on',
    async () => {
      const { studio, calls } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: 'job_gone', state: 'running' }),
        generate_status: () => {
          throw new ApiError('Generation job not found', 404);
        },
      });
      const view = render(<QuickStartPanel studio={studio} />);
      await startCreateImage(view);
      await waitFor(
        () => expect(jobRow(view, 'job_gone')?.getAttribute('data-state')).toBe('failed'),
        { timeout: 8_000 },
      );
      expect(jobRow(view, 'job_gone')?.textContent).toContain('Generation job not found');
      const polls = calls.filter((call) => call.op === 'generate_status').length;
      await new Promise((resolve) => setTimeout(resolve, 3_500));
      expect(calls.filter((call) => call.op === 'generate_status').length).toBe(polls);
    },
    TIMEOUT_MS,
  );

  it(
    'a completed job that returned no media is reported, not shown as in the pool',
    async () => {
      const { studio } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: 'job_empty', state: 'running' }),
        generate_status: () => ({ jobId: 'job_empty', state: 'completed' }),
      });
      const view = render(<QuickStartPanel studio={studio} />);
      await startCreateImage(view);
      await waitFor(
        () => expect(jobRow(view, 'job_empty')?.getAttribute('data-state')).toBe('failed'),
        { timeout: 8_000 },
      );
      expect(jobRow(view, 'job_empty')?.textContent).toContain('without returning media');
      expect(jobRow(view, 'job_empty')?.textContent).not.toContain('In the pool');
    },
    TIMEOUT_MS,
  );

  it(
    'a placement is read from the timeline, never assumed from the request',
    async () => {
      const made: VideoEditorPoolAsset = {
        assetId: 'placed-still',
        kind: 'image',
        title: 'Placed still',
        origin: 'generated',
      };
      const { studio } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: 'job_placed', state: 'running' }),
        generate_status: () => ({
          jobId: 'job_placed',
          state: 'completed',
          asset: made,
          clipId: 'generated-placed',
        }),
      });
      const view = render(<QuickStartPanel studio={studio} />);
      await startCreateImage(view);
      await waitFor(
        () => expect(jobRow(view, 'job_placed')?.getAttribute('data-state')).toBe('completed'),
        { timeout: 8_000 },
      );
      // The clip is not on this timeline (yet): requested 0:02 must not be claimed.
      expect(jobRow(view, 'job_placed')?.textContent).not.toContain('Placed at');
      expect(jobRow(view, 'job_placed')?.textContent).toContain('In the pool');
      const placed = {
        ...studio.project,
        tracks: [
          {
            id: 'generated',
            name: 'Generated',
            kind: 'overlay' as const,
            order: 1,
            enabled: true,
            locked: false,
            muted: false,
            solo: false,
            clips: [{ id: 'generated-placed', timelineStartSec: 4.5, durationSec: 3 }],
          },
        ],
      } as unknown as VideoStudioContext['project'];
      view.rerender(<QuickStartPanel studio={{ ...studio, project: placed }} />);
      expect(jobRow(view, 'job_placed')?.textContent).toContain('Placed at 4.5s');
    },
    TIMEOUT_MS,
  );

  it(
    'a concept reel shows the catalog and its cost, and spends only on a second click',
    async () => {
      const { studio, calls } = fakeStudio({
        get_pool: () => ({ assets: pool }),
        generate: () => ({ jobId: 'job_reel', state: 'queued' }),
        generate_status: () => ({ jobId: 'job_reel', state: 'running' }),
      });
      const view = render(<QuickStartPanel studio={studio} />);
      fireEvent.click(
        view.container.querySelector('[data-quick-start="headless_concept"]') as HTMLElement,
      );
      await waitFor(() => expect(document.querySelectorAll('[data-concept]').length).toBe(10));
      const generate = view.getByRole('button', { name: 'Generate reel' });
      expect(generate.hasAttribute('disabled')).toBe(true);
      const offer = document.querySelector(
        '[data-concept="offer-direct"] [role="radio"]',
      ) as HTMLElement;
      fireEvent.click(offer);
      await waitFor(() =>
        expect(view.getByTestId('concept-cost').textContent).toContain('Up to $8'),
      );
      fireEvent.click(view.getByRole('button', { name: 'Generate reel' }));
      expect(calls.some((call) => call.op === 'generate')).toBe(false);
      fireEvent.click(view.getByRole('button', { name: 'Confirm, spend up to $8' }));
      await waitFor(() => expect(calls.some((call) => call.op === 'generate')).toBe(true));
      expect(calls.find((call) => call.op === 'generate')?.input).toMatchObject({
        quickStart: 'headless_concept',
        concept: 'offer-direct',
        place: { atSec: 2.5 },
      });
    },
    TIMEOUT_MS,
  );
});
