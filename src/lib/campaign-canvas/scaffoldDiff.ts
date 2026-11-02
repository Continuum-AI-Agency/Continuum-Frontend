// The Backend's per-node diff of a campaign copy, carried from the chat to the canvas.
//
// A copy proposed by Jaina (`paid_scaffold_propose_duplicate`) lands in the chat as a
// `paid.campaign_structure` part with layout 'diff': every node of the copy keyed by path key,
// marked added / changed / unchanged against the live campaign. The canvas beside the chat
// marks its nodes from it (`scaffoldMarksOf`), so a copy with test ad sets shows exactly what
// the Backend added, not a guess from copied audiences. Pure: no React, no store.

import type { CampaignStructurePayload, StructureDiff } from '@continuum/contracts';

/** A diff and the scaffold it was drawn for. */
export type ScaffoldStructureDiff = {
  /** `paid_scaffolds.id` — the parent, so a later version of the same copy still finds it. */
  parentScaffoldId: string;
  /** `paid_scaffold_versions.id` the Backend drew it for. */
  scaffoldVersionId: string;
  diff: StructureDiff;
};

type MessageWithStructures = { campaignStructures?: readonly CampaignStructurePayload[] };

/** The diff a structure part carries, with the scaffold it belongs to; null for other layouts. */
export const scaffoldStructureDiffOf = (
  structure: CampaignStructurePayload,
): ScaffoldStructureDiff | null =>
  structure.layout === 'diff' && structure.diff && structure.parentScaffoldId
    ? {
        parentScaffoldId: structure.parentScaffoldId,
        scaffoldVersionId: structure.scaffoldId,
        diff: structure.diff,
      }
    : null;

/** The newest diff the thread drew for this scaffold, or null when it drew none. */
export const latestStructureDiffFor = (
  messages: readonly MessageWithStructures[],
  parentScaffoldId: string,
): ScaffoldStructureDiff | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const structures = messages[index]?.campaignStructures ?? [];
    for (let at = structures.length - 1; at >= 0; at -= 1) {
      const structure = structures[at];
      const found = structure ? scaffoldStructureDiffOf(structure) : null;
      if (found && found.parentScaffoldId === parentScaffoldId) return found;
    }
  }
  return null;
};

/**
 * The diff for the graph on the canvas, or null when the canvas holds another scaffold — a
 * diff keyed by path keys marks the wrong nodes on any graph but its own.
 */
export const diffForCanvas = (
  structureDiff: ScaffoldStructureDiff | null | undefined,
  hydration: { scaffoldId: string } | null | undefined,
): StructureDiff | null =>
  structureDiff && hydration && hydration.scaffoldId === structureDiff.parentScaffoldId
    ? structureDiff.diff
    : null;
