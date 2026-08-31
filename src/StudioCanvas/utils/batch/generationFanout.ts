// Fan a GENERATOR out over a batch.
//
// Wave 2 built the fan-out around the `action` branch only (`collectionInputFor` +
// `fanOut` in executeWorkflow). A generator never looked at a collection, and
// `imageRefFromOutput` matches only `image`/`images` — so a batch wired into `nanoGen`
// resolved to NO reference image at all and generated the same picture N times, or
// nothing. This closes that.
//
// The trick that keeps it small: do NOT re-implement payload building. A collection is
// swapped for ONE of its items in a shallow copy of the resolved-output map, and the
// existing single-item path (`buildNanoGenPayload` / `buildVeoPayload`) runs unchanged.
// Every reference rule, prompt injection, model coercion and size correction therefore
// behaves identically for a batch item and for a plain node — because it IS the same
// code.

import { type BatchCombine, type BatchItemKind, MAX_BATCH_ITEMS } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';

import type { BackendChatImageRequestPayload } from '@/lib/types/chatImage';
import type { StudioNode } from '../../types';
import type { NodeOutput } from '../../types/execution';
import { fanOut } from './fanout';

type CollectionOutput = Extract<NodeOutput, { type: 'collection' }>;

const isCollection = (output: NodeOutput | undefined): output is CollectionOutput =>
  output?.type === 'collection';

/** One end of a pairing: the node whose stored output is a collection. */
export interface BatchSource {
  readonly nodeId: string;
  readonly output: CollectionOutput;
}

export interface BatchPairPlan {
  readonly pairIndex: number;
  readonly leftIndex: number;
  readonly rightIndex?: number;
  readonly left: NodeOutput;
  readonly right?: NodeOutput;
  readonly label: string;
}

export interface BatchGenerationPlan {
  readonly primary: BatchSource;
  readonly partner?: BatchSource;
  readonly combine: BatchCombine;
  readonly itemType: BatchItemKind;
  readonly pairs: BatchPairPlan[];
  /** True when the cap cut the run short — surfaced, never applied silently. */
  readonly truncated: boolean;
}

/**
 * Where a pair's RIGHT item sits in the partner batch.
 *
 * `materializeBatch` has already combined the two batches by the time we get here: the
 * primary's collection IS the pair sequence, projected onto its left sides. So the only
 * thing missing is the right index, and the contracts' two orderings make that a one-
 * liner — `crossBatches` is row-major over the left, `zipBatches` is positional.
 *
 * Derived rather than recomputed on purpose: recomputing the whole product here would be
 * a second implementation of the pairing that could disagree with the one that actually
 * decided the run order.
 */
export function rightIndexFor(
  combine: BatchCombine,
  pairIndex: number,
  rightCount: number,
): number | undefined {
  if (rightCount <= 0) return undefined;
  return combine === 'cross' ? pairIndex % rightCount : pairIndex;
}

/**
 * The collections feeding `nodeId`, and which of them is the pairing's primary.
 *
 * The primary is the batch that another collection source is wired INTO — the same
 * partner rule `materializeBatch` uses, so the node that combined is the node whose
 * `data.combine` decides how. With a single collection there is no pairing and the run
 * is one pass per item.
 */
export function collectionSourcesFor(
  nodeId: string,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
): { primary: BatchSource; partner?: BatchSource; combine: BatchCombine } | undefined {
  const sources: BatchSource[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    if (seen.has(edge.source)) continue;
    const output = resolvedOutputs.get(edge.source);
    if (!isCollection(output)) continue;
    seen.add(edge.source);
    sources.push({ nodeId: edge.source, output });
  }

  if (sources.length === 0) return undefined;

  const combineOf = (source: BatchSource): BatchCombine => {
    const value = (nodeById.get(source.nodeId)?.data as Record<string, unknown> | undefined)
      ?.combine;
    return value === 'cross' ? 'cross' : 'zip';
  };

  if (sources.length === 1) {
    return { primary: sources[0], combine: combineOf(sources[0]) };
  }

  // Two (or more) collections reach this node. The one that has another of them wired
  // into it is the combined batch; the other is its partner.
  for (const candidate of sources) {
    const feeders = edges
      .filter((edge) => edge.target === candidate.nodeId)
      .map((edge) => edge.source);
    const partner = sources.find(
      (other) => other.nodeId !== candidate.nodeId && feeders.includes(other.nodeId),
    );
    if (partner) return { primary: candidate, partner, combine: combineOf(candidate) };
  }

  // Two unrelated collections with no pairing between them. Fanning over the first and
  // silently freezing the second would be a guess; the first is the one whose order the
  // executor already materialized, so it leads and the other is left as it resolved.
  return { primary: sources[0], combine: combineOf(sources[0]) };
}

