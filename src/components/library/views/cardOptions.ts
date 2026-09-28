// Grid card presentation a user picks once and keeps (media.library_view_preferences
// → config.card): how big a card is, what shape its media box takes, and which facts
// sit under it. Built-in field keys are fixed words; any other key is a custom field id.
// The same chosen keys add List columns, and cardFieldValue formats a built-in field for
// every surface (card, List, info panel), so a fact reads the same everywhere.

import type {
  CollectionViewConfig,
  DynamicRange,
  MediaAsset,
  MediaKind,
} from '@continuum/contracts';
import { SOURCE_LABEL } from '@/lib/media/filters';
import { fileExtension, formatBytes } from '../detail/assetFileMeta';

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

export type LibraryFieldGroup = 'file' | 'video' | 'audio' | 'document' | 'workflow';

type BuiltInField = {
  key: string;
  label: string;
  group: LibraryFieldGroup;
  /** The info panel lists the field for these kinds even while it is empty. */
  kinds?: readonly MediaKind[];
};

const VIDEO: readonly MediaKind[] = ['video'];
const AV: readonly MediaKind[] = ['video', 'audio'];
const VISUAL: readonly MediaKind[] = ['image', 'video'];

// Every built-in fact a card, a List column or the info panel can show — Frame.io's
// built-in fields as far as we hold them (Rating and Assignee are custom fields here).
export const BUILT_IN_CARD_FIELDS = [
  { key: 'title', label: 'Title', group: 'file' },
  { key: 'fileName', label: 'Source filename', group: 'file' },
  { key: 'kind', label: 'File type', group: 'file' },
  { key: 'format', label: 'Format', group: 'file' },
  { key: 'size', label: 'File size', group: 'file' },
  { key: 'dimensions', label: 'Resolution', group: 'file', kinds: VISUAL },
  { key: 'duration', label: 'Duration', group: 'file', kinds: AV },
  { key: 'pageCount', label: 'Page count', group: 'document' },
  { key: 'source', label: 'Source', group: 'file' },
  { key: 'uploader', label: 'Uploader', group: 'file' },
  { key: 'created', label: 'Date uploaded', group: 'file' },
  { key: 'updated', label: 'Updated', group: 'file' },
  { key: 'videoCodec', label: 'Video codec', group: 'video', kinds: VIDEO },
  { key: 'frameRate', label: 'Frame rate', group: 'video', kinds: VIDEO },
  { key: 'bitRate', label: 'Bit rate', group: 'video', kinds: AV },
  { key: 'videoBitRate', label: 'Video bit rate', group: 'video', kinds: VIDEO },
  { key: 'colorSpace', label: 'Color space', group: 'video', kinds: VISUAL },
  { key: 'dynamicRange', label: 'Dynamic range', group: 'video', kinds: VIDEO },
  { key: 'bitDepth', label: 'Bit depth', group: 'video', kinds: VISUAL },
  { key: 'hasAlpha', label: 'Alpha channel', group: 'video', kinds: VISUAL },
  { key: 'startTimecode', label: 'Start time', group: 'video', kinds: VIDEO },
  { key: 'endTimecode', label: 'End time', group: 'video', kinds: VIDEO },
  { key: 'audioCodec', label: 'Audio codec', group: 'audio', kinds: AV },
  { key: 'audioBitRate', label: 'Audio bit rate', group: 'audio', kinds: AV },
  { key: 'audioChannels', label: 'Channels', group: 'audio', kinds: AV },
  { key: 'audioSampleRate', label: 'Sample rate', group: 'audio', kinds: AV },
  { key: 'audioBitDepth', label: 'Audio bit depth', group: 'audio', kinds: AV },
  { key: 'review', label: 'Status', group: 'workflow' },
  { key: 'tags', label: 'Keywords', group: 'workflow' },
  { key: 'comments', label: 'Comment count', group: 'workflow' },
  { key: 'notes', label: 'Notes', group: 'workflow' },
  { key: 'transcript', label: 'Transcript', group: 'workflow', kinds: AV },
  { key: 'hasLocation', label: 'Location (GPS)', group: 'file' },
] as const satisfies readonly BuiltInField[];

export type BuiltInCardField = (typeof BUILT_IN_CARD_FIELDS)[number]['key'];

const BUILT_IN_KEYS = new Set<string>(BUILT_IN_CARD_FIELDS.map((field) => field.key));

export function isBuiltInCardField(key: string): key is BuiltInCardField {
  return BUILT_IN_KEYS.has(key);
}

/** MediaCard draws these itself; every other chosen field is a label row under it. */
export const CARD_DRAWN_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'size',
  'duration',
  'review',
  'created',
]);

/** Facts that live outside the asset row, looked up by the surface that shows them. */
export type CardFieldLookups = {
  commentCount?: (assetId: string) => number | undefined;
  memberName?: (userId: string) => string | undefined;
  reviewLabel?: (asset: MediaAsset) => string;
};

/**
 * A member-name lookup for CardFieldLookups, or none while the list is loading — or when it
 * came back empty, which it never is for a member looking at the Library: the read failed,
 * and every uploader would otherwise read "Former member".
 */
export function memberNameLookup(
  members: readonly { userId: string; label: string }[] | null,
): ((userId: string) => string | undefined) | undefined {
  if (!members?.length) return undefined;
  return (userId) => members.find((member) => member.userId === userId)?.label;
}

