# Onboarding V3 Mega Doc

This document combines the implementation specification and UX copy system for Continuum onboarding V3.

## Part I: Product and Implementation Specification


## 1. Overview
Continuum onboarding currently ships as a custom three-step flow with high cognitive load in step 1 and no onboarding-specific funnel analytics. This specification defines a production-ready V3 onboarding that improves completion, reduces perceived effort, and preserves all existing backend contracts.

## 2. User Value
- Reach first value faster by splitting setup into focused micro-steps.
- Prevent dead ends when website analysis or agent generation fails.
- Keep setup optional where possible (integrations and analysis), while still enabling launch.
- Improve trust through clear progress, transparent states, and actionable recovery paths.

## 3. Goals
- Replace the legacy 3-step client flow with OnboardJS-powered 5-step flow.
- Keep server actions, API routes, and data model behavior unchanged.
- Add measurable funnel tracking and churn signals.
- Reduce initial onboarding bundle cost with step-level lazy loading.
- Preserve resume behavior for existing users and existing numeric step persistence.

## 4. Non-Goals
- No backend schema redesign.
- No changes to strategic analysis business logic.
- No redesign of global navigation or dashboard post-onboarding IA.

## 5. Personas
- New founder/operator with limited setup time.
- Agency/admin user connecting many paid media assets.
- Returning user resuming incomplete onboarding.

## 6. Step Model
- `brand-basics` (required): Name, industry, timezone, logo, referral.
- `brand-analysis` (optional analysis path): Website analysis, voice/audience drafts, docs.
- `integrations` (skippable): Connect and select assets.
- `review` (required): Validate summary and generate strategic preview.
- `launch` (required): Final confirmation and approve/launch action.

Backward compatibility:
- `brand-basics` and `brand-analysis` map to stored numeric step `0`.
- `integrations` maps to `1`.
- `review` and `launch` map to `2`.

## 7. Functional Requirements (EARS)
- When a user opens onboarding for an incomplete brand, the system shall start or resume at the correct V3 step mapped from persisted step data.
- When a user completes Brand Basics with valid required fields, the system shall allow progression without requiring website input.
- Where website input is missing or invalid, the system shall provide a visible "Continue without analysis" path.
- When website analysis is triggered, the system shall stream brand voice and audience drafts and preserve in-progress UI state until completion.
- When website analysis fails, the system shall show retry guidance and allow progression without blocking onboarding.
- When a user uploads documents, the system shall preserve uploaded document metadata and show per-file status transitions.
- When a user enters Integrations, the system shall support connect, refresh, select, and skip flows without requiring at least one selected account.
- Where no integrations are selected, the system shall allow progression and reflect zero-account context in downstream steps.
- When a user requests report generation in Review, the system shall stream report sections and expose retry without losing previously entered guidance.
- When report generation fails, the system shall provide actionable retry and non-blocking progression to Launch.
- When a user confirms in Launch, the system shall invoke existing launch action and redirect to dashboard on success.
- When onboarding state changes, the system shall persist state via debounced writes to avoid mutation flooding.
- When any step is viewed, completed, skipped, or errored, the system shall emit onboarding telemetry with flow and step metadata.

## 8. Non-Functional Requirements
- Performance:
  - Onboarding shell first render (p75) under 1.5s on mid-tier mobile 4G.
  - Step transition animation duration 200ms-300ms.
  - Heavy steps (`integrations`, `review`) loaded on demand.
- Reliability:
  - State persistence resilient to transient network errors with retry-safe UX.
  - No data loss for brand profile fields on stream/persist failures.
- Accessibility:
  - Keyboard-accessible step controls and action buttons.
  - Focus-visible states on all primary controls.
  - Error messages announced and visually attached to related controls.
- Observability:
  - Structured onboarding event taxonomy with step-level context.