/** The full work-list for one fanned-out generation. */
export function batchGenerationPlan(discovered: {
  primary: BatchSource;
  partner?: BatchSource;
  combine: BatchCombine;
}): BatchGenerationPlan | undefined {
  const { primary, partner, combine } = discovered;
  const leftItems = primary.output.items;
  if (leftItems.length === 0) return undefined;

  const rightCount = partner?.output.items.length ?? 0;
  const capped = Math.min(leftItems.length, MAX_BATCH_ITEMS);

  const pairs: BatchPairPlan[] = [];
  for (let pairIndex = 0; pairIndex < capped; pairIndex += 1) {
    const rightIndex = partner ? rightIndexFor(combine, pairIndex, rightCount) : undefined;
    pairs.push({
      pairIndex,
      // `materializeBatch` projected the pair sequence onto its left sides, so the
      // primary's item index IS the pair index.
      leftIndex: pairIndex,
      rightIndex,
      left: leftItems[pairIndex],
      right: rightIndex === undefined ? undefined : partner?.output.items[rightIndex],
      label: primary.output.labels?.[pairIndex] ?? `Item ${pairIndex + 1}`,
    });
  }

  return {
    primary,
    partner,
    combine,
    itemType: primary.output.itemType,
    pairs,
    truncated: leftItems.length > MAX_BATCH_ITEMS,
  };
}

/**
 * `resolvedOutputs` with the batch collections replaced by ONE pair's items.
 *
 * A shallow copy, two writes. Everything else the payload builder reads — the prompt
 * node, the other reference edges, the brand — is untouched and shared, so a run over 40
 * items does not re-resolve them 40 times.
 */
export function substituteCollections(
  resolvedOutputs: Map<string, NodeOutput>,
  plan: BatchGenerationPlan,
  pair: BatchPairPlan,
): Map<string, NodeOutput> {
  const perItem = new Map(resolvedOutputs);
  perItem.set(plan.primary.nodeId, pair.left);
  if (plan.partner && pair.right) perItem.set(plan.partner.nodeId, pair.right);
  return perItem;
}

// ---------------------------------------------------------------------------
// What the finished run leaves on the consuming node
// ---------------------------------------------------------------------------

/** A matrix axis header, persisted on the consuming node so the grid survives a reload. */
export interface BatchAxisEntry {
  readonly index: number;
  readonly label: string;
  readonly url?: string;
}

export interface BatchResultItem {
  readonly pairIndex: number;
  readonly leftIndex: number;
  readonly rightIndex?: number;
  readonly label: string;
  readonly status: 'completed' | 'failed';
  readonly url?: string;
  readonly assetId?: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly error?: string;
}

export interface BatchRunRecord {
  readonly combine: BatchCombine;
  readonly itemType: BatchItemKind;
  readonly left: BatchAxisEntry[];
  readonly right: BatchAxisEntry[];
  readonly items: BatchResultItem[];
  readonly completed: number;
  readonly failed: number;
  readonly truncated: boolean;
}

/** Axis headers are stored flat — never the base64, which would put megabytes of image
 *  into `canvas_sessions` on every autosave. */
const axisEntries = (source: BatchSource | undefined): BatchAxisEntry[] => {
  if (!source) return [];
  return source.output.items.map((item, index) => ({
    index,
    label: source.output.labels?.[index] ?? `Item ${index + 1}`,
    url: item.type === 'image' || item.type === 'video' ? item.url : undefined,
  }));
};

const resultFromOutput = (
  pair: BatchPairPlan,
  output: NodeOutput | null,
  error?: string,
): BatchResultItem => {
  const base = {
    pairIndex: pair.pairIndex,
    leftIndex: pair.leftIndex,
    rightIndex: pair.rightIndex,
    label: pair.label,
  };
  if (!output) return { ...base, status: 'failed', error };
  if (output.type === 'text') return { ...base, status: 'completed', text: output.value };
  if (output.type === 'video')
    return { ...base, status: 'completed', url: output.url, assetId: output.assetId };
  if (output.type === 'image')
    return {
      ...base,
      status: 'completed',
      url: output.url,
      assetId: output.assetId,
      mimeType: output.mimeType,
    };
  if (output.type === 'images') {
    const first = output.items[0];
    return {
      ...base,
      status: 'completed',
      url: first?.url,
      assetId: first?.assetId,
      mimeType: first?.mimeType,
    };
  }
  return { ...base, status: 'failed', error: 'nested collection' };
};

