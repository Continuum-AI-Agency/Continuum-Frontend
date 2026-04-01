# Onboarding V3: OnboardJS Migration Guide

## Why

The current onboarding is a custom 3-step flow built on a bespoke React Context (`OnboardingContext`). The `BrandProfileStep` alone is a 400-line monolith handling brand basics, website analysis, AI streaming, document upload, and logo upload. There's zero Mixpanel funnel tracking. The UX feels dense -- too much on screen at once.

**Goals:**
- Migrate to **OnboardJS** as the headless flow engine (already installed: `@onboardjs/react` v1.0.0-rc.3)
- Decompose 3 mega-steps into 5 focused micro-steps for a snappier, more progressive experience
- Add Mixpanel funnel analytics via OnboardJS's built-in analytics system
- Code-split heavy steps (Integrations, Review) with `next/dynamic`
- Keep **every backend interaction identical** -- zero server-side changes

---

## Current System Inventory

### Flow Architecture

```
OnboardingGate (dark gradient background)
  -> OnboardingContainer (custom context provider + step router)
     -> OnboardingRouter (renders step 0/1/2 based on state.step)
        -> BrandProfileStep (step 0)  -- 400 lines, handles everything
        -> IntegrationsStep (step 1)  -- OAuth + asset hierarchy
        -> ReviewStep (step 2)        -- agent report + launch
```

### State Management

**Provider:** `src/components/onboarding/providers/OnboardingContext.tsx`
- Custom React Context wrapping `useOptimistic` for instant UI feedback
- Server-synced via `mutateOnboardingStateAction(brandId, patch)`
- Exposes: `{ state, brandId, userId, isPending, updateState, resetState, reloadState }`

**State Shape** (`src/lib/onboarding/state.ts`):
```typescript
OnboardingState {
  step: 0 | 1 | 2
  brand: {
    name, industry, timezone, website, logoPath,
    brandVoice, brandVoiceTags, targetAudience
  }
  documents: OnboardingDocument[]
  connections: Record<PlatformKey, {
    connected, accountId, accounts[], integrationIds[], lastSyncedAt
  }>
  members: BrandMember[]
  invites: BrandInvite[]
  completedAt: string | null
  preview: { completedAt, payload } | null
}
```

Validated with Zod. Merged via `mergeOnboardingState(current, patch)`.

### Database Schema (Supabase, `brand_profiles` schema)

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `user_onboarding_states` | user_id, brand_id, state (jsonb), is_active | Onboarding progress per user+brand |
| `brand_profiles` | id, brand_name, created_by, context (jsonb), logo_path, tier, completed_at | Brand identity |
| `brand_documents` | id, brand_id, name, source, status, storage_path, mime_type | Uploaded knowledge base docs |
| `brand_profile_integration_accounts` | brand_profile_id, integration_account_id, type, name, metadata | Linked ad/social accounts |
| `user_integrations` | user_id, provider, status, access/refresh tokens (encrypted), metadata | OAuth tokens |
| `permissions` | brand_profile_id, user_id, role, tier | ACL |
| `invites` | brand_profile_id, email, role, token_hash, expires_at | Pending invites |
| `strategic_analyses` | brand_id, analysis_json, summary_markdown, embeddings | Post-onboarding analysis output |
| `strategic_analysis_runs` | brand_id, status, phases, result_ref | Analysis job tracking |

### Server Actions (`src/app/onboarding/actions.ts`)

All `"use server"` -- **these stay unchanged**:

| Action | Purpose |
|--------|---------|
| `fetchOnboardingStateAction(brandId)` | Load state from DB |
| `mutateOnboardingStateAction(brandId, patch)` | Patch-merge and persist state |
| `resetOnboardingStateAction(brandId)` | Clear state |
| `markPlatformConnectionAction({brandId, key, accountId})` | Mark platform connected |
| `refreshPlatformConnectionAction(brandId, provider)` | Refresh account list from edge fn |
| `clearPlatformConnectionAction(brandId, key)` | Disconnect platform |
| `completeOnboardingAction(brandId)` | Set completedAt |
| `approveAndLaunchOnboardingAction(brandId)` | Agent approval + integration association + strategic analysis trigger |
| `registerDocumentMetadataAction(brandId, doc)` | Register doc without upload |
| `removeDocumentAction(brandId, docId)` | Delete document |
| `enqueueDocumentEmbedAction(brandId, input)` | Upload + queue embedding |
| `syncIntegrationAccountsAction(brandId, groups)` | Sync accounts from edge fn |
| `associateIntegrationAccountsAction(brandId, ids)` | Link selected accounts to brand |

