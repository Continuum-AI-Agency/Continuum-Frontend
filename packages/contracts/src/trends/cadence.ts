// Shared cadence knobs for weekly brand-trends generation. These are plain
// constants (not env flags) so the web app, the MCP tool, and the cron warmer
// all agree on freshness/cost without config drift.

/**
 * A completed generation newer than this many days is "fresh enough to serve"
 * without kicking off a new run. Lowering it lets the daily cron append a fresh
 * generation a few times a week (the schema is append-only + deduped), so brands
 * see newer trends within the week instead of one weekly snapshot.
 */
export const TRENDS_REUSE_DAYS = 2;

/**
 * Hard ceiling on completed generations minted per calendar week (per brand).
 * Once reached, unforced requests reuse the latest completed generation instead
 * of running the (costly) Meta-harvester workflow again. `force_regenerate`
 * bypasses this — an explicit, operator-gated action.
 */
export const TRENDS_MAX_GENERATIONS_PER_WEEK = 3;

/**
 * Weekly ceiling for the FREE trends tier (unpaid brands). Free brands get a
 * single provider-free (heuristic) trends generation per calendar week and
 * cannot regenerate or force additional runs — `force_regenerate` is ignored
 * for them. Paid tiers use TRENDS_MAX_GENERATIONS_PER_WEEK instead.
 */
export const TRENDS_FREE_MAX_GENERATIONS_PER_WEEK = 1;

/** trendsTier value for unpaid brands entitled only to the weekly free run. */
export const TRENDS_FREE_TIER = 'free' as const;
