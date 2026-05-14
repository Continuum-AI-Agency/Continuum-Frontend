"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { OnboardingShell, type ShellPillId } from "./OnboardingShell";
import type { StepperState } from "./OnboardingStepper";
import { UrlScreen } from "./screens/UrlScreen";
import { BrandDnaScreen } from "./screens/BrandDnaScreen";
import { IntegrationsScreen } from "./screens/IntegrationsScreen";
import { BackgroundJobsProvider, useBackgroundJobs } from "./state/BackgroundJobsProvider";
import { runScrape, runTrendsPrewarm } from "./state/jobRunners";
import { runAgentPreview, emptyBuckets, type AgentPreviewBuckets } from "./state/agentPreview";
import {
  computePreviewInputHash,
  fetchPreviewLatest,
  fetchPreviewSnapshot,
  PreviewRateLimitedError,
  PREVIEW_PROMPT_VERSION,
} from "@/lib/onboarding/agentClient";
import { JobPersistor } from "./state/JobPersistor";
import { OnboardingProvider, useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { approveAndLaunchOnboardingAction } from "@/app/onboarding/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OnboardingState } from "@/lib/onboarding/state";
import { useBrandProfileRevealCache } from "@/lib/onboarding/revealCache";
import { timing, trackOnboardingEvent } from "@/lib/onboarding/telemetry";
import { useBrandAssignedAccountIds } from "@/hooks/useBrandAssignedAccountIds";

type ScreenIndex = 0 | 1 | 2;

const swipeVariants = {
  enter: (dir: number) => ({ x: dir * 56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -56, opacity: 0 }),
};

type OnboardingExperienceProps = {
  brandId: string;
  initialState: OnboardingState;
  defaultUrl: string | null;
};

export function OnboardingExperience(props: OnboardingExperienceProps) {
  return (
    <OnboardingProvider brandId={props.brandId} initialState={props.initialState}>
      <BackgroundJobsProvider>
        <JobPersistor />
        <ExperienceInner {...props} />
      </BackgroundJobsProvider>
    </OnboardingProvider>
  );
}

function ExperienceInner({ initialState, defaultUrl }: OnboardingExperienceProps) {
  const router = useRouter();
  const { show } = useToast();
  const [screen, setScreen] = useState<ScreenIndex>(resumeScreenFor(initialState));
  const directionRef = useRef<1 | -1>(1);
  const navigate = useCallback((next: ScreenIndex) => {
    directionRef.current = next > screen ? 1 : -1;
    setScreen(next);
  }, [screen]);
  const [domain, setDomain] = useState<string>(initialState.brand.website ?? defaultUrl ?? "");
  const { start, patch, jobs, reset } = useBackgroundJobs();
  const { brandId, resetState, state } = useOnboarding();
  const { assignedIds: assignedAccountIds } = useBrandAssignedAccountIds(brandId);
  const [launching, startLaunch] = useTransition();
  const [resetting, startReset] = useTransition();
  const prewarmedRef = useRef(false);
  const launchInFlightRef = useRef(false);
  const launchKeyRef = useRef<string | null>(null);

  const handleStartOver = () => {
    startReset(async () => {
      reset();
      prewarmedRef.current = false;
      launchInFlightRef.current = false;
      launchKeyRef.current = null;
      useBrandProfileRevealCache.getState().invalidateBrand(brandId);
      try {
        await resetState();
      } catch (error) {
        show({
          title: "Couldn't reset",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
        return;
      }
      setDomain(defaultUrl ?? "");
      navigate(0);
    });
  };

  const handleLaunch = () => {
    if (launchInFlightRef.current) return;

    const legacySelectedCount = countSelectedAccounts(state);
    const integrationCount = Math.max(assignedAccountIds.length, legacySelectedCount);
    if (integrationCount === 0 && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Launch without any integration accounts attached?\n\nYou won't see paid-media or organic data on the dashboard until you connect at least one account in Settings."
      );
      if (!confirmed) {
        trackOnboardingEvent("onboarding_launch_clicked", { integration_count: 0, confirmed: false });
        return;
      }
    }
    trackOnboardingEvent("onboarding_launch_clicked", {
      integration_count: integrationCount,
      confirmed: true,
    });

    launchInFlightRef.current = true;
    if (!launchKeyRef.current) {
      launchKeyRef.current =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${brandId}-${Date.now().toString(36)}`;
    }

    const launchTimer = timing();
    startLaunch(async () => {
      try {
        await approveAndLaunchOnboardingAction(brandId, {
          idempotencyKey: launchKeyRef.current ?? undefined,
        });
        useBrandProfileRevealCache.getState().invalidateBrand(brandId);
        trackOnboardingEvent("onboarding_launch_succeeded", {
          duration_ms: launchTimer.sinceStart(),
          integration_count: integrationCount,
        });
        router.push("/dashboard");
      } catch (error) {
        launchInFlightRef.current = false;
        trackOnboardingEvent("onboarding_launch_failed", {
          duration_ms: launchTimer.sinceStart(),
          message: error instanceof Error ? error.message : "Unknown error",
        });
        show({
          title: "Launch failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      }
    });
  };

  const handleUrlSubmit = async (url: string) => {
    if (domain && domain !== url) {
      useBrandProfileRevealCache.getState().invalidateUrl(brandId, domain);
    }
    setDomain(url);
    navigate(1);
    patch("agentPreview", emptyBuckets());

    const scrapePromise = start("scrape", (signal) => runScrape(url, signal));

    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;

    const scrape = await scrapePromise;
    const brandName =
      scrape?.title ??
      initialState.brand.name ??
      new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname;

    void (async () => {
      const previewTimer = timing();
      trackOnboardingEvent("onboarding_agent_preview_started", { url });

      const inputHash = await computePreviewInputHash({
        payload: {
          brandProfile: {
            id: brandId,
            brand_name: brandName,
            website_url: url || undefined,
          },
          runContext: {
            user_id: userId,
            brand_id: brandId,
            brand_name: brandName,
            created_at: new Date().toISOString(),
            platform_urls: url ? [url] : [],
            integrated_platforms: [],
            brand_voice_tags: initialState.brand.brandVoiceTags ?? [],
            integration_account_ids: [],
          },
          scrape,
        },
        promptVersion: PREVIEW_PROMPT_VERSION,
      }).catch(() => null);

      try {
        const outcome = await start("agentPreview", (signal) =>
          runAgentPreview(
            {
              brandId,
              userId,
              brandName,
              websiteUrl: url,
              voiceTags: initialState.brand.brandVoiceTags ?? [],
              scrape: scrape ?? null,
              onUpdate: (next) => patch("agentPreview", next),
            },
            signal
          )
        );
        if (outcome) {
          useBrandProfileRevealCache.getState().write(brandId, url, {
            buckets: outcome.buckets,
            scrape,
            runId: outcome.runId,
            inputHash,
          });
          trackOnboardingEvent("onboarding_agent_preview_completed", {
            duration_ms: previewTimer.sinceStart(),
            has_voice: Boolean(outcome.buckets.voice),
            has_audience: Boolean(outcome.buckets.audience),
            has_business: Boolean(outcome.buckets.business),
            has_readiness: Boolean(outcome.buckets.readiness),
            has_understanding: Boolean(outcome.buckets.result?.understanding),
          });
        } else {
          trackOnboardingEvent("onboarding_agent_preview_failed", {
            duration_ms: previewTimer.sinceStart(),
          });
        }
      } catch (error) {
        if (error instanceof PreviewRateLimitedError) {
          show({
            title: "Slow down a moment",
            description: `We can analyze again in ${error.retryAfterSeconds}s.`,
            variant: "error",
          });
        }
        trackOnboardingEvent("onboarding_agent_preview_failed", {
          duration_ms: previewTimer.sinceStart(),
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    })();
  };

  const handleScrapeRetry = () => {
    if (!domain) return;
    void handleUrlSubmit(domain);
  };

  const steps = useMemo(
    () => [
      { id: "website" as const, label: "Your website", description: "Tell us where to start", state: stepState(screen, 0) },
      { id: "integrations" as const, label: "Connect channels", description: "Link your accounts", state: stepState(screen, 1) },
      { id: "dna" as const, label: "Brand DNA", description: "Review and launch", state: stepState(screen, 2) },
    ],
    [screen]
  );

  const onStepClick = (id: ShellPillId) => {
    if (id === "website") navigate(0);
    if (id === "integrations" && screen >= 1) navigate(1);
    if (id === "dna" && screen >= 2) navigate(2);
  };

  const { hint, actions } = useBottomBar({
    screen,
    onChangeUrl: () => navigate(0),
    onAdvanceToDna: () => navigate(2),
    onLaunch: handleLaunch,
    launching,
  });

  const agentRaw = jobs.agentPreview.data as AgentPreviewBuckets | { buckets: AgentPreviewBuckets } | null;
  const agentBuckets: AgentPreviewBuckets | null =
    agentRaw && typeof agentRaw === "object" && "buckets" in agentRaw ? agentRaw.buckets : agentRaw;
  const readinessLoading = jobs.agentPreview.status === "running";

  useEffect(() => {
    trackOnboardingEvent("onboarding_step_viewed", { screen });
  }, [screen]);

  useEffect(() => {
    if (screen !== 2) return;
    if (jobs.agentPreview.status !== "idle") return;
    if (!domain) return;

    let cancelled = false;
    void (async () => {
      const cached = useBrandProfileRevealCache.getState().read(brandId, domain);
      if (cached) {
        trackOnboardingEvent("onboarding_reveal_cache_hit", {
          brand_id: brandId,
          cached_age_ms: Date.now() - cached.cachedAt,
        });
        if (cancelled) return;
        await start("agentPreview", () => Promise.resolve({ runId: cached.runId, buckets: cached.buckets }));
        return;
      }
      trackOnboardingEvent("onboarding_reveal_cache_miss", { brand_id: brandId });

      let latest: Awaited<ReturnType<typeof fetchPreviewLatest>> = null;
      try {
        latest = await fetchPreviewLatest(brandId);
      } catch (error) {
        console.warn("[onboarding] fetchPreviewLatest failed", error);
        return;
      }
      if (cancelled || !latest) return;

      if (latest.status === "running") {
        trackOnboardingEvent("onboarding_step_viewed", { screen: 2, resumed: true });
        await start("agentPreview", (signal) =>
          runAgentPreview(
            {
              brandId,
              userId: state.members[0]?.id ?? "",
              brandName: state.brand.name || "Untitled brand",
              websiteUrl: domain,
              voiceTags: state.brand.brandVoiceTags ?? [],
              scrape: null,
              resumeRunId: latest!.run_id,
              onUpdate: (next) => patch("agentPreview", next),
            },
            signal
          )
        );
        return;
      }

      if (latest.status === "completed") {
        try {
          const snapshot = await fetchPreviewSnapshot(latest.run_id);
          if (cancelled || !snapshot?.result) return;
          const buckets = emptyBuckets();
          const result = snapshot.result;
          if (result.brand_profile) buckets.brandProfile = result.brand_profile;
          if (result.first_impression) buckets.firstImpression = result.first_impression;
          if (result.readiness) buckets.readiness = result.readiness;
          buckets.result = { ...result };
          await start("agentPreview", () => Promise.resolve({ runId: latest!.run_id, buckets }));
        } catch (error) {
          console.warn("[onboarding] fetchPreviewSnapshot failed", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, jobs.agentPreview.status, domain, brandId, start, patch, state.brand.brandVoiceTags, state.brand.name, state.members]);

  useEffect(() => {
    if (jobs.agentPreview.status !== "done") return;
    if (prewarmedRef.current) return;
    prewarmedRef.current = true;
    router.prefetch("/dashboard");
    void (async () => {
      try {
        await start("trendsPrewarm", () => runTrendsPrewarm(brandId));
      } catch (error) {
        // Best-effort prewarm: dashboard has its own fetcher fallback.
        console.warn("[onboarding] trends prewarm failed", error);
      }
    })();
  }, [jobs.agentPreview.status, brandId, start, router]);

  return (
    <OnboardingShell
      steps={steps}
      onStepClick={onStepClick}
      bottomHint={hint}
      bottomActions={actions}
      onStartOver={handleStartOver}
      startOverDisabled={resetting || launching}
    >
      <AnimatePresence mode="wait" custom={directionRef.current}>
        <motion.div
          key={screen}
          custom={directionRef.current}
          variants={swipeVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-1 flex-col"
        >
          {screen === 0 ? (
            <UrlScreen
              defaultUrl={domain || defaultUrl}
              onSubmit={handleUrlSubmit}
              error={jobs.scrape.status === "error" ? jobs.scrape.error : null}
              onRetry={handleScrapeRetry}
              retrying={jobs.scrape.status === "running"}
            />
          ) : screen === 1 ? (
            <IntegrationsScreen onAdvance={() => navigate(2)} />
          ) : (
            <BrandDnaScreen agentBuckets={agentBuckets} readinessLoading={readinessLoading} />
          )}
        </motion.div>
      </AnimatePresence>
    </OnboardingShell>
  );
}

function countSelectedAccounts(state: OnboardingState): number {
  let count = 0;
  for (const conn of Object.values(state.connections)) {
    for (const account of conn.accounts ?? []) {
      if (account.selected) count += 1;
    }
  }
  return count;
}

function resumeScreenFor(state: OnboardingState): ScreenIndex {
  const brand = state.brand;
  const hasAnyConnection = Object.values(state.connections).some((c) => c.connected);
  const hasDna = Boolean(brand.overview) || brand.colors.length > 0 || Boolean(brand.brandVoice);
  if (hasAnyConnection || hasDna) return 2;
  if (brand.website) return 1;
  return 0;
}

function stepState(screen: ScreenIndex, pillIndex: 0 | 1 | 2): StepperState {
  if (pillIndex < screen) return "done";
  if (pillIndex === screen) return "active";
  return "pending";
}

function useBottomBar({
  screen,
  onChangeUrl,
  onAdvanceToDna,
  onLaunch,
  launching,
}: {
  screen: ScreenIndex;
  onChangeUrl: () => void;
  onAdvanceToDna: () => void;
  onLaunch: () => void;
  launching: boolean;
}) {
  const { jobs } = useBackgroundJobs();
  const dnaReady = jobs.agentPreview.status === "done";

  if (screen === 0) {
    return { hint: "", actions: null };
  }
  if (screen === 1) {
    return {
      hint: "",
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={onChangeUrl}>
            ← Change URL
          </Button>
          <Button variant="brand" size="sm" onClick={onAdvanceToDna}>
            {dnaReady ? "Reveal Brand DNA →" : "Continue →"}
          </Button>
        </>
      ),
    };
  }
  return {
    hint: "",
    actions: (
      <Button variant="success" size="sm" onClick={onLaunch} disabled={launching}>
        {launching ? "Launching…" : "Launch Continuum ✦"}
      </Button>
    ),
  };
}
