import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { WebComponentNode, WebComponentProject } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createStarterProject } from '@/lib/forge-web-components/starter';

const scene: WebComponentNode[] = [
  {
    id: 'hero-orb',
    name: 'Hero orb',
    kind: 'mesh',
    parentId: null,
    properties: [
      {
        key: 'position.x',
        label: 'X position',
        type: 'number',
        value: 0,
        min: -3,
        max: 3,
        step: 0.05,
      },
    ],
  },
];
const savedId = '22222222-2222-4222-8222-222222222222';
let inspectResult: { inspected: boolean; unresolvedOverrides: unknown[] };
let saveDraft: (project: WebComponentProject) => Promise<unknown>;
const createDraft = mock(async (brandId: string, project: WebComponentProject) => ({
  id: savedId,
  brandId,
  ownerId: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  updatedAt: '2026-10-17T00:00:00.000Z',
  project,
}));
const buildDraft = mock(async (_id: string, _revision: number) => ({
  build: {
    id: '33333333-3333-4333-8333-333333333333',
    draftRevision: 1,
    inspected: false,
    unresolvedOverrides: [],
    nodes: scene,
  },
  previewHtml: '<!doctype html><html><head></head><body></body></html>',
}));
const inspectDraft = mock(async () => ({
  build: {
    id: '33333333-3333-4333-8333-333333333333',
    draftRevision: 1,
    inspected: inspectResult.inspected,
    unresolvedOverrides: inspectResult.unresolvedOverrides,
    nodes: scene,
  },
  previewHtml: '<!doctype html><html><head></head><body></body></html>',
}));
const commitDraft = mock(async () => ({
  id: '44444444-4444-4444-8444-444444444444',
  draftId: savedId,
}));
const queueRender = mock(async () => ({
  job: {
    id: '55555555-5555-4555-8555-555555555555',
    state: 'ready',
    progress: 0,
    phase: 'Queued',
    error: null,
    url: null,
  },
}));
const getRenderJob = mock(async () => ({
  job: {
    id: '55555555-5555-4555-8555-555555555555',
    state: 'completed',
    progress: 1,
    phase: 'Complete',
    error: null,
    url: 'https://storage.example.com/signed/video.mp4',
  },
}));

mock.module('next/navigation', () => ({ useRouter: () => ({ push: mock(() => {}) }) }));
mock.module('@/lib/forge-web-components/api', () => ({
  webComponentsApi: {
    list: mock(async () => []),
    create: createDraft,
    load: mock(async () => {
      throw new Error('not used');
    }),
    save: mock(async (id: string, _revision: number, project: WebComponentProject) =>
      saveDraft(project).then((draft) => ({ ...draft, id })),
    ),
    build: buildDraft,
    inspect: inspectDraft,
    commit: commitDraft,
    queueRender,
    getRenderJob,
    download: mock(async () => new Blob()),
  },
}));
mock.module('@/lib/forge-web-components/previewBridge', () => ({
  ForgePreviewBridge: class {
    ready = Promise.resolve(scene);
    constructor(_frame: HTMLIFrameElement, onNodes?: (nodes: WebComponentNode[]) => void) {
      onNodes?.(scene);
    }
    load() {}
    request = mock(async () => scene);
    dispose = mock(async () => {});
  },
}));

import { WebComponentWorkspace } from './WebComponentWorkspace';

afterEach(() => {
  cleanup();
  createDraft.mockClear();
  buildDraft.mockClear();
  inspectDraft.mockClear();
  commitDraft.mockClear();
  queueRender.mockClear();
  getRenderJob.mockClear();
});

