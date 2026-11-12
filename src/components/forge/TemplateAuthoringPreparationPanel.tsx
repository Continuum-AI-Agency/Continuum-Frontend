'use client';

import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';

export type PreparationUi = {
  t: ReturnType<typeof useUiTranslations<'forge'>>;
  locale: ReturnType<typeof useUiLocale>;
};

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
                        {
                          name: typeof item.name === 'string' ? item.name : null,
                          file: item.file,
                        },
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

function diagnosticCopy(diagnostic: PreflightDiagnostic, ui?: PreparationUi) {
  const { code } = diagnostic;
  if (code.includes('artwork_missing'))
    return (
      ui?.t('the_private_package_still_has_unres_7df2ca5c') ??
      'The private package still has unresolved footage dependencies.'
    );
  if (code.includes('font'))
    return ui
      ? ui.t('exact_font_evidence_is_still_pendin_6926afe0')
      : (diagnostic.reason ?? 'Exact font evidence is still pending.');
  if (code.includes('format_inventory_pending'))
    return (
      ui?.t('forge_could_not_verify_the_delivery_bfb17ddc') ??
      'Forge could not verify the delivery-format mapping, so no composition has been selected for repair.'
    );
  if (code.includes('format') && code.includes('pending'))
    return ui
      ? ui.t('a_required_delivery_format_check_is_0a7ddded')
      : (diagnostic.reason ?? 'A required delivery-format check is still pending.');
  if (code.includes('parse') && code.includes('pending'))
    return ui
      ? ui.t('the_private_package_parse_check_is__dc0b459c')
      : (diagnostic.reason ?? 'The private package parse check is still pending.');
  return ui
    ? ui.t('additional_private_preflight_eviden_9b7266bf')
    : (diagnostic.reason ?? 'Additional private preflight evidence is pending.');
}

const verificationLabels = [
  ['packageIntegrity', 'package_integrity_c706413b'],
  ['writerReadback', 'edits_preserved_0ab7e306'],
  ['sourcePreservation', 'original_preserved_f5a3ccab'],
  ['dependencies', 'fonts_and_artwork_87a00558'],
  ['format', 'delivery_formats_6c25fe32'],
  ['nativeAfterEffects', 'native_render_830ba123'],
] as const;

