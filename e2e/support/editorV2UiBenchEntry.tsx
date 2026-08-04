import {
  applyEditorCommandBatch,
  createEditorProjectV2,
  type EditorCommand,
  type EditorProjectV2,
  editorProjectV2Schema,
} from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { EditorProjectV2Assembly } from '../../src/StudioCanvas/nodes/timeline/EditorProjectV2Assembly';
import type { EditorAssemblyOperation } from '../../src/StudioCanvas/nodes/timeline/editorProjectV2AssemblyModel';
import type { TimelineInputSource } from '../../src/StudioCanvas/types';

const STORAGE_KEY = 'continuum:editor-v2-ui-bench';
const ACTOR = { actorId: 'browser-user', actorType: 'user' as const };

const videoClip = (id: string, startSec: number, color: string) => ({
  id,
  name: id === 'first' ? 'First' : 'Second',
  timelineStartSec: startSec,
  durationSec: 2,
  kind: 'video' as const,
  source: {
    sourceType: 'library_asset' as const,
    assetId: `asset-${id}`,
    renditionId: `version-${id}`,
  },
  sourceInSec: 0,
  playbackRate: 1,
  tags: [color],
});

function initialProject(): EditorProjectV2 {
  const base = createEditorProjectV2({
    projectId: 'browser-ui-project',
    title: 'Browser canonical editor',
    width: 320,
    height: 180,
    now: '2026-08-02T12:00:00.000Z',
  });
  return editorProjectV2Schema.parse({
    ...base,
    durationSec: 4,
    tracks: [
      {
        id: 'production-masters',
        name: 'Approved masters',
        order: 0,
        kind: 'video',
        clips: [videoClip('first', 0, 'blue'), videoClip('second', 2, 'red')],
      },
    ],
  });
}

const imageUrl =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ffdd00"/></svg>',
  );

const pool: TimelineInputSource[] = [
  {
    nodeId: 'first-source',
    kind: 'video',
    label: 'First',
    sourceAssetId: 'asset-first',
    sourceVersionId: 'version-first',
    previewUrl: 'data:video/mp4;base64,',
    durationSec: 2,
  },
  {
    nodeId: 'second-source',
    kind: 'video',
    label: 'Second',
    sourceAssetId: 'asset-second',
    sourceVersionId: 'version-second',
    previewUrl: 'data:video/mp4;base64,',
    durationSec: 2,
  },
  {
    nodeId: 'logo-source',
    kind: 'image',
    label: 'Pinned logo',
    sourceAssetId: 'asset-logo',
    sourceVersionId: 'version-logo-7',
    previewUrl: imageUrl,
  },
];

function applyDrafts(project: EditorProjectV2, drafts: EditorAssemblyOperation['forward']) {
  const issuedAt = new Date().toISOString();
  const commands = drafts.map(
    (draft) =>
      ({
        ...draft,
        commandId: crypto.randomUUID(),
        idempotencyKey: `ui-command:${crypto.randomUUID()}`,
        expectedRevision: project.revision,
        issuedAt,
        actor: ACTOR,
      }) as EditorCommand,
  );
  return applyEditorCommandBatch(project, {
    batchId: crypto.randomUUID(),
    projectId: project.projectId,
    sequenceId: project.sequenceId,
    idempotencyKey: `ui-batch:${crypto.randomUUID()}`,
    expectedRevision: project.revision,
    expectedFingerprint: project.fingerprint,
    atomic: true,
    issuedAt,
    actor: ACTOR,
    commands,
  });
}

function restore(project: EditorProjectV2, source: EditorProjectV2): EditorProjectV2 {
  return applyDrafts(project, [
    {
      commandType: 'restore_timeline_snapshot',
      snapshot: {
        sourceRevision: source.revision,
        sourceFingerprint: source.fingerprint,
        durationSec: source.durationSec,
        tracks: source.tracks,
        transitions: source.transitions,
      },
    },
  ]);
}

function readInitial(): EditorProjectV2 {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialProject();
  try {
    return editorProjectV2Schema.parse(JSON.parse(stored));
  } catch {
    return initialProject();
  }
}

function Bench() {
  const [project, setProject] = useState(readInitial);
  const revisions = useRef(new Map<number, EditorProjectV2>([[project.revision, project]]));
  const [undo, setUndo] = useState<Array<{ before: number; after: number }>>([]);
  const [redo, setRedo] = useState<Array<{ before: number; after: number }>>([]);

  useEffect(() => {
    revisions.current.set(project.revision, project);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    window.__editorV2UiBench.project = project;
  }, [project]);

  const onApply = (operation: EditorAssemblyOperation) => {
    const next = applyDrafts(project, operation.forward);
    revisions.current.set(next.revision, next);
    setUndo((current) => [...current, { before: project.revision, after: next.revision }]);
    setRedo([]);
    setProject(next);
  };

  const onUndo = () => {
    const entry = undo.at(-1);
    const source = entry ? revisions.current.get(entry.before) : undefined;
    if (!entry || !source) return;
    const next = restore(project, source);
    revisions.current.set(next.revision, next);
    setUndo((current) => current.slice(0, -1));
    setRedo((current) => [...current, entry]);
    setProject(next);
  };

  const onRedo = () => {
    const entry = redo.at(-1);
    const source = entry ? revisions.current.get(entry.after) : undefined;
    if (!entry || !source) return;
    const next = restore(project, source);
    revisions.current.set(next.revision, next);
    setRedo((current) => current.slice(0, -1));
    setUndo((current) => [...current, entry]);
    setProject(next);
  };

  return (
    <EditorProjectV2Assembly
      project={project}
      brandId="00000000-0000-4000-8000-000000000555"
      pool={pool}
      busy={false}
      canUndo={undo.length > 0}
      canRedo={redo.length > 0}
      canRender={false}
      onApply={onApply}
      onUndo={onUndo}
      onRedo={onRedo}
      onRender={() => undefined}
    />
  );
}

declare global {
  interface Window {
    __editorV2UiBench: { project: EditorProjectV2 };
  }
}

window.__editorV2UiBench = { project: initialProject() };
createRoot(document.getElementById('root') as HTMLElement).render(
  <ToastProvider>
    <Bench />
  </ToastProvider>,
);
