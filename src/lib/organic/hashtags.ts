// Flattens the tiered hashtag model (high/medium/low competition) into a single
// ordered, deduped, #-prefixed list for display under a post's caption — the way
// hashtags actually appear on a published post. Editing stays tiered (HashtagTiers).

export type HashtagTierMap = {
  high?: string[]
  medium?: string[]
  low?: string[]
}

const TIER_ORDER: Array<keyof HashtagTierMap> = ["high", "medium", "low"]

const stripHash = (tag: string): string => tag.trim().replace(/^#+/, "").trim()

export function flattenHashtags(hashtags: HashtagTierMap | undefined): string[] {
  if (!hashtags) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const tier of TIER_ORDER) {
    for (const raw of hashtags[tier] ?? []) {
      const tag = stripHash(raw)
      if (!tag) continue
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`#${tag}`)
    }
  }
  return out
}