/** Just the generator surface this needs — typed structurally so the module does not have
 *  to import the execution hook (and drag a React dependency into the run path). */
export interface BatchGenerationDeps {
  /**
   * The modality the GENERATOR emits — never the batch's `itemType`.
   *
   * The same trap the action branch documents: a batch of text prompts fanned through
   * `nanoGen` produces IMAGES, and labelling that collection `text` would send every
   * downstream consumer looking for a string. The input's kind says nothing about the
   * output's.
   */
  outputItemType: BatchItemKind;
  buildPayload(
    node: StudioNode,
    resolved: Map<string, NodeOutput>,
  ): BackendChatImageRequestPayload | null;
  executeGeneration(
    executionId: string,
    payload: BackendChatImageRequestPayload,
  ): Promise<{ success: boolean; output?: NodeOutput; error?: string }>;
  onProgress?(record: BatchRunRecord): void;
}

export interface BatchGenerationResult {
  readonly output: CollectionOutput;
  readonly record: BatchRunRecord;
}

/**
 * Runs one generation per pair, three at a time, and emits a collection of the results.
 *
 * The execution id is `${nodeId}::b${index}`, deliberately synthetic:
 * `executeGeneration` keys its abort-controller and reader maps by the id it is handed,
 * so three concurrent calls under ONE real node id would overwrite each other's
 * controllers and the first `finally` would delete the third's. `cancelAll` iterates
 * every controller in the map, so Cancel still reaches all of them.
 */
export async function runGenerationFanOut(
  node: StudioNode,
  plan: BatchGenerationPlan,
  resolvedOutputs: Map<string, NodeOutput>,
  deps: BatchGenerationDeps,
): Promise<BatchGenerationResult | undefined> {
  const left = axisEntries(plan.primary);
  const right = axisEntries(plan.partner);
  const results: BatchResultItem[] = plan.pairs.map((pair) => ({
    pairIndex: pair.pairIndex,
    leftIndex: pair.leftIndex,
    rightIndex: pair.rightIndex,
    label: pair.label,
    status: 'failed',
    error: 'not run yet',
  }));

  const snapshot = (): BatchRunRecord => ({
    combine: plan.combine,
    itemType: plan.itemType,
    left,
    right,
    items: [...results],
    completed: results.filter((item) => item.status === 'completed').length,
    failed: results.filter((item) => item.status === 'failed' && item.error !== 'not run yet')
      .length,
    truncated: plan.truncated,
  });

  const fan = await fanOut(
    plan.pairs,
    async (pair) => {
      const perItem = substituteCollections(resolvedOutputs, plan, pair);
      const payload = deps.buildPayload(node, perItem);
      if (!payload) throw new Error('This batch item has no usable prompt or reference');
      const result = await deps.executeGeneration(`${node.id}::b${pair.pairIndex}`, payload);
      if (!result.success || !result.output) {
        throw new Error(result.error ?? 'Generation returned no output');
      }
      results[pair.pairIndex] = resultFromOutput(pair, result.output);
      deps.onProgress?.(snapshot());
      return result.output;
    },
    { pool: 3, cap: MAX_BATCH_ITEMS },
  );

  // `fanOut` isolates a rejection to its own slot, so a 40-item batch where item 7 fails
  // still delivers 39. Record the failures by name rather than folding them away.
  fan.results.forEach((output, index) => {
    if (output === null && results[index]?.error === 'not run yet') {
      results[index] = resultFromOutput(plan.pairs[index], null, 'Generation failed');
    }
  });

  const produced = fan.results.filter((output): output is NodeOutput => output !== null);
  if (produced.length === 0) return undefined;

  const record = snapshot();
  deps.onProgress?.(record);

  return {
    output: {
      type: 'collection',
      itemType: deps.outputItemType,
      items: produced,
      labels: plan.pairs
        .filter((_, index) => fan.results[index] !== null)
        .map((pair) => pair.label),
    },
    record,
  };
}
