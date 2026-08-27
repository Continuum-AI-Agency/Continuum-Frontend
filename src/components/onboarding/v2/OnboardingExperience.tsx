'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  approveAndLaunchOnboardingAction,
  approveOnboardingAndStartAnalysisAction,
  completeOnboardingAction,
} from '@/app/onboarding/actions';
import {
  OnboardingProvider,
  useOnboarding,
} from '@/components/onboarding/providers/OnboardingContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useBrandAssignedAccountIds } from '@/hooks/useBrandAssignedAccountIds';
import {
  computePreviewInputHash,
  fetchPreviewLatest,
  fetchPreviewSnapshot,
  PREVIEW_PROMPT_VERSION,
  PreviewRateLimitedError,
} from '@/lib/onboarding/agentClient';
import { resolveSafeBrandName } from '@/lib/onboarding/brandName';
import { useBrandProfileRevealCache } from '@/lib/onboarding/revealCache';
import type { OnboardingState } from '@/lib/onboarding/state';
import { timing, trackOnboardingEvent } from '@/lib/onboarding/telemetry';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { OnboardingBrandSwitcher } from './OnboardingBrandSwitcher';
import { OnboardingShell, type ShellPillId } from './OnboardingShell';
import type { StepperState } from './OnboardingStepper';
import { BrandDnaScreen } from './screens/BrandDnaScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import {
  CompetitorInspirationsScreen,
  type SelectedInspiration,
} from './screens/CompetitorInspirationsScreen';
import { DocumentsScreen } from './screens/DocumentsScreen';
import { InspirationGenerationScreen } from './screens/InspirationGenerationScreen';
import { IntegrationsScreen } from './screens/IntegrationsScreen';
import { InvitesScreen } from './screens/InvitesScreen';
import { UrlScreen } from './screens/UrlScreen';
import { hasSeenWelcome, WelcomeScreen } from './screens/WelcomeScreen';
import {
  type AgentPreviewBuckets,
  emptyBuckets,
  runAgentPreview,
  seedBucketsFromSnapshot,
} from './state/agentPreview';
import { BackgroundJobsProvider, useBackgroundJobs } from './state/BackgroundJobsProvider';
import { JobPersistor } from './state/JobPersistor';
import { runCreativePrewarm, runScrape } from './state/jobRunners';

type ScreenIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const TOTAL_STEPS = 6;

