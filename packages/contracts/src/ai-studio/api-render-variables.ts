import {
  API_RENDER_MEDIA_LIST_MAX,
  type ApiRenderInputValue,
  type ApiRenderVariable,
  type PinnedRenderAsset,
} from './api-renders';
import {
  apiRenderVariableHandleId,
  type GraphEdgeLike,
  type GraphNodeLike,
  variationIndexFromHandle,
} from './workflow-graph';

/**
 * Resolve an `apiRender` node's template variables from its own fields and its wiring.
 *
 * This lives in contracts because BOTH sides need the identical answer. The Canvas shows a
 * person what will be sent and gates Prepare on it; the headless runner sends it with
 * nobody watching. A second copy of "a wired source beats the typed field" is exactly the
 * drift root AGENTS.md §4 forbids — and the failure it produces is silent: a render that
 * succeeds carrying values the graph does not depict.
 *
 * Typed against `GraphNodeLike` / `GraphEdgeLike` rather than React Flow's `Edge` and the
 * Frontend's `StudioNode`, so the Backend can call it without importing the app.
 */

/** The subset of an apiRender node's data this needs. */
export interface ApiRenderVariableSource {
  readonly variableDefinitions?: readonly ApiRenderVariable[];
  readonly variables?: Record<string, ApiRenderInputValue> | undefined;
}

export interface ResolveApiRenderVariablesArgs {
  readonly nodeId: string;
  readonly data: ApiRenderVariableSource;
  readonly nodes: readonly GraphNodeLike[];
  readonly edges: readonly GraphEdgeLike[];
}

/**
 * The text an upstream node produces. Three keys because three node families spell it
 * differently — a Text Block writes `value`, a decoder writes `value`, an enriched or
 * agent-authored node writes `text`/`generatedText`.
 */
