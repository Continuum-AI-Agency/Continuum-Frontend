/**
 * A pain the category's long-running ads keep selling against, in the customer's own words.
 * Long-running = someone is paying for it, so the pain is validated with real money. Mined on
 * the bench tenant's competitor ads and handed to the headless director as grounding.
 */
export type CompetitorAngle = {
  readonly pain: string;
  readonly customerWords: readonly string[];
  /** How many of the sampled long-running ads carry this pain (the playbook's "4 of 10"). */
  readonly adCount: number;
  readonly medianLongevityDays: number;
  readonly sources: readonly { readonly competitor: string; readonly adArchiveId: string }[];
};
