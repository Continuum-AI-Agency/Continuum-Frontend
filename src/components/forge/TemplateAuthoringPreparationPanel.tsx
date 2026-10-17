'use client';

import type { TemplateAuthoringDocument } from '@continuum/contracts';
import { Check, Circle, Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LayerDraftSyncStatus } from '@/components/forge/layerDraft';
import type { useTemplateAuthoringLifecycle } from '@/components/forge/useTemplateAuthoringLifecycle';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  fetchTemplateAuthoringArtifactPackage,
  fetchTemplateAuthoringNativeRenderFrame,
} from '@/lib/library/templateSources';

type Workflow = ReturnType<typeof useTemplateAuthoringLifecycle>;

type PreflightProgress = {
  stage?: string;
  checks?: { format?: string; dependencies?: string };
  providerActivation?: string;
  diagnostics?: PreflightDiagnostic[];
};

type PreflightDiagnostic = {
  code: string;
  reason?: string;
  compId?: number;
  layerId?: number;
  affectedFontPostScriptNames?: string[];
  missingFootage?: Array<{ name: string | null; file: string }>;
};

function preflightProgress(value: unknown): PreflightProgress | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const progress = value as Record<string, unknown>;
  const rawChecks = progress.checks;
  const checks =
    rawChecks && typeof rawChecks === 'object' && !Array.isArray(rawChecks)
      ? (rawChecks as Record<string, unknown>)
      : null;
  return {
    stage: typeof progress.stage === 'string' ? progress.stage : undefined,
    providerActivation:
      typeof progress.providerActivation === 'string' ? progress.providerActivation : undefined,
    checks: checks
      ? {
          format: typeof checks.format === 'string' ? checks.format : undefined,
          dependencies: typeof checks.dependencies === 'string' ? checks.dependencies : undefined,
        }
      : undefined,
    diagnostics: Array.isArray(progress.diagnostics)
      ? progress.diagnostics.flatMap((item): PreflightDiagnostic[] => {
          if (typeof item === 'string') return [{ code: item }];
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const diagnostic = item as Record<string, unknown>;
          if (typeof diagnostic.code !== 'string') return [];
          return [
            {
              code: diagnostic.code,
              reason: typeof diagnostic.reason === 'string' ? diagnostic.reason : undefined,
              compId:
                typeof diagnostic.compId === 'number' && Number.isInteger(diagnostic.compId)
                  ? diagnostic.compId
                  : undefined,
              layerId:
                typeof diagnostic.layerId === 'number' && Number.isInteger(diagnostic.layerId)
                  ? diagnostic.layerId
                  : undefined,
              affectedFontPostScriptNames: Array.isArray(diagnostic.affectedFontPostScriptNames)
                ? diagnostic.affectedFontPostScriptNames.filter(
                    (name): name is string => typeof name === 'string',
                  )
                : undefined,
              missingFootage: Array.isArray(diagnostic.missingFootage)
                ? diagnostic.missingFootage.flatMap(
                    (footage): Array<{ name: string | null; file: string }> => {
                      if (!footage || typeof footage !== 'object' || Array.isArray(footage))
                        return [];
                      const item = footage as Record<string, unknown>;
                      if (typeof item.file !== 'string') return [];
                      return [
                        { name: typeof item.name === 'string' ? item.name : null, file: item.file },
                      ];
                    },
                  )
                : undefined,
            },
          ];
        })
      : undefined,
  };
}

function diagnosticCopy(diagnostic: PreflightDiagnostic) {
  const { code } = diagnostic;
  if (code.includes('artwork_missing'))
    return 'The private package still has unresolved footage dependencies.';
  if (code.includes('font')) return diagnostic.reason ?? 'Exact font evidence is still pending.';
  if (code.includes('format_inventory_pending'))
    return 'Forge could not verify the delivery-format mapping, so no composition has been selected for repair.';
  if (code.includes('format') && code.includes('pending'))
    return diagnostic.reason ?? 'A required delivery-format check is still pending.';
  if (code.includes('parse') && code.includes('pending'))
    return diagnostic.reason ?? 'The private package parse check is still pending.';
  return diagnostic.reason ?? 'Additional private preflight evidence is pending.';
}

