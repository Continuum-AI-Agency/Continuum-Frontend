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
// Meta ad-set targeting -> the audience axis (cold/warm, and the normalized columns
// paid_media.adset_targeting_snapshots indexes on).
export * from './targeting';
