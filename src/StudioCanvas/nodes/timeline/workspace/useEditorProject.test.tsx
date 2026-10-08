import { afterEach, expect, mock, test } from 'bun:test';
import { createEditorProjectV2 } from '@continuum/contracts';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PostgresChangesSubscription } from '@/lib/supabase/realtime';

const ID = '22222222-2222-4222-8222-222222222222';
let project = createEditorProjectV2({ projectId: ID, title: 'Edit', width: 640, height: 640 });
let reads = 0;
let subscription: PostgresChangesSubscription | undefined;
const notices: string[] = [];
const show = (notice: { title: string }) => notices.push(notice.title);
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
mock.module('@/lib/api/videoProjects.client', () => ({
  getVideoProject: async () => {
    reads++;
    return project;
  },
  applyVideoProjectCommands: async () => {
    throw new Error('Unexpected command');
  },
  restoreVideoProjectTimeline: async () => {
    throw new Error('Unexpected restore');
  },
}));
mock.module('@/lib/api/videoEditorOps.client', () => ({
  runVideoEditorOp: async (_id: string, op: string) => {
    if (op === 'draft_cut') return { jobId: 'job_pending', state: 'running' };
    if (op !== 'add_text') throw new Error(`Unexpected ${op}`);
    project = { ...project, revision: project.revision + 1, fingerprint: 'f'.repeat(64) };
    return { commit: { revision: project.revision, fingerprint: project.fingerprint } };
  },
}));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: (input: PostgresChangesSubscription) => {
    subscription = input;
    return () => undefined;
  },
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    schema: () => ({
      from: () => ({
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { actor_type: 'user', summary: 'Independent edit' } };
        },
      }),
    }),
  }),
}));
const { useEditorProject } = await import('./useEditorProject');
afterEach(() => {
  cleanup();
});

test('a pending draft does not refresh or claim a future revision; real edits still refresh', async () => {
  const { result } = renderHook(() => useEditorProject(ID));
  await waitFor(() => expect(result.current.project).not.toBeNull());
  expect(reads).toBe(1);
  await act(async () => {
    await result.current.runOp('draft_cut', { brief: 'Keep my text' });
  });
  expect(reads).toBe(1);
  expect(result.current.busy).toBeNull();
  project = { ...project, revision: 1, fingerprint: 'e'.repeat(64) };
  act(() => subscription?.bindings[0]?.onRow({ revision: 1 }, { eventType: 'UPDATE', old: {} }));
  await waitFor(() => expect(notices).toContain('Updated by another session'));
  expect(reads).toBe(2);
  await act(async () => {
    await result.current.runOp('add_text', { text: 'Title', startSec: 0 });
  });
  expect(reads).toBe(3);
  expect(result.current.project?.revision).toBe(2);
  expect(result.current.canUndo).toBe(true);
});