const verificationLabels = [
  ['packageIntegrity', 'Package integrity'],
  ['writerReadback', 'Edits preserved'],
  ['sourcePreservation', 'Original preserved'],
  ['dependencies', 'Fonts and artwork'],
  ['format', 'Delivery formats'],
  ['nativeAfterEffects', 'Native render'],
] as const;

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function stateCopy(workflow: Workflow, syncStatus: LayerDraftSyncStatus, draftDirty: boolean) {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch')
    return 'Resolve the saved draft difference before preparing a package.';
  if (syncStatus === 'error')
    return 'The private draft needs a successful retry before preparation.';
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty)
    return 'Saving the private draft before preparation.';
  const preflight = preflightProgress(workflow.preparation?.progress);
  if (
    preflight?.stage === 'private_preflight_complete' &&
    preflight.providerActivation === 'pending'
  )
    return 'Private package preflight passed. Forge provider activation is pending; the package stays available while native After Effects verification waits for a runner.';
  if (preflight?.stage === 'private_preflight_pending') {
    const hasNamedRepairs = preflight.diagnostics?.some(
      (diagnostic) =>
        diagnostic.affectedFontPostScriptNames?.length || diagnostic.missingFootage?.length,
    );
    return hasNamedRepairs
      ? 'Saved private package is waiting for the listed repairs.'
      : 'Saved private package is waiting for pending preflight checks.';
  }
  switch (workflow.state) {
    case 'waiting':
      return 'The saved authoring changes are settling before package preparation.';
    case 'compiling':
      return 'Building a private package from this exact draft revision.';
    case 'preparing':
      return 'Checking the private package and preserving its source lineage.';
    case 'rendering':
      return 'Requesting native sample frames for the delivery compositions.';
    case 'needs-input':
      return 'The package is retained privately. An After Effects runner is needed to finish native verification.';
    case 'failed':
      return 'Preparation paused. Your private draft and any completed package are retained.';
    case 'ready':
      if (workflow.artifact?.state === 'reviewed')
        return 'This exact package has an explicit review decision and can be saved as a version.';
      if (workflow.artifact?.state === 'committed')
        return 'This exact private package has been published as a version.';
      if (workflow.artifact?.verification.nativeAfterEffects === 'passed')
        return 'Native samples passed. Review the package before saving a version.';
      return 'The private package is available. Native After Effects verification is still pending.';
    default:
      return 'Preparation starts automatically after a supported authoring change is saved.';
  }
}

function nextActionCopy(
  workflow: Workflow,
  syncStatus: LayerDraftSyncStatus,
  draftDirty: boolean,
  diagnostics: PreflightDiagnostic[],
  dependencies: TemplateAuthoringDocument['dependencies'],
) {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch')
    return 'Reconcile the saved and local draft above before preparing this package.';
  if (syncStatus === 'error')
    return 'Retry the private draft save above. Your local work remains available.';
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty)
    return 'Let the private draft finish saving; preparation resumes from the saved revision.';
  if (diagnostics.some((diagnostic) => diagnostic.affectedFontPostScriptNames?.length))
    return 'Open Fonts check to resolve the exact listed faces, then preparation will resume.';
  const missingFootage = diagnostics.flatMap((diagnostic) => diagnostic.missingFootage ?? []);
  if (missingFootage.length) {
    const hasExactRepair = missingFootage.some((footage) => {
      const matches = dependencies.filter(
        (dependency) =>
          dependency.originalFile === footage.file &&
          (footage.name === null || dependency.name === footage.name),
      );
      return matches.length === 1 && matches[0]?.relinkReason === null;
    });
    return hasExactRepair
      ? 'Relink the matching package dependency from Library below; the exact package will be checked again automatically.'
      : 'No verified Library target matches this package dependency yet. Keep the package private and retry after the dependency is available.';
  }
  if (diagnostics.some((diagnostic) => diagnostic.code.includes('format_inventory_pending')))
    return 'No composition has a verified delivery-format mapping yet, so there is no safe format repair target. Retry after the mapping evidence is corrected.';
  const providerPending =
    preflightProgress(workflow.preparation?.progress)?.providerActivation === 'pending';
  if (workflow.state === 'needs-input' || providerPending)
    return 'Retry preparation to resume provider activation. Native After Effects verification remains pending until a runner returns frames.';
  if (workflow.state === 'failed')
    return 'Retry preparation to resume this exact private package revision; your draft and completed package are retained.';
  if (workflow.artifact && workflow.artifact.verification.nativeAfterEffects !== 'passed')
    return 'Keep editing or download the private package. Version review remains locked until native After Effects samples pass.';
  if (workflow.canReview)
    return 'Review this exact package to enable the existing version-saving action.';
  return 'Supported authoring changes save privately and resume preparation automatically.';
}

