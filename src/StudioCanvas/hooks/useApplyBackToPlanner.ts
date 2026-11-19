import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { request } from '@/lib/api/http';
import {
  buildPendingApplyStorageKey,
  type PlannerAiStudioApplyRequest,
  type PlannerAiStudioHandoff,
  plannerAiStudioApplyResponseSchema,
  resolveWorkflowConceptSpec,
  type WorkflowConceptSpec,
} from '@/lib/organic/ai-studio-bridge';
import { useStudioStore } from '../stores/useStudioStore';
import {
  type ApplyAssetCandidate,
  collectApplyAssetCandidates,
} from '../utils/applyAssetCandidates';
import { buildStarterFlow } from '../utils/seedStarterFlow';

// Module scope rather than a useCallback: it closes over nothing, so its identity
// was already constant and the apply handler no longer needs it as a dependency.
async function resolveCandidateSource(source: string) {
  if (source.startsWith('data:')) {
    return { sourceDataUrl: source };
  }
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return { sourceUrl: source };
  }
  if (source.startsWith('blob:')) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error('Unable to read local asset blob for apply.');
    }
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          reject(new Error('Unable to convert blob output to data URL.'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error('Unable to convert blob output to data URL.'));
      reader.readAsDataURL(blob);
    });
    return { sourceDataUrl: dataUrl };
  }
  return { sourceBase64: source };
}

