// Grid card presentation a user picks once and keeps (media.library_view_preferences
// → config.card): how big a card is, what shape its media box takes, and which facts
// sit under it. Built-in field keys are fixed words; any other key is a custom field id.

import type { CollectionViewConfig } from '@continuum/contracts';

export type CardViewOptions = NonNullable<CollectionViewConfig['card']>;
export type CardSize = NonNullable<CardViewOptions['size']>;
export type CardAspect = NonNullable<CardViewOptions['aspect']>;

export const CARD_SIZES: readonly { value: CardSize; label: string; minWidthPx: number }[] = [
  { value: 'sm', label: 'Small', minWidthPx: 150 },
  { value: 'md', label: 'Medium', minWidthPx: 210 },
  { value: 'lg', label: 'Large', minWidthPx: 300 },
];

export const CARD_ASPECTS: readonly {
  value: CardAspect;
  label: string;
  className: string | null;
}[] = [
  // null = the asset's own ratio, which is what the grid did before card options.
  { value: 'original', label: 'Original', className: null },
  { value: 'square', label: 'Square', className: 'aspect-square' },
  { value: 'portrait', label: 'Portrait', className: 'aspect-[4/5]' },
  { value: 'landscape', label: 'Landscape', className: 'aspect-video' },
];

export const BUILT_IN_CARD_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'size', label: 'File size' },
  { key: 'duration', label: 'Duration' },
  { key: 'review', label: 'Review status' },
  { key: 'created', label: 'Created date' },
] as const;

export type BuiltInCardField = (typeof BUILT_IN_CARD_FIELDS)[number]['key'];

const BUILT_IN_KEYS = new Set<string>(BUILT_IN_CARD_FIELDS.map((field) => field.key));

// What a card showed before it was configurable.
export const DEFAULT_CARD_FIELDS: readonly string[] = ['title', 'created'];

export function visibleCardFields(card: CardViewOptions | undefined): readonly string[] {
  return card?.fields ?? DEFAULT_CARD_FIELDS;
}

/** The chosen custom field ids, in the order the user picked them. */
export function chosenCustomFieldIds(card: CardViewOptions | undefined): string[] {
  return visibleCardFields(card).filter((key) => !BUILT_IN_KEYS.has(key));
}

export function toggleCardField(fields: readonly string[], key: string): string[] {
  return fields.includes(key) ? fields.filter((field) => field !== key) : [...fields, key];
}

/** Inline grid template for a chosen size; undefined keeps the breakpoint columns. */
export function cardGridTemplate(size: CardSize | undefined): string | undefined {
  const minWidth = CARD_SIZES.find((option) => option.value === size)?.minWidthPx;
  return minWidth ? `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))` : undefined;
}

/** Media-box class for a chosen aspect; null means "use the asset's own ratio". */
export function cardAspectClass(aspect: CardAspect | undefined): string | null {
  return CARD_ASPECTS.find((option) => option.value === aspect)?.className ?? null;
}

export function formatDurationMs(durationMs: number | null | undefined): string | null {
  if (durationMs == null || durationMs <= 0) return null;
  const total = Math.round(durationMs / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