### API Routes (unchanged)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/onboarding/brand-draft-voice` | POST | SSE proxy to `brand-draft-voice` edge function |
| `/api/onboarding/brand-draft-audience` | POST | SSE proxy to `brand-draft-audience` edge function |
| `/api/onboarding/documents` | POST | FormData upload to Supabase Storage + `embed_document` edge fn |

### AI/Agent Integration (unchanged)

| Module | Path | Purpose |
|--------|------|---------|
| `agentClient.ts` | `src/lib/onboarding/agentClient.ts` | SSE streaming from onboarding agent: `runOnboardingPreview()`, `approveOnboardingBrandProfile()` |
| `mapping.ts` | `src/lib/onboarding/mapping.ts` | `mapOnboardingStateToAgentPayload()` -- transforms state to agent request |
| `useBrandDraftStream` | `src/components/onboarding/hooks/useBrandDraftStream.ts` | Hook for dual-stream brand voice + audience analysis from website URL |

**Agent Events (from `runOnboardingPreview`):**
- `status` -- section progress
- `stream` -- delta text per section (voice, audience, website, business)
- `voice` / `audience` / `website` / `business` -- structured payloads
- `structured` -- full structured report
- `embedding` -- embedding progress
- `complete` -- flow done
- `error` -- failure

### Reusable Shared Components (unchanged)

| Component | Path | Used In |
|-----------|------|---------|
| `LogoUploader` | `src/components/onboarding/shared/LogoUploader.tsx` | BrandBasicsStep |
| `DocumentUploader` | `src/components/onboarding/shared/DocumentUploader.tsx` | BrandAnalysisStep |
| `DraftResultCard` | `src/components/onboarding/shared/DraftResultCard.tsx` | BrandAnalysisStep |
| `PlatformIcons` | `src/components/onboarding/PlatformIcons.tsx` | IntegrationsStep |
| Integration constants | `src/components/onboarding/integrations/constants.ts` | IntegrationsStep |
| `selectableAssetsMerge` | `src/components/onboarding/selectableAssetsMerge.ts` | IntegrationsStep |
| `OnboardingLoading` | `src/components/loader-animations/OnboardingLoading.tsx` | LaunchStep loading state |

### UI Primitives Available

- `GlassCard`, `Motion` variants (`fadeInUp`, `stagger`), `ToastProvider` (`useToast()`)
- `Loading`, `Skeleton`, `LoadingOverlay`
- `SafeMarkdown` / `SafeMarkdownLazy`
- Full form kit: `Form`, `FormField`, `Input`, `Textarea`, `Select`, `Button`, `Checkbox`
- `Card`, `Badge`, `Avatar`, `Progress`, `ScrollArea`
- `AnimatePresence` from `motion/react` (already used in 20+ files)

### Design System (`docs/styleguide.md`)

- **Brand primary:** `#5A48F9` (Electric Violet)
- **Font:** Inter (system sans-serif fallback)
- **Grid:** 8-point spacing
- **Semantic classes:** `bg-default`, `bg-accent`, `text-primary`, `text-secondary`, `bg-brand-primary`, `shadow-brand-glow`
- **Border radius:** Cards `rounded-lg` (8px), Inputs `rounded-md` (6px), Tags `rounded-full`
- **Animations:** 200-300ms, `ease-out` default, Framer Motion variants

### Mixpanel (global, no onboarding tracking yet)

Initialized in `src/components/analytics/MixpanelInit.tsx`:
- Token: `c4c6970ea649d1a205fbf340cdbb97d7`
- `autocapture: true`, `record_sessions_percent: 100`
- Skipped in development
- **Zero onboarding-specific events exist** -- this is a gap we're filling

---

## V3 Architecture

### Step Decomposition: 5 Micro-Steps

| Step ID | Name | Origin | Lazy? | Skippable? |
|---------|------|--------|-------|------------|
| `brand-basics` | Brand Identity | Extracted from BrandProfileStep | No | No |
| `brand-analysis` | AI Analysis + Docs | Extracted from BrandProfileStep | No | No |
| `integrations` | Connect Platforms | Refactored IntegrationsStep | Yes | Yes (`skipToStep: 'review'`) |
| `review` | Review Report | Refactored ReviewStep (no launch btn) | Yes | No |
| `launch` | Approve & Launch | New focused step | No | No |

