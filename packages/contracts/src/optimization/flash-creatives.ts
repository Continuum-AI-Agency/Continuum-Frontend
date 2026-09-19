// Flash creatives — how an Optimizer creative recommendation becomes three generated
// variants through the brand's own Creative+ workflows (saved canvas pipelines), and how
// the pieces of the argument (angle, audience, why) become the prompts those workflows
// take. Pure: the Frontend uses it to pick and request, the swap worker uses it to fill
// the pipeline's ports, and both read one ranking.
//
// A pipeline is a fit for flash images when it (1) can run headless on the server,
// (2) outputs image assets, (3) takes a text prompt, and — the tie-breaks — takes a
// negative prompt, accepts a reference image, was written for paid variations (its own
// agent guide says so), is the brand's rather than global, is cheap, and holds a high
// quality bar. Nothing here reads a node graph; the capability manifest is the contract.

import type { PipelineCapabilityV2 } from '../ai-studio/pipeline-manifest';

export type FlashWant = {
  /** Placement ratio the variants should come in: "1:1", "4:5", "9:16"; null = any. */
  ratio: string | null;
  /** Is there a winning creative to hand in as a reference? */
  hasReference: boolean;
  count: number;
};

export type FlashPipelineFit = {
  capability: PipelineCapabilityV2;
  score: number;
  reasons: string[];
};

const NEGATIVE_WORDS = /negative|avoid|exclude|dont|don_t|no_/i;
const REFERENCE_WORDS = /reference|source|winner|inspiration|example|style/i;
const PAID_WORDS = /\b(paid|ad|ads|variation|variations|flash|static|creative|meta|social)\b/i;

export function scoreFlashPipeline(
  capability: PipelineCapabilityV2,
  want: FlashWant,
): FlashPipelineFit | null {
  if (capability.execution_policy.runtime === 'client') return null;
  const imageOutputs = capability.outputs.filter((o) => o.kind === 'asset' && o.media === 'image');
  if (imageOutputs.length === 0) return null;
  const textInputs = capability.inputs.filter((i) => i.kind === 'text');
  if (textInputs.length === 0) return null;

  let score = 0;
  const reasons: string[] = [];
  const negative = textInputs.find((i) =>
    NEGATIVE_WORDS.test(`${i.semantic_role} ${i.label} ${i.description ?? ''}`),
  );
  if (negative) {
    score += 2;
    reasons.push('takes a negative prompt');
  }
  const reference = capability.inputs.find((i) => i.kind === 'asset' && i.media === 'image');
  if (reference) {
    if (want.hasReference && !reference.required) {
      score += 2;
      reasons.push('accepts a reference image');
    } else if (reference.required && !want.hasReference) {
      return null;
    } else if (want.hasReference) {
      score += 2;
      reasons.push('takes the winner as reference');
    }
  }
  const guide = capability.agent_guide;
  const guideText = [...(guide?.use_when ?? []), capability.name, capability.description ?? ''].join(
    ' ',
  );
  if (PAID_WORDS.test(guideText)) {
    score += 2;
    reasons.push('written for paid creatives');
  }
  if (capability.source === 'brand') {
    score += 1;
    reasons.push("the brand's own workflow");
  }
  const outputCount = imageOutputs.reduce((sum, o) => sum + o.count, 0);
  if (outputCount >= want.count) {
    score += 1;
    reasons.push(`${outputCount} images per run`);
  }
  score += Math.min(1, capability.quality_policy.minimum_score);
  const cents = capability.cost_policy.max_amount_minor;
  score += cents <= 100 ? 1 : cents <= 500 ? 0.5 : 0;
  if (capability.cost_policy.approval === 'always') {
    score -= 1;
    reasons.push('every run needs approval');
  }
  return { capability, score, reasons };
}

/** Best-first, distinct. Fewer workflows than asked for → the best one repeats, so the
 *  caller still gets `count` requests to place. Empty when nothing can run headless. */
export function pickFlashPipelines(
  capabilities: readonly PipelineCapabilityV2[],
  want: FlashWant,
): FlashPipelineFit[] {
  const fits = capabilities
    .map((c) => scoreFlashPipeline(c, want))
    .filter((fit): fit is FlashPipelineFit => fit !== null)
    .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name));
  if (fits.length === 0) return [];
  const out: FlashPipelineFit[] = [];
  for (let i = 0; i < want.count; i += 1) out.push(fits[i % fits.length]);
  return out;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export type FlashBrief = {
  angle: string | null;
  hook: string | null;
  audience: string | null;
  /** The evidence line: "wins at $29 per lead vs $164", "CTR down 33%, CPA up 40%". */
  why: string | null;
  cta: string | null;
  sourceAdName: string | null;
  brandName: string | null;
  /** 0-based; three variants get three deliberately different directions. */
  variant: number;
};

