'use client';

import { TRENDS_REUSE_DAYS } from '@continuum/contracts';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { TrendGenerationProgress } from '@/components/brand-insights/TrendGenerationProgress';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useSmoothTrendProgress } from '@/hooks/useSmoothTrendProgress';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { revalidateBrandInsights } from '@/lib/actions/brandInsights';
import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  subscribeToBrandInsightsJob,
} from '@/lib/api/brandInsights.client';
import { ApiError } from '@/lib/api/errors';
import { buildBrandInsightsProgressSteps } from '@/lib/brand-insights/progress';
import { cn } from '@/lib/utils';

// Matches the backend reuse window (findFreshCompletedGeneration withinDays):
// within this window a click re-pulls the cached generation; past it the backend
// regenerates. The single button reflects that to the user.
const STALE_AFTER_DAYS = TRENDS_REUSE_DAYS;

type Props = {
  brandId: string;
  lastGeneratedAt?: string;
  // Render as a low-key, uncolored control (not a call-to-action). Used on the
  // dashboard where generation is automatic and the manual refresh is secondary.
  subtle?: boolean;
  // Always start a fresh generation, bypassing the backend's 5-day reuse window.
  force?: boolean;
};

function ageInDays(iso?: string): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

export function BrandInsightsGenerateButton({
  brandId,
  lastGeneratedAt,
  subtle = false,
  force = false,
}: Props) {
  const tUi = useTranslations('common');
  const getUiErrorMessage = useUiErrorMessage();
  const stageKeys = {
    awaiting_brand_context: 'm_695ed43e06',
    awaiting_strategic_analysis: 'm_0ac0d6926a',
    queued: 'queued_661ff40',
    scraping: 'm_9dcca872d7',
    raw_search: 'm_f444e7a435',
    synthesis: 'm_d7b22a6928',
    web_enrichment: 'm_7ba0d56d2c',
    questions: 'questions_9a72221',
    secondary_platform_eval: 'm_7621ca76a3',
    persisting: 'm_68a9ccaac6',
    completed: 'm_1798b3ba42',
    failed: 'failed_031a8f0',
  } as const;

  const router = useRouter();
  const { show } = useToast();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | undefined>(undefined);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const completedToastGenerationRef = useRef<string | null>(null);

  const isWorking = isPending || Boolean(generationId);
  const isFailureStatus = status === 'failed' || status === 'error' || status === 'not_found';
  const isWorkflowRunning =
    isPending || Boolean(generationId) || (status ? !isTerminalBrandInsightsStatus(status) : false);
  const showProgress = isWorkflowRunning || isFailureStatus || Boolean(error);

  const ageDays = ageInDays(lastGeneratedAt);
  const isStale = ageDays === null || ageDays >= STALE_AFTER_DAYS;

  const buttonLabel = useMemo(() => {
    if (generationId) return tUi('m_11edad70c1');
    if (isPending) return tUi('starting_bbe5fc3');
    if (force) return tUi('m_0c80809193');
    return isStale ? tUi('m_17ca5fb6f5') : tUi('m_0c80809193');
  }, [generationId, isPending, isStale, force, tUi]);

  // Relative age caption, hidden while a run is in flight (the progress row
  // takes over). Null when we have no prior generation to describe.
  const ageLabel = useMemo(() => {
    if (isWorking || ageDays === null) return null;
    if (ageDays <= 0) return tUi('m_82fb1d5144');
    return isStale ? tUi('m_edbc56c2c7', { v0: String(ageDays) }) : tUi('m_82fb1d5144');
  }, [isWorking, ageDays, isStale, tUi]);

  const progressSteps = useMemo(() => {
    const steps = buildBrandInsightsProgressSteps({ stage, status });
    const showAwaitingBrandContext = stage === 'awaiting_brand_context';
    const showAwaitingStrategic = stage === 'awaiting_strategic_analysis';
    return steps
      .map((step) => ({ ...step, label: tUi(stageKeys[step.id]) }))
      .filter((step) => {
        if (step.id === 'awaiting_brand_context' && !showAwaitingBrandContext) {
          return false;
        }
        if (step.id === 'awaiting_strategic_analysis' && !showAwaitingStrategic) {
          return false;
        }
        if (step.id === 'failed' && !isFailureStatus) {
          return false;
        }
        return true;
      });
  }, [stage, status, isFailureStatus, tUi]);

  const currentLabel = useMemo(
    () => progressSteps.find((s) => s.status === 'current')?.label ?? tUi('queued_661ff40'),
    [progressSteps, tUi],
  );

  const isTerminal = isFailureStatus || status === 'completed';
  const { displayPercent, etaSeconds } = useSmoothTrendProgress({
    targetPercent: progressPercent ?? 0,
    remainingMs,
    isTerminal,
  });

  useEffect(
    () => () => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
    },
    [],
  );

  // Busting the tagged Data Cache (tags.brandInsights) is what actually pulls
  // the new generation in — router.refresh() alone re-renders against the stale
  // cached /api/trends/read response.
  const refreshInsights = async () => {
    try {
      await revalidateBrandInsights(brandId);
    } catch {
      // Best-effort; router.refresh still re-renders from the server.
    }
    router.refresh();
  };

  const handleRun = () => {
    setError(null);
    setStatus(null);
    setStage('queued');
    setProgressPercent(null);
    setRemainingMs(undefined);
    setStageMessage(null);
    startTransition(async () => {
      try {
        const result = await generateBrandInsights({ brandId, forceRegenerate: force });
        if (result.status === 'processing' && result.generationId) {
          const activeGenerationId = result.generationId;
          setGenerationId(activeGenerationId);
          setStatus(result.jobStatus ?? 'running');
          setStage(result.stage ?? 'queued');
          setStageMessage(result.message ?? null);
          stopTrackingRef.current?.();
          stopTrackingRef.current = subscribeToBrandInsightsJob({
            generationId: activeGenerationId,
            streamChannel: result.stream?.channel,
            fallbackPollUrl: result.fallbackPollUrl,
            onStatus: (next) => {
              setStatus(next.status);
              setStage((previous) => {
                if (next.stage) return next.stage;
                if (next.status === 'completed') return 'completed';
                if (
                  next.status === 'failed' ||
                  next.status === 'error' ||
                  next.status === 'not_found'
                )
                  return 'failed';
                return previous;
              });
              setProgressPercent(next.progressPercent ?? null);
              if (typeof next.runtime?.remainingMs === 'number') {
                setRemainingMs(next.runtime.remainingMs);
              }
              setStageMessage(next.stageMessage ?? next.errorDetail ?? next.message ?? null);
              if (isTerminalBrandInsightsStatus(next.status)) {
                if (
                  next.status === 'completed' &&
                  completedToastGenerationRef.current !== activeGenerationId
                ) {
                  completedToastGenerationRef.current = activeGenerationId;
                  show({
                    title: tUi('m_e8b1187f89'),
                    description: tUi('m_bd27df9b01'),
                    variant: 'success',
                  });
                }
                stopTrackingRef.current?.();
                stopTrackingRef.current = null;
                setGenerationId(null);
                void refreshInsights();
              }
            },
            onMessage: (message) => {
              if (typeof message.progressPercent === 'number') {
                setProgressPercent(message.progressPercent);
              }
              if (typeof message.runtime?.remainingMs === 'number') {
                setRemainingMs(message.runtime.remainingMs);
              }
              if (message.stageMessage) {
                setStageMessage(message.stageMessage);
              }
              if (message.stage) {
                setStage(message.stage);
              }
              if (message.status) {
                setStatus(message.status);
              } else if (message.stage) {
                setStatus((current) =>
                  isTerminalBrandInsightsStatus(current) ? current : 'running',
                );
              }
            },
            onError: (streamError) => {
              setError(getUiErrorMessage(streamError));
            },
          });
        } else {
          // Fresh (<5d) generation reused by the backend — nothing to stream,
          // just re-pull the page so the latest saved trends render.
          show({
            title: tUi('m_39a239b0d9'),
            description: tUi('m_1803c313b8'),
            variant: 'success',
          });
          await refreshInsights();
        }
      } catch (runError) {
        // 409: the brand report isn't approved yet — trends start on their own after onboarding.
        setError(
          runError instanceof ApiError && runError.status === 409
            ? tUi('m_078d1efd06')
            : runError instanceof Error
              ? getUiErrorMessage(runError)
              : tUi('m_aa69543610'),
        );
      }
    });
  };

  const Icon = force ? RefreshCw : isStale ? Sparkles : RefreshCw;

  return (
    <div className={cn('flex flex-col items-end gap-1.5', showProgress ? 'w-full' : 'w-auto')}>
      <div className="flex items-center gap-2">
        {ageLabel && !subtle ? (
          <span className="text-xs tabular-nums text-muted-foreground">{ageLabel}</span>
        ) : null}
        <Button
          onClick={handleRun}
          disabled={isWorking}
          variant={subtle ? 'ghost' : 'default'}
          size="sm"
          aria-label={subtle ? buttonLabel : undefined}
          title={subtle ? buttonLabel : undefined}
          className={cn(
            'h-7 text-xs',
            subtle ? 'w-7 px-0 text-muted-foreground hover:text-foreground' : 'px-2',
          )}
        >
          {isWorking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Icon className="size-3.5" />
          )}
          {!subtle && buttonLabel}
        </Button>
      </div>
      {showProgress && (
        <TrendGenerationProgress
          progressPercent={displayPercent}
          currentLabel={currentLabel}
          isError={isFailureStatus || Boolean(error)}
          errorMessage={
            error ??
            (isFailureStatus ? getUiErrorMessage({ code: 'generation_failed' }) : undefined)
          }
          etaSeconds={etaSeconds}
        />
      )}
    </div>
  );
}