function formatBytes(size: number, locale: ReturnType<typeof useUiLocale>) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${formatDecimal(size / 1024, 1, locale)} KB`;
  return `${formatDecimal(size / (1024 * 1024), 1, locale)} MB`;
}

function stateCopy(
  workflow: Workflow,
  syncStatus: LayerDraftSyncStatus,
  draftDirty: boolean,
  ui?: PreparationUi,
) {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch')
    return (
      ui?.t('resolve_the_saved_draft_difference__993f31bc') ??
      'Resolve the saved draft difference before preparing a package.'
    );
  if (syncStatus === 'error')
    return (
      ui?.t('the_private_draft_needs_a_successfu_396ad086') ??
      'The private draft needs a successful retry before preparation.'
    );
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty)
    return (
      ui?.t('saving_the_private_draft_before_pre_3348bc44') ??
      'Saving the private draft before preparation.'
    );
  const preflight = preflightProgress(workflow.preparation?.progress);
  if (
    preflight?.stage === 'private_preflight_complete' &&
    preflight.providerActivation === 'pending'
  )
    return (
      ui?.t('private_package_preflight_passed_fo_a75eb93e') ??
      'Private package preflight passed. Forge provider activation is pending; the package stays available while native After Effects verification waits for a runner.'
    );
  if (preflight?.stage === 'private_preflight_pending') {
    const hasNamedRepairs = preflight.diagnostics?.some(
      (diagnostic) =>
        diagnostic.affectedFontPostScriptNames?.length || diagnostic.missingFootage?.length,
    );
    return hasNamedRepairs
      ? (ui?.t('saved_private_package_is_waiting_fo_53362d72') ??
          'Saved private package is waiting for the listed repairs.')
      : (ui?.t('saved_private_package_is_waiting_fo_11f5ed42') ??
          'Saved private package is waiting for pending preflight checks.');
  }
  switch (workflow.state) {
    case 'waiting':
      return (
        ui?.t('the_saved_authoring_changes_are_set_27ef9c3d') ??
        'The saved authoring changes are settling before package preparation.'
      );
    case 'compiling':
      return (
        ui?.t('building_a_private_package_from_thi_08224ae0') ??
        'Building a private package from this exact draft revision.'
      );
    case 'preparing':
      return (
        ui?.t('checking_the_private_package_and_pr_86eabbdc') ??
        'Checking the private package and preserving its source lineage.'
      );
    case 'rendering':
      return (
        ui?.t('requesting_native_sample_frames_for_57cd8092') ??
        'Requesting native sample frames for the delivery compositions.'
      );
    case 'needs-input':
      return (
        ui?.t('the_package_is_retained_privately_a_f3d1f244') ??
        'The package is retained privately. An After Effects runner is needed to finish native verification.'
      );
    case 'failed':
      return (
        ui?.t('preparation_paused_your_private_dra_84870fae') ??
        'Preparation paused. Your private draft and any completed package are retained.'
      );
    case 'ready':
      if (workflow.artifact?.state === 'reviewed')
        return (
          ui?.t('this_exact_package_has_an_explicit__d94a79eb') ??
          'This exact package has an explicit review decision and can be saved as a version.'
        );
      if (workflow.artifact?.state === 'committed')
        return (
          ui?.t('this_exact_private_package_has_been_ce213188') ??
          'This exact private package has been published as a version.'
        );
      if (workflow.artifact?.verification.nativeAfterEffects === 'passed')
        return (
          ui?.t('native_samples_passed_review_the_pa_b7130404') ??
          'Native samples passed. Review the package before saving a version.'
        );
      return (
        ui?.t('the_private_package_is_available_na_7cc1ea5e') ??
        'The private package is available. Native After Effects verification is still pending.'
      );
    default:
      return (
        ui?.t('preparation_starts_automatically_af_bc69f4fc') ??
        'Preparation starts automatically after a supported authoring change is saved.'
      );
  }
}

function nextActionCopy(
  workflow: Workflow,
  syncStatus: LayerDraftSyncStatus,
  draftDirty: boolean,
  diagnostics: PreflightDiagnostic[],
  dependencies: TemplateAuthoringDocument['dependencies'],
  ui?: PreparationUi,
) {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch')
    return (
      ui?.t('reconcile_the_saved_and_local_draft_784edaac') ??
      'Reconcile the saved and local draft above before preparing this package.'
    );
  if (syncStatus === 'error')
    return (
      ui?.t('retry_the_private_draft_save_above__472bdda7') ??
      'Retry the private draft save above. Your local work remains available.'
    );
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty)
    return (
      ui?.t('let_the_private_draft_finish_saving_4e29bf27') ??
      'Let the private draft finish saving; preparation resumes from the saved revision.'
    );
  if (diagnostics.some((diagnostic) => diagnostic.affectedFontPostScriptNames?.length))
    return (
      ui?.t('open_fonts_check_to_resolve_the_exa_5f06ab62') ??
      'Open Fonts check to resolve the exact listed faces, then preparation will resume.'
    );
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
      ? (ui?.t('relink_the_matching_package_depende_5358ef47') ??
          'Relink the matching package dependency from Library below; the exact package will be checked again automatically.')
      : (ui?.t('no_verified_library_target_matches__ee392cbc') ??
          'No verified Library target matches this package dependency yet. Keep the package private and retry after the dependency is available.');
  }
  if (diagnostics.some((diagnostic) => diagnostic.code.includes('format_inventory_pending')))
    return (
      ui?.t('no_composition_has_a_verified_deliv_3f3f2f9e') ??
      'No composition has a verified delivery-format mapping yet, so there is no safe format repair target. Retry after the mapping evidence is corrected.'
    );
  const providerPending =
    preflightProgress(workflow.preparation?.progress)?.providerActivation === 'pending';
  if (workflow.state === 'needs-input' || providerPending)
    return (
      ui?.t('retry_preparation_to_resume_provide_5698e0d7') ??
      'Retry preparation to resume provider activation. Native After Effects verification remains pending until a runner returns frames.'
    );
  if (workflow.state === 'failed')
    return (
      ui?.t('retry_preparation_to_resume_this_ex_5ec215fc') ??
      'Retry preparation to resume this exact private package revision; your draft and completed package are retained.'
    );
  if (workflow.artifact && workflow.artifact.verification.nativeAfterEffects !== 'passed')
    return (
      ui?.t('keep_editing_or_download_the_privat_0a5b6ff2') ??
      'Keep editing or download the private package. Version review remains locked until native After Effects samples pass.'
    );
  if (workflow.canReview)
    return (
      ui?.t('review_this_exact_package_to_enable_65889742') ??
      'Review this exact package to enable the existing version-saving action.'
    );
  return (
    ui?.t('supported_authoring_changes_save_pr_1266375a') ??
    'Supported authoring changes save privately and resume preparation automatically.'
  );
}

export function templatePreparationSummary(
  workflow: Workflow,
  syncStatus: LayerDraftSyncStatus,
  draftDirty: boolean,
  dependencies: TemplateAuthoringDocument['dependencies'],
  ui?: PreparationUi,
): {
  label: string;
  detail: string;
  action: 'fonts' | 'save' | 'checks' | null;
} {
  if (syncStatus === 'conflict' || syncStatus === 'source-mismatch') {
    return {
      label: ui?.t('draft_conflict_ea099ac1') ?? 'Draft conflict',
      detail:
        ui?.t('reconcile_the_saved_draft_differenc_c25768cf') ??
        'Reconcile the saved draft difference before package preparation can continue.',
      action: 'save',
    };
  }
  if (syncStatus === 'error') {
    return {
      label: ui?.t('save_failed_53ad6f99') ?? 'Save failed',
      detail:
        ui?.t('retry_saving_the_private_draft_your_6e7f1e82') ??
        'Retry saving the private draft; your local edits are still available.',
      action: 'save',
    };
  }
  if (syncStatus === 'saving' || syncStatus === 'unsaved' || draftDirty) {
    return {
      label: ui?.t('saving_edits_5ca18e46') ?? 'Saving edits',
      detail:
        ui?.t('the_private_draft_must_finish_savin_a4891d30') ??
        'The private draft must finish saving before preparation can continue.',
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
      label: ui?.t('fonts_need_attention_34a6a77e') ?? 'Fonts need attention',
      detail:
        ui?.t('resolve_these_exact_font_faces_in_f_057f9927', {
          value0: String(missingFonts.join(', ')),
        }) ?? `Resolve these exact font faces in Fonts check: ${missingFonts.join(', ')}.`,
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
      label: ui?.t('artwork_needs_attention_24e96459') ?? 'Artwork needs attention',
      detail: names.length
        ? (ui?.t('resolve_these_missing_package_depen_8abafd22', {
            value0: String(names.join(', ')),
          }) ?? `Resolve these missing package dependencies: ${names.join(', ')}.`)
        : (ui?.t('the_package_reports_unresolved_artw_1bf1ae5f') ??
          'The package reports unresolved artwork dependencies. Review the package checks for details.'),
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
      label: ui?.t('delivery_formats_pending_3acd51aa') ?? 'Delivery formats pending',
      detail: diagnostic
        ? diagnosticCopy(diagnostic, ui)
        : (ui?.t('the_required_delivery_format_check__52943d75') ??
          'The required delivery-format check is still pending.'),
      action: 'checks',
    };
  }

  if (workflow.state === 'compiling') {
    return {
      label: ui?.t('building_package_d9b722e6') ?? 'Building package',
      detail:
        ui?.t('creating_a_private_package_from_the_1f459c9e') ??
        'Creating a private package from the saved draft.',
      action: null,
    };
  }
  if (workflow.state === 'preparing') {
    return {
      label: ui?.t('checking_package_4b0d1069') ?? 'Checking package',
      detail:
        ui?.t('verifying_package_contents_and_pres_a32d7382') ??
        'Verifying package contents and preserving the original source.',
      action: null,
    };
  }
  if (workflow.state === 'rendering') {
    return {
      label: ui?.t('rendering_samples_5212e4d8') ?? 'Rendering samples',
      detail:
        ui?.t('requesting_native_sample_frames_for_57cd8092') ??
        'Requesting native sample frames for the delivery compositions.',
      action: null,
    };
  }

  if (workflow.artifact && workflow.artifact.verification.nativeAfterEffects !== 'passed') {
    const providerPending = preflight?.providerActivation === 'pending';
    return {
      label: ui?.t('native_render_pending_dbfef427') ?? 'Native render pending',
      detail: providerPending
        ? (ui?.t('package_checks_are_complete_native__ccde1749') ??
          'Package checks are complete; native sample frames are waiting for the configured render provider.')
        : workflow.state === 'needs-input'
          ? (ui?.t('the_preparation_state_is_waiting_fo_e8329293') ??
            'The preparation state is waiting for an After Effects runner to return native sample frames.')
          : (ui?.t('native_sample_frames_have_not_been__63d34691') ??
            'Native sample frames have not been verified for this package.'),
      action: 'checks',
    };
  }

  if (workflow.canPublish) {
    return {
      label: ui?.t('ready_to_publish_c056e02b') ?? 'Ready to publish',
      detail:
        ui?.t('all_required_checks_and_native_samp_93099e05') ??
        'All required checks and native samples passed for this exact package.',
      action: 'save',
    };
  }

  if (workflow.artifact?.state === 'committed') {
    const versionId = workflow.artifact.commit?.versionId;
    return {
      label: ui?.t('version_published_016929aa') ?? 'Version published',
      detail: versionId
        ? (ui?.t('version_value0_was_published_from_t_3d2c96dc', {
            value0: String(versionId),
          }) ?? `Version ${versionId} was published from this exact package.`)
        : (ui?.t('this_exact_package_has_a_confirmed__198219bd') ??
          'This exact package has a confirmed published version.'),
      action: null,
    };
  }

  if (workflow.state === 'needs-input') {
    return {
      label: ui?.t('preparation_needs_input_16622eb6') ?? 'Preparation needs input',
      detail: nextActionCopy(workflow, syncStatus, draftDirty, diagnostics, dependencies, ui),
      action: 'checks',
    };
  }
  if (workflow.state === 'failed') {
    return {
      label: ui?.t('preparation_paused_c556d8c3') ?? 'Preparation paused',
      detail: nextActionCopy(workflow, syncStatus, draftDirty, diagnostics, dependencies, ui),
      action: 'checks',
    };
  }
  return {
    label: ui?.t('draft_saved_5ccb8caa') ?? 'Draft saved',
    detail:
      ui?.t('supported_authoring_changes_prepare_a8862caf') ??
      'Supported authoring changes prepare a private package automatically after saving.',
    action: null,
  };
}

function userFacingError(error: string, ui?: PreparationUi) {
  if (ui) return ui.t('private_preparation_could_not_conti_442bc070');
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
  const translateUi = useUiTranslations('forge');
  const preparationLocale = useUiLocale();
  const uiErrorText = useUiErrorMessage();
  const checkLabel = (value: string | undefined) => {
    const keys = {
      passed: 'preparationCheckPassed',
      pass: 'preparationCheckPassed',
      verified: 'preparationCheckPassed',
      complete: 'preparationCheckPassed',
      completed: 'preparationCheckPassed',
      ready: 'preparationCheckPassed',
      failed: 'preparationCheckFailed',
      fail: 'preparationCheckFailed',
      pending: 'preparationCheckPending',
      configured: 'preparationProviderConfigured',
      active: 'preparationProviderConfigured',
      unconfigured: 'preparationProviderUnavailable',
      unavailable: 'preparationProviderUnavailable',
    } as const;
    return translateUi(
      value && Object.hasOwn(keys, value)
        ? keys[value as keyof typeof keys]
        : value
          ? 'preparationCheckUnknown'
          : 'preparationCheckPending',
    );
  };

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
        if (!cancelled) setSampleError(uiErrorText(reason));
      });
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [workflow.artifact?.artifactId, sampleKey, uiErrorText]);

  const stateDescription = stateCopy(workflow, syncStatus, draftDirty, {
    t: translateUi,
    locale: preparationLocale,
  });
  const checks = workflow.artifact?.verification;
  const preflight = preflightProgress(workflow.preparation?.progress);
  const nextAction = nextActionCopy(
    workflow,
    syncStatus,
    draftDirty,
    preflight?.diagnostics ?? [],
    dependencies,
    { t: translateUi, locale: preparationLocale },
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
            {' '}
            {translateUi('private_package_preparation_8a48c84d')}{' '}
          </h3>
          <p role="status" className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {stateDescription}
          </p>
        </div>
        {workflow.state === 'compiling' ||
        workflow.state === 'preparing' ||
        workflow.state === 'rendering' ? (
          <Loader2
            aria-label={translateUi('preparation_in_progress_1d6050e9')}
            className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      {preflight?.diagnostics?.length ? (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {preflight.diagnostics.map((diagnostic, index) => (
            <li key={`${index}:${diagnostic.code}`}>
              {!diagnostic.missingFootage?.length ? (
                <span>
                  {diagnosticCopy(diagnostic, {
                    t: translateUi,
                    locale: preparationLocale,
                  })}
                </span>
              ) : null}
              {diagnostic.affectedFontPostScriptNames?.length ? (
                <>
                  <span>
                    {' '}
                    {translateUi('affected_font_faces_859643f8')}{' '}
                    {diagnostic.affectedFontPostScriptNames.join(', ')}.
                  </span>
                  {onOpenFontRepair ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="link"
                      className="ml-1 h-auto p-0"
                      onClick={onOpenFontRepair}
                    >
                      {' '}
                      {translateUi('open_fonts_check_ca16c0e2')}{' '}
                    </Button>
                  ) : null}
                  {fontLayerContext(diagnostic.affectedFontPostScriptNames).length ? (
                    <span className="block pl-2">
                      {' '}
                      {translateUi('affected_layers_a3797d08')}{' '}
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
                            {' '}
                            {translateUi('inspect_affected_composition_a1177775')}{' '}
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
                        {' '}
                        {translateUi('inspect_affected_composition_a1177775')}{' '}
                      </Button>
                    );
                  })()
                : null}
              {diagnostic.missingFootage?.length ? (
                <ul
                  className="list-disc pl-4"
                  aria-label={translateUi('unresolved_package_footage_b4682ef4')}
                >
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
                              {' '}
                              {translateUi('relink_from_library_ba87d929')}{' '}
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
                                {' '}
                                {translateUi('inspect_affected_composition_a1177775')}{' '}
                              </Button>
                            ) : null}
                          </>
                        ) : exact?.relinkReason ? (
                          <span className="ml-1">· {exact.relinkReason}</span>
                        ) : matches.length > 1 ? (
                          <span className="ml-1">
                            {' '}
                            {translateUi('multiple_package_dependencies_match_a3bb7c03')}{' '}
                          </span>
                        ) : (
                          <span className="ml-1">
                            {' '}
                            {translateUi('no_exact_editable_package_dependenc_bf896472')}{' '}
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
        <span className="font-medium">{translateUi('next_step_707b05c5')}</span> {nextAction}
      </p>

      {workflow.preparation ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {' '}
            {translateUi('preparation_55084680')}{' '}
            <span className="font-medium text-foreground">
              {workflow.preparation.state.replaceAll('_', ' ')}
            </span>
          </span>
          {workflow.preparation.runId ? (
            <span>
              {translateUi('run_00d60e31')} {workflow.preparation.runId}
            </span>
          ) : null}
        </div>
      ) : null}

      {preflight?.stage ? (
        <p role="status" className="text-xs text-muted-foreground">
          {' '}
          {translateUi('package_preflight_format_12c2641f')} {checkLabel(preflight.checks?.format)}
          {translateUi('dependencies_603accd6')} {checkLabel(preflight.checks?.dependencies)}
          {preflight.providerActivation
            ? translateUi('forgeProviderState', {
                status: checkLabel(preflight.providerActivation),
              })
            : ''}
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
                setPackageError(uiErrorText(reason));
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
            {downloading
              ? translateUi('verifying_package_3e2e01da')
              : translateUi('download_private_package_472829f9')}
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
            {' '}
            {translateUi('package_details_and_verification_90e2ad56')}{' '}
            <span aria-hidden className="text-muted-foreground">
              {checks ? translateUi('view_checks_d9afefde') : translateUi('view_details_d1bf045b')}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 border-t border-border p-2 text-xs sm:grid-cols-2">
            {workflow.artifact ? (
              <>
                <div className="min-w-0">
                  <span className="text-muted-foreground">
                    {translateUi('private_package_b6f29fd2')}
                  </span>
                  <p
                    className="truncate font-medium text-foreground"
                    title={workflow.artifact.filename}
                  >
                    {workflow.artifact.filename}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {translateUi('package_size_df358ee3')}
                  </span>
                  <p className="font-medium text-foreground">
                    {formatBytes(workflow.artifact.sizeBytes, preparationLocale)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {translateUi('draft_revision_eb00feff')}
                  </span>
                  <p className="font-mono text-foreground">{workflow.artifact.draftRevision}</p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">
                    {translateUi('package_checksum_dcaace66')}
                  </span>
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
                aria-label={translateUi('package_verification_checks_c17d2d8d')}
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
                        {translateUi(label)}
                      </span>
                      <span className="ml-auto font-medium capitalize text-foreground">
                        {checkLabel(value)}
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
          aria-label={translateUi('verified_native_sample_frames_bc78b18c')}
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
          {userFacingError(workflow.error, {
            t: translateUi,
            locale: preparationLocale,
          })}
        </p>
      ) : null}
      {workflow.state === 'needs-input' || workflow.state === 'failed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="xs" variant="outline" onClick={() => void workflow.retry()}>
            <RefreshCw data-icon="inline-start" /> {translateUi('retry_preparation_e42e093a')}{' '}
          </Button>
          <span className="text-xs text-muted-foreground">
            {' '}
            {translateUi('retry_keeps_this_private_draft_and__d4752866')}{' '}
          </span>
        </div>
      ) : null}

      {workflow.artifact?.state === 'committed' ? (
        <p role="status" className="text-xs font-medium text-foreground">
          {' '}
          {translateUi('published_version_e5dfd8a7')}{' '}
          {workflow.artifact.commit?.versionId ?? translateUi('confirmed_9599915b')}{' '}
          {translateUi('from_this_exact_private_package_f5d0835f')}{' '}
        </p>
      ) : workflow.artifact?.state === 'reviewed' ? (
        <p role="status" className="text-xs font-medium text-foreground">
          {' '}
          {translateUi('reviewed_for_version_saving_the_ver_aeb69cb9')}{' '}
        </p>
      ) : workflow.canReview ? (
        reviewInVersionAction ? (
          <p role="status" className="text-xs text-muted-foreground">
            {' '}
            {translateUi('all_checks_passed_for_this_exact_pa_298a0b2a')}{' '}
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
              )}{' '}
              {translateUi('approve_for_version_saving_241ad219')}{' '}
            </Button>
            <span className="text-xs text-muted-foreground">
              {' '}
              {translateUi('this_decision_is_available_only_aft_92736d11')}{' '}
            </span>
          </div>
        )
      ) : workflow.artifact ? (
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('version_review_stays_locked_until_p_242004b4')}{' '}
        </p>
      ) : null}

      {workflow.state === 'failed' && !workflow.artifact ? (
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('the_local_and_private_server_draft__2bfdd59e')}{' '}
        </p>
      ) : null}
      <span className="sr-only">
        {translateUi('draft_revision_eb00feff')} {draftRevision}
      </span>
    </section>
  );
}
