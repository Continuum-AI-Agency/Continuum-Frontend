# Onboarding V3 Improvements Specification

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
