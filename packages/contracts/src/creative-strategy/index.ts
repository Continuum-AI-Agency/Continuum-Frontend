// Creative Strategy — the first-party, data-derived winning-angle playbook.
//
// The brand's own top-performing organic posts and ads are analyzed by a Gemini
// 3.1 Flash-Lite pass (analysis.ts), clustered and scored into evidence-backed
// creative insights (insight.ts), materialized into the creative_strategy store,
// served by the creative_strategy MCP umbrella, and grounded into organic
// generation. Distinct from analytics_creative_insights (a numeric hook/hold
// ranker), which is one of this pipeline's data sources.

export * from './analysis';
export * from './insight';
export * from './paid';
export * from './taxonomy';