## 9. Analytics Contract
Auto events:
- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_step_skipped`
- `onboarding_completed`
- `onboarding_error`
- milestone events (25/50/75/100)

Custom events:
- `onboarding_website_analyzed`
- `onboarding_document_uploaded`
- `onboarding_integration_connected`
- `onboarding_report_generated`
- `onboarding_launched`

Required properties:
- `flowId`
- `flowVersion`
- `stepId`
- `sessionId`
- `userId` (when available)
- `brandId`

## 10. Acceptance Criteria (Given/When/Then)
1. Given a new user with no website, when they complete Brand Basics, then they can continue to Integrations without running analysis.
2. Given a user with a valid website URL, when they run analysis, then voice and audience content streams and can be edited before continue.
3. Given analysis failure, when the user is in Brand Analysis, then retry and continue-without-analysis actions are both available.
4. Given no connected integrations, when a user chooses skip, then they can proceed to Review and Launch.
5. Given selected assets and guidance, when report generation runs, then market and competitive sections stream and persist in current context.
6. Given report generation failure, when user reaches Launch, then launch action remains available with clear warning copy.
7. Given an in-progress user returning later, when they revisit onboarding, then the same logical V3 step is restored from persisted state.
8. Given production mode, when users traverse onboarding, then telemetry events are emitted for views/completions/skips/errors.
9. Given successful launch, when user confirms final action, then onboarding is marked complete and user is redirected to `/dashboard`.

## 11. Error Handling Matrix
| Scenario | User-Facing Behavior | Recovery | Telemetry |
| --- | --- | --- | --- |
| Brand draft SSE failure | Inline error plus toast in Brand Analysis | Retry analysis or continue without analysis | `onboarding_error` (`stepId=brand-analysis`) |
| Document upload failure | Per-file failure status with retry CTA | Re-upload failed file only | `onboarding_error` + `onboarding_document_uploaded` outcome |
| OAuth popup blocked/closed | Non-blocking warning; integrations remain skippable | Retry connect or skip step | `onboarding_error` (`stepId=integrations`) |
| Report generation failure | Inline section-level fallback and retry | Retry generation or continue to Launch | `onboarding_error` (`stepId=review`) |
| Launch action failure | Stay on Launch with actionable message | Retry launch without data loss | `onboarding_error` (`stepId=launch`) |
| Persist mutation failure | Toast plus retained optimistic UI with rollback-safe sync | Auto retry next mutation + manual retry | `onboarding_error` (`type=persist`) |

## 12. Implementation Checklist
### Phase A: Flow Foundation
- [ ] Add `v2/types.ts` with step IDs and numeric mappers.
- [ ] Add `v2/persistence.ts` with load/persist/clear handlers and debounce.
- [ ] Add `v2/OnboardingShell.tsx` with OnboardJS provider and step rendering.
- [ ] Add `v2/steps.ts` with step definitions and skippable rules.

### Phase B: Step Decomposition
- [ ] Extract `BrandBasicsStep` from legacy profile step.
- [ ] Extract `BrandAnalysisStep` with explicit skip path.
- [ ] Port Integrations step with `skipToStep` support.
- [ ] Port Review step and decouple launch action.
- [ ] Add new focused Launch step.

### Phase C: Performance and UX
- [ ] Lazy-load `integrations` and `review` step components.
- [ ] Ensure skeletons match final layout structure per step.
- [ ] Add consistent loading/error/empty states.

### Phase D: Telemetry
- [ ] Add analytics adapter and event naming contract.
- [ ] Emit custom events for analysis/upload/connect/report/launch.
- [ ] Validate event payloads in production telemetry checks.

### Phase E: Verification
- [ ] Restore and align onboarding test suite with live architecture.
- [ ] Add tests for skip/failure/resume paths.
- [ ] Validate fresh flow and resume flow manually.
- [ ] Confirm all acceptance criteria pass.

## 13. Risks
- Legacy tests currently fail and may hide regressions until repaired.
- Step decomposition can introduce state synchronization defects if bridge hooks are inconsistent.
- Telemetry drift risk if event properties are not centrally typed.

## 14. Dependencies
- `@onboardjs/react` and `@onboardjs/core` already present.
- Existing server actions and routes remain integration boundary.
- Mixpanel runtime initialization already present.

## 15. Definition of Done
- V3 flow is default onboarding path.
- Legacy 3-step container is removed or fully deprecated behind non-default fallback.
- Acceptance criteria and test coverage pass.
- Onboarding analytics dashboard can measure step conversion and drop-off.

---

## Part II: UX Copy and Messaging System


## 1. Voice and Tone
- Clear, direct, and outcome-focused.
- Friendly but not playful.
- Low-ambiguity action labels.
- Never block users without a clear reason and recovery action.

## 2. Global Copy Principles
- Lead with value, then ask for input.
- Keep helper text under one sentence where possible.
- Buttons should be verb-first (`Continue`, `Analyze Website`, `Skip for now`).
- Errors must include one recovery action.
- Empty states must include why this matters and what to do next.

## 3. Flow-Level Copy
### Page Header
- Title: `Get Started`
- Subtitle: `Set up your brand context and launch your first strategy in a few minutes.`
- Optional time estimate badge: `~4 min setup`

### Step Indicator Labels
- `1. Brand Basics`
- `2. Brand Analysis`
- `3. Integrations`
- `4. Review`
- `5. Launch`

## 4. Step Copy
## Step 1: Brand Basics
### Hero
- Title: `Tell us about your brand`
- Description: `This helps Continuum tailor strategy, voice, and recommendations from day one.`

### Field Labels and Helpers
- `Brand Name`  
  Helper: `The name your team and customers recognize.`
- `Industry`  
  Helper: `Choose the closest match. You can update this later.`
- `Timezone`  
  Helper: `Used for scheduling and reporting windows.`
- `How did you hear about us?`  
  Helper: `Optional. Helps us improve onboarding.`
- `Brand Logo`  
  Helper: `Optional. PNG, JPG, or SVG under 2 MB.`

### Primary Actions
- Primary: `Continue`
- Secondary (if needed): `Save and exit`

### Validation/Error Copy
- `Brand name is required.`
- `Choose an industry to continue.`
- `Choose a timezone to continue.`
- `Logo must be under 2 MB.`
- `We couldn’t save your changes. Try again.`

## Step 2: Brand Analysis
### Hero
- Title: `Optional: analyze your website`
- Description: `Generate a first draft of your brand voice and audience in under a minute.`

### Input Area
- Label: `Website URL`
- Placeholder: `https://example.com`
- Helper: `We’ll use this to draft voice and audience recommendations.`

