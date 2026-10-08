import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createEditorProjectV2, type VideoEditorOpName } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoStudioContext } from '../types';

// Export all variants against a faked ops client: A is this project (edited through the
// workspace's runOp), B and C are siblings (edited through the client). Every cut applies
// the requested framing; B's first render fails and is retried alone.
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const LABEL: Record<string, string> = { [A]: 'A', [B]: 'B', [C]: 'C' };
const clientCalls: string[] = [];
let bFailures = 1;

mock.module('@/lib/api/videoEditorOps.client', () => ({
  runVideoEditorOp: async (projectId: string, op: string, input: { jobId?: string }) => {
    const label = LABEL[projectId] ?? '?';
    clientCalls.push(`${label}:${op}`);
    if (op === 'list_variants') {
      return {
        variants: [A, B, C].map((id) => ({
          projectId: id,
          label: LABEL[id],
          title: `Cut ${LABEL[id]}`,
          durationSec: 30,
          editorPath: '',
          current: id === A,
        })),
      };
    }
    if (op === 'set_format') return {};
    if (op === 'export') return { jobId: `job-${label}`, state: 'queued', warnings: [] };
    if (op === 'export_status') {
      if (label === 'B' && bFailures > 0) {
        bFailures -= 1;
        return { jobId: input.jobId, state: 'failed', error: 'Render timed out.' };
      }
      return {
        jobId: input.jobId,
        state: 'completed',
        assetId: `asset-${label}`,
        downloadUrl: `https://storage.test/${label}.mp4?download=`,
      };
    }
    throw new Error(`unexpected ${op}`);
  },
}));

const { ExportDialog } = await import('./ExportDialog');

afterEach(() => {
  cleanup();
  clientCalls.length = 0;
  bFailures = 1;
});

const TIMEOUT_MS = 15_000;

function renderDialog() {
  const workspaceCalls: string[] = [];
  const project = {
    ...createEditorProjectV2({ projectId: A, title: 'Cut A', width: 1080, height: 1920 }),
    brief: {
      briefId: 'brief-1',
      text: 'Three hooks',
      kind: 'hook' as const,
      targetDurationSec: 30,
      variantLabel: 'A',
      variantIndex: 0,
    },
  };
  const studio = {
    projectId: A,
    brandId: '11111111-1111-4111-8111-111111111111',
    project,
    selection: { clipIds: [] },
    playheadSec: 0,
    runOp: (async (op: VideoEditorOpName) => {
      workspaceCalls.push(`A:${op}`);
      if (op === 'export') return { jobId: 'job-A', state: 'queued', warnings: [] };
      return {};
    }) as VideoStudioContext['runOp'],
    refresh: async () => undefined,
    seek: () => undefined,
    addAssetToTimeline: async () => undefined,
  } satisfies VideoStudioContext;
  render(<ExportDialog studio={studio} open onOpenChange={() => undefined} allVariants />);
  return workspaceCalls;
}

const downloads = () =>
  screen
    .queryAllByRole('link', { name: /^Download [ABC]$/ })
    .map((link) => `${link.textContent?.trim()} ${link.getAttribute('href')}`);

describe('ExportDialog — all variants', () => {
  it(
    'exports every sibling with the requested framing and retries a failure alone',
    async () => {
      const workspaceCalls = renderDialog();
      const start = await screen.findByTestId('export-all-start');
      await waitFor(() => expect(start.textContent).toContain('Export 3 variants for TikTok'));
      fireEvent.click(start);

      await waitFor(() => expect(downloads()).toHaveLength(2), { timeout: TIMEOUT_MS });
      expect(downloads()).toEqual([
        'Download A https://storage.test/A.mp4?download=',
        'Download C https://storage.test/C.mp4?download=',
      ]);
      // This project's framing and export join its workspace history; siblings stay independent.
      expect(clientCalls.filter((call) => call.endsWith(':set_format'))).toEqual([
        'B:set_format',
        'C:set_format',
      ]);
      expect(workspaceCalls).toEqual(['A:set_format', 'A:export']);
      expect(clientCalls.filter((call) => call.endsWith(':export')).sort()).toEqual([
        'B:export',
        'C:export',
      ]);
      expect(screen.getByText('Render timed out.')).toBeTruthy();
      for (const label of ['A', 'C']) {
        expect(screen.getByRole('link', { name: `Open ${label} in Library` })).toBeTruthy();
      }

      clientCalls.length = 0;
      fireEvent.click(screen.getByRole('button', { name: 'Retry B' }));
      await waitFor(() => expect(downloads()).toHaveLength(3), { timeout: TIMEOUT_MS });
      expect(clientCalls.filter((call) => call.endsWith(':export'))).toEqual(['B:export']);
      expect(workspaceCalls).toEqual(['A:set_format', 'A:export']);
    },
    TIMEOUT_MS * 2,
  );
});
