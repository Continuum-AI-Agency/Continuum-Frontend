/**
 * A pain the category's long-running ads keep selling against, in the customer's own words.
 * Long-running = someone is paying for it, so the pain is validated with real money. Mined on
 * the bench tenant's competitor ads and handed to the headless director as grounding.
 */
export type CompetitorAngle = {
  readonly pain: string;
  /** Where the pain was mined, which the bar was met in: 'competitor ads', 'competitor 1–2★
   *  reviews', 'competitor Instagram posts', or '<brand> comments' (its own customers). */
  readonly source: string;
  /** Phrases copied verbatim from the sources that carry this pain. */
  readonly customerWords: readonly string[];
  /** How many of the source's sampled items carry this pain (`bar.n` is the sample). */
  readonly adCount: number;
  /** The bar the pain met in its source, with the real numbers: ads '≥4 of 10 long-running ads';
   *  reviews 'reviews ≥10% across ≥3 chains' (long-tailed, so read over every eligible review). */
  readonly bar: {
    readonly rule: string;
    /** adCount / n. */
    readonly share: number;
    readonly chains: number;
    readonly n: number;
  };
  /** Median days the carrying ads have run; null when the source has no run length (an
   *  Instagram post stays up, so its age says nothing about spend). */
  readonly medianLongevityDays: number | null;
  readonly sources: readonly {
    readonly competitor: string;
    readonly platform: 'meta_ad_library' | 'instagram' | 'google_maps_review' | 'instagram_comment';
    /** The Ad Library archive id, the Instagram media or comment id, or the Google review id. */
    readonly id: string;
  }[];
};