describe('WebComponentWorkspace', () => {
  test('uploads assets under safe project-relative paths and keeps duplicate names unique', async () => {
    render(<WebComponentWorkspace brandId="11111111-1111-4111-8111-111111111111" />);
    const picker = await screen.findByLabelText('Add component assets');
    const first = new File(['first image'], '../texture map.png', { type: 'image/png' });
    const second = new File(['second image'], '../texture map.png', { type: 'image/png' });
    fireEvent.change(picker, { target: { files: [first, second] } });

    await screen.findAllByText(/^assets\//);
    const paths = Array.from(document.querySelectorAll('span[title^="assets/"]')).map((node) =>
      node.getAttribute('title'),
    );
    expect(paths).toHaveLength(2);
    expect(new Set(paths).size).toBe(2);
    for (const path of paths) {
      expect(path?.startsWith('assets/')).toBe(true);
      expect(path).not.toContain('..');
      expect(path).not.toContain('/../');
    }
  });

  test('keeps edits across a save conflict and gates publishing on inspection and current edits', async () => {
    inspectResult = { inspected: true, unresolvedOverrides: [] };
    saveDraft = async (project) => ({
      id: savedId,
      revision: 2,
      updatedAt: '2026-10-17T00:00:01.000Z',
      project,
    });
    render(<WebComponentWorkspace brandId="11111111-1111-4111-8111-111111111111" />);

    const source = await screen.findByRole('textbox', { name: 'src/main.js source' });
    const starter = createStarterProject('three').files['src/main.js'] ?? '';
    fireEvent.change(source, { target: { value: `${starter}\n// retained source edit` } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));
    await screen.findByRole('button', { name: 'Verify in render browser' });
    const publish = screen.getByRole('button', { name: 'Publish revision' });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Verify in render browser' }));
    await waitFor(() => expect(inspectDraft).toHaveBeenCalledTimes(1));
    const review = screen.getByRole('checkbox', {
      name: 'I reviewed this verified build and its editable properties.',
    });
    fireEvent.click(review);
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));

    fireEvent.change(screen.getByRole('spinbutton', { name: 'X position' }), {
      target: { value: '1.25' },
    });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Verify in render browser' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((screen.getByRole('spinbutton', { name: 'X position' }) as HTMLInputElement).value).toBe(
      '0',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect((screen.getByRole('spinbutton', { name: 'X position' }) as HTMLInputElement).value).toBe(
      '1.25',
    );

    saveDraft = async () => {
      throw new Error('409 revision conflict');
    };
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'src/main.js source' }) as HTMLTextAreaElement).value,
      ).toBe(`${starter}\n// retained source edit`),
    );
    expect(commitDraft).not.toHaveBeenCalled();
  });

  test('queues one revision-pinned render job, polls progress, and exposes its signed download URL', async () => {
    inspectResult = { inspected: true, unresolvedOverrides: [] };
    queueRender.mockResolvedValueOnce({
      job: {
        id: '55555555-5555-4555-8555-555555555555',
        state: 'ready',
        progress: 0,
        phase: 'Queued',
        error: null,
        url: null,
      },
    });
    getRenderJob
      .mockResolvedValueOnce({
        job: {
          id: '55555555-5555-4555-8555-555555555555',
          state: 'rendering',
          progress: 0.5,
          phase: 'Rendering frames',
          error: null,
          url: null,
        },
      })
      .mockResolvedValueOnce({
        job: {
          id: '55555555-5555-4555-8555-555555555555',
          state: 'completed',
          progress: 1,
          phase: 'Complete',
          error: null,
          url: 'https://storage.example.com/signed/video.mp4',
        },
      });
    render(<WebComponentWorkspace brandId="11111111-1111-4111-8111-111111111111" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(createDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));
    await waitFor(() => expect(buildDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Verify in render browser' }));
    await waitFor(() => expect(inspectDraft).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'I reviewed this verified build and its editable properties.',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Render video' }));

    await waitFor(() => expect(queueRender).toHaveBeenCalledTimes(1));
    expect(queueRender).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      { format: 'mp4' },
      expect.any(AbortSignal),
    );
    expect(commitDraft).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Rendering frames')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Download video' }, { timeout: 5000 })).toBeTruthy();
    expect(getRenderJob).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      expect.any(AbortSignal),
    );
    expect(getRenderJob).toHaveBeenCalledTimes(2);
    expect(commitDraft).toHaveBeenCalledTimes(1);
  });
});
