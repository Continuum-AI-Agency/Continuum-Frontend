import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createEditorProjectV2, type VideoEditorOpName } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/errors';
import type { VideoStudioContext } from '../types';

// The dialog polls draft_cut_status straight through the ops client (never the workspace's
// busy-setting runOp), so the client, the router and the toasts are the seams faked here.
let pollAnswers: Array<() => unknown> = [];
const polled: string[] = [];
const toasts: Array<{ title: string; action?: { label: string; onClick: () => void } }> = [];

mock.module('@/lib/api/videoEditorOps.client', () => ({
  runVideoEditorOp: async (_projectId: string, op: string) => {
    if (op === 'get_pool') return { assets: [] };
    polled.push(op);
    const answer = pollAnswers.shift();
    if (!answer) throw new Error(`unexpected ${op}`);
    return answer();
  },
}));
mock.module('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: (toast: (typeof toasts)[number]) => toasts.push(toast) }),
}));

const { BriefDialog } = await import('./BriefDialog');

afterEach(() => {
  cleanup();
  pollAnswers = [];
  polled.length = 0;
  toasts.length = 0;
});

const TIMEOUT_MS = 10_000;
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const footage = [{ assetId: 'reel', kind: 'video' as const, title: 'Reel', origin: 'project' as const }];

function renderDialog(runOp: (op: VideoEditorOpName, input: unknown) => unknown) {
  const calls: Array<{ op: string; input: unknown }> = [];
  const project = { ...createEditorProjectV2({ projectId: PROJECT_ID, title: 'Edit', width: 1080, height: 1920 }), revision: 7 };
  const studio = {
    projectId: PROJECT_ID,
    brandId: '11111111-1111-4111-8111-111111111111',
    project,
    selection: { clipIds: [] },
    playheadSec: 0,
    runOp: (async (op: VideoEditorOpName, input: unknown) => {
      calls.push({ op, input });
      return runOp(op, input);
    }) as VideoStudioContext['runOp'],
    refresh: async () => undefined,
    seek: () => undefined,
    addAssetToTimeline: async () => undefined,
  } satisfies VideoStudioContext;
  render(
    <BriefDialog
      studio={studio}
      origin="library"
      open
      onOpenChange={() => undefined}
      sources={footage}
      seed={null}
      onDrafted={() => undefined}
      onRunningChange={() => undefined}
    />,
  );
  return calls;
}

const submit = () => fireEvent.click(screen.getByTestId('brief-submit'));

describe('BriefDialog', () => {
  it(
    'a failed draft, then a draft whose request errors, leaves no progress stuck on screen',
    async () => {
      let started = 0;
      const calls = renderDialog((op) => {
        if (op !== 'draft_cut') throw new Error(op);
        started += 1;
        if (started === 1) return { jobId: 'job_1', state: 'running' };
        throw new Error('The draft could not start.');
      });
      pollAnswers.push(() => ({ jobId: 'job_1', state: 'failed', error: 'No speech found.' }));
      submit();
      await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No speech found.'), {
        timeout: TIMEOUT_MS,
      });
      submit();
      await waitFor(
        () => expect(screen.getByRole('alert').textContent).toContain('The draft could not start.'),
        { timeout: TIMEOUT_MS },
      );
      expect(screen.queryByTestId('brief-progress')).toBeNull();
      expect(screen.getByTestId('brief-submit').textContent).toContain('Draft 1 cut');
      // The format was never touched, so the draft keeps the project's own.
      expect(calls[0]?.input).not.toHaveProperty('preset');
    },
    TIMEOUT_MS,
  );

  it(
    'a permanent 4xx on a poll stops polling and says so',
    async () => {
      renderDialog(() => ({ jobId: 'job_2', state: 'running' }));
      pollAnswers.push(() => {
        throw new ApiError('No draft job_2 on this project.', 404);
      });
      submit();
      await waitFor(
        () => expect(screen.getByRole('alert').textContent).toContain('No draft job_2'),
        { timeout: TIMEOUT_MS },
      );
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(polled).toEqual(['draft_cut_status']);
      expect(screen.queryByTestId('brief-progress')).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    'a finished draft stays as a summary, and its toast undoes back to the revision it replaced',
    async () => {
      const calls = renderDialog((op) =>
        op === 'draft_cut'
          ? { jobId: 'job_3', state: 'running' }
          : { restoredRevision: 7, commit: { revision: 9, fingerprint: 'f', summary: 'Undo' } },
      );
      const variant = (label: string, projectId: string) => ({
        projectId,
        label,
        angle: `Angle ${label}`,
        durationSec: 29.5,
        editorPath: `/studio/video/${projectId}?origin=library`,
        segments: [],
        commit: { revision: 8, fingerprint: 'f', summary: 'Drafted' },
      });
      pollAnswers.push(() => ({
        jobId: 'job_3',
        state: 'completed',
        progress: 1,
        phase: 'Done',
        variants: [
          variant('A', PROJECT_ID),
          variant('B', '33333333-3333-4333-8333-333333333333'),
        ],
        warnings: ['B is 2 s short of the target.'],
      }));
      submit();
      await waitFor(() => expect(screen.getByTestId('brief-summary')).toBeTruthy(), {
        timeout: TIMEOUT_MS,
      });
      const rows = screen.getByTestId('brief-summary').querySelectorAll('li[data-variant]');
      expect([...rows].map((row) => row.getAttribute('data-variant'))).toEqual(['A', 'B']);
      expect(screen.getByText('B is 2 s short of the target.')).toBeTruthy();
      const undo = toasts.at(-1)?.action;
      expect(undo?.label).toBe('Undo');
      undo?.onClick();
      await waitFor(() => expect(calls.at(-1)).toEqual({ op: 'undo', input: { toRevision: 7 } }));
    },
    TIMEOUT_MS,
  );
});