export function templatePreparationSummary(
  workflow: Workflow,
  syncStatus: LayerDraftSyncStatus,
  draftDirty: boolean,
  dependencies: TemplateAuthoringDocument['dependencies'],
): { label: string; detail: string; action: 'fonts' | 'save' | 'checks' | null } {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch') {
    return {
      label: 'Draft conflict',
      detail: 'Reconcile the saved draft difference before package preparation can continue.',
      action: 'save',
    };
  }
  if (syncStatus === 'error') {
    return {
      label: 'Save failed',
      detail: 'Retry saving the private draft; your local edits are still available.',
      action: 'save',
    };
  }
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty) {
    return {
      label: 'Saving edits',
      detail: 'The private draft must finish saving before preparation can continue.',
      action: 'save',
    };
  }

  const preflight = preflightProgress(workflow.preparation?.progress);
  const diagnostics = preflight?.diagnostics ?? [];
  const missingFonts = [
    ...new Set(diagnostics.flatMap((diagnostic) => diagnostic.affectedFontPostScriptNames ?? [])),
  ];
  if (missingFonts.length) {
    return {
      label: 'Fonts need attention',
      detail: `Resolve these exact font faces in Fonts check: ${missingFonts.join(', ')}.`,
      action: 'fonts',
    };
  }

  const missingFootage = diagnostics.flatMap((diagnostic) => diagnostic.missingFootage ?? []);
  const artworkMissing =
    missingFootage.length > 0 ||
    diagnostics.some((diagnostic) => diagnostic.code.includes('artwork_missing'));
  if (artworkMissing) {
    const names = [...new Set(missingFootage.map((footage) => footage.name ?? footage.file))];
    return {
      label: 'Artwork needs attention',
      detail: names.length
        ? `Resolve these missing package dependencies: ${names.join(', ')}.`
        : 'The package reports unresolved artwork dependencies. Review the package checks for details.',
      action: 'checks',
    };
  }

  const formatPending =
    preflight?.checks?.format === 'pending' ||
    diagnostics.some(
      (diagnostic) => diagnostic.code.includes('format') && diagnostic.code.includes('pending'),
    );
  if (formatPending) {
    const diagnostic = diagnostics.find(
      (item) => item.code.includes('format') && item.code.includes('pending'),
    );
    return {
      label: 'Delivery formats pending',
      detail: diagnostic
        ? diagnosticCopy(diagnostic)
        : 'The required delivery-format check is still pending.',
      action: 'checks',
    };
  }

  if (workflow.state === 'compiling') {
    return {
      label: 'Building package',
      detail: 'Creating a private package from the saved draft.',
      action: null,
    };
  }
  if (workflow.state === 'preparing') {
    return {
      label: 'Checking package',
      detail: 'Verifying package contents and preserving the original source.',
      action: null,
    };
  }
  if (workflow.state === 'rendering') {
    return {
      label: 'Rendering samples',
      detail: 'Requesting native sample frames for the delivery compositions.',
      action: null,
    };
  }

  if (workflow.artifact && workflow.artifact.verification.nativeAfterEffects !== 'passed') {
    const providerPending = preflight?.providerActivation === 'pending';
    return {
      label: 'Native render pending',
      detail: providerPending
        ? 'Package checks are complete; native sample frames are waiting for the configured render provider.'
        : workflow.state === 'needs-input'
          ? 'The preparation state is waiting for an After Effects runner to return native sample frames.'
          : 'Native sample frames have not been verified for this package.',
      action: 'checks',
    };
  }

  if (workflow.canPublish) {
    return {
      label: 'Ready to publish',
      detail: 'All required checks and native samples passed for this exact package.',
      action: 'save',
    };
  }

  if (workflow.artifact?.state === 'committed') {
    const versionId = workflow.artifact.commit?.versionId;
    return {
      label: 'Version published',
      detail: versionId
        ? `Version ${versionId} was published from this exact package.`
        : 'This exact package has a confirmed published version.',
      action: null,
    };
  }

  if (workflow.state === 'needs-input') {
    return {
      label: 'Preparation needs input',
      detail: nextActionCopy(workflow, syncStatus, draftDirty, diagnostics, dependencies),
      action: 'checks',
    };
  }
  if (workflow.state === 'failed') {
    return {
      label: 'Preparation paused',
      detail: nextActionCopy(workflow, syncStatus, draftDirty, diagnostics, dependencies),
      action: 'checks',
    };
  }
  return {
    label: 'Draft saved',
    detail: 'Supported authoring changes prepare a private package automatically after saving.',
    action: null,
  };
}