// The Planner handoff's return leg: which generated outputs count, whether enough of
// them exist for this workflow shape, and the POST that writes them back to the draft.
export function useApplyBackToPlanner({
  brandProfileId,
  organicPlannerSeed,
  focusNodeId,
}: {
  brandProfileId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
  focusNodeId?: string;
}) {
  const translateUi = useUiTranslations('studio');

  const uiErrorText = useUiErrorMessage();

  const router = useRouter();
  const { show } = useToast();
  const nodes = useStudioStore((state) => state.nodes);
  const [isApplyingBack, setIsApplyingBack] = useState(false);
  const [selectedLinkedinNodeId, setSelectedLinkedinNodeId] = useState<string | null>(null);
  const workflowSpec = useMemo<WorkflowConceptSpec | null>(
    () =>
      organicPlannerSeed
        ? resolveWorkflowConceptSpec({
            platform: organicPlannerSeed.platform,
            postType: organicPlannerSeed.postType,
            workflowConcept: organicPlannerSeed.workflowConcept,
          })
        : null,
    [organicPlannerSeed],
  );

  const allowedOutputIds = useMemo(() => {
    if (!organicPlannerSeed || organicPlannerSeed.brandProfileId !== brandProfileId)
      return new Set<string>();
    const ids = new Set(buildStarterFlow(organicPlannerSeed).nodes.map((node) => node.id));
    if (focusNodeId) ids.add(focusNodeId);
    return ids;
  }, [brandProfileId, focusNodeId, organicPlannerSeed]);
  const applyCandidates = useMemo(
    () =>
      collectApplyAssetCandidates(
        nodes.filter(
          (node) =>
            allowedOutputIds.has(node.id) ||
            (workflowSpec?.outputMode !== 'ordered' && node.selected),
        ),
      ),
    [allowedOutputIds, nodes, workflowSpec?.outputMode],
  );
  const linkedinImageCandidates = useMemo(
    () => applyCandidates.filter((candidate) => candidate.kind === 'image'),
    [applyCandidates],
  );
  const requiresExplicitSelection = Boolean(
    workflowSpec?.requiresExplicitPickOnMultiOutput && linkedinImageCandidates.length > 1,
  );
  const applyReadiness = useMemo(() => {
    if (!organicPlannerSeed || !workflowSpec) return null;

    if (workflowSpec.outputKind === 'text') {
      const copy = nodes.find(
        (node) => node.id === `organic-seed-text-${organicPlannerSeed.draftId}`,
      )?.data as { value?: unknown } | undefined;
      const caption = typeof copy?.value === 'string' ? copy.value.trim() : '';
      const ready = Boolean(caption && caption !== organicPlannerSeed.captionPreview.trim());
      return {
        ready,
        completed: ready ? 1 : 0,
        total: 1,
        label: ready ? translateUi('caption_ready_c6b137e8') : translateUi('edit_caption_fcbd55e5'),
        detail: ready
          ? 'Ready to save this caption to Planner.'
          : 'Edit the caption in the text node to apply it.',
      };
    }

    const imageCount = applyCandidates.filter((candidate) => candidate.kind === 'image').length;
    const videoCount = applyCandidates.filter((candidate) => candidate.kind === 'video').length;

    if (workflowSpec.outputKind === 'video') {
      const total = 1;
      const completed = Math.min(videoCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: translateUi('value0_value1_video_ready_faef4869', {
          value0: String(completed),
          value1: String(total),
        }),
        detail:
          completed >= total
            ? 'Ready to apply this reel back to Planner.'
            : 'Generate one video output to enable apply-back.',
      };
    }

    if (workflowSpec.outputMode === 'ordered') {
      const total = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
      const completed = Math.min(imageCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: translateUi('value0_value1_slides_ready_796e9b30', {
          value0: String(completed),
          value1: String(total),
        }),
        detail:
          completed >= total
            ? 'Ordered carousel outputs are ready to apply.'
            : 'Generate all required carousel slides before applying.',
      };
    }

    const total = 1;
    const completed = Math.min(imageCount, total);
    const missingSelection =
      workflowSpec.requiresExplicitPickOnMultiOutput && imageCount > 1 && !selectedLinkedinNodeId;
    return {
      ready: completed >= total && !missingSelection,
      completed,
      total,
      label: translateUi('value0_value1_image_ready_f5df23ad', {
        value0: String(completed),
        value1: String(total),
      }),
      detail: missingSelection
        ? 'Select one image output before applying.'
        : completed >= total
          ? 'Ready to apply this draft back to Planner.'
          : 'Generate one image output to enable apply-back.',
    };
  }, [
    applyCandidates,
    nodes,
    organicPlannerSeed,
    selectedLinkedinNodeId,
    workflowSpec,
    translateUi,
  ]);
  const workflowSummaryLabel = useMemo(() => {
    if (!workflowSpec) return null;
    if (workflowSpec.outputKind === 'text') return 'TikTok caption';
    if (workflowSpec.outputKind === 'video') return 'Reel workflow';
    if (workflowSpec.outputMode === 'ordered') return 'Carousel workflow';
    if (workflowSpec.requiresExplicitPickOnMultiOutput) return 'LinkedIn post workflow';
    return 'Single-image workflow';
  }, [workflowSpec]);

  useEffect(() => {
    if (!requiresExplicitSelection) {
      setSelectedLinkedinNodeId(null);
      return;
    }
    if (
      selectedLinkedinNodeId &&
      linkedinImageCandidates.some((candidate) => candidate.nodeId === selectedLinkedinNodeId)
    ) {
      return;
    }
    setSelectedLinkedinNodeId(null);
  }, [linkedinImageCandidates, requiresExplicitSelection, selectedLinkedinNodeId]);

  const handleReturnToPlanner = useCallback(() => {
    if (!organicPlannerSeed) return;

    const params = new URLSearchParams({
      tab: 'planner',
      draftId: organicPlannerSeed.draftId,
      weekStartId: organicPlannerSeed.weekStartId,
      from: 'ai-studio',
    });
    router.push(`/organic?${params.toString()}`);
  }, [organicPlannerSeed, router]);

  const handleApplyBackToPlanner = useCallback(async () => {
    if (
      !organicPlannerSeed ||
      !brandProfileId ||
      organicPlannerSeed.brandProfileId !== brandProfileId
    ) {
      show({
        title: translateUi('apply_unavailable_728d7c1b'),
        description: translateUi('missing_planner_context_for_this_ca_d21fd027'),
        variant: 'warning',
      });
      return;
    }

    setIsApplyingBack(true);
    try {
      if (!workflowSpec) {
        throw new Error('Workflow concept is missing for this Planner draft.');
      }
      if (workflowSpec.outputKind === 'text') {
        const draftId = organicPlannerSeed.backendDraftId;
        const expectedUpdatedAt = organicPlannerSeed.sourceUpdatedAt;
        const textNode = nodes.find(
          (node) => node.id === `organic-seed-text-${organicPlannerSeed.draftId}`,
        );
        const value = (textNode?.data as { value?: unknown } | undefined)?.value;
        const caption = typeof value === 'string' ? value.trim() : '';
        if (
          !draftId ||
          !expectedUpdatedAt ||
          !caption ||
          caption === organicPlannerSeed.captionPreview.trim()
        ) {
          throw new Error('Edit this draft caption before applying it to Planner.');
        }
        await request({
          path: `/api/organic/calendar/drafts/${encodeURIComponent(draftId)}/fields`,
          method: 'PATCH',
          body: { caption, expected_updated_at: expectedUpdatedAt },
        });
        show({ title: translateUi('caption_saved_to_planner_2fa3400a'), variant: 'success' });
        const params = new URLSearchParams({
          tab: 'planner',
          draftId: organicPlannerSeed.draftId,
          weekStartId: organicPlannerSeed.weekStartId,
          from: 'ai-studio',
        });
        router.push(`/organic?${params.toString()}`);
        return;
      }
      if (organicPlannerSeed.platform === 'tiktok') {
        throw new Error('TikTok media cannot be applied from this Studio workflow.');
      }
      const imageCandidates = applyCandidates.filter((candidate) => candidate.kind === 'image');
      const videoCandidates = applyCandidates.filter((candidate) => candidate.kind === 'video');

      let selectedCandidates: ApplyAssetCandidate[] = [];
      if (workflowSpec.outputKind === 'video') {
        const firstVideo = videoCandidates[0];
        if (!firstVideo) {
          throw new Error('Generate at least one video output before applying back.');
        }
        selectedCandidates = [firstVideo];
      } else if (workflowSpec.outputMode === 'ordered') {
        const requiredCount = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
        if (imageCandidates.length < requiredCount) {
          throw new Error(
            `Carousel requires ${requiredCount} generated images, but only ${imageCandidates.length} found.`,
          );
        }
        selectedCandidates = imageCandidates.slice(0, requiredCount);
      } else if (workflowSpec.requiresExplicitPickOnMultiOutput) {
        if (imageCandidates.length === 0) {
          throw new Error('Generate at least one image output before applying back.');
        }
        if (imageCandidates.length > 1 && !selectedLinkedinNodeId) {
          throw new Error('Select one image output before applying.');
        }
        selectedCandidates =
          imageCandidates.length > 1
            ? imageCandidates.filter((candidate) => candidate.nodeId === selectedLinkedinNodeId)
            : [imageCandidates[0]];
      } else {
        const firstImage =
          imageCandidates.find(
            (candidate) =>
              !allowedOutputIds.has(candidate.nodeId) &&
              nodes.some((node) => node.id === candidate.nodeId && node.selected),
          ) ?? imageCandidates[0];
        if (!firstImage) {
          throw new Error('Generate at least one image output before applying back.');
        }
        selectedCandidates = [firstImage];
      }

      const assets = await Promise.all(
        selectedCandidates.map(async (candidate, index) => {
          const source = await resolveCandidateSource(candidate.source);
          return {
            role: workflowSpec.outputMode === 'ordered' ? `slide_${index + 1}` : candidate.role,
            kind: candidate.kind,
            slideIndex: workflowSpec.outputMode === 'ordered' ? index : undefined,
            ...source,
          };
        }),
      );

      // The route writes the ROW the handoff was opened from. On a group that is the frame's
      // member row, whose planner id (`<card>::<platform>`) is not a row id.
      const requestPayload: PlannerAiStudioApplyRequest = {
        schemaVersion: 'planner_ai_apply_v1',
        draftId: organicPlannerSeed.backendDraftId ?? organicPlannerSeed.draftId,
        brandProfileId,
        postType: organicPlannerSeed.postType,
        platform: organicPlannerSeed.platform,
        overwrite: true,
        expectedUpdatedAt: organicPlannerSeed.sourceUpdatedAt,
        contentPatch: {},
        assets,
        selection: {
          required: requiresExplicitSelection,
          selectedAssetRole:
            requiresExplicitSelection && selectedCandidates[0]
              ? selectedCandidates[0].role
              : undefined,
        },
      };

      const response = await fetch('/api/organic/ai-studio/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const responseJson = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          responseJson && typeof responseJson.error === 'string'
            ? responseJson.error
            : translateUi('failed_to_apply_output_to_planner_eed52d95');
        throw new Error(message);
      }

      const parsed = plannerAiStudioApplyResponseSchema.safeParse(responseJson);
      if (!parsed.success) {
        throw new Error('Apply response payload is invalid.');
      }

      // The planner mirrors it by its own id, the one the return link carries.
      window.localStorage.setItem(
        buildPendingApplyStorageKey(organicPlannerSeed.draftId),
        JSON.stringify({ ...parsed.data, draftId: organicPlannerSeed.draftId }),
      );

      show({
        title: translateUi('applied_to_planner_1e656aee'),
        description: translateUi('returning_to_organic_planner_c9092bc8'),
        variant: 'success',
      });

      const params = new URLSearchParams({
        tab: 'planner',
        draftId: organicPlannerSeed.draftId,
        weekStartId: organicPlannerSeed.weekStartId,
        from: 'ai-studio',
      });
      router.push(`/organic?${params.toString()}`);
    } catch (error) {
      show({
        title: translateUi('apply_failed_cae4cf5c'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setIsApplyingBack(false);
    }
  }, [
    applyCandidates,
    allowedOutputIds,
    brandProfileId,
    organicPlannerSeed,
    nodes,
    requiresExplicitSelection,
    router,
    selectedLinkedinNodeId,
    show,
    workflowSpec,

    uiErrorText,
    translateUi,
  ]);

  return {
    enabled: Boolean(organicPlannerSeed && organicPlannerSeed.brandProfileId === brandProfileId),
    applyReadiness,
    workflowSummaryLabel,
    requiresExplicitSelection,
    linkedinImageCandidates,
    selectedLinkedinNodeId,
    setSelectedLinkedinNodeId,
    isApplyingBack,
    onReturnToPlanner: handleReturnToPlanner,
    onApplyBack: handleApplyBackToPlanner,
  };
}
