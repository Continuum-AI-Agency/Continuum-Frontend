'use client';

import {
  type EditorProjectV2,
  editorCommandBatchSchema,
  VIDEO_EDITOR_OPS,
  type VideoEditorOpName,
} from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import type { RunVideoEditorOp } from '@/components/video-studio/types';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import {
  applyVideoProjectCommands,
  getVideoProject,
  restoreVideoProjectTimeline,
} from '@/lib/api/videoProjects.client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import type { EditorCommandDraft } from '../editorProjectV2AssemblyModel';
import { type EditBuild, finalizeEdit } from './timelineEdits';

type HistoryEntry = { label: string; beforeRevision: number; afterRevision: number };
type UndoEntry = HistoryEntry & { appliedFingerprint: string };
type RedoEntry = HistoryEntry & { redoFingerprint: string };

const ACTOR_LABELS: Record<string, string> = {
  agent: 'the agent',
  system: 'Continuum',
  user: 'another session',
};

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * The open project and every way it changes: this page's edits (command batches with
 * optimistic concurrency), editor ops, undo/redo as revision restores, and edits made
 * anywhere else — the agent, MCP, another tab — which arrive over Realtime on
 * `media.editor_projects`. The initial fetch stays: a Realtime-only hook fails open.
 */
export function useEditorProject(projectId: string) {
  const { show } = useToast();
  const [project, setProject] = useState<EditorProjectV2 | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<RedoEntry[]>([]);
  const projectRef = useRef<EditorProjectV2 | null>(null);
  // Revisions this page committed itself; any other newer revision came from outside.
  const ownRevisions = useRef(new Set<number>());

  const accept = useCallback((next: EditorProjectV2) => {
    const current = projectRef.current;
    if (current && next.revision < current.revision) return current;
    projectRef.current = next;
    setProject(next);
    return next;
  }, []);

  const refresh = useCallback(
    async () => accept(await getVideoProject(projectId)),
    [accept, projectId],
  );

  const announceExternal = useCallback(
    async (revision: number) => {
      const { data } = await createSupabaseBrowserClient()
        .schema('media')
        .from('editor_project_revisions')
        .select('actor_type, summary')
        .eq('project_id', projectId)
        .eq('revision', revision)
        .maybeSingle();
      const actor = ACTOR_LABELS[data?.actor_type ?? ''] ?? 'someone else';
      show({
        title: `Updated by ${actor}`,
        description: data?.summary || `Revision ${revision} arrived live.`,
      });
    },
    [projectId, show],
  );

  useEffect(() => {
    void refresh().catch((error) =>
      show({
        title: 'Could not open the video project',
        description: errorText(error, 'Project loading failed.'),
        variant: 'error',
      }),
    );
    return subscribeToPostgresChanges({
      label: `editor_project_${projectId}`,
      bindings: [
        {
          event: 'UPDATE',
          schema: 'media',
          table: 'editor_projects',
          filter: `id=eq.${projectId}`,
          onRow: (row) => {
            const revision = typeof row.revision === 'number' ? row.revision : null;
            if (revision === null || revision <= (projectRef.current?.revision ?? -1)) return;
            void refresh().catch(() => undefined);
            if (!ownRevisions.current.has(revision)) {
              void announceExternal(revision).catch(() => undefined);
            }
          },
        },
      ],
      // Anything committed between the first fetch and the channel going live.
      onSubscribed: () => void refresh().catch(() => undefined),
    });
  }, [announceExternal, projectId, refresh, show]);

  const commit = useCallback(
    async (commands: readonly EditorCommandDraft[], label: string) => {
      const current = projectRef.current;
      if (!current || commands.length === 0) return undefined;
      const issuedAt = new Date().toISOString();
      const batchId = crypto.randomUUID();
      const actor = { actorId: 'current-user', actorType: 'user' as const };
      const batch = editorCommandBatchSchema.parse({
        batchId,
        projectId: current.projectId,
        sequenceId: current.sequenceId,
        idempotencyKey: `ui:${batchId}`,
        expectedRevision: current.revision,
        expectedFingerprint: current.fingerprint,
        atomic: true,
        issuedAt,
        actor,
        commands: commands.map((command, index) => {
          const commandId = crypto.randomUUID();
          return {
            ...command,
            commandId,
            idempotencyKey: `ui-command:${batchId}:${index}:${commandId}`,
            expectedRevision: current.revision,
            issuedAt,
            actor,
          };
        }),
      });
      setBusy(label);
      ownRevisions.current.add(current.revision + 1);
      try {
        return accept(await applyVideoProjectCommands(batch));
      } catch (error) {
        ownRevisions.current.delete(current.revision + 1);
        throw error;
      } finally {
        setBusy(null);
      }
    },
    [accept],
  );

  // Edits run one at a time, each built from the project the previous one produced —
  // three dropped files place three clips instead of racing on one stale revision.
  const queue = useRef<Promise<void>>(Promise.resolve());

  /** A timeline edit: fitted to the main track, committed, and pushed on the undo stack. */
  const apply = useCallback(
    (build: EditBuild) => {
      const run = async () => {
        const current = projectRef.current;
        if (!current) return;
        let label = 'Edit';
        try {
          const edit = typeof build === 'function' ? build(current) : build;
          if (!edit) return;
          label = edit.label;
          const fitted = finalizeEdit(current, edit);
          const next = await commit(fitted.forward, fitted.label);
          if (!next) return;
          setUndoStack((stack) => [
            ...stack,
            {
              label: edit.label,
              beforeRevision: current.revision,
              afterRevision: next.revision,
              appliedFingerprint: next.fingerprint,
            },
          ]);
          setRedoStack([]);
        } catch (error) {
          show({
            title: `${label} failed`,
            description: errorText(error, 'The timeline could not be updated.'),
            variant: 'error',
          });
          await refresh().catch(() => undefined);
        }
      };
      const next = queue.current.then(run);
      queue.current = next;
      return next;
    },
    [commit, refresh, show],
  );

  const restore = useCallback(
    async (restoreRevision: number, label: string) => {
      const current = projectRef.current;
      if (!current) return undefined;
      setBusy(label);
      ownRevisions.current.add(current.revision + 1);
      try {
        return accept(
          await restoreVideoProjectTimeline(current.projectId, {
            expectedRevision: current.revision,
            expectedFingerprint: current.fingerprint,
            restoreRevision,
            idempotencyKey: `ui-restore:${current.projectId}:${current.revision}:${restoreRevision}:${crypto.randomUUID()}`,
          }),
        );
      } catch (error) {
        ownRevisions.current.delete(current.revision + 1);
        throw error;
      } finally {
        setBusy(null);
      }
    },
    [accept],
  );

  const undo = useCallback(async () => {
    const entry = undoStack.at(-1);
    const current = projectRef.current;
    if (!entry || !current || busy) return;
    if (entry.appliedFingerprint !== current.fingerprint) {
      show({
        title: 'Undo needs the latest revision',
        description: 'The project changed after this edit. Use the history of the new edit.',
        variant: 'warning',
      });
      return;
    }
    try {
      const next = await restore(entry.beforeRevision, `Undo ${entry.label}`);
      if (!next) return;
      setUndoStack((stack) => {
        const remaining = stack.slice(0, -1);
        const previous = remaining.at(-1);
        // Restoring the same timeline creates a new revision and fingerprint.
        return previous
          ? remaining.with(-1, { ...previous, appliedFingerprint: next.fingerprint })
          : remaining;
      });
      setRedoStack((stack) => [...stack, { ...entry, redoFingerprint: next.fingerprint }]);
    } catch (error) {
      show({
        title: 'Undo failed',
        description: errorText(error, 'Undo failed.'),
        variant: 'error',
      });
    }
  }, [busy, restore, show, undoStack]);

  const redo = useCallback(async () => {
    const entry = redoStack.at(-1);
    const current = projectRef.current;
    if (!entry || !current || busy) return;
    if (entry.redoFingerprint !== current.fingerprint) {
      show({
        title: 'Redo needs the latest revision',
        description: 'The project changed after undo. Redo was left unapplied.',
        variant: 'warning',
      });
      return;
    }
    try {
      const next = await restore(entry.afterRevision, `Redo ${entry.label}`);
      if (!next) return;
      setRedoStack((stack) => {
        const remaining = stack.slice(0, -1);
        const previous = remaining.at(-1);
        return previous
          ? remaining.with(-1, { ...previous, redoFingerprint: next.fingerprint })
          : remaining;
      });
      setUndoStack((stack) => [...stack, { ...entry, appliedFingerprint: next.fingerprint }]);
    } catch (error) {
      show({
        title: 'Redo failed',
        description: errorText(error, 'Redo failed.'),
        variant: 'error',
      });
    }
  }, [busy, redoStack, restore, show]);

  const runOp = useCallback<RunVideoEditorOp>(
    async (op, input) => {
      setBusy(op);
      const spec = VIDEO_EDITOR_OPS[op as VideoEditorOpName];
      // Draft jobs commit later; their completion path refreshes the project.
      const deferred = spec.group === 'draft';
      // Claimed before the request: Realtime can deliver the op's own revision before the
      // response does, and it must not read as someone else's edit.
      const claimed = spec.commits && !deferred ? (projectRef.current?.revision ?? -1) + 1 : null;
      if (claimed !== null) ownRevisions.current.add(claimed);
      const beforeRevision = projectRef.current?.revision;
      try {
        const output = await runVideoEditorOp(projectId, op, input);
        const commit = (output as { commit?: { revision?: number; fingerprint?: string } }).commit;
        if (typeof commit?.revision === 'number') ownRevisions.current.add(commit.revision);
        if (spec.access === 'operate' && !deferred) await refresh();
        // An op this page ran is undoable like any other edit made here — except `undo`
        // itself, whose own caller (the first-cut toast) owns what it restored.
        if (
          op !== 'undo' &&
          typeof commit?.revision === 'number' &&
          commit.fingerprint &&
          beforeRevision !== undefined
        ) {
          const { revision: afterRevision, fingerprint } = commit;
          setUndoStack((stack) => [
            ...stack,
            {
              label: op.replaceAll('_', ' '),
              beforeRevision,
              afterRevision,
              appliedFingerprint: fingerprint,
            },
          ]);
          setRedoStack([]);
        }
        return output;
      } catch (error) {
        if (claimed !== null) ownRevisions.current.delete(claimed);
        throw error;
      } finally {
        setBusy(null);
      }
    },
    [projectId, refresh],
  );

  const canUndo = Boolean(project && undoStack.at(-1)?.appliedFingerprint === project.fingerprint);
  const canRedo = Boolean(project && redoStack.at(-1)?.redoFingerprint === project.fingerprint);

  return useMemo(
    () => ({ project, busy, refresh, commit, apply, runOp, undo, redo, canUndo, canRedo }),
    [project, busy, refresh, commit, apply, runOp, undo, redo, canUndo, canRedo],
  );
}

export type EditorProjectController = ReturnType<typeof useEditorProject>;
