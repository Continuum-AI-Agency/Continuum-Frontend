// Which branch (location) a campaign belongs to, on an account that runs one campaign per
// branch. Easy Fit names them "OCTUBRE// ALEIRA // MENSAJES //  2026", "CAÑADAS // MENSAJES
// //Octubre  2026" and "CAÑADAS // FORMULARIO // AGOSTO 2026": the branch is the one segment
// that is neither a date (a month, a year) nor a word for what the campaign buys or how it is
// built (MENSAJES, FORMULARIO, BAU, CONTINUUM…). The spacing and the month move around from
// one name to the next, so the segments are compared folded (no accents, one space, upper case)
// and shown as stored.
//
// An account reads by branch only when its names show the pattern: at least two branches, the
// campaigns that name one carry 80% of the spend or more, and some non-branch segment repeats
// across two branches or more (the template the names were written from). Anything else reads
// by campaign, which is what the views fall back to. The month and kind tokens, Spanish and
// English, live in contracts (boardCopy/metaViewsCopy.ts) with the rest of the board's copy.

import { branchKindTokens, branchMonthTokens } from '@continuum/contracts';

const SEGMENT_DELIMITER = /\s*(?:\/{2,}|\||\s[-–]\s)\s*/;

const MONTHS: ReadonlySet<string> = new Set(branchMonthTokens);
const KIND_WORDS: ReadonlySet<string> = new Set(branchKindTokens);

/** Folded for comparison: no accents, upper case, one space between words. */
export function foldName(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function isDateWord(word: string): boolean {
  return (
    MONTHS.has(word) ||
    /^(19|20)\d{2}$/.test(word) ||
    /^\d{1,2}$/.test(word) ||
    /^Q[1-4]$/.test(word) ||
    /^\d{1,4}([/.-]\d{1,4})+$/.test(word)
  );
}

type SegmentKind = 'date' | 'kind' | 'branch';

function segmentKind(folded: string): SegmentKind {
  const words = folded
    .split(' ')
    .map((word) => word.replace(/[^A-Z0-9/.-]/g, ''))
    .filter((word) => word.length > 0);
  if (words.length === 0) return 'kind';
  if (words.every(isDateWord)) return 'date';
  if (words.every((word) => isDateWord(word) || KIND_WORDS.has(word.replace(/[/.-]/g, '')))) {
    return 'kind';
  }
  return 'branch';
}

function segmentsOf(name: string): string[] {
  return name
    .split(SEGMENT_DELIMITER)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0);
}

export type ParsedCampaignName = {
  /** The branch as stored (one space between words), or null when the name names none. */
  branch: string | null;
  /** The branch folded, to group campaigns by. */
  branchKey: string | null;
  /** The folded segments that are not the branch: the template's dates and kinds. */
  template: string[];
};

/**
 * The branch of one campaign name: its first segment that is neither a date nor a kind word.
 * `constants` are folded segments every campaign on the account carries (a brand prefix such
 * as "EASYFIT // …"): they belong to the template, never to the branch.
 */
export function parseCampaignName(
  name: string,
  constants: ReadonlySet<string> = new Set(),
): ParsedCampaignName {
  const segments = segmentsOf(name);
  if (segments.length < 2) return { branch: null, branchKey: null, template: [] };
  let branch: string | null = null;
  const template: string[] = [];
  for (const segment of segments) {
    const folded = foldName(segment);
    if (branch == null && !constants.has(folded) && segmentKind(folded) === 'branch') {
      branch = segment;
      continue;
    }
    template.push(folded);
  }
  return { branch, branchKey: branch ? foldName(branch) : null, template };
}

/** The branch-like segments every one of two or more campaigns carries. */
function constantSegments(names: readonly string[]): Set<string> {
  if (names.length < 2) return new Set();
  const counts = new Map<string, number>();
  for (const name of names) {
    const seen = new Set(
      segmentsOf(name)
        .map(foldName)
        .filter((folded) => segmentKind(folded) === 'branch'),
    );
    for (const folded of seen) counts.set(folded, (counts.get(folded) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count === names.length).map(([key]) => key));
}

export type BranchGroup<T> = {
  key: string;
  /** The branch as the biggest campaign spells it. */
  label: string;
  members: T[];
};

export type BranchGrouping<T> =
  | { by: 'branch'; groups: BranchGroup<T>[]; ungrouped: T[] }
  | { by: 'campaign' };

const BRANCH_SPEND_SHARE = 0.8;

/** Groups campaigns by branch when the names show the pattern, else says to read by campaign. */
export function groupByBranch<T extends { name: string; spend: number }>(
  campaigns: readonly T[],
): BranchGrouping<T> {
  const bySpend = [...campaigns].sort((a, b) => b.spend - a.spend);
  const constants = constantSegments(bySpend.map((campaign) => campaign.name));
  const groups = new Map<string, BranchGroup<T>>();
  const ungrouped: T[] = [];
  const branchesBySegment = new Map<string, Set<string>>();
  for (const campaign of bySpend) {
    const parsed = parseCampaignName(campaign.name, constants);
    if (!parsed.branch || !parsed.branchKey) {
      ungrouped.push(campaign);
      continue;
    }
    const group = groups.get(parsed.branchKey) ?? {
      key: parsed.branchKey,
      label: parsed.branch,
      members: [],
    };
    group.members.push(campaign);
    groups.set(parsed.branchKey, group);
    for (const segment of parsed.template) {
      const branches = branchesBySegment.get(segment) ?? new Set<string>();
      branches.add(parsed.branchKey);
      branchesBySegment.set(segment, branches);
    }
  }
  const total = bySpend.reduce((sum, campaign) => sum + campaign.spend, 0);
  const grouped = [...groups.values()].reduce(
    (sum, group) => sum + group.members.reduce((inner, campaign) => inner + campaign.spend, 0),
    0,
  );
  const share =
    total > 0 ? grouped / total : (campaigns.length - ungrouped.length) / (campaigns.length || 1);
  const templated = [...branchesBySegment.values()].some((branches) => branches.size >= 2);
  if (groups.size < 2 || share < BRANCH_SPEND_SHARE || !templated) return { by: 'campaign' };
  return { by: 'branch', groups: [...groups.values()], ungrouped };
}