const DYNAMIC_RANGE_LABEL: Record<DynamicRange, string> = {
  sdr: 'SDR',
  hdr10: 'HDR10',
  hlg: 'HLG',
  dolby_vision: 'Dolby Vision',
  hdr10plus: 'HDR10+',
  unknown: 'Unknown',
};

const KIND_LABEL: Record<MediaKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  file: 'Project file',
};

const CHANNEL_LABEL: Record<number, string> = { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' };

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export function formatBitRate(bitsPerSecond: number): string {
  return bitsPerSecond >= 1_000_000
    ? `${Number((bitsPerSecond / 1_000_000).toFixed(1))} Mb/s`
    : `${Math.round(bitsPerSecond / 1000)} kb/s`;
}

const present = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** The display string for a built-in field, or null when the asset holds nothing for it. */
export function cardFieldValue(
  asset: MediaAsset,
  key: string,
  lookups: CardFieldLookups = {},
): string | null {
  switch (key) {
    case 'title':
      return asset.title ?? asset.fileName;
    case 'fileName':
      return asset.fileName;
    case 'kind':
      return KIND_LABEL[asset.kind];
    case 'format':
      return fileExtension(asset.fileName) ?? asset.mimeType.split('/')[1]?.toUpperCase() ?? null;
    case 'size':
      return asset.sizeBytes ? formatBytes(asset.sizeBytes) : null;
    case 'dimensions':
      return asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
    case 'duration':
      return formatDurationMs(asset.durationMs);
    case 'pageCount':
      return present(asset.pageCount) ? String(asset.pageCount) : null;
    case 'source':
      return SOURCE_LABEL[asset.source] ?? asset.source;
    case 'uploader':
      // No lookup yet = the member list is still loading: unknown, not "Former member".
      if (!asset.createdBy || !lookups.memberName) return null;
      return lookups.memberName(asset.createdBy) ?? 'Former member';
    case 'created':
      return new Date(asset.createdAt).toLocaleDateString(undefined, DATE_FORMAT);
    case 'updated':
      return new Date(asset.updatedAt).toLocaleDateString(undefined, DATE_FORMAT);
    case 'videoCodec':
      return asset.videoCodec ?? null;
    case 'frameRate':
      return present(asset.frameRate) ? `${Number(asset.frameRate.toFixed(3))} fps` : null;
    case 'bitRate':
      return present(asset.bitRate) ? formatBitRate(asset.bitRate) : null;
    case 'videoBitRate':
      return present(asset.videoBitRate) ? formatBitRate(asset.videoBitRate) : null;
    case 'colorSpace':
      return asset.colorSpace ?? null;
    case 'dynamicRange':
      return asset.dynamicRange ? DYNAMIC_RANGE_LABEL[asset.dynamicRange] : null;
    case 'bitDepth':
      return present(asset.bitDepth) ? `${asset.bitDepth}-bit` : null;
    case 'hasAlpha':
      return present(asset.hasAlpha) ? (asset.hasAlpha ? 'Yes' : 'No') : null;
    case 'startTimecode':
      return asset.startTimecode ?? null;
    case 'endTimecode':
      return asset.endTimecode ?? null;
    case 'audioCodec':
      return asset.audioCodec ?? null;
    case 'audioBitRate':
      return present(asset.audioBitRate) ? formatBitRate(asset.audioBitRate) : null;
    case 'audioChannels':
      return present(asset.audioChannels)
        ? (CHANNEL_LABEL[asset.audioChannels] ?? `${asset.audioChannels} channels`)
        : null;
    case 'audioSampleRate':
      return present(asset.audioSampleRate)
        ? `${Number((asset.audioSampleRate / 1000).toFixed(1))} kHz`
        : null;
    case 'audioBitDepth':
      return present(asset.audioBitDepth) ? `${asset.audioBitDepth}-bit` : null;
    case 'review':
      return lookups.reviewLabel?.(asset) ?? null;
    case 'tags':
      return asset.tags.length > 0 ? asset.tags.join(', ') : null;
    case 'comments': {
      const count = lookups.commentCount?.(asset.id);
      return present(count) ? String(count) : null;
    }
    case 'notes':
      return asset.notes?.trim() || null;
    case 'transcript':
      return present(asset.transcript) ? (asset.transcript ? 'Available' : 'No speech') : null;
    case 'hasLocation':
      return present(asset.hasLocation) ? (asset.hasLocation ? 'Has GPS' : 'None') : null;
    default:
      return null;
  }
}

/** A List sort key for a built-in field: numbers stay numbers, everything else its text. */
export function cardFieldSortValue(
  asset: MediaAsset,
  key: string,
  lookups: CardFieldLookups = {},
): string | number | null {
  switch (key) {
    case 'pageCount':
    case 'frameRate':
    case 'bitRate':
    case 'videoBitRate':
    case 'bitDepth':
    case 'audioBitRate':
    case 'audioChannels':
    case 'audioSampleRate':
    case 'audioBitDepth':
      return asset[key] ?? null;
    case 'comments':
      return lookups.commentCount?.(asset.id) ?? null;
    default:
      return cardFieldValue(asset, key, lookups)?.toLocaleLowerCase() ?? null;
  }
}

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
  const seconds = String(total % 60).padStart(2, '0');
  if (total < 3600) return `${Math.floor(total / 60)}:${seconds}`;
  return `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${seconds}`;
}