function textFromNode(node: GraphNodeLike): string | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  for (const candidate of [data.value, data.text, data.generatedText]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * The Library coordinate an upstream node holds, or null when it holds none.
 *
 * The ASSET id is what makes a pin. The version is sent when the node knows it and left
 * off when it does not: preflight resolves the head version and freezes the exact pair
 * into the signed confirmation, so an omitted version costs no reproducibility.
 *
 * Requiring both is what made the node refuse assets that were demonstrably in the
 * Library — several producers stamp an asset id without a version, and a Library asset
 * that never had its `head_version_id` materialized has no version to stamp.
 */
export function pinFromNode(
  node: GraphNodeLike,
  sourceHandle: string | null | undefined,
): PinnedRenderAsset | null {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const generated = Array.isArray(data.generatedImages)
    ? (data.generatedImages as Array<{ assetId?: unknown; assetVersionId?: unknown }>)
    : [];
  const variation = generated[variationIndexFromHandle(sourceHandle)];
  const assetId = variation?.assetId ?? data.renderOutputAssetId ?? data.assetId;
  const versionId =
    variation?.assetVersionId ?? data.renderOutputAssetVersionId ?? data.assetVersionId;
  if (typeof assetId !== 'string') return null;
  return typeof versionId === 'string' ? { assetId, versionId } : { assetId };
}

/**
 * The pins a media slot holds on the node itself — what the Library picker put there.
 *
 * Normalised to a list so the wired and the picked path resolve through the same guards.
 * Returns an empty list for anything that is not a pin, which is how a stale scalar left
 * behind by an earlier contract fails as "not saved in the Library" rather than reaching
 * the fleet as a bare string.
 */
export function pinsFromValue(value: ApiRenderInputValue | undefined): PinnedRenderAsset[] {
  if (value === undefined || value === null) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(
    (candidate): candidate is PinnedRenderAsset =>
      typeof candidate === 'object' && candidate !== null && 'assetId' in candidate,
  );
}

const ENGLISH_LABELS: Record<string, string> = {
  imagen: 'Image',
  logo: 'Logo',
  texto: 'Text',
  title: 'Title',
  titulo: 'Title',
};

export function apiRenderVariableLabel(definition: { key: string; label: string }): string {
  const key = definition.key.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return ENGLISH_LABELS[key] ?? definition.label;
}

export function resolveApiRenderVariables(args: ResolveApiRenderVariablesArgs): {
  variables: Record<string, ApiRenderInputValue>;
  errors: string[];
} {
  const variables: Record<string, ApiRenderInputValue> = {};
  const errors: string[] = [];
  const byId = new Map(args.nodes.map((node) => [node.id, node]));

  for (const definition of args.data.variableDefinitions ?? []) {
    // The server fills a reserved variable (today: `watermark_logo`, the brand's own
    // mark, content-addressed and pinned during preflight) and REFUSES a caller-supplied
    // value. Skipping it is not cosmetic: a reserved variable is `required` too, so
    // keying off `required` alone would raise "needs a version-pinned Library asset"
    // and refuse Prepare for a slot the caller is forbidden to fill.
    if (definition.reserved) continue;
    const wired = args.edges.filter(
      (candidate) =>
        candidate.target === args.nodeId &&
        candidate.targetHandle === apiRenderVariableHandleId(definition.key),
    );

    if (definition.kind === 'image' || definition.kind === 'video') {
      // A media slot fills two ways, and a WIRED source wins over the picked one — the
      // same precedence the text branch below states. Once an edge exists the canvas
      // depicts media flowing into this slot; rendering the picked asset instead would
      // produce something the graph does not show. The picked value is not discarded,
      // it goes back to being the fallback the moment the wire is removed.
      //
      // Edge order is the order the user wired them; a `multiple` port is a list the
      // renderer LOOPS over, so position is meaning, not incidental.
      const pins: Array<PinnedRenderAsset | null> =
        wired.length > 0
          ? wired.map((edge) => {
              const source = byId.get(edge.source);
              return source ? pinFromNode(source, edge.sourceHandle) : null;
            })
          : pinsFromValue(args.data.variables?.[definition.key]);

      // Three distinct ways a media slot fails, and they used to collapse into one
      // sentence — so "needs a Library asset" was shown for a slot that was merely
      // over-wired, and for one that was empty. Each says what to do instead.
      const label = apiRenderVariableLabel(definition);
      const max = definition.multiple ? API_RENDER_MEDIA_LIST_MAX : 1;
      if (pins.length > max) {
        // Dropping the extras would render a shorter list than the canvas shows —
        // succeeding, wrongly. Name where they came from: the picker caps itself at
        // `max`, so an over-filled slot is almost always over-WIRED, and saying
        // "connected" about a selection would send the user to the wrong place.
        const verb = wired.length > 0 ? 'connected' : 'selected';
        errors.push(
          definition.multiple
            ? `${label} takes at most ${max} inputs — ${pins.length} are ${verb}`
            : `${label} takes one input — ${pins.length} are ${verb}`,
        );
      } else if (pins.some((pin) => pin === null)) {
        errors.push(`${label} is connected to something that is not saved in the Library yet`);
      } else if (pins.length > 0) {
        variables[definition.key] = definition.multiple
          ? (pins as PinnedRenderAsset[])
          : (pins[0] as PinnedRenderAsset);
      } else if (definition.required) {
        errors.push(`${label} is required — connect media or choose it from the Library`);
      }
      continue;
    }

    // A wired text source WINS over the field typed on the node. The field stays as the
    // fallback for an unwired variable, but once an edge exists the canvas shows text
    // flowing into this slot — sending the inline value instead would render something
    // the graph does not depict. A wired source with nothing in it is MISSING, not empty:
    // sending '' would satisfy a required slot with a blank.
    if (definition.kind === 'text' && wired.length > 0) {
      const source = byId.get(wired[0].source);
      const text = source ? textFromNode(source) : null;
      if (text !== null) variables[definition.key] = text;
      else if (definition.required)
        errors.push(`${apiRenderVariableLabel(definition)} is required`);
      continue;
    }

    const value = args.data.variables?.[definition.key];
    if (value !== undefined && value !== '') variables[definition.key] = value;
    else if (definition.required) errors.push(`${apiRenderVariableLabel(definition)} is required`);
  }

  return { variables, errors };
}
