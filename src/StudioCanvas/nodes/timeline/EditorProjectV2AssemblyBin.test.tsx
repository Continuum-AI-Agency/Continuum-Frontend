// #294 — the Assembly stage told people to "drag clips from the media bin onto the
// timeline" and rendered no media bin, then filtered the pool it did get down to
// Library-pinned sources. A clip wired into the Canvas node was therefore invisible in
// the one place the record says to look. This mounts the real stage and asserts the
// wired source is listed and placeable.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  editorProjectV2Schema,
} from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { TimelineInputSource } from '../../types';
import { EditorProjectV2Assembly } from './EditorProjectV2Assembly';
import type { EditorAssemblyOperation } from './editorProjectV2AssemblyModel';
import { VideoProductionWorkspaceDialog } from './VideoProductionWorkspaceDialog';

mock.module('@/lib/library/versions', () => ({ listAssetVersions: async () => [] }));
mock.module('@/lib/api/videoProjects.client', () => ({
  getVideoProject: async () => assemblyProject(),
  getVideoProjectSummary: async () => {
    throw new Error('the media bin must not need a summary to list a wired clip');
  },
  applyVideoProjectCommands: async () => assemblyProject(),
  enqueueVideoProjectRender: async () => undefined,
  generateVideoCandidates: async () => undefined,
  restoreVideoProjectTimeline: async () => assemblyProject(),
}));

afterEach(cleanup);

const noop = () => {};

const emptyProject = (): EditorProjectV2 =>
  editorProjectV2Schema.parse(
    createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000294',
      title: 'Fresh production',
      width: 1080,
      height: 1920,
      now: '2026-09-01T00:00:00.000Z',
    }),
  );

/** The stage the record's screenshot was taken on, with nothing produced yet. */
const assemblyProject = (): EditorProjectV2 =>
  editorProjectV2Schema.parse({
    ...emptyProject(),
    production: { ...emptyProject().production, workflowStage: 'assembly' },
  });

// A clip straight off the canvas: an edge into the node, no Library pin. This is the
// shape the record was filed against.
const wiredClip: TimelineInputSource = {
  nodeId: 'clip-node',
  kind: 'video',
  label: 'bench-clip.mp4',
};

const renderAssembly = (applied: EditorAssemblyOperation[]) =>
  render(
    <ToastProvider>
      <EditorProjectV2Assembly
        project={emptyProject()}
        brandId="00000000-0000-4000-8000-0000000000b2"
        pool={[wiredClip]}
        busy={false}
        canUndo={false}
        canRedo={false}
        canRender={false}
        onApply={(operation) => applied.push(operation)}
        onUndo={noop}
        onRedo={noop}
        onRender={noop}
      />
    </ToastProvider>,
  );

describe('Assembly media bin', () => {
  it('lists a connected source that has no Library pin', () => {
    const { container } = renderAssembly([]);
    expect(container.textContent).toContain('Media bin');
    expect(container.textContent).toContain('bench-clip.mp4');
  });

  it('places the connected source on the timeline as the canvas node it came from', async () => {
    const applied: EditorAssemblyOperation[] = [];
    const { getByLabelText } = renderAssembly(applied);
    getByLabelText('Add bench-clip.mp4 to the timeline').click();
    await Promise.resolve();

    expect(applied).toHaveLength(1);
    const upsert = applied[0]?.forward.find((command) => command.commandType === 'upsert_clip');
    expect(upsert && 'clip' in upsert ? upsert.clip.kind : undefined).toBe('video');
    expect(
      upsert && 'clip' in upsert && 'source' in upsert.clip ? upsert.clip.source : undefined,
    ).toMatchObject({ sourceType: 'canvas_node', nodeId: 'clip-node' });
  });
});

describe('the Video Editor production workspace', () => {
  it('hands the media bin every connected source, not only the Library-pinned ones', async () => {
    render(
      <ToastProvider>
        <VideoProductionWorkspaceDialog
          projectId="00000000-0000-4000-8000-000000000294"
          brandId="00000000-0000-4000-8000-0000000000b2"
          pool={[wiredClip]}
          open
          onOpenChange={noop}
        />
      </ToastProvider>,
    );

    expect(await screen.findByText('bench-clip.mp4')).toBeDefined();
  });
});