const DIRECTIONS = [
  'Keep the hook and the offer word for word; change the visual framing and the opening line.',
  'Keep the offer; lead with proof (a number, a testimonial line) instead of the promise.',
  'Keep the offer; make the headline a question this audience is already asking.',
];

export const FLASH_NEGATIVE_PROMPT =
  'No invented claims, prices, dates or statistics. No competitor names. No misspelled or ' +
  'altered brand name or logo. No extra logos, watermarks or stock-photo look. No text ' +
  'running off the frame; no more than one headline and one call to action. Nothing off-brand ' +
  'in tone or colour.';

export function flashPrompts(brief: FlashBrief): { positive: string; negative: string } {
  const parts: string[] = [];
  parts.push(
    brief.sourceAdName
      ? `Make a paid-social image ad that iterates on the ad "${brief.sourceAdName}".`
      : 'Make a paid-social image ad for this ad set.',
  );
  if (brief.angle) parts.push(`Communication angle to keep: ${brief.angle}.`);
  if (brief.hook) parts.push(`Hook type: ${brief.hook}.`);
  if (brief.audience) parts.push(`Audience: ${brief.audience}.`);
  if (brief.why) parts.push(`Why now: ${brief.why}.`);
  if (brief.cta) parts.push(`Call to action: ${brief.cta}.`);
  parts.push(DIRECTIONS[((brief.variant % DIRECTIONS.length) + DIRECTIONS.length) % DIRECTIONS.length]);
  if (brief.brandName) parts.push(`In ${brief.brandName}'s voice.`);
  return { positive: parts.join(' '), negative: FLASH_NEGATIVE_PROMPT };
}

// ---------------------------------------------------------------------------
// Port assignment — the same rule for a capability's inputs and a manifest's ports.
// ---------------------------------------------------------------------------

export type PortLike = {
  id: string;
  kind: 'text' | 'asset' | 'element' | (string & {});
  label?: string | null;
  role?: string | null;
  required: boolean;
  /** Asset ports: how many items they take. */
  maxItems?: number | null;
};

export type PortAssignment =
  | { portId: string; text: string }
  | { portId: string; assetIds: string[] };

/** Fill a workflow's ports from the prompts and references. The first text port (or the one
 *  that names the prompt) takes the positive prompt; a port that names the negative takes the
 *  negative; every other text port takes the positive, so a required port is never left
 *  empty. Image asset ports take the references, up to their capacity. Returns null when a
 *  required port cannot be filled — the caller then refuses instead of running half-fed. */
export function assignFlashPorts(
  ports: readonly PortLike[],
  prompts: { positive: string; negative: string },
  referenceAssetIds: readonly string[],
): PortAssignment[] | null {
  const out: PortAssignment[] = [];
  let positiveGiven = false;
  for (const port of ports) {
    const words = `${port.role ?? ''} ${port.label ?? ''}`;
    if (port.kind === 'text') {
      if (NEGATIVE_WORDS.test(words)) {
        out.push({ portId: port.id, text: prompts.negative });
      } else {
        out.push({ portId: port.id, text: prompts.positive });
        positiveGiven = true;
      }
      continue;
    }
    if (port.kind === 'asset') {
      const take = referenceAssetIds.slice(0, Math.max(1, port.maxItems ?? 1));
      if (take.length > 0 && (REFERENCE_WORDS.test(words) || !port.required || true)) {
        out.push({ portId: port.id, assetIds: take });
        continue;
      }
      if (port.required) return null;
      continue;
    }
    if (port.required) return null;
  }
  return positiveGiven ? out : null;
}

// ---------------------------------------------------------------------------
// What a finished flash job carries in `result`, read leniently: older jobs have only the
// primary asset; flash jobs list every output and the canvas room they ran in.
// ---------------------------------------------------------------------------

export type FlashJobResult = {
  assetIds: string[];
  /** The canvas room the pipeline ran in, kept so "Edit" can open it. Null when swept. */
  roomId: string | null;
  publishedToMeta: boolean;
  adId: string | null;
};

export function readFlashJobResult(
  job: { asset_id?: string | null; result?: Record<string, unknown> | null },
): FlashJobResult {
  const result = job.result ?? {};
  const listed = Array.isArray(result.assets)
    ? (result.assets as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
  const primary = typeof job.asset_id === 'string' && job.asset_id ? job.asset_id : null;
  const assetIds = primary && !listed.includes(primary) ? [primary, ...listed] : listed;
  return {
    assetIds,
    roomId: typeof result.roomId === 'string' && result.roomId ? result.roomId : null,
    publishedToMeta: result.publishedToMeta === true,
    adId: typeof result.adId === 'string' ? result.adId : null,
  };
}
