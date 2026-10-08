export * from './adNaming';
export * from './audience-groups';
export * from './hierarchy';
export * from './insight-model';
export * from './jaina-export';
export * from './kpi';
export * from './live-creative-audience';
// The Meta ad-set targeting spec as the Graph API shapes it (flexible_spec, Advantage+ flag)
// and the one-line audience summary a card reads off it.
export * from './meta-targeting';
export * from './multi-account';
// OpenAI Ads (ChatGPT Ads) — Advertiser API request/response shapes shared by the
// Backend client and the campaign canvas that drives it.
export * from './openai-ads';
export * from './ranking';
// The typed plan behind a paid scaffold version (evidence, expected results, optimizer
// enrollment) and the Campaign Canvas save request/response.
export * from './scaffold-plan';
// Meta ad-set targeting -> the audience axis (cold/warm, and the normalized columns
// paid_media.adset_targeting_snapshots indexes on).
export * from './targeting';
// Multi-platform vocabulary, Google Ads v25 and TikTok v1.3 wire shapes (vendored from the monorepo, Optimizer multiplatform).
export * from './platform';
export * from './google-ads';
export * from './tiktok-ads';