**DB backward-compat mapping:**
- `brand-basics`, `brand-analysis` -> numeric step `0`
- `integrations` -> numeric step `1`
- `review`, `launch` -> numeric step `2`

The database never sees step values it doesn't understand. A user who started on V2 resumes correctly on V3.

### OnboardJS Context Type

```typescript
// src/components/onboarding/v2/types.ts
import { OnboardingContext } from '@onboardjs/core'
import type { OnboardingState } from '@/lib/onboarding/state'

export const STEP_IDS = [
  'brand-basics', 'brand-analysis', 'integrations', 'review', 'launch'
] as const

export type StepId = typeof STEP_IDS[number]

export interface ContinuumOnboardingContext extends OnboardingContext {
  flowData: {
    onboardingState: OnboardingState
    _internal?: {
      completedSteps: Record<string | number, number>
      startedAt: number
      stepStartTimes: Record<string | number, number>
    }
  }
  brandId: string
  userId: string | null
}
```

The existing `OnboardingState` lives inside `flowData.onboardingState` -- zero transformation needed for server actions.

### Persistence Bridge

```typescript
// src/components/onboarding/v2/persistence.ts

// OnboardJS calls this once on mount to hydrate
customOnDataLoad = async (): Promise<LoadedData<ContinuumOnboardingContext>> => {
  const serverState = await fetchOnboardingStateAction(brandId)
  return {
    flowData: { onboardingState: serverState },
    currentStepId: mapNumericStepToStepId(serverState.step),
  }
}

// OnboardJS calls this on every context change + step transition
// Wrapped in 500ms debounce to avoid hammering during SSE streaming
customOnDataPersist = debounced(async (context, currentStepId) => {
  const state = context.flowData.onboardingState
  const numericStep = mapStepIdToNumeric(currentStepId)
  await mutateOnboardingStateAction(brandId, { ...state, step: numericStep })
}, 500)

// OnboardJS calls this on reset
customOnClearPersistedData = async () => {
  await resetOnboardingStateAction(brandId)
}
```

**Key detail:** During SSE streaming, intermediate text is held in local component state (via `useBrandDraftStream` hook) and only committed to OnboardJS context when streaming completes. This prevents the debounced persist from firing hundreds of times.

### Bridge Hook (drop-in replacement)

```typescript
// src/components/onboarding/v2/useOnboardingBridge.ts
// Shared components (LogoUploader, DocumentUploader) change only 1 import line

export function useOnboardingBridge() {
  const onboard = useOnboarding<ContinuumOnboardingContext>()
  const state = onboard.state?.context.flowData.onboardingState
  const brandId = onboard.state?.context.brandId ?? ''
  const userId = onboard.state?.context.userId ?? null

  const updateState = useCallback(async (patch: OnboardingPatch) => {
    const current = onboard.state!.context.flowData.onboardingState
    const merged = mergeOnboardingState(current, patch)
    await onboard.updateContext({
      flowData: { ...onboard.state!.context.flowData, onboardingState: merged }
    })
  }, [onboard])

  return { state, brandId, userId, updateState, resetState, isPending, onboard }
}
```

### OnboardJS Provider Shell

```tsx
// src/components/onboarding/v2/OnboardingShell.tsx
<OnboardingProvider<ContinuumOnboardingContext>
  steps={steps}
  initialContext={{ flowData: { onboardingState: initialState }, brandId, userId }}
  initialStepId={mapNumericStepToStepId(initialState.step)}
  customOnDataLoad={handlers.load}
  customOnDataPersist={handlers.persist}
  customOnClearPersistedData={handlers.clear}
  onFlowComplete={handleFlowComplete}
  analytics={createAnalyticsConfig(userId)}
  flowId={`onboarding-${brandId}`}
  flowVersion="3.0.0"
  userId={userId ?? undefined}
>
  <StepIndicator />
  <AnimatePresence mode="wait">
    <motion.div key={currentStepId} variants={stepTransition} ...>
      {renderStep()}
    </motion.div>
  </AnimatePresence>
</OnboardingProvider>
```

### Animation Strategy