// Post-Brand-DNA "Competitor Inspirations → brand-guided generations" finale.
// On by default: only disabled when the flag is explicitly "false" (then Brand
// DNA keeps the classic launch → dashboard flow).
const INSPIRATIONS_ENABLED = process.env.NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED !== 'false';

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
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const persistedStepRef = useRef<ScreenIndex>(screen);

  useEffect(() => {
    if (resumeScreenFor(initialState) === 0 && !hasSeenWelcome()) {
      setWelcomeVisible(true);
    }
  }, [initialState]);
  const directionRef = useRef<1 | -1>(1);
  const [domain, setDomain] = useState<string>(initialState.brand.website ?? defaultUrl ?? '');
  const { start, patch, jobs, reset } = useBackgroundJobs();
  const { brandId, resetState, state, updateState } = useOnboarding();
  const emailReportOptInRef = useRef(state.emailReportOptIn ?? true);

  const navigate = useCallback(
    async (next: ScreenIndex): Promise<boolean> => {
      directionRef.current = next > screen ? 1 : -1;
      if (next > persistedStepRef.current) {
        try {
          await updateState({ step: next });
          persistedStepRef.current = next;
        } catch {
          return false;
        }
      }
      setScreen(next);
      return true;
    },
    [screen, updateState],
  );
  const { assignedIds: assignedAccountIds } = useBrandAssignedAccountIds(brandId);
  const [launching, startLaunch] = useTransition();
  const [resetting, startReset] = useTransition();
  const prewarmedRef = useRef(false);
  const launchInFlightRef = useRef(false);
  const launchKeyRef = useRef<string | null>(null);
  const selectedInspiration: SelectedInspiration | null = state.selectedInspiration;

  const ensureLaunchKey = () => {
    if (!launchKeyRef.current) {
      launchKeyRef.current =
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `${brandId}-${Date.now().toString(36)}`;
    }
    return launchKeyRef.current;
  };

  const handleStartOver = () => {
    startReset(async () => {
      reset();
      prewarmedRef.current = false;
      launchInFlightRef.current = false;
      launchKeyRef.current = null;
      persistedStepRef.current = 0;
      useBrandProfileRevealCache.getState().invalidateBrand(brandId);
      try {
        await resetState();
      } catch (error) {
        show({
          title: "Couldn't reset",
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
        return;
      }
      setDomain(defaultUrl ?? '');
      directionRef.current = -1;
      setScreen(0);
    });
  };

  const handleLaunch = () => {
    if (launchInFlightRef.current) return;

    const legacySelectedCount = countSelectedAccounts(state);
    const integrationCount = Math.max(assignedAccountIds.length, legacySelectedCount);
    if (integrationCount === 0 && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        "Launch without any integration accounts attached?\n\nYou won't see paid-media or organic data on the dashboard until you connect at least one account in Settings.",
      );
      if (!confirmed) {
        trackOnboardingEvent('onboarding_launch_clicked', {
          integration_count: 0,
          confirmed: false,
        });
        return;
      }
    }
    trackOnboardingEvent('onboarding_launch_clicked', {
      integration_count: integrationCount,
      confirmed: true,
    });

    launchInFlightRef.current = true;
    if (!launchKeyRef.current) {
      launchKeyRef.current =
        typeof globalThis.crypto?.randomUUID === 'function'
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
        trackOnboardingEvent('onboarding_launch_succeeded', {
          duration_ms: launchTimer.sinceStart(),
          integration_count: integrationCount,
        });
        router.push('/dashboard');
      } catch (error) {
        launchInFlightRef.current = false;
        trackOnboardingEvent('onboarding_launch_failed', {
          duration_ms: launchTimer.sinceStart(),
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        show({
          title: 'Launch failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  // Flag-on path: leaving Brand DNA approves the profile + kicks the background
  // strategic analysis (so competitor analysis is computing), then advances to
  // the inspirations screen. Onboarding is NOT marked complete until the finale.
  //
  // Competitor organic posts come from Meta Business Discovery, which requires the
  // brand's own Instagram account to be connected. Without it the inspirations
  // screen has no organic data to show, so we skip it gracefully and go straight
  // to the brand-guided generation screen (which only needs the brand guidelines).
  // Held while a design system is being read — see DocumentsScreen for why.
  const [designSystemBusy, setDesignSystemBusy] = useState(false);
  // Same contract, one step later: a catalog import in flight holds Continue, because
  // advancing mid-import unmounts the only place the per-row report is shown.
  const [catalogBusy, setCatalogBusy] = useState(false);

  const handleContinueToInspirations = () => {
    const integrationCount = Math.max(assignedAccountIds.length, countSelectedAccounts(state));
    trackOnboardingEvent('onboarding_launch_clicked', {
      integration_count: integrationCount,
      confirmed: true,
    });
    const idempotencyKey = ensureLaunchKey();
    const skipInspirations = !hasConnectedInstagram(state);
    startLaunch(async () => {
      try {
        await approveOnboardingAndStartAnalysisAction(brandId, { idempotencyKey });
        if (skipInspirations) {
          trackOnboardingEvent('onboarding_inspirations_skipped', {
            reason: 'no_connected_instagram',
          });
        }
        await navigate(skipInspirations ? 7 : 6);
      } catch (error) {
        show({
          title: "Couldn't continue",
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  // Flag-on path: the finale's final CTA only completes onboarding + routes; the
  // approve/analysis already ran when leaving Brand DNA.
  const handleFinishToDashboard = () => {
    const launchTimer = timing();
    startLaunch(async () => {
      try {
        // Drain any in-flight switch mutation through the serialized queue before
        // completion. Otherwise a fast toggle + Finish click can persist completedAt
        // while the previous email preference is still in flight.
        await updateState({ emailReportOptIn: emailReportOptInRef.current });
        await completeOnboardingAction(brandId);
        useBrandProfileRevealCache.getState().invalidateBrand(brandId);
        trackOnboardingEvent('onboarding_launch_succeeded', {
          duration_ms: launchTimer.sinceStart(),
          integration_count: Math.max(assignedAccountIds.length, countSelectedAccounts(state)),
        });
        router.push('/dashboard');
      } catch (error) {
        trackOnboardingEvent('onboarding_launch_failed', {
          duration_ms: launchTimer.sinceStart(),
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        show({
          title: 'Launch failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      }
    });
  };

  const handleUrlSubmit = async (url: string) => {
    if (domain && domain !== url) {
      useBrandProfileRevealCache.getState().invalidateUrl(brandId, domain);
    }
    setDomain(url);
    if (!(await navigate(1))) return; // Documents
    patch('agentPreview', emptyBuckets());

    const scrapePromise = start('scrape', (signal) => runScrape(brandId, url, signal));

    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;

    const scrape = await scrapePromise;
    const brandName = resolveSafeBrandName({
      scrapeTitle: scrape?.title,
      fallbackName: initialState.brand.name,
      url,
    });

    void (async () => {
      const previewTimer = timing();
      trackOnboardingEvent('onboarding_agent_preview_started', { url });

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
        const outcome = await start('agentPreview', (signal) =>
          runAgentPreview(
            {
              brandId,
              userId,
              brandName,
              websiteUrl: url,
              voiceTags: initialState.brand.brandVoiceTags ?? [],
              scrape: scrape ?? null,
              onUpdate: (next) => patch('agentPreview', next),
            },
            signal,
          ),
        );
        if (outcome) {
          useBrandProfileRevealCache.getState().write(brandId, url, {
            buckets: outcome.buckets,
            scrape,
            runId: outcome.runId,
            inputHash,
          });
          trackOnboardingEvent('onboarding_agent_preview_completed', {
            duration_ms: previewTimer.sinceStart(),
            has_voice: Boolean(outcome.buckets.voice),
            has_audience: Boolean(outcome.buckets.audience),
            has_business: Boolean(outcome.buckets.business),
            has_readiness: Boolean(outcome.buckets.readiness),
            has_understanding: Boolean(outcome.buckets.result?.understanding),
          });
        } else {
          trackOnboardingEvent('onboarding_agent_preview_failed', {
            duration_ms: previewTimer.sinceStart(),
          });
        }
      } catch (error) {
        if (error instanceof PreviewRateLimitedError) {
          show({
            title: 'Slow down a moment',
            description: `We can analyze again in ${error.retryAfterSeconds}s.`,
            variant: 'error',
          });
        }
        trackOnboardingEvent('onboarding_agent_preview_failed', {
          duration_ms: previewTimer.sinceStart(),
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();
  };

  const handleScrapeRetry = () => {
    if (!domain) return;
    void handleUrlSubmit(domain);
  };

  const handleAgentRerun = useCallback(() => {
    if (!domain) return;
    useBrandProfileRevealCache.getState().invalidateUrl(brandId, domain);
    patch('agentPreview', emptyBuckets());
    void handleUrlSubmit(domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, domain]);

  const steps = useMemo(
    () => [
      {
        id: 'website' as const,
        label: 'Your website',
        description: 'Tell us where to start',
        state: stepState(screen, 0),
      },
      {
        id: 'documents' as const,
        label: 'Documents',
        description: 'Add brand assets',
        state: stepState(screen, 1),
      },
      {
        id: 'catalog' as const,
        label: 'Products',
        description: 'Add what you sell',
        state: stepState(screen, 2),
      },
      {
        id: 'integrations' as const,
        label: 'Connect channels',
        description: 'Link your accounts',
        state: stepState(screen, 3),
      },
      {
        id: 'invites' as const,
        label: 'Invite team',
        description: 'Bring teammates in',
        state: stepState(screen, 4),
      },
      {
        id: 'dna' as const,
        label: 'Brand DNA',
        description: 'Review and launch',
        state: stepState(screen, 5),
      },
    ],
    [screen],
  );

  const onStepClick = (id: ShellPillId) => {
    if (id === 'website') void navigate(0);
    if (id === 'documents' && screen >= 1) void navigate(1);
    if (id === 'catalog' && screen >= 2) void navigate(2);
    if (id === 'integrations' && screen >= 3) void navigate(3);
    if (id === 'invites' && screen >= 4) void navigate(4);
    if (id === 'dna' && screen >= 5) void navigate(5);
  };

  const { hint, actions } = useBottomBar({
    screen,
    navigate,
    onChangeUrl: () => void navigate(0),
    onLaunch: handleLaunch,
    onContinueToInspirations: handleContinueToInspirations,
    designSystemBusy,
    catalogBusy,
    inspirationsEnabled: INSPIRATIONS_ENABLED,
    launching,
  });

  const agentRaw = jobs.agentPreview.data as
    | AgentPreviewBuckets
    | { buckets: AgentPreviewBuckets }
    | null;
  const agentBuckets: AgentPreviewBuckets | null =
    agentRaw && typeof agentRaw === 'object' && 'buckets' in agentRaw ? agentRaw.buckets : agentRaw;
  const readinessLoading = jobs.agentPreview.status === 'running';

  useEffect(() => {
    trackOnboardingEvent('onboarding_step_viewed', { screen });
  }, [screen]);

  useEffect(() => {
    if (screen !== 5) return;
    if (jobs.agentPreview.status !== 'idle') return;
    if (!domain) return;

    let cancelled = false;
    void (async () => {
      const cached = useBrandProfileRevealCache.getState().read(brandId, domain);
      if (cached) {
        trackOnboardingEvent('onboarding_reveal_cache_hit', {
          brand_id: brandId,
          cached_age_ms: Date.now() - cached.cachedAt,
        });
        if (cancelled) return;
        if (cached.scrape) {
          void start('scrape', () => Promise.resolve(cached.scrape!));
        }
        await start('agentPreview', () =>
          Promise.resolve({ runId: cached.runId, buckets: cached.buckets }),
        );
        return;
      }
      trackOnboardingEvent('onboarding_reveal_cache_miss', { brand_id: brandId });

      let latest: Awaited<ReturnType<typeof fetchPreviewLatest>> = null;
      try {
        latest = await fetchPreviewLatest(brandId);
      } catch (error) {
        console.warn('[onboarding] fetchPreviewLatest failed', error);
        return;
      }
      if (cancelled || !latest) return;

      if (latest.status === 'running') {
        trackOnboardingEvent('onboarding_step_viewed', { screen: 5, resumed: true });
        await start('agentPreview', (signal) =>
          runAgentPreview(
            {
              brandId,
              userId: state.members[0]?.id ?? '',
              brandName: state.brand.name || 'Untitled brand',
              websiteUrl: domain,
              voiceTags: state.brand.brandVoiceTags ?? [],
              scrape: null,
              resumeRunId: latest!.run_id,
              onUpdate: (next) => patch('agentPreview', next),
            },
            signal,
          ),
        );
        return;
      }

      if (latest.status === 'completed' || latest.status === 'partial') {
        try {
          const snapshot = await fetchPreviewSnapshot(latest.run_id);
          if (cancelled || !snapshot?.result) return;
          // Seed via the shared merge so the scorer-lane outputs (per-section
          // audit scores + readiness) on the persisted snapshot are surfaced —
          // a manual field copy here used to drop audits entirely.
          const buckets = seedBucketsFromSnapshot(snapshot.result);
          await start('agentPreview', () => Promise.resolve({ runId: latest!.run_id, buckets }));
        } catch (error) {
          console.warn('[onboarding] fetchPreviewSnapshot failed', error);
        }
        return;
      }

      if (latest.status === 'failed') {
        let errorMessage: string | undefined;
        try {
          const snapshot = await fetchPreviewSnapshot(latest.run_id);
          errorMessage = snapshot?.error?.message;
        } catch (error) {
          console.warn('[onboarding] fetchPreviewSnapshot failed', error);
        }
        if (cancelled) return;
        trackOnboardingEvent('onboarding_agent_preview_failed', {
          brand_id: brandId,
          run_id: latest.run_id,
          resumed: true,
          message: errorMessage ?? 'Preview run failed.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    screen,
    jobs.agentPreview.status,
    domain,
    brandId,
    start,
    patch,
    state.brand.brandVoiceTags,
    state.brand.name,
    state.members,
  ]);

  useEffect(() => {
    if (jobs.agentPreview.status !== 'done') return;
    if (prewarmedRef.current) return;
    prewarmedRef.current = true;
    router.prefetch('/dashboard');
    // Generate the first on-brand creatives now too — decoupled from the strategic
    // analysis, grounded in the brand profile. Persists the kit (colors) first.
    if (INSPIRATIONS_ENABLED) {
      const kit = {
        colors: state.brand.colors ?? [],
        typography: state.brand.typography ?? { primary: null, secondary: null },
        logoPath: state.brand.logoPath ?? null,
      };
      void (async () => {
        try {
          await start('creativePrewarm', (signal) =>
            runCreativePrewarm(brandId, kit, signal, (images) =>
              patch('creativePrewarm', { images }),
            ),
          );
        } catch (error) {
          console.warn('[onboarding] creative prewarm failed', error);
        }
      })();
    }
  }, [jobs.agentPreview.status, brandId, start, router, state.brand]);

  return (
    <OnboardingShell
      steps={steps}
      onStepClick={onStepClick}
      bottomHint={hint}
      bottomActions={actions}
      onStartOver={handleStartOver}
      startOverDisabled={resetting || launching}
      headerRight={<OnboardingBrandSwitcher />}
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
              error={jobs.scrape.status === 'error' ? jobs.scrape.error : null}
              onRetry={handleScrapeRetry}
              retrying={jobs.scrape.status === 'running'}
            />
          ) : screen === 1 ? (
            <DocumentsScreen
              totalSteps={TOTAL_STEPS}
              brandId={brandId}
              onDesignSystemBusyChange={setDesignSystemBusy}
            />
          ) : screen === 2 ? (
            <CatalogScreen totalSteps={TOTAL_STEPS} onBusyChange={setCatalogBusy} />
          ) : screen === 3 ? (
            <IntegrationsScreen onAdvance={() => void navigate(4)} />
          ) : screen === 4 ? (
            <InvitesScreen totalSteps={TOTAL_STEPS} />
          ) : screen === 5 ? (
            <BrandDnaScreen
              agentBuckets={agentBuckets}
              readinessLoading={readinessLoading}
              onRetry={handleAgentRerun}
            />
          ) : screen === 6 ? (
            <CompetitorInspirationsScreen
              brandId={brandId}
              selected={selectedInspiration}
              onSelect={(selection) => void updateState({ selectedInspiration: selection })}
              onContinue={() => void navigate(7)}
              onBack={() => void navigate(5)}
            />
          ) : (
            <InspirationGenerationScreen
              brandId={brandId}
              onFinish={handleFinishToDashboard}
              finishing={launching}
              onBack={() => void navigate(hasConnectedInstagram(state) ? 6 : 5)}
              emailReportOptIn={state.emailReportOptIn ?? true}
              onEmailReportOptInChange={(value) => {
                emailReportOptInRef.current = value;
                void updateState({ emailReportOptIn: value });
              }}
              selectedInspiration={selectedInspiration}
            />
          )}
        </motion.div>
      </AnimatePresence>
      {welcomeVisible ? <WelcomeScreen onDismiss={() => setWelcomeVisible(false)} /> : null}
    </OnboardingShell>
  );
}

// The brand has a usable Instagram connection (enables Meta Business Discovery
// for competitor organic posts) if the IG connection is marked connected, has any
// resolved accounts, or carries assigned Meta integration ids. IG OAuths through
// Meta, so selectableAssetsMerge tracks those integration ids under "instagram".
function hasConnectedInstagram(state: OnboardingState): boolean {
  const ig = state.connections.instagram;
  if (!ig) return false;
  return ig.connected || ig.accounts.length > 0 || ig.integrationIds.length > 0;
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
  const hasInvites = (state.invites?.length ?? 0) > 0;
  const hasDocuments = (state.documents?.length ?? 0) > 0;

  // No catalog floor: whether the brand imported products is not derivable from
  // OnboardingState (the products are Elements, read over HTTP), and a floor that
  // guessed would skip the step for a brand that never saw it.
  let dataFloor: ScreenIndex = 0;
  if (brand.website) dataFloor = 1;
  if (hasDocuments) dataFloor = 2;
  if (hasAnyConnection) dataFloor = 4;
  if (hasInvites) dataFloor = 5;
  if (hasDna) dataFloor = 5;

  const persistedStep = Math.min(7, Math.max(0, state.step ?? 0)) as ScreenIndex;
  return Math.max(persistedStep, dataFloor) as ScreenIndex;
}

function stepState(screen: ScreenIndex, pillIndex: 0 | 1 | 2 | 3 | 4 | 5): StepperState {
  if (pillIndex < screen) return 'done';
  if (pillIndex === screen) return 'active';
  return 'pending';
}

function useBottomBar({
  screen,
  navigate,
  onChangeUrl,
  onLaunch,
  onContinueToInspirations,
  inspirationsEnabled,
  launching,
  designSystemBusy,
  catalogBusy,
}: {
  screen: ScreenIndex;
  navigate: (next: ScreenIndex) => Promise<boolean>;
  onChangeUrl: () => void;
  onLaunch: () => void;
  onContinueToInspirations: () => void;
  inspirationsEnabled: boolean;
  launching: boolean;
  designSystemBusy: boolean;
  catalogBusy: boolean;
}) {
  const { jobs } = useBackgroundJobs();
  const dnaReady = jobs.agentPreview.status === 'done';

  if (screen === 0) {
    return { hint: '', actions: null };
  }
  if (screen === 1) {
    return {
      hint: designSystemBusy
        ? 'Reading your design system — you can review what we understood in Brand Kit settings.'
        : "Add brand assets — or skip and we'll infer from your website.",
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={onChangeUrl}>
            ← Change URL
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate(2)}
            disabled={designSystemBusy}
          >
            Skip for now
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => void navigate(2)}
            disabled={designSystemBusy}
          >
            {designSystemBusy ? 'Reading design system…' : 'Continue →'}
          </Button>
        </>
      ),
    };
  }
  if (screen === 2) {
    return {
      hint: catalogBusy
        ? 'Importing your products — this stays open until every row has an answer.'
        : 'Optional. Add what you sell, or skip — nothing later needs it.',
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={() => void navigate(1)}>
            ← Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="catalog-skip"
            onClick={() => void navigate(3)}
            disabled={catalogBusy}
          >
            Skip for now
          </Button>
          <Button
            variant="default"
            size="sm"
            data-testid="catalog-continue"
            onClick={() => void navigate(3)}
            disabled={catalogBusy}
          >
            {catalogBusy ? 'Importing…' : 'Continue →'}
          </Button>
        </>
      ),
    };
  }
  if (screen === 3) {
    return {
      hint: '',
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={() => void navigate(2)}>
            ← Back
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void navigate(4)}>
            Skip for now
          </Button>
          <Button variant="default" size="sm" onClick={() => void navigate(4)}>
            Continue →
          </Button>
        </>
      ),
    };
  }
  if (screen === 4) {
    return {
      hint: 'Add teammates — or invite them later from Settings.',
      actions: (
        <>
          <Button variant="outline" size="sm" onClick={() => void navigate(3)}>
            ← Back
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void navigate(5)}>
            Skip for now
          </Button>
          <Button variant="default" size="sm" onClick={() => void navigate(5)}>
            {dnaReady ? 'Reveal Brand DNA →' : 'Continue →'}
          </Button>
        </>
      ),
    };
  }
  if (screen === 5) {
    if (inspirationsEnabled) {
      return {
        hint: '',
        actions: (
          <Button
            variant="default"
            size="sm"
            onClick={onContinueToInspirations}
            disabled={launching}
          >
            {launching ? 'Preparing…' : 'Continue →'}
          </Button>
        ),
      };
    }
    return {
      hint: '',
      actions: (
        <Button variant="success" size="sm" onClick={onLaunch} disabled={launching}>
          {launching ? 'Launching…' : 'Launch Continuum ✦'}
        </Button>
      ),
    };
  }
  // Screens 6 (inspirations) and 7 (generation) render their own footer CTAs.
  return { hint: '', actions: null };
}
