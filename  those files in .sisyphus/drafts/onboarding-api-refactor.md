# Draft: Onboarding API Refactor

## Requirements (confirmed)
- Goal: Refactor onboarding API communication to use a mature request structure.
- Target Endpoint: `POST /onboarding/brand-profiles/approve`
- Structure Requirements:
    - `brandProfile`: { id, brand_name, brand_voice, target_audience, website_url, ... }
    - `runContext`: { user_id, brand_id, brand_name, integrated_platforms, integration_account_ids, ... }
- Tasks:
    - Create `approveAndLaunchOnboardingAction` in `actions.ts`.
    - Update `ReviewStep.tsx` to use the new action.
    - Ensure `integration_account_ids` is correctly mapped.
    - Handle strategic analysis trigger.

## Technical Decisions
- **Test Strategy**: TDD (Red-Green-Refactor) for the Server Action.
- **API Communication**: Use Server Action to proxy the request to the backend.

## Research Findings
- Backend expects structured `brandProfile` and `runContext` in the approve request.

## Open Questions
- Is there an existing SDK/wrapper for the `/approve` endpoint?
- Does `brandProfile` require `logo_url` or `logo_path`?