```typescript
const stepTransition: Variants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: 'easeIn' } },
}
```

Back navigation reverses the x direction. Key is `currentStep.id` so each step gets its own enter/exit.

### Mixpanel Analytics

```typescript
// src/components/onboarding/v2/analytics.ts
const mixpanelProvider: AnalyticsProvider = {
  name: 'mixpanel',
  trackEvent(event: AnalyticsEvent) {
    if (typeof window === 'undefined') return
    mixpanel.track(event.type, {
      ...event.properties,
      flowId: event.flowId,
      flowVersion: event.flowVersion,
      sessionId: event.sessionId,
    })
  }
}

export function createAnalyticsConfig(userId: string | null): AnalyticsConfig {
  return {
    enabled: process.env.NODE_ENV === 'production',
    providers: [mixpanelProvider],
    userId: userId ?? undefined,
    autoTrack: { steps: true, flow: true, navigation: true },
    enableProgressMilestones: true,
    enableChurnDetection: true,
    excludeFlowDataKeys: ['onboardingState'], // don't send full state blob
    globalProperties: { app: 'continuum', module: 'onboarding' },
  }
}
```

**Auto-tracked events (via OnboardJS):**
- `onboarding_step_viewed` / `onboarding_step_completed` / `onboarding_completed`
- `onboarding_step_skipped` / `onboarding_error`
- Progress milestones (25%, 50%, 75%, 100%)
- Churn detection (step abandonment)

**Custom events (fired manually in step components):**
- `onboarding_website_analyzed` -- when SSE streaming completes
- `onboarding_document_uploaded` -- per document
- `onboarding_integration_connected` -- per provider OAuth
- `onboarding_report_generated` -- when agent preview completes
- `onboarding_launched` -- on Approve & Launch

---

## Step Component Design

### BrandBasicsStep (extracted from BrandProfileStep)

**Fields:** Logo (left column) + Brand Name, Industry, Timezone, Referral Source (right column, 2x2 grid)

Intentionally minimal -- 4 form fields + logo upload. No website, no AI, no documents. Takes under 30 seconds. Uses React Hook Form + Zod validation (same `formSchema` subset).

On submit: `onDataChange({ brand: { name, industry, timezone } }, true)` -> OnboardJS `next()`.

### BrandAnalysisStep (extracted from BrandProfileStep)

**Layout:**
1. Website URL input with globe icon + "Analyze" button
2. On click: dual SSE streams begin, two side-by-side markdown cards appear with live-streaming content (brand voice | target audience)
3. Edit/Preview toggle + Regenerate button (same as current)
4. Document uploader (collapsed by default with disclosure toggle)
5. "Continue" button enabled once streaming completes OR user explicitly skips analysis

Reuses `useBrandDraftStream(brandId)` unchanged. Reuses `DocumentUploader` (1 import change). Reuses `DraftResultCard` pattern.

### IntegrationsStep (refactored)

Same OAuth popup flow, same asset hierarchy selection, same platform grouping (Google, Meta, Coming Soon). Changes:
- Import `useOnboardingBridge` instead of old `useOnboarding`
- Remove manual `updateState({ step: 2 })` -- OnboardJS `next()` handles it
- `isSkippable: true` with "Skip for now" option -> `skipToStep: 'review'`
- Lazy-loaded via `next/dynamic`

### ReviewStep (refactored)

Same summary card + 4 report sections (voice, audience, market, competitive) + agent streaming. Changes:
- Import `useOnboardingBridge` instead of old `useOnboarding`
- Remove the bottom portal with "Approve & Launch" button -- that's now in LaunchStep
- Remove "Back to Integrations" button -- OnboardJS `previous()` handles it
- `triggerReportAgent()` logic stays here, writing results into OnboardJS context
- Lazy-loaded via `next/dynamic`

### LaunchStep (new)

Focused confirmation gate:
- Summary card: brand name + logo + industry + account count + document count
- Optional guidance textarea for final refinement
- "Approve & Launch" primary button (Electric Violet, prominent, full-width on mobile)
- "Go back and review" ghost link
- On click: calls `approveAndLaunchOnboardingAction(brandId)`, shows `OnboardingLoading` during processing
- On success: OnboardJS `onFlowComplete` fires -> redirect to `/dashboard`

---

## File Map

### New Files (`src/components/onboarding/v2/`)