function userFacingError(error: string) {
  return /\b(?:authoring|template|private)_[a-z0-9_]+\b|\bPRIVATE_[A-Z0-9_]+\b/i.test(error)
    ? 'Private preparation could not continue. Your draft remains available; use the next step below and retry.'
    : error;
}

export function TemplateAuthoringPreparationPanel({
  workflow,
  syncStatus,
  draftDirty,
  draftRevision,
  onOpenFontRepair,
  dependencies = [],
  onRelinkDependency,
  authoringDocument,
  onInspectComposition,
  reviewInVersionAction = false,
}: {
  workflow: Workflow;
  syncStatus: LayerDraftSyncStatus;
  draftDirty: boolean;
  draftRevision: number;
  onOpenFontRepair?: () => void;
  dependencies?: TemplateAuthoringDocument['dependencies'];
  onRelinkDependency?: (footageItemId: number) => void;
  authoringDocument?: TemplateAuthoringDocument | null;
  onInspectComposition?: (compId: number) => void;
  reviewInVersionAction?: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [samples, setSamples] = useState<
    Array<{ key: string; src: string; alt: string; checksum: string }>
  >([]);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleKey = useMemo(
    () =>
      workflow.renders
        .filter((render) => render.state === 'completed')
        .flatMap((render) =>
          render.frames.map(
            (frame) => `${render.renderId}:${frame.frameId}:${frame.checksum}:${frame.stale}`,
          ),
        )
        .join('|'),
    [workflow.renders],
  );

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setSamples([]);
    setSampleError(null);
    if (!workflow.artifact || !workflow.artifact.scope || !workflow.renders.length) return;
    const completed = workflow.renders.flatMap((render) =>
      render.state === 'completed'
        ? render.frames.filter((frame) => !frame.stale).map((frame) => ({ render, frame }))
        : [],
    );
    if (!completed.length) return;
    void Promise.all(
      completed.map(async ({ render, frame }) => {
        const { blob, sha256 } = await fetchTemplateAuthoringNativeRenderFrame(
          workflow.artifact!.scope.assetId,
          workflow.artifact!.artifactId,
          render.renderId,
          frame.frameId,
          workflow.artifact!.scope,
        );
        if (cancelled) return null;
        const src = URL.createObjectURL(blob);
        objectUrls.push(src);
        return {
          key: frame.frameId,
          src,
          alt: `Composition ${frame.compId}, frame ${frame.frameIndex}`,
          checksum: sha256,
        };
      }),
    )
      .then((entries) => {
        if (!cancelled)
          setSamples(entries.filter((entry): entry is NonNullable<typeof entry> => !!entry));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setSampleError(
            reason instanceof Error ? reason.message : 'Could not load the private sample frames.',
          );
      });
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [workflow.artifact?.artifactId, sampleKey]);

  const stateDescription = stateCopy(workflow, syncStatus, draftDirty);
  const checks = workflow.artifact?.verification;
  const preflight = preflightProgress(workflow.preparation?.progress);
  const nextAction = nextActionCopy(
    workflow,
    syncStatus,
    draftDirty,
    preflight?.diagnostics ?? [],
    dependencies,
  );
  const exactComposition = (sourceCompId: number, layerId?: number) => {
    if (!authoringDocument) return null;
    const sourceLayers =
      layerId === undefined
        ? []
        : authoringDocument.nodes.filter(
            (node) => node.sourceRef?.compId === sourceCompId && node.sourceRef.layerId === layerId,
          );
    if (layerId !== undefined && sourceLayers.length !== 1) return null;
    const candidates = authoringDocument.compositions.filter(
      (composition) =>
        composition.compId !== null &&
        (composition.sourceCompId === sourceCompId || composition.compId === sourceCompId) &&
        (layerId === undefined ||
          (sourceLayers[0]!.nodeId !== undefined &&
            composition.nodeIds.includes(sourceLayers[0]!.nodeId))),
    );
    return candidates.length === 1 ? candidates[0]! : null;
  };
  const fontLayerContext = (names: string[]) =>
    authoringDocument?.nodes.flatMap((node) => {
      const fontName = node.fontRef?.postScriptName;
      if (!fontName || !names.includes(fontName) || !node.sourceRef) return [];
      const composition = exactComposition(node.sourceRef.compId, node.sourceRef.layerId);
      return composition ? [{ node, composition }] : [];
    }) ?? [];

  return (
    <section
      aria-labelledby="template-authoring-preparation-title"
      className="space-y-2 border-t border-border pt-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="template-authoring-preparation-title"
            className="text-xs font-semibold text-foreground"
          >
            Private package preparation
          </h3>
          <p role="status" className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {stateDescription}
          </p>
        </div>
        {workflow.state === 'compiling' ||
        workflow.state === 'preparing' ||
        workflow.state === 'rendering' ? (
          <Loader2
            aria-label="Preparation in progress"
            className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      {preflight?.diagnostics?.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {preflight.diagnostics.map((diagnostic, index) => (
            <li key={`${index}:${diagnostic.code}`}>
              {!diagnostic.missingFootage?.length ? (
                <span>{diagnosticCopy(diagnostic)}</span>
              ) : null}
              {diagnostic.affectedFontPostScriptNames?.length ? (
                <>
                  <span>
                    {' '}
                    Affected font faces: {diagnostic.affectedFontPostScriptNames.join(', ')}.
                  </span>
                  {onOpenFontRepair ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="link"
                      className="ml-1 h-auto p-0"
                      onClick={onOpenFontRepair}
                    >
                      Open Fonts check
                    </Button>
                  ) : null}
                  {fontLayerContext(diagnostic.affectedFontPostScriptNames).length ? (
                    <span className="block pl-2">
                      Affected layers:{' '}
                      {fontLayerContext(diagnostic.affectedFontPostScriptNames)
                        .map(
                          ({ node, composition }) =>
                            `${composition.name ?? `Composition ${composition.compId}`} / ${node.name ?? node.nodeId}`,
                        )
                        .join(', ')}
                      .
                    </span>
                  ) : null}
                  {onInspectComposition &&
                  fontLayerContext(diagnostic.affectedFontPostScriptNames).length === 1
                    ? (() => {
                        const target = fontLayerContext(diagnostic.affectedFontPostScriptNames)[0]!
                          .composition;
                        return target.compId === null ? null : (
                          <Button
                            type="button"
                            size="xs"
                            variant="link"
                            className="ml-1 h-auto p-0"
                            onClick={() => onInspectComposition(target.compId!)}
                          >
                            Inspect affected composition
                          </Button>
                        );
                      })()
                    : null}
                </>
              ) : null}
              {diagnostic.compId !== undefined && onInspectComposition
                ? (() => {
                    const target = exactComposition(diagnostic.compId, diagnostic.layerId);
                    return target?.compId === null || !target ? null : (
                      <Button
                        type="button"
                        size="xs"
                        variant="link"
                        className="ml-1 h-auto p-0"
                        onClick={() => onInspectComposition(target.compId!)}
                      >
                        Inspect affected composition
                      </Button>
                    );
                  })()
                : null}
              {diagnostic.missingFootage?.length ? (
                <ul className="list-disc pl-4" aria-label="Unresolved package footage">
                  {diagnostic.missingFootage.map((footage, footageIndex) => (
                    <li key={`${footageIndex}:${footage.file}`}>
                      <span className="[overflow-wrap:anywhere]">
                        {footage.name ? `${footage.name}: ` : ''}
                        {footage.file}
                      </span>
                      {(() => {
                        const matches = dependencies.filter(
                          (dependency) =>
                            dependency.originalFile === footage.file &&
                            (footage.name === null || dependency.name === footage.name),
                        );
                        const exact = matches.length === 1 ? matches[0] : null;
                        const affectedCompositions =
                          exact?.affectedLayers.flatMap((layer) => {
                            const target = exactComposition(layer.compId, layer.layerUid);
                            return target?.compId === null || !target ? [] : [target];
                          }) ?? [];
                        return exact?.relinkReason === null && onRelinkDependency ? (
                          <>
                            <Button
                              type="button"
                              size="xs"
                              variant="link"
                              className="ml-1 h-auto p-0"
                              disabled={syncStatus !== 'saved' || draftDirty}
                              onClick={() => onRelinkDependency(exact.footageItemId)}
                            >
                              Relink from Library
                            </Button>
                            {onInspectComposition && affectedCompositions.length === 1 ? (
                              <Button
                                type="button"
                                size="xs"
                                variant="link"
                                className="ml-1 h-auto p-0"
                                onClick={() =>
                                  onInspectComposition(affectedCompositions[0]!.compId!)
                                }
                              >
                                Inspect affected composition
                              </Button>
                            ) : null}
                          </>
                        ) : exact?.relinkReason ? (
                          <span className="ml-1">· {exact.relinkReason}</span>
                        ) : matches.length > 1 ? (
                          <span className="ml-1">
                            · Multiple package dependencies match; no automatic target was chosen.
                          </span>
                        ) : (
                          <span className="ml-1">
                            · No exact editable package dependency was identified.
                          </span>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p
        data-testid="preparation-next-step"
        className="max-w-3xl text-xs leading-relaxed text-foreground"
      >
        <span className="font-medium">Next step:</span> {nextAction}
      </p>

      {workflow.preparation ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Preparation:{' '}
            <span className="font-medium text-foreground">
              {workflow.preparation.state.replaceAll('_', ' ')}
            </span>
          </span>
          {workflow.preparation.runId ? <span>Run {workflow.preparation.runId}</span> : null}
        </div>
      ) : null}

      {preflight?.stage ? (
        <p role="status" className="text-xs text-muted-foreground">
          Package preflight: format {preflight.checks?.format ?? 'pending'}, dependencies{' '}
          {preflight.checks?.dependencies ?? 'pending'}
          {preflight.providerActivation ? ` · Forge provider ${preflight.providerActivation}` : ''}
        </p>
      ) : null}

      {workflow.artifact ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={downloading || !workflow.artifact.scope}
            onClick={async () => {
              setDownloading(true);
              setPackageError(null);
              try {
                const artifact = workflow.artifact;
                if (!artifact) return;
                const blob = await fetchTemplateAuthoringArtifactPackage(
                  artifact.scope.assetId,
                  artifact,
                  artifact.scope,
                );
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = artifact.filename;
                anchor.rel = 'noopener';
                anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (reason) {
                setPackageError(
                  reason instanceof Error
                    ? reason.message
                    : 'Could not download this private package.',
                );
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {downloading ? 'Verifying package…' : 'Download private package'}
          </Button>
          {packageError ? (
            <p role="alert" className="text-xs text-destructive">
              {packageError}
            </p>
          ) : null}
        </div>
      ) : null}

      {workflow.artifact || checks ? (
        <Collapsible className="rounded-md border border-border bg-muted/20">
          <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-accent">
            Package details and verification
            <span aria-hidden className="text-muted-foreground">
              {checks ? 'View checks' : 'View details'}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 border-t border-border p-2 text-xs sm:grid-cols-2">
            {workflow.artifact ? (
              <>
                <div className="min-w-0">
                  <span className="text-muted-foreground">Private package</span>
                  <p
                    className="truncate font-medium text-foreground"
                    title={workflow.artifact.filename}
                  >
                    {workflow.artifact.filename}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Package size</span>
                  <p className="font-medium text-foreground">
                    {formatBytes(workflow.artifact.sizeBytes)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Draft revision</span>
                  <p className="font-mono text-foreground">{workflow.artifact.draftRevision}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">Package checksum</span>
                  <p
                    className="truncate font-mono text-foreground"
                    title={workflow.artifact.packageChecksum}
                  >
                    {workflow.artifact.packageChecksum}
                  </p>
                </div>
              </>
            ) : null}
            {checks ? (
              <fieldset
                aria-label="Package verification checks"
                className="grid gap-x-3 gap-y-1 border-0 p-0 sm:col-span-2 sm:grid-cols-2"
              >
                {verificationLabels.map(([key, label]) => {
                  const value = checks[key];
                  return (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      {value === 'passed' ? (
                        <Check aria-hidden className="size-3 text-foreground" />
                      ) : value === 'failed' ? (
                        <ShieldAlert aria-hidden className="size-3 text-destructive" />
                      ) : (
                        <Circle aria-hidden className="size-3 text-muted-foreground" />
                      )}
                      <span
                        className={
                          value === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                        }
                      >
                        {label}
                      </span>
                      <span className="ml-auto font-medium capitalize text-foreground">
                        {value}
                      </span>
                    </div>
                  );
                })}
              </fieldset>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {samples.length ? (
        <fieldset
          aria-label="Verified native sample frames"
          className="grid grid-cols-2 gap-2 border-0 p-0 sm:grid-cols-4"
        >
          {samples.map((sample) => (
            <figure
              key={sample.key}
              className="min-w-0 overflow-hidden rounded-md border border-border bg-background"
            >
              <img
                src={sample.src}
                alt={sample.alt}
                className="aspect-video w-full object-contain"
              />
              <figcaption
                className="truncate px-2 py-1 font-mono text-xs text-muted-foreground"
                title={sample.checksum}
              >
                SHA-256 {sample.checksum.slice(0, 12)}…
              </figcaption>
            </figure>
          ))}
        </fieldset>
      ) : null}
      {sampleError ? (
        <p role="alert" className="text-xs text-destructive">
          {sampleError}
        </p>
      ) : null}

      {workflow.error ? (
        <p role="alert" className="text-xs text-destructive">
          {userFacingError(workflow.error)}
        </p>
      ) : null}
      {workflow.state === 'needs-input' || workflow.state === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="xs" variant="outline" onClick={() => void workflow.retry()}>
            <RefreshCw data-icon="inline-start" />
            Retry preparation
          </Button>
          <span className="text-xs text-muted-foreground">
            Retry keeps this private draft and resumes the same package revision.
          </span>
        </div>
      ) : null}

      {workflow.artifact?.state === 'committed' ? (
        <p role="status" className="text-xs font-medium text-foreground">
          Published version {workflow.artifact.commit?.versionId ?? 'confirmed'} from this exact
          private package.
        </p>
      ) : workflow.artifact?.state === 'reviewed' ? (
        <p role="status" className="text-xs font-medium text-foreground">
          Reviewed for version saving. The version action below will save these exact package bytes.
        </p>
      ) : workflow.canReview ? (
        reviewInVersionAction ? (
          <p role="status" className="text-xs text-muted-foreground">
            All checks passed for this exact package. The version action will review and publish it
            together.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              disabled={reviewing}
              onClick={async () => {
                setReviewing(true);
                await workflow.review();
                setReviewing(false);
              }}
            >
              {reviewing ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              Approve for version saving
            </Button>
            <span className="text-xs text-muted-foreground">
              This decision is available only after all checks pass for the exact package above.
            </span>
          </div>
        )
      ) : workflow.artifact ? (
        <p className="text-xs text-muted-foreground">
          Version review stays locked until package integrity, source preservation, dependency,
          format, and native After Effects checks pass.
        </p>
      ) : null}

      {workflow.state === 'failed' && !workflow.artifact ? (
        <p className="text-xs text-muted-foreground">
          The local and private server draft remain available for another attempt.
        </p>
      ) : null}
      <span className="sr-only">Draft revision {draftRevision}</span>
    </section>
  );
}
