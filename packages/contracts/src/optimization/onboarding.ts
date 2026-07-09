// Shared optimizer onboarding builders — the ONE source of the suggestion→config
// and create→enroll mapping. The dashboard onboarding (PortfolioSetup.tsx), the MCP
// `optimizer_manage` tool, and the Jaina optimizer tools ALL import these, so the
// discover→suggest→create→enroll flow can never drift between the UI and the agents.
//
// Pure and dependency-free (types-only imports) so it is consumable by the Frontend
// (browser), the Backend MCP handlers, and the isolated Jaina package alike.

import type {
  CreatePortfolioRequest,
  EnrollRequest,
  PortfolioConfig,
  PortfolioSuggestion,
} from './service';

/** Map an onboarding suggestion to the portfolio config used to create it. Mirrors
 *  the dashboard's `createFromSuggestion` exactly: `apply_mode` is forced to
 *  `'recommend'` (money-safety — a freshly created portfolio never auto-applies
 *  budget), and `cpa_target` is carried only when the suggestion set one. */
export function suggestionToPortfolioConfig(suggestion: PortfolioSuggestion): PortfolioConfig {
  return {
    name: suggestion.name,
    objective: suggestion.objective,
    level: suggestion.level,
    mode: suggestion.mode,
    apply_mode: 'recommend',
    daily_total: suggestion.daily_total,
    ...(suggestion.cpa_target ? { cpa_target: suggestion.cpa_target } : {}),
  };
}

/** Build the create-portfolio request for a suggestion under a brand + ad account. */
export function suggestionToCreateRequest(args: {
  brand_id: string;
  ad_account_id: string;
  suggestion: PortfolioSuggestion;
}): CreatePortfolioRequest {
  return {
    brand_id: args.brand_id,
    ad_account_id: args.ad_account_id,
    config: suggestionToPortfolioConfig(args.suggestion),
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