```
v2/
  types.ts                    -- ContinuumOnboardingContext, STEP_IDS, mappers
  persistence.ts              -- createPersistenceHandlers(brandId) with debounce
  useOnboardingBridge.ts      -- drop-in hook replacing old useOnboarding()
  analytics.ts                -- MixpanelAnalyticsProvider + createAnalyticsConfig()
  OnboardingShell.tsx          -- OnboardJS Provider + AnimatePresence + StepIndicator
  StepIndicator.tsx            -- horizontal 5-step progress (clickable via goToStep)
  OnboardingDebugControls.tsx  -- dev tools using goToStep()/reset()
  steps.ts                     -- OnboardJS step definitions + dynamic() lazy imports
  steps/
    BrandBasicsStep.tsx        -- name, industry, timezone, logo, referral
    BrandAnalysisStep.tsx      -- website analysis, AI streaming, documents
    IntegrationsStep.tsx       -- refactored OAuth + asset selection
    ReviewStep.tsx             -- refactored report generation (no launch)
    LaunchStep.tsx             -- confirmation + approve & launch
```

### Modified Files

| File | Change |
|------|--------|
| `src/app/onboarding/page.tsx` | Swap `OnboardingContainer` to `OnboardingShell` |
| `src/components/onboarding/shared/LogoUploader.tsx` | 1 import change: `useOnboarding` -> `useOnboardingBridge` |
| `src/components/onboarding/shared/DocumentUploader.tsx` | 1 import change: `useOnboarding` -> `useOnboardingBridge` |

### Unchanged (backend layer -- zero modifications)

- `src/app/onboarding/actions.ts` -- all 12+ server actions
- `src/lib/onboarding/storage.ts` -- Supabase persistence layer
- `src/lib/onboarding/state.ts` -- types, Zod schemas, merge logic
- `src/lib/onboarding/agentClient.ts` -- agent SSE client
- `src/lib/onboarding/mapping.ts` -- state-to-agent mapper
- `src/app/api/onboarding/brand-draft-voice/route.ts`
- `src/app/api/onboarding/brand-draft-audience/route.ts`
- `src/app/api/onboarding/documents/route.ts`
- `src/components/onboarding/hooks/useBrandDraftStream.ts`
- `src/components/onboarding/platforms.ts`
- `src/components/onboarding/PlatformIcons.tsx`
- `src/components/onboarding/integrations/constants.ts`
- `src/components/onboarding/selectableAssetsMerge.ts`
- `src/components/onboarding/OnboardingGate.tsx`
- `src/components/analytics/MixpanelInit.tsx`

### Deprecated (remove after V3 validated)

- `src/components/onboarding/OnboardingContainer.tsx`
- `src/components/onboarding/providers/OnboardingContext.tsx`
- `src/components/onboarding/steps/BrandProfileStep.tsx`
- `src/components/onboarding/steps/IntegrationsStep.tsx`
- `src/components/onboarding/steps/ReviewStep.tsx`
- `src/components/onboarding/OnboardingDebugControls.tsx`

---

## Implementation Order

### Phase 1: Foundation (no visible changes)
1. `v2/types.ts` -- context type, step IDs, numeric mappers
2. `v2/persistence.ts` -- load/persist/clear bridge with debounce
3. `v2/useOnboardingBridge.ts` -- compatibility hook
4. `v2/analytics.ts` -- Mixpanel provider adapter

### Phase 2: Shell
5. `v2/StepIndicator.tsx` -- horizontal progress indicator
6. `v2/steps.ts` -- step definitions with `dynamic()` lazy imports
7. `v2/OnboardingShell.tsx` -- provider + animation wrapper

### Phase 3: Steps
8. `v2/steps/BrandBasicsStep.tsx` -- extract from BrandProfileStep
9. `v2/steps/BrandAnalysisStep.tsx` -- extract from BrandProfileStep
10. `v2/steps/IntegrationsStep.tsx` -- refactor existing
11. `v2/steps/ReviewStep.tsx` -- refactor existing
12. `v2/steps/LaunchStep.tsx` -- new

### Phase 4: Integration
13. Update `LogoUploader.tsx` + `DocumentUploader.tsx` imports
14. Update `src/app/onboarding/page.tsx` to use `OnboardingShell`
15. `v2/OnboardingDebugControls.tsx`

