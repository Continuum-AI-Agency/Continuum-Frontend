// Elements as canvas-composer @-mentions.
//
// An Element is a named, reusable subject — a model, a product, a place, a style —
// whose EMISSION RULES live in `@continuum/contracts`: `resolveElementRefs` decides
// pinned-reference vs. raw-member fallback, `buildElementReferenceLabel` writes the
// prose that names the image. Both are imported here, never re-derived. An Element
// that resolves one way in the mention menu and another way on `ElementNode` is
// exactly the drift that package exists to prevent.
//
// WHY a mention becomes `media_asset` references rather than a new wire type:
// `agentMentionReferenceTypeSchema` has no `element` member, and the canvas composer
// does not need one. It already resolves a `media_asset` grab server-side —
// `loadCanvasAssetsById` → `add_node` + `attach_media` → an edge with `role:
// 'ref-images'` into the generator. An Element's refs ARE library asset ids, so the
// mention is RESOLVED at pick time into the ids that path already accepts, with the
// Element's identity riding in `metadata` so the composer can still say which
// Elements grounded the turn.
//
// Reference material: docs/research/element-reference-generation.md §9 (fallback
// semantics, the person ceiling, the label requirement, "a missing Element is not an
// empty one").

import type { AgentMentionReference, ElementCategory, ElementRecord } from '@continuum/contracts';
import {
  buildElementReferenceLabel,
  ELEMENT_CATEGORIES,
  elementCategorySchema,
  resolveElementRefs,
} from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import { ELEMENT_CATEGORY_LABEL } from '@/lib/ai-studio/elements';

export const ELEMENTS_ROOT_KEY = 'canvas-context:elements';
export const ELEMENT_CATEGORY_FOLDER_PREFIX = 'canvas-context:elements:';
export const ELEMENT_MENTION_KEY_PREFIX = 'canvas-element:';

/** `canvasComposeRequestSchema.prompt` is `.max(4000)` — the grounding block rides in it. */
const PROMPT_MAX_CHARS = 4000;

/** What one mentioned Element contributes, read back off the reference it produced. */
export interface ElementMentionGrounding {
  elementId: string;
  name: string;
  category: ElementCategory;
  /** The resolved refs, in emission order: one when pinned, members otherwise. */
  assetIds: string[];
  mode: 'pinned' | 'fallback';
  /** Members the fallback ceiling left behind. Silent truncation reads as randomness. */
  droppedCount: number;
}

export const elementCategoryFolderKey = (category: ElementCategory): string =>
  `${ELEMENT_CATEGORY_FOLDER_PREFIX}${category}`;

