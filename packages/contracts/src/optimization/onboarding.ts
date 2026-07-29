// Shared optimizer onboarding builders — the ONE source of the suggestion→config
// and create→enroll mapping. The dashboard onboarding (PortfolioSetup.tsx), the MCP
// `optimizer_manage` tool, and the Jaina optimizer tools ALL import these, so the
// discover→suggest→create→enroll flow can never drift between the UI and the agents.
//
// Pure and dependency-free (types-only imports) so it is consumable by the Frontend
// (browser), the Backend MCP handlers, and the isolated Jaina package alike.

import type {
  ApplyMode,
  CreatePortfolioRequest,
  EnrollRequest,
  PortfolioConfig,
  PortfolioSuggestion,
} from './service';

export type SuggestionToConfigOpts = {
  /** Override the default `observe` (soak-first) create mode. Use `recommend` for
   *  human-in-the-loop create, or `autopilot` only when guardrails are also set. */
  apply_mode?: ApplyMode;
};

/** Map an onboarding suggestion to the portfolio config used to create it. Mirrors
 *  the dashboard's `createFromSuggestion` exactly: `apply_mode` defaults to
 *  `'observe'` (soak-first — ingest + score, no Meta writes; promote to recommend
 *  or autopilot from Manage). Pass `apply_mode: 'recommend'` when the caller wants
 *  human-in-the-loop create. `cpa_target` is carried only when the suggestion set one. */
export function suggestionToPortfolioConfig(
  suggestion: PortfolioSuggestion,
  opts: SuggestionToConfigOpts = {},
): PortfolioConfig {
  return {
    name: suggestion.name,
    objective: suggestion.objective,
    level: suggestion.level,
    mode: suggestion.mode,
    apply_mode: opts.apply_mode ?? 'observe',
    daily_total: suggestion.daily_total,
    // A suggestion's daily_total is a point-in-time SUM of the member ad sets' live
    // budgets, not a target anybody chose — so the portfolio must keep tracking the live
    // sum. Pinning it as 'fixed' is what made balanced cycles claw budgets back to
    // whatever they happened to be on the day the portfolio was created.
    budget_source: 'observed',
    lookback_window: 'd14',
    ...(suggestion.cpa_target ? { cpa_target: suggestion.cpa_target } : {}),
  };
}

/** Build the create-portfolio request for a suggestion under a brand + ad account. */
export function suggestionToCreateRequest(args: {
  brand_id: string;
  ad_account_id: string;
  suggestion: PortfolioSuggestion;
  apply_mode?: ApplyMode;
}): CreatePortfolioRequest {
  return {
    brand_id: args.brand_id,
    ad_account_id: args.ad_account_id,
    config: suggestionToPortfolioConfig(args.suggestion, { apply_mode: args.apply_mode }),
  };
}

/** Build the enroll request for a just-created portfolio from its suggestion.
 *  A single-campaign campaign-level suggestion enrolls by `campaign_id` (the enroll
 *  edge expands it to the campaign's ad sets); every other case enrolls the ad-set
 *  ids directly. A campaign-level suggestion carrying multiple campaign ids cannot be
 *  expressed as one EnrollRequest (`campaign_id` is singular) — callers fan out per
 *  campaign. Callers guard for a non-empty `adset_ids` before enrolling (EnrollRequest
 *  requires at least one entity), mirroring the dashboard's `adset_ids.length > 0` check. */
export function suggestionToEnrollRequest(
  portfolioId: string,
  suggestion: PortfolioSuggestion,
): EnrollRequest {
  const [firstId] = suggestion.adset_ids;
  if (suggestion.level === 'campaign' && firstId && suggestion.adset_ids.length === 1) {
    return { portfolio_id: portfolioId, campaign_id: firstId };
  }
  return { portfolio_id: portfolioId, adset_ids: suggestion.adset_ids };
}