### Phase 5: Validation
16. `bun run build` passes
17. Fresh user flow: brand-basics -> analysis -> integrations -> review -> launch -> dashboard
18. Returning user resumes at correct step
19. OAuth popups work for Google & Meta
20. SSE streaming for brand voice/audience
21. Agent preview streaming in review step
22. Approve & launch completes and redirects
23. Integrations skippable
24. Mixpanel events fire in production mode (check Mixpanel Live View)

---

## OnboardJS API Reference (verified from source)

### Provider Props (`OnboardingProviderProps<TContext>`)

```typescript
steps: OnboardingStep<TContext>[]                    // required
initialStepId?: string | number
initialContext?: Partial<TContext>
onFlowComplete?: (context: TContext) => void | Promise<void>
onStepChange?: callback
customOnDataLoad?: () => Promise<LoadedData<TContext> | null>
customOnDataPersist?: (context: TContext, currentStepId: string | number | null) => void | Promise<void>
customOnClearPersistedData?: () => Promise<unknown>
localStoragePersistence?: { key: string; ttl?: number }
analytics?: AnalyticsConfig
plugins?: OnboardingPlugin[]
flowId?: string
flowVersion?: string
userId?: string
debug?: boolean
```

### `useOnboarding<TContext>()` Returns

```typescript
engine: OnboardingEngine<TContext> | null
state: EngineState<TContext> | null
loading: { isHydrating, isEngineProcessing, isComponentProcessing, isAnyLoading }
next(stepData?) / previous() / skip() / goToStep(stepId, data?)
updateContext(partial) / reset(config?)
renderStep(): ReactNode
currentStep / isCompleted / error
setComponentLoading(bool)
```

### `EngineState<TContext>`

```typescript
currentStep / context / isLoading / isHydrating / isCompleted
isFirstStep / isLastStep / canGoNext / canGoPrevious / isSkippable
error / currentStepNumber? / totalSteps?
```

### Step Config (`OnboardingStep<TContext>`)

```typescript
id: string | number                                  // required
component: React.ComponentType<StepComponentProps>   // required
payload?: any
nextStep?: string | null | ((ctx) => string | null)
previousStep?: string | null | ((ctx) => string | null)
condition?: (ctx) => boolean
isSkippable?: boolean
skipToStep?: string | null | ((ctx) => string | null)
onStepActive?: (ctx) => void | Promise<void>
onStepComplete?: (stepData, ctx) => void | Promise<void>
meta?: Record<string, any>
```

### `StepComponentProps<TPayload, TContext>`

```typescript
payload: TPayload
context: TContext
onDataChange?: (data: Record<string, unknown>, isValid: boolean) => void
initialData?: Record<string, unknown>
```

### `AnalyticsConfig`

```typescript
enabled?: boolean
providers?: AnalyticsProvider[]                       // { name, trackEvent(event), flush?() }
autoTrack?: boolean | { steps?, flow?, navigation?, interactions? }
enableProgressMilestones?: boolean
enableChurnDetection?: boolean
excludeFlowDataKeys?: string[]                       // prevent large state blobs in events
globalProperties?: Record<string, any>
before_send?: (event) => event | null                // filter/modify events
```

### Engine Events (for custom tracking)

```
stepActive / stepCompleted / stepSkipped
flowCompleted / flowReset
stateChange / contextUpdate
error / beforeStepChange
```

---

## Design Principles

Per the loaded skills and project design system:

1. **Progressive disclosure** -- show only what's needed at each step. BrandBasics is 4 fields. BrandAnalysis reveals AI cards after user clicks Analyze. Documents are collapsed by default.
2. **No AI slop** -- avoid gradient text, neon accents, glassmorphism everywhere. Use the design system: Electric Violet brand color, Inter font, 8pt grid, `bg-accent` cards, `shadow-brand-glow` on hover.
3. **Snappy transitions** -- 200-300ms Framer Motion with `ease-out`. No bounce/elastic. `AnimatePresence` with `mode="wait"` for step changes.
4. **Touch targets** -- 44x44px minimum for all interactive elements.
5. **Accessibility** -- focus rings, ARIA labels, keyboard navigation, `prefers-reduced-motion` respected.
6. **Optimistic UI** -- state updates appear instantly, server sync is debounced background.
7. **Code splitting** -- Integrations and Review steps are lazy-loaded since they're heavy (OAuth, asset hierarchy, agent streaming).