export function parseElementCategoryFolderKey(key: string): ElementCategory | null {
  if (!key.startsWith(ELEMENT_CATEGORY_FOLDER_PREFIX)) return null;
  const parsed = elementCategorySchema.safeParse(key.slice(ELEMENT_CATEGORY_FOLDER_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

/**
 * One Element as a mention suggestion.
 *
 * `null` when the Element resolves to nothing — no pinned reference and no members.
 * Offering it would hand the composer a grab that contributes zero images, which is
 * the §9.6 failure: a node that generates something plausible and wrong.
 */
export function elementToCanvasMentionSuggestion(
  element: ElementRecord,
): AgentMentionSuggestion | null {
  const assetIds = resolveElementRefs(element).map((ref) => ref.asset_id);
  if (assetIds.length === 0) return null;

  const pinned = Boolean(element.defaultReferenceAssetId);
  const droppedCount = pinned ? 0 : Math.max(0, element.members.length - assetIds.length);
  const categoryLabel = ELEMENT_CATEGORY_LABEL[element.category];

  return {
    key: `${ELEMENT_MENTION_KEY_PREFIX}${element.id}`,
    label: element.name,
    type: 'media_asset',
    source: 'canvas',
    group: `Elements · ${categoryLabel}`,
    description: pinned
      ? `${categoryLabel} · pinned reference`
      : [
          `${categoryLabel} · ${assetIds.length} image${assetIds.length === 1 ? '' : 's'}`,
          droppedCount > 0 ? `${droppedCount} over the limit` : null,
        ]
          .filter(Boolean)
          .join(' · '),
    badge: 'element',
    reference: {
      id: assetIds[0] as string,
      type: 'media_asset',
      label: element.name,
      source: 'canvas',
      metadata: {
        kind: 'image',
        elementId: element.id,
        elementName: element.name,
        elementCategory: element.category,
        elementAssetIds: assetIds,
        elementMode: pinned ? 'pinned' : 'fallback',
        elementDropped: droppedCount,
      },
    },
  };
}

/** Groups the brand's Elements by category, in the canonical category order. */
export function elementSuggestionsByCategory(
  elements: readonly ElementRecord[],
): Map<ElementCategory, AgentMentionSuggestion[]> {
  const grouped = new Map<ElementCategory, AgentMentionSuggestion[]>();
  for (const category of ELEMENT_CATEGORIES) {
    const bucket = elements
      .filter((element) => element.category === category)
      .map(elementToCanvasMentionSuggestion)
      .filter((suggestion): suggestion is AgentMentionSuggestion => suggestion !== null);
    if (bucket.length > 0) grouped.set(category, bucket);
  }
  return grouped;
}

/** The Element behind a reference, or `null` for an ordinary media/skill/signal grab. */
export function readElementMention(
  reference: AgentMentionReference,
): ElementMentionGrounding | null {
  const metadata = reference.metadata;
  if (!metadata) return null;
  if (typeof metadata.elementId !== 'string') return null;

  const assetIds = Array.isArray(metadata.elementAssetIds)
    ? metadata.elementAssetIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (assetIds.length === 0) return null;

  const category = elementCategorySchema.safeParse(metadata.elementCategory);
  if (!category.success) return null;

  return {
    elementId: metadata.elementId,
    name: typeof metadata.elementName === 'string' ? metadata.elementName : reference.label,
    category: category.data,
    assetIds,
    mode: metadata.elementMode === 'pinned' ? 'pinned' : 'fallback',
    droppedCount: typeof metadata.elementDropped === 'number' ? metadata.elementDropped : 0,
  };
}

export interface ExpandedElementMentions {
  /** The turn's references with every Element's remaining refs attached after it. */
  references: AgentMentionReference[];
  /** One `buildElementReferenceLabel` line per Element, in mention order. */
  grounding: string;
  /** What grounded this turn, for the composer's provenance chips. */
  elements: ElementMentionGrounding[];
}

/**
 * Expand each Element mention into the refs it actually emits.
 *
 * The picked reference already carries the Element's FIRST ref (so the `@name` chip
 * resolves and the label the model reads is the Element's name); a fallback Element
 * contributes the rest here. Slot numbers count images in submission order, which is
 * the order the composer materializes and lists them for the model — so
 * "product shot of @model holding @product" numbers both correctly.
 */
export function expandElementMentions(
  references: readonly AgentMentionReference[],
): ExpandedElementMentions {
  const expanded: AgentMentionReference[] = [];
  const elements: ElementMentionGrounding[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    const element = readElementMention(reference);
    if (!element) {
      expanded.push(reference);
      continue;
    }
    // The same Element mentioned twice is one grab: it would otherwise repeat its
    // grounding line and burn a second copy of every ref against the 20-ref cap.
    if (seen.has(element.elementId)) continue;
    seen.add(element.elementId);

    elements.push(element);
    expanded.push(reference);
    for (let index = 1; index < element.assetIds.length; index += 1) {
      expanded.push({
        id: element.assetIds[index] as string,
        type: 'media_asset',
        label: `${element.name} (${index + 1}/${element.assetIds.length})`,
        source: reference.source,
        metadata: {
          kind: 'image',
          elementId: element.elementId,
          elementMemberPosition: index,
        },
      });
    }
  }

  const slots = new Map<string, number>();
  let slot = 0;
  for (const reference of expanded) {
    if (reference.type !== 'media_asset') continue;
    slot += 1;
    if (!slots.has(reference.id)) slots.set(reference.id, slot);
  }

  const grounding = elements
    .map((element) => {
      const first = slots.get(element.assetIds[0] as string) ?? 1;
      const line = buildElementReferenceLabel({
        category: element.category,
        name: element.name,
        slot: first,
      });
      // A fallback Element spans several slots; without saying so the model is left to
      // decide on its own whether those images are one subject or several.
      if (element.assetIds.length === 1) return line;
      const last = first + element.assetIds.length - 1;
      return `${line} Reference images #${first}–#${last} are all the same ${element.category}.`;
    })
    .join('\n');

  return { references: expanded, grounding, elements };
}

/**
 * Ride the grounding into the wire prompt.
 *
 * The composer's model reads the prompt plus a line per grabbed asset (`asset_id=…
 * label="…"`); nothing else tells it that image #3 is a person it must preserve.
 * Lines are dropped from the END when the block would push the prompt past the
 * schema's 4000-char ceiling — a rejected request grounds nothing at all.
 */
export function appendElementGrounding(prompt: string, grounding: string): string {
  if (!grounding.trim()) return prompt;
  const lines = grounding.split('\n');
  while (lines.length > 0) {
    const block = `\n\n<elements>\n${lines.join('\n')}\n</elements>`;
    if (prompt.length + block.length <= PROMPT_MAX_CHARS) return `${prompt}${block}`;
    lines.pop();
  }
  return prompt;
}
