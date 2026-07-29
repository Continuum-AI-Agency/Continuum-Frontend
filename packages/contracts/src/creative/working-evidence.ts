// What the agent already learned, carried into generation instead of thrown away.
//
// The organic agent does real analysis before it generates — hook rate, top posts,
// competitor creatives, KPI movement. Until now the only places to put any of that were
// `angle` (one line), `hook` (one string) and a batch-wide `guidancePrompt`, so a ranked
// set of proven hooks and CTAs had to be compressed into a sentence and hoped for.
//
// Deliberately loose: every field optional, no caps, no `.strict()`. This is a wire DTO
// and the agent knows what it is doing — the value here is the field NAMES telling it
// what is worth carrying, not a validator second-guessing its analysis. Prose in any
// field is fine.

import { z } from 'zod';

export const workingEvidenceSchema = z.object({
  provenHooks: z
    .array(z.string())
    .optional()
    .describe(
      'Opening lines that measurably held attention for this account, in their original wording.',
    ),
  provenCtas: z
    .array(z.string())
    .optional()
    .describe('Calls to action that measurably converted, worded as they actually ran.'),
  valueProps: z
    .array(z.string())
    .optional()
    .describe('Value propositions the audience responded to, phrased as the audience heard them.'),
  referenceAssetIds: z
    .array(z.string())
    .optional()
    .describe(
      'Durable Library asset ids worth drawing the look from — a past winner, a saved competitor frame. Ids, never signed URLs.',
    ),
  basis: z
    .string()
    .optional()
    .describe('Where this came from, in one line ("top 5 reels by hook rate, last 30 days").'),
});
export type WorkingEvidence = z.infer<typeof workingEvidenceSchema>;

const bullets = (label: string, values?: string[]): string[] =>
  values && values.length > 0 ? [`${label}:`, ...values.map((value) => `- ${value}`)] : [];

/**
 * The evidence as a guidance block the generation stages read.
 *
 * Phrased as "reuse what worked" because the failure mode is a model treating a proven
 * hook as inspiration and paraphrasing the winning part straight back out of it.
 */
export function renderWorkingEvidence(evidence: WorkingEvidence | null | undefined): string {
  if (!evidence) return '';
  const lines = [
    ...bullets(
      'Hooks that worked for this account — reuse the structure, not a paraphrase',
      evidence.provenHooks,
    ),
    ...bullets(
      'Calls to action that converted — keep the wording that earned the click',
      evidence.provenCtas,
    ),
    ...bullets('Value propositions the audience responded to', evidence.valueProps),
  ];
  if (lines.length === 0) return '';
  if (evidence.basis) lines.push(`Basis: ${evidence.basis}.`);
  return ['What is already working (measured, not assumed):', ...lines].join('\n');
}
