'use client';

import type {
  WebComponentFramework,
  WebComponentNode,
  WebComponentOverride,
  WebComponentProject,
  WebComponentRenderJob,
} from '@continuum/contracts';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Code2,
  Download,
  Play,
  Redo2,
  Save,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayerDraftState } from '@/components/forge/layerDraft';
import { useForgeExitGuard } from '@/components/forge/useForgeExitGuard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast-imperative';
import { type WebComponentDraftSummary, webComponentsApi } from '@/lib/forge-web-components/api';
import { ForgePreviewBridge } from '@/lib/forge-web-components/previewBridge';
import { createStarterProject } from '@/lib/forge-web-components/starter';

type SavedDraft = { id: string; revision: number; project: WebComponentProject };
type History = {
  past: WebComponentProject[];
  present: WebComponentProject;
  future: WebComponentProject[];
};

function sameProject(a: WebComponentProject, b: WebComponentProject) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const RENDER_POLL_INTERVAL_MS = 1500;
const RENDER_POLL_MAX_DURATION_MS = 15 * 60 * 1000;
const TERMINAL_RENDER_STATES = new Set(['completed', 'failed', 'cancelled', 'superseded']);

function waitForRenderPoll(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Render status polling stopped.', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Render status polling stopped.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function PropertyEditor({
  node,
  propertyKey,
  value,
  onChange,
}: {
  node: WebComponentNode;
  propertyKey: string;
  value: WebComponentNode['properties'][number]['value'];
  onChange: (value: WebComponentNode['properties'][number]['value']) => void;
}) {
  const property = node.properties.find((item) => item.key === propertyKey);
  if (!property) return null;
  const inputId = `forge-property-${node.id}-${property.key}`;
  return (
    <label
      htmlFor={inputId}
      className="grid grid-cols-[minmax(5rem,1fr)_minmax(6rem,1.2fr)] items-center gap-2 py-1.5 text-xs"
    >
      <span className="truncate text-muted-foreground" title={property.label}>
        {property.label}
      </span>
      {property.type === 'boolean' ? (
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 justify-self-end accent-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : property.type === 'color' ? (
        <input
          id={inputId}
          type="color"
          value={typeof value === 'string' ? value : '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-full cursor-pointer rounded border border-input bg-background p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : property.type === 'select' ? (
        <select
          id={inputId}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(property.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type={property.type === 'number' ? 'number' : 'text'}
          value={typeof value === 'boolean' ? String(value) : value}
          min={property.min}
          max={property.max}
          step={property.step}
          onChange={(event) =>
            onChange(property.type === 'number' ? Number(event.target.value) : event.target.value)
          }
          className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </label>
  );
}

function ProjectName({
  project,
  onChange,
}: {
  project: WebComponentProject;
  onChange: (name: string) => void;
}) {
  return (
    <input
      aria-label="Component name"
      value={project.name}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 min-w-28 max-w-64 border-0 bg-transparent px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function WebComponentWorkspace({
  brandId,
}: {
  brandId: string;
}) {
  const exitGuard = useForgeExitGuard();
  const [drafts, setDrafts] = useState<WebComponentDraftSummary[]>([]);
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: createStarterProject('three'),
    future: [],
  }));
  const project = history.present;
  const [activeFile, setActiveFile] = useState(project.entry);
  const [nodes, setNodes] = useState<WebComponentNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [built, setBuilt] = useState<{
    id: string;
    draftRevision: number;
    inspected: boolean;
    unresolved: WebComponentOverride[];
  } | null>(null);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string | null>(null);
  const [renderJob, setRenderJob] = useState<{
    revisionId: string;
    format: 'png' | 'mp4';
    job: WebComponentRenderJob;
  } | null>(null);
  const [renderPolling, setRenderPolling] = useState(false);
  const [renderPollError, setRenderPollError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<
    'load' | 'save' | 'build' | 'commit' | 'render' | 'export' | null
  >(null);
  const [playhead, setPlayhead] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<ForgePreviewBridge | null>(null);
  const renderPollControllerRef = useRef<AbortController | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const dirty = !saved || !sameProject(project, saved.project);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const propertyOverrides = useMemo(
    () => project.overrides.filter((item) => item.nodeId === selectedNodeId),
    [project.overrides, selectedNodeId],
  );
  const unresolved = built?.unresolved ?? [];
  const buildMatchesDraft = Boolean(
    !dirty && saved && built && built.draftRevision === saved.revision,
  );

  const update = useCallback((next: WebComponentProject) => {
    setHistory((current) => ({
      past: [...current.past.slice(-49), current.present],
      present: next,
      future: [],
    }));
    setBuilt(null);
    setReviewed(false);
    setPublishedRevisionId(null);
  }, []);

  const refreshDrafts = useCallback(async () => {
    const result = await webComponentsApi.list(brandId);
    setDrafts(result);
  }, [brandId]);
  useEffect(() => {
    let active = true;
    void webComponentsApi
      .list(brandId)
      .then((result) => {
        if (active) setDrafts(result);
      })
      .catch((error: unknown) => {
        if (active)
          toast.error(error instanceof Error ? error.message : 'Could not load component drafts');
      });
    return () => {
      active = false;
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      renderPollControllerRef.current?.abort();
      renderPollControllerRef.current = null;
    };
  }, [brandId]);

  useEffect(() => {
    const host = previewHostRef.current;
    const bridge = bridgeRef.current;
    if (!built || !host || !bridge || typeof ResizeObserver === 'undefined') return;
    let active = true;
    let observer: ResizeObserver | null = null;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      void bridge
        .request('resize', {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        })
        .catch((error: unknown) => {
          if (active)
            setPreviewError(error instanceof Error ? error.message : 'Could not resize preview');
        });
    };
    void bridge.ready
      .then(() => {
        if (!active) return;
        observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [built]);

  const loadDraft = async (id: string) => {
    if (!id) return;
    await bridgeRef.current?.dispose();
    bridgeRef.current = null;
    setBusy('load');
    try {
      const draft = await webComponentsApi.load(id);
      setSaved({ id: draft.id, revision: draft.revision, project: draft.project });
      setHistory({ past: [], present: draft.project, future: [] });
      setActiveFile(draft.project.entry);
      setNodes([]);
      setBuilt(null);
      setPublishedRevisionId(null);
      setSelectedNodeId(null);
      setPlayhead(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open draft');
    } finally {
      setBusy(null);
    }
  };

  const newProject = async (framework: WebComponentFramework) => {
    await bridgeRef.current?.dispose();
    bridgeRef.current = null;
    const next = createStarterProject(framework);
    setSaved(null);
    setHistory({ past: [], present: next, future: [] });
    setActiveFile(next.entry);
    setNodes([]);
    setBuilt(null);
    setPublishedRevisionId(null);
    setSelectedNodeId(null);
    setPlayhead(0);
  };

  const save = useCallback(async () => {
    if (!dirty || busy) return saved;
    setBusy('save');
    try {
      const draft = saved
        ? await webComponentsApi.save(saved.id, saved.revision, project)
        : await webComponentsApi.create(brandId, project);
      const nextSaved = { id: draft.id, revision: draft.revision, project: draft.project };
      setSaved(nextSaved);
      await refreshDrafts();
      toast.success('Draft saved');
      return nextSaved;
    } catch (error) {
      toast.error(
        error instanceof Error && /409|conflict|revision/i.test(error.message)
          ? 'This draft changed elsewhere. Reload it before saving.'
          : error instanceof Error
            ? error.message
            : 'Could not save draft',
      );
      return null;
    } finally {
      setBusy(null);
    }
  }, [brandId, busy, dirty, project, refreshDrafts, saved]);

  useEffect(() => {
    if (!dirty) {
      exitGuard.onDraftChange(null);
      return;
    }
    const draft: LayerDraftState = {
      dirty: true,
      busy: busy !== null,
      saveLabel: 'Save component draft',
      save: async () => Boolean(await save()),
      discard: () => {
        const restored = saved?.project ?? createStarterProject(project.framework);
        setHistory({ past: [], present: restored, future: [] });
        setActiveFile(restored.entry);
        setBuilt(null);
        setPublishedRevisionId(null);
        setReviewed(false);
        exitGuard.onDraftChange(null);
      },
    };
    exitGuard.onDraftChange(draft);
    return () => exitGuard.onDraftChange(null);
  }, [busy, dirty, exitGuard.onDraftChange, project.framework, save, saved]);

  const build = async () => {
    const draft = dirty ? await save() : saved;
    if (!draft) return;
    setBusy('build');
    setPreviewError(null);
    setReviewed(false);
    setPublishedRevisionId(null);
    await bridgeRef.current?.dispose();
    const bridge = frameRef.current
      ? new ForgePreviewBridge(
          frameRef.current,
          (scene) => setNodes(scene),
          (error) => setPreviewError(error.message),
        )
      : null;
    bridgeRef.current = bridge;
    try {
      const result = await webComponentsApi.build(draft.id, draft.revision);
      setBuilt({
        id: result.build.id,
        draftRevision: result.build.draftRevision,
        inspected: result.build.inspected,
        unresolved: result.build.unresolvedOverrides,
      });
      bridge?.load(result.previewHtml);
      if (bridge) await bridge.ready;
      const scene = result.build.nodes;
      setNodes(scene);
      setSelectedNodeId((current) =>
        scene.some((node) => node.id === current) ? current : (scene[0]?.id ?? null),
      );
      toast.success('Preview is ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Build failed';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const inspect = async () => {
    if (!saved || !built || busy) return;
    setBusy('build');
    setPreviewError(null);
    setReviewed(false);
    try {
      const result = await webComponentsApi.inspect(saved.id, built.id);
      setBuilt({
        id: result.build.id,
        draftRevision: result.build.draftRevision,
        inspected: result.build.inspected,
        unresolved: result.build.unresolvedOverrides,
      });
      setNodes(result.build.nodes);
      toast.success(
        result.build.inspected
          ? 'Build verified in the render browser'
          : 'Build could not be verified',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Build verification failed';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const setOverride = (nodeId: string, property: string, value: WebComponentOverride['value']) => {
    const overrides = project.overrides.filter(
      (item) => !(item.nodeId === nodeId && item.property === property),
    );
    const nextOverrides = [...overrides, { nodeId, property, value }];
    update({ ...project, overrides: nextOverrides });
    const bridge = bridgeRef.current;
    if (bridge)
      void bridge
        .request<WebComponentOverride[]>('applyOverrides', { overrides: nextOverrides })
        .then(() => bridge.request<WebComponentNode[]>('describeScene'))
        .then(setNodes)
        .catch((error: unknown) =>
          setPreviewError(error instanceof Error ? error.message : 'Could not update preview'),
        );
  };

  const seek = async (timeSec: number) => {
    const next = Math.max(0, Math.min(project.durationSec, timeSec));
    setPlayhead(next);
    try {
      await bridgeRef.current?.request('renderAt', { timeSec: next });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview seek failed');
    }
  };

  const undo = () => {
    setHistory((current) =>
      current.past.length
        ? {
            past: current.past.slice(0, -1),
            present: current.past[current.past.length - 1]!,
            future: [current.present, ...current.future],
          }
        : current,
    );
    setBuilt(null);
    setReviewed(false);
    setPublishedRevisionId(null);
  };
  const redo = () => {
    setHistory((current) =>
      current.future.length
        ? {
            past: [...current.past, current.present],
            present: current.future[0]!,
            future: current.future.slice(1),
          }
        : current,
    );
    setBuilt(null);
    setReviewed(false);
    setPublishedRevisionId(null);
  };

  const commit = async () => {
    if (!saved || !built?.inspected || !buildMatchesDraft || unresolved.length || !reviewed || busy)
      return;
    setBusy('commit');
    try {
      const revision = await webComponentsApi.commit(saved.id, saved.revision, built.id);
      setPublishedRevisionId(revision.id);
      toast.success(`Revision ${revision.id.slice(0, 8)} published`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not publish revision');
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!saved || !built?.inspected || !buildMatchesDraft || unresolved.length || !reviewed) return;
    setBusy('export');
    try {
      const revisionId =
        publishedRevisionId ??
        (await webComponentsApi.commit(saved.id, saved.revision, built.id)).id;
      setPublishedRevisionId(revisionId);
      const blob = await webComponentsApi.download(revisionId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase() || 'forge-component'}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export bundle');
    } finally {
      setBusy(null);
    }
  };

  const pollRenderJob = useCallback(
    async (
      revisionId: string,
      jobId: string,
      format: 'png' | 'mp4',
      signal: AbortSignal,
    ) => {
      const deadline = Date.now() + RENDER_POLL_MAX_DURATION_MS;
      let consecutiveErrors = 0;
      setRenderPolling(true);
      setRenderPollError(null);
      try {
        while (!signal.aborted && Date.now() < deadline) {
          try {
            const { job } = await webComponentsApi.getRenderJob(revisionId, jobId, signal);
            if (signal.aborted) return;
            consecutiveErrors = 0;
            setRenderJob({ revisionId, format, job });
            if (TERMINAL_RENDER_STATES.has(job.state)) return;
          } catch (error) {
            if (signal.aborted) return;
            consecutiveErrors += 1;
            if (consecutiveErrors >= 5) throw error;
          }
          await waitForRenderPoll(
            consecutiveErrors ? RENDER_POLL_INTERVAL_MS * consecutiveErrors : RENDER_POLL_INTERVAL_MS,
            signal,
          );
        }
        if (!signal.aborted)
          setRenderPollError('Status polling paused after 15 minutes. Check the job status to resume.');
      } catch (error) {
        if (!signal.aborted)
          setRenderPollError(error instanceof Error ? error.message : 'Could not refresh render status');
      } finally {
        if (!signal.aborted) setRenderPolling(false);
      }
    },
    [],
  );

  const startRenderPolling = useCallback(
    (revisionId: string, jobId: string, format: 'png' | 'mp4') => {
      renderPollControllerRef.current?.abort();
      const controller = new AbortController();
      renderPollControllerRef.current = controller;
      void pollRenderJob(revisionId, jobId, format, controller.signal);
    },
    [pollRenderJob],
  );

  const renderIsActive = Boolean(renderJob && !TERMINAL_RENDER_STATES.has(renderJob.job.state));

  const openRenderResult = () => {
    if (!renderJob?.job.url) return;
    window.open(renderJob.job.url, '_blank', 'noopener,noreferrer');
  };

  const requestRender = async (format: 'png' | 'mp4') => {
    if (!saved || !built?.inspected || !buildMatchesDraft || unresolved.length || !reviewed) return;
    renderPollControllerRef.current?.abort();
    const controller = new AbortController();
    renderPollControllerRef.current = controller;
    setBusy('render');
    try {
      const revisionId =
        publishedRevisionId ??
        (await webComponentsApi.commit(saved.id, saved.revision, built.id)).id;
      if (controller.signal.aborted) return;
      setPublishedRevisionId(revisionId);
      const response = await webComponentsApi.queueRender(revisionId, {
        format,
        ...(format === 'png' ? { timeSec: playhead } : {}),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setRenderJob({ revisionId, format, job: response.job });
      renderPollControllerRef.current = null;
      startRenderPolling(revisionId, response.job.id, format);
      toast.success(`${format === 'mp4' ? 'Video' : 'Frame'} render queued`);
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(error instanceof Error ? error.message : 'Could not queue render');
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  };

  const updateFile = (source: string) =>
    update({ ...project, files: { ...project.files, [activeFile]: source } });
  const addAssets = async (files: FileList | null) => {
    if (!files?.length) return;
    const assets = [...project.assets];
    for (const file of Array.from(files)) {
      if (assets.length >= 100) {
        toast.error('A component package can contain at most 100 assets');
        break;
      }
      if (file.size > 16 * 1024 * 1024) {
        toast.error(`${file.name} is over the 16 MiB per-file limit`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '') || 'asset';
      let path = `assets/${safeName}`;
      let suffix = 2;
      while (assets.some((asset) => asset.path === path) || path in project.files) {
        const dot = safeName.lastIndexOf('.');
        path = `assets/${dot > 0 ? safeName.slice(0, dot) : safeName}-${suffix++}${dot > 0 ? safeName.slice(dot) : ''}`;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let start = 0; start < bytes.length; start += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
      assets.push({
        path,
        base64: btoa(binary),
        contentType: file.type || 'application/octet-stream',
      });
    }
    const next = { ...project, assets };
    if (JSON.stringify(next).length > 32 * 1024 * 1024) {
      toast.error('These assets exceed the 32 MiB component package limit');
      return;
    }
    update(next);
  };
  const selectFramework = (framework: WebComponentFramework) => {
    if (framework === project.framework) return;
    const starter = createStarterProject(framework);
    setActiveFile(starter.entry);
    update({ ...project, framework, entry: starter.entry, files: starter.files });
  };
  const startNew = () =>
    exitGuard.confirm(() => {
      void newProject(project.framework);
    });

  return (
    <>
      <section
        className="flex min-h-[36rem] min-w-0 flex-1 flex-col overflow-hidden border-t border-border"
        aria-label="Web component workspace"
      >
        <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
          <Code2 className="ml-1 size-4 text-primary" aria-hidden="true" />
          <ProjectName project={project} onChange={(name) => update({ ...project, name })} />
          <select
            aria-label="Framework"
            value={project.framework}
            onChange={(event) => selectFramework(event.target.value as WebComponentFramework)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="three">Three.js</option>
            <option value="r3f">React Three Fiber</option>
            <option value="pixi">PixiJS</option>
            <option value="dom">DOM + GSAP</option>
          </select>
          <select
            aria-label="Open saved draft"
            value={saved?.id ?? ''}
            onChange={(event) =>
              event.target.value &&
              void exitGuard.confirm(() => {
                void loadDraft(event.target.value);
              })
            }
            className="h-7 min-w-28 max-w-48 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Open draft…</option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name} · r{draft.revision}
              </option>
            ))}
          </select>
          <span className="min-w-0 flex-1" />
          <Button
            variant="outline"
            size="sm"
            aria-label="Undo"
            title="Undo"
            disabled={!history.past.length}
            onClick={undo}
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Redo"
            title="Redo"
            disabled={!history.future.length}
            onClick={redo}
          >
            <Redo2 className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void startNew()}
          >
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || busy !== null}
            onClick={() => void save()}
          >
            <Save className="mr-1.5 size-3.5" />
            {busy === 'save' ? 'Saving…' : dirty ? 'Save draft' : 'Saved'}
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void build()}>
            <Play className="mr-1.5 size-3.5" />
            {busy === 'build' ? 'Building…' : 'Build preview'}
          </Button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(13rem,0.8fr)_minmax(24rem,1.6fr)_minmax(14rem,0.85fr)] lg:divide-x lg:divide-y-0">
          <aside
            className="flex min-h-40 min-w-0 flex-col border-border lg:min-h-0"
            aria-label="Scene and source files"
          >
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scene
              </h2>
              <span className="text-2xs tabular-nums text-muted-foreground">
                {nodes.length} objects
              </span>
            </div>
            <div className="min-h-14 flex-1 overflow-y-auto py-1">
              {nodes.length ? (
                nodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`flex h-8 w-full items-center gap-2 px-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedNodeId === node.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                  >
                    <ChevronRight
                      className={`size-3 transition-transform ${selectedNodeId === node.id ? 'rotate-90 text-primary' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{node.name || node.id}</span>
                    <span className="ml-auto text-2xs text-muted-foreground">{node.kind}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  Build to inspect registered scene objects.
                </p>
              )}
            </div>
            <div className="border-t border-border">
              <div className="flex h-9 items-center px-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source files
                </h2>
              </div>
              {Object.keys(project.files).map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setActiveFile(path)}
                  className={`flex h-7 w-full items-center px-3 text-left font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${activeFile === path ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                >
                  {path}
                </button>
              ))}
            </div>
            <div className="border-t border-border px-3 py-2">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium hover:text-primary">
                <span>
                  Assets{' '}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {project.assets.length}
                  </span>
                </span>
                <span className="text-primary">Add files</span>
                <input
                  aria-label="Add component assets"
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    void addAssets(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {project.assets.map((asset) => (
                <div key={asset.path} className="mt-1 flex items-center gap-2 text-2xs">
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-muted-foreground"
                    title={asset.path}
                  >
                    {asset.path}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${asset.path}`}
                    onClick={() =>
                      update({
                        ...project,
                        assets: project.assets.filter((item) => item.path !== asset.path),
                      })
                    }
                    className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {project.assets.length > 0 && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  Read asset data from <code className="font-mono">ctx.assets[path]</code>.
                </p>
              )}
            </div>
          </aside>
          <main
            className="flex min-h-[20rem] min-w-0 flex-col bg-muted/20 lg:min-h-0"
            aria-label="Component preview and code"
          >
            <details className="shrink-0 border-b border-border bg-background px-3 py-1.5">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Output · {project.width} × {project.height} · {project.durationSec}s at{' '}
                {project.fps} fps
              </summary>
              <div className="grid grid-cols-4 gap-2 py-2">
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Width
                  <input
                    aria-label="Output width"
                    type="number"
                    min={16}
                    max={3840}
                    step={1}
                    value={project.width}
                    onChange={(event) => update({ ...project, width: Number(event.target.value) })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Height
                  <input
                    aria-label="Output height"
                    type="number"
                    min={16}
                    max={3840}
                    step={1}
                    value={project.height}
                    onChange={(event) => update({ ...project, height: Number(event.target.value) })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Duration
                  <input
                    aria-label="Output duration"
                    type="number"
                    min={0.1}
                    max={60}
                    step={0.1}
                    value={project.durationSec}
                    onChange={(event) =>
                      update({ ...project, durationSec: Number(event.target.value) })
                    }
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Frame rate
                  <input
                    aria-label="Output frame rate"
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    value={project.fps}
                    onChange={(event) => update({ ...project, fps: Number(event.target.value) })}
                    className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </details>
            <div
              ref={previewHostRef}
              className="relative min-h-48 flex-1 overflow-hidden bg-[#0b0e13]"
            >
              <iframe
                ref={frameRef}
                title="Untrusted web component preview"
                sandbox="allow-scripts"
                className="absolute inset-0 size-full border-0 bg-[#0b0e13]"
              />
              {!built && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b0e13]/80 px-6 text-center text-sm text-muted-foreground">
                  Build preview to see your component
                </div>
              )}
              {previewError && (
                <div
                  role="alert"
                  className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-background p-2.5 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  {previewError}
                </div>
              )}
            </div>
            <div className="flex min-h-10 shrink-0 items-center gap-2 border-y border-border bg-background px-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label={playing ? 'Pause preview' : 'Play preview'}
                disabled={!built}
                onClick={() => {
                  const next = !playing;
                  setPlaying(next);
                  void bridgeRef.current?.request(next ? 'play' : 'pause');
                }}
              >
                <Play className={`size-3.5 ${playing ? 'text-primary' : ''}`} />
              </Button>
              <input
                aria-label="Preview time"
                type="range"
                min={0}
                max={project.durationSec}
                step={1 / project.fps}
                value={playhead}
                disabled={!built}
                onChange={(event) => void seek(Number(event.target.value))}
                className="min-w-0 flex-1 accent-primary"
              />
              <span className="w-20 text-right font-mono text-2xs tabular-nums text-muted-foreground">
                {playhead.toFixed(2)} / {project.durationSec.toFixed(2)} s
              </span>
            </div>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {activeFile}
              </h2>
              <span className="text-2xs text-muted-foreground">JavaScript · CSS</span>
            </div>
            <Textarea
              aria-label={`${activeFile} source`}
              spellCheck={false}
              value={project.files[activeFile] ?? ''}
              onChange={(event) => updateFile(event.target.value)}
              className="min-h-40 flex-1 resize-y rounded-none border-0 bg-background px-3 py-2 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:min-h-44"
            />
          </main>
          <aside
            className="flex min-h-40 min-w-0 flex-col lg:min-h-0"
            aria-label="Object inspector and publish"
          >
            <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Inspector
              </h2>
            </div>
            <div className="min-h-20 flex-1 overflow-y-auto px-3 py-2">
              {selectedNode ? (
                <>
                  <p className="truncate text-sm font-medium" title={selectedNode.name}>
                    {selectedNode.name || selectedNode.id}
                  </p>
                  <p className="mb-2 mt-0.5 truncate font-mono text-2xs text-muted-foreground">
                    {selectedNode.id} · {selectedNode.kind}
                  </p>
                  {selectedNode.properties.map((property) => {
                    const override = propertyOverrides.find(
                      (item) => item.property === property.key,
                    );
                    return (
                      <PropertyEditor
                        key={property.key}
                        node={selectedNode}
                        propertyKey={property.key}
                        value={override?.value ?? property.value}
                        onChange={(value) => setOverride(selectedNode.id, property.key, value)}
                      />
                    );
                  })}
                  {!selectedNode.properties.length && (
                    <p className="text-xs text-muted-foreground">
                      No editable properties registered.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select a registered object to edit its exposed properties.
                </p>
              )}
            </div>
            <div className="border-t border-border px-3 py-2">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Publish
              </h2>
              {unresolved.length > 0 ? (
                <div
                  role="alert"
                  className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-2xs text-destructive"
                >
                  Resolve {unresolved.length} property override{unresolved.length === 1 ? '' : 's'}{' '}
                  before publishing. Source edits can change registered object IDs or properties.
                </div>
              ) : null}
              <Button
                className="mb-2 w-full"
                size="sm"
                variant="outline"
                disabled={!built || !buildMatchesDraft || built.inspected || busy !== null}
                onClick={() => void inspect()}
              >
                <ShieldCheck className="mr-1.5 size-3.5" />
                {busy === 'build' ? 'Verifying…' : 'Verify in render browser'}
              </Button>
              <label className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                  disabled={
                    !built?.inspected ||
                    !buildMatchesDraft ||
                    unresolved.length > 0 ||
                    busy !== null
                  }
                  className="mt-0.5 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span>I reviewed this verified build and its editable properties.</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !built?.inspected ||
                    !buildMatchesDraft ||
                    !reviewed ||
                    unresolved.length > 0 ||
                    busy !== null
                  }
                  onClick={() => void commit()}
                >
                  {busy === 'commit' ? 'Publishing…' : 'Publish revision'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !built?.inspected ||
                    !buildMatchesDraft ||
                    !reviewed ||
                    unresolved.length > 0 ||
                    busy !== null
                  }
                  onClick={() => void download()}
                >
                  <Download className="mr-1 size-3.5" />
                  {busy === 'export' ? 'Packaging…' : 'Download ZIP'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2"
                  disabled={
                    !built?.inspected ||
                    !buildMatchesDraft ||
                    !reviewed ||
                    unresolved.length > 0 ||
                    busy !== null ||
                    renderIsActive
                  }
                  onClick={() => void requestRender('mp4')}
                >
                  {busy === 'render' ? 'Queueing render…' : 'Render video'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="col-span-2"
                  disabled={
                    !built?.inspected ||
                    !buildMatchesDraft ||
                    !reviewed ||
                    unresolved.length > 0 ||
                    busy !== null ||
                    renderIsActive
                  }
                  onClick={() => void requestRender('png')}
                >
                  Render frame at {playhead.toFixed(2)} s
                </Button>
              </div>
              {renderJob && (
                <div
                  className="mt-2 rounded-md border border-border bg-muted/30 p-2"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">
                      {renderJob.format === 'mp4' ? 'Video' : 'PNG frame'} · revision{' '}
                      {renderJob.revisionId.slice(0, 8)}
                    </span>
                    <span className="capitalize text-muted-foreground">{renderJob.job.state}</span>
                  </div>
                  {renderJob.job.phase && (
                    <p className="mt-1 text-2xs text-muted-foreground">{renderJob.job.phase}</p>
                  )}
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label="Render progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(renderJob.job.progress * 100)}
                  >
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${Math.round(renderJob.job.progress * 100)}%` }}
                    />
                  </div>
                  {renderJob.job.error && (
                    <p role="alert" className="mt-1 text-2xs text-destructive">
                      {renderJob.job.error}
                    </p>
                  )}
                  {renderPollError && (
                    <p role="alert" className="mt-1 text-2xs text-destructive">
                      {renderPollError}
                    </p>
                  )}
                  {renderPollError && renderIsActive && !renderPolling && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() =>
                        startRenderPolling(renderJob.revisionId, renderJob.job.id, renderJob.format)
                      }
                    >
                      Check render status
                    </Button>
                  )}
                  {renderJob.job.state === 'completed' && renderJob.job.url && (
                    <Button
                      size="sm"
                      className="mt-2 w-full"
                      onClick={openRenderResult}
                    >
                      Download {renderJob.format === 'mp4' ? 'video' : 'PNG frame'}
                    </Button>
                  )}
                </div>
              )}
              {built && (
                <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground">
                  <Check
                    className={`size-3 ${built.inspected ? 'text-primary' : 'text-muted-foreground'}`}
                  />{' '}
                  {built.inspected
                    ? 'Browser verified'
                    : 'Preview built; browser verification required'}{' '}
                  · source revision {saved?.revision ?? 'unsaved'}
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>
      {exitGuard.dialog}
    </>
  );
}