### Primary Actions
- Before run: `Analyze Website`
- During run: `Analyzing...`
- After success: `Use this draft`
- Secondary: `Continue without analysis`
- Tertiary: `Regenerate`

### Streaming/Loading States
- Voice card title: `Brand Voice Draft`
- Audience card title: `Target Audience Draft`
- Loading text: `Generating draft...`

### Failure and Recovery
- Inline alert title: `Analysis didn’t finish`
- Inline message: `You can retry now or continue without analysis.`
- Retry CTA: `Retry analysis`
- Continue CTA: `Continue without analysis`

### Document Upload Section
- Section title: `Knowledge Base (Optional)`
- Description: `Upload brand docs to improve strategic grounding.`
- Upload CTA: `Upload Files`
- Empty state: `No documents yet. Add PDFs, docs, or notes to improve output quality.`
- Success toast: `Document uploaded`
- Error toast: `Upload failed. Please retry.`

## Step 3: Integrations
### Hero
- Title: `Connect your channels`
- Description: `Sync ad and social accounts now, or skip and add them later.`

### Primary Actions
- Connect CTA: `Connect`
- Reconnect CTA: `Reconnect`
- Refresh CTA: `Refresh assets`
- Primary continue: `Continue`
- Secondary continue: `Skip for now`

### Selection Copy
- Group label: `Available assets`
- Count badge: `{selected} selected`
- Helper: `Select the accounts you want this brand to use.`

### Empty and Failure States
- No assets after connect: `No assets found yet. Refresh or reconnect to try again.`
- OAuth closed: `Connection window closed before completion.`
- OAuth failed: `We couldn’t complete the connection. Try again.`

## Step 4: Review
### Hero
- Title: `Review your strategy inputs`
- Description: `Confirm your brand inputs and generate a final strategic preview.`

### Summary Labels
- `Brand`
- `Connected Accounts`
- `Documents`

### Report Area
- Generate CTA: `Generate Preview`
- Regenerate CTA: `Regenerate Preview`
- Guidance placeholder: `Optional guidance to refine the output`
- Loading: `Generating strategic preview...`

### Failure and Recovery
- Error title: `Preview generation failed`
- Error body: `Retry generation or continue to launch with current inputs.`
- Retry CTA: `Retry preview`
- Continue CTA: `Continue to launch`

## Step 5: Launch
### Hero
- Title: `Ready to launch`
- Description: `We’ll save your setup and start processing your brand strategy.`

### Actions
- Primary: `Approve & Launch`
- Secondary: `Go back and review`

### Success and Failure
- Success toast: `Setup complete. Redirecting to dashboard...`
- Failure toast: `Launch failed. Your data is safe; please retry.`

## 5. Reusable UI Copy
### Generic Save/Error
- Save success: `Saved`
- Save failure: `Couldn’t save changes. Try again.`
- Network error: `Connection issue detected. Check your network and retry.`

### Unsaved Changes
- Prompt title: `Leave onboarding?`
- Prompt body: `You have unsaved progress in this step.`
- Confirm leave: `Leave`
- Stay: `Stay`

### Accessibility Labels
- Back button aria-label: `Go to previous step`
- Close dialog aria-label: `Close`
- Retry button aria-label: `Retry`

## 6. Copy QA Checklist
- Every blocking state has a non-blocking fallback when technically safe.
- Every error includes one clear recovery action.
- Button labels are action-first and unique per screen.
- Step headers match step indicator names.
- Toasts are under 90 characters where possible.
