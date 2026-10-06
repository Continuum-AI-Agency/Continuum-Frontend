import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createEditorProjectV2 } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VideoStudioContext } from '../types';

// list_variants is held open, so the test sees the switcher before and after it answers.
let answer: (variants: unknown[]) => void = () => undefined;
let refuse: (error: Error) => void = () => undefined;
let reads = 0;
mock.module('@/lib/api/videoEditorOps.client', () => ({
  runVideoEditorOp: () => {
    reads += 1;
    return new Promise((resolve, reject) => {
      answer = (variants) => resolve({ variants });
      refuse = reject;
    });
  },
}));
mock.module('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));

const { VariantSwitcher } = await import('./VariantSwitcher');

afterEach(cleanup);

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SIBLING_ID = '33333333-3333-4333-8333-333333333333';

const studioFor = (project: VideoStudioContext['project']) =>
  ({
    projectId: project.projectId,
    brandId: '11111111-1111-4111-8111-111111111111',
    project,
    selection: { clipIds: [] },
    playheadSec: 0,
    runOp: (async () => ({})) as unknown as VideoStudioContext['runOp'],
    refresh: async () => undefined,
    seek: () => undefined,
    addAssetToTimeline: async () => undefined,
  }) satisfies VideoStudioContext;

describe('VariantSwitcher', () => {
  it('holds "Redraft all variants" and "Export all variants" until list_variants has answered, then redrafts every sibling', async () => {
    const redrafts: number[] = [];
    const project = {
      ...createEditorProjectV2({ projectId: PROJECT_ID, title: 'A', width: 1080, height: 1920 }),
      brief: {
        briefId: 'brief-1',
        text: 'Two hooks',
        kind: 'hook' as const,
        targetDurationSec: 15,
        variantLabel: 'A',
        variantIndex: 0,
      },
    };
    const studio = {
      projectId: PROJECT_ID,
      brandId: '11111111-1111-4111-8111-111111111111',
      project,
      selection: { clipIds: [] },
      playheadSec: 0,
      runOp: (async () => ({})) as unknown as VideoStudioContext['runOp'],
      refresh: async () => undefined,
      seek: () => undefined,
      addAssetToTimeline: async () => undefined,
    } satisfies VideoStudioContext;
    render(
      <VariantSwitcher
        studio={studio}
        origin="library"
        reloadKey={0}
        onRedraft={(count) => redrafts.push(count)}
      />,
    );
    const button = screen.getByRole('button', { name: 'Redraft all variants' });
    const exportAll = screen.getByRole('button', { name: 'Export all variants' });
    // Before the answer the only tab is this project: a redraft now would redraft one.
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(exportAll.hasAttribute('disabled')).toBe(true);
    const variant = (projectId: string, label: string, current: boolean) => ({
      projectId,
      label,
      title: label,
      durationSec: 15,
      editorPath: '',
      current,
    });
    answer([variant(PROJECT_ID, 'A', true), variant(SIBLING_ID, 'B', false)]);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    expect(redrafts).toEqual([2]);
    // Export all opens the export dialog on the whole family.
    fireEvent.click(exportAll);
    const dialog = await screen.findByTestId('video-studio-export-dialog');
    expect(
      dialog.querySelector('[aria-label="What to export"] [aria-pressed="true"]')?.textContent,
    ).toBe('All variants');
    expect(screen.getByTestId('export-all-start')).toBeTruthy();
  });

  it('a failed sibling read keeps Redraft and Export-all off, says so, and retries', async () => {
    const redrafts: number[] = [];
    const project = {
      ...createEditorProjectV2({ projectId: PROJECT_ID, title: 'A', width: 1080, height: 1920 }),
      brief: {
        briefId: 'brief-2',
        text: 'Three hooks',
        kind: 'hook' as const,
        targetDurationSec: 15,
        variantLabel: 'A',
        variantIndex: 0,
      },
    };
    render(
      <VariantSwitcher
        studio={studioFor(project)}
        origin="library"
        reloadKey={0}
        onRedraft={(count) => redrafts.push(count)}
      />,
    );
    const before = reads;
    refuse(new Error('Variants unavailable (HTTP 503)'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Variants unavailable (HTTP 503)');
    // One tab is all it knows: a redraft now would silently redraft one variant, not three.
    expect(
      screen.getByRole('button', { name: 'Redraft all variants' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Export all variants' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(reads).toBe(before + 1));
    const variant = (projectId: string, label: string, current: boolean) => ({
      projectId,
      label,
      title: label,
      durationSec: 15,
      editorPath: '',
      current,
    });
    answer([
      variant(PROJECT_ID, 'A', true),
      variant(SIBLING_ID, 'B', false),
      variant('44444444-4444-4444-8444-444444444444', 'C', false),
    ]);
    const button = screen.getByRole('button', { name: 'Redraft all variants' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(button);
    expect(redrafts).toEqual([3]);
  });
});
