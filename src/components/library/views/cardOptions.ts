import type { useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import type libraryMessages from '../../../../messages/library/en.json';
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

export const CARD_SIZES: readonly {
  value: CardSize;
  labelKey: keyof typeof libraryMessages;
  minWidthPx: number;
}[] = [
  { value: 'sm', labelKey: 'small_5263293f', minWidthPx: 150 },
  { value: 'md', labelKey: 'medium_8e588cd1', minWidthPx: 210 },
  { value: 'lg', labelKey: 'large_ab80540d', minWidthPx: 300 },
];

export const CARD_ASPECTS: readonly {
  value: CardAspect;
  labelKey: keyof typeof libraryMessages;
  className: string | null;
}[] = [
  // null = the asset's own ratio, which is what the grid did before card options.
  { value: 'original', labelKey: 'original_88d759ea', className: null },
  { value: 'square', labelKey: 'square_c11092bc', className: 'aspect-square' },
  {
    value: 'portrait',
    labelKey: 'portrait_f71094c3',
    className: 'aspect-[4/5]',
  },
  {
    value: 'landscape',
    labelKey: 'landscape_e658d3ae',
    className: 'aspect-video',
  },
];

export type LibraryFieldGroup = 'file' | 'video' | 'audio' | 'document' | 'workflow';

type BuiltInField = {
  key: string;
  labelKey: keyof typeof libraryMessages;
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
  { key: 'title', labelKey: 'title_7e8cd205', group: 'file' },
  { key: 'fileName', labelKey: 'source_filename_3fc6620c', group: 'file' },
  { key: 'kind', labelKey: 'file_type_ea1df052', group: 'file' },
  { key: 'format', labelKey: 'format_2f343666', group: 'file' },
  { key: 'size', labelKey: 'file_size_ff044294', group: 'file' },
  {
    key: 'dimensions',
    labelKey: 'resolution_d4055faf',
    group: 'file',
    kinds: VISUAL,
  },
  { key: 'duration', labelKey: 'duration_4fc52a3c', group: 'file', kinds: AV },
  { key: 'pageCount', labelKey: 'page_count_2905c1b8', group: 'document' },
  { key: 'source', labelKey: 'source_0e570ca6', group: 'file' },
  { key: 'uploader', labelKey: 'uploader_29ca9741', group: 'file' },
  { key: 'created', labelKey: 'date_uploaded_f58bc77b', group: 'file' },
  { key: 'updated', labelKey: 'updated_3a5ecca1', group: 'file' },
  {
    key: 'videoCodec',
    labelKey: 'video_codec_8f405ca2',
    group: 'video',
    kinds: VIDEO,
  },
  {
    key: 'frameRate',
    labelKey: 'frame_rate_68e19e4c',
    group: 'video',
    kinds: VIDEO,
  },
  { key: 'bitRate', labelKey: 'bit_rate_0087fbde', group: 'video', kinds: AV },
  {
    key: 'videoBitRate',
    labelKey: 'video_bit_rate_f728abc7',
    group: 'video',
    kinds: VIDEO,
  },
  {
    key: 'colorSpace',
    labelKey: 'color_space_e7a97086',
    group: 'video',
    kinds: VISUAL,
  },
  {
    key: 'dynamicRange',
    labelKey: 'dynamic_range_9a6fcfdb',
    group: 'video',
    kinds: VIDEO,
  },
  {
    key: 'bitDepth',
    labelKey: 'bit_depth_cc62f2e8',
    group: 'video',
    kinds: VISUAL,
  },
  {
    key: 'hasAlpha',
    labelKey: 'alpha_channel_eb7c327a',
    group: 'video',
    kinds: VISUAL,
  },
  {
    key: 'startTimecode',
    labelKey: 'start_time_babe9dda',
    group: 'video',
    kinds: VIDEO,
  },
  {
    key: 'endTimecode',
    labelKey: 'end_time_2e46006a',
    group: 'video',
    kinds: VIDEO,
  },
  {
    key: 'audioCodec',
    labelKey: 'audio_codec_4fd00b75',
    group: 'audio',
    kinds: AV,
  },
  {
    key: 'audioBitRate',
    labelKey: 'audio_bit_rate_7235e78c',
    group: 'audio',
    kinds: AV,
  },
  {
    key: 'audioChannels',
    labelKey: 'channels_4c8906cf',
    group: 'audio',
    kinds: AV,
  },
  {
    key: 'audioSampleRate',
    labelKey: 'sample_rate_218e0d43',
    group: 'audio',
    kinds: AV,
  },
  {
    key: 'audioBitDepth',
    labelKey: 'audio_bit_depth_497dd2c6',
    group: 'audio',
    kinds: AV,
  },
  { key: 'review', labelKey: 'status_920e413c', group: 'workflow' },
  { key: 'tags', labelKey: 'keywords_8bfdb93c', group: 'workflow' },
  { key: 'comments', labelKey: 'comment_count_6b60df4f', group: 'workflow' },
  { key: 'notes', labelKey: 'notes_8a7525b1', group: 'workflow' },
  {
    key: 'transcript',
    labelKey: 'transcript_721164f0',
    group: 'workflow',
    kinds: AV,
  },
  { key: 'hasLocation', labelKey: 'location_gps_44fbedd8', group: 'file' },
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
  locale?: UiLocale;
  translate?: ReturnType<typeof useTranslations<'library'>>;
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

const CHANNEL_LABEL: Record<number, string> = {
  1: 'Mono',
  2: 'Stereo',
  6: '5.1',
  8: '7.1',
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const numberFormats = new Map<string, Intl.NumberFormat>();
function displayNumber(value: number, digits: number, locale: UiLocale = 'en'): string {
  const key = `${locale}:${digits}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      maximumFractionDigits: digits,
      useGrouping: false,
    });
    numberFormats.set(key, formatter);
  }
  return formatter.format(Number(value.toFixed(digits)));
}

export function formatBitRate(bitsPerSecond: number, locale: UiLocale = 'en'): string {
  return bitsPerSecond >= 1_000_000
    ? `${displayNumber(bitsPerSecond / 1_000_000, 1, locale)} Mb/s`
    : `${displayNumber(Math.round(bitsPerSecond / 1000), 0, locale)} kb/s`;
}

const present = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

/** The display string for a built-in field, or null when the asset holds nothing for it. */
export function cardFieldValue(
  asset: MediaAsset,
  key: string,
  lookups: CardFieldLookups = {},
): string | null {
  const locale = lookups.locale ?? 'en';
  const t = (message: keyof typeof libraryMessages, fallback: string) =>
    lookups.translate?.(message) ?? fallback;
  switch (key) {
    case 'title':
      return asset.title ?? asset.fileName;
    case 'fileName':
      return asset.fileName;
    case 'kind':
      return t(
        (
          {
            image: 'fieldKindImage',
            video: 'fieldKindVideo',
            audio: 'fieldKindAudio',
            file: 'fieldKindFile',
          } as const
        )[asset.kind],
        KIND_LABEL[asset.kind],
      );
    case 'format':
      return fileExtension(asset.fileName) ?? asset.mimeType.split('/')[1]?.toUpperCase() ?? null;
    case 'size':
      return asset.sizeBytes ? formatBytes(asset.sizeBytes, locale) : null;
    case 'dimensions':
      return asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
    case 'duration':
      return formatDurationMs(asset.durationMs);
    case 'pageCount':
      return present(asset.pageCount) ? displayNumber(asset.pageCount, 0, locale) : null;
    case 'source':
      return t(
        (
          {
            upload: 'sourceUpload',
            ai_generated: 'sourceAiGenerated',
            canvas: 'sourceCanvas',
            inspiration: 'sourceInspiration',
            meta_ad: 'sourceMetaAd',
            hyperframe: 'sourceHyperframe',
            chat_upload: 'sourceChatUpload',
            clip: 'sourceClip',
            reel: 'sourceReel',
            backfill: 'sourceBackfill',
            figma: 'sourceFigma',
            forge: 'sourceForge',
            goal_artifact: 'sourceGoalArtifact',
          } as const
        )[asset.source],
        SOURCE_LABEL[asset.source] ?? asset.source,
      );
    case 'uploader':
      // No lookup yet = the member list is still loading: unknown, not "Former member".
      if (!asset.createdBy || !lookups.memberName) return null;
      return lookups.memberName(asset.createdBy) ?? t('fieldFormerMember', 'Former member');
    case 'created':
      return new Date(asset.createdAt).toLocaleDateString(locale, DATE_FORMAT);
    case 'updated':
      return new Date(asset.updatedAt).toLocaleDateString(locale, DATE_FORMAT);
    case 'videoCodec':
      return asset.videoCodec ?? null;
    case 'frameRate':
      return present(asset.frameRate) ? `${displayNumber(asset.frameRate, 3, locale)} fps` : null;
    case 'bitRate':
      return present(asset.bitRate) ? formatBitRate(asset.bitRate, locale) : null;
    case 'videoBitRate':
      return present(asset.videoBitRate) ? formatBitRate(asset.videoBitRate, locale) : null;
    case 'colorSpace':
      return asset.colorSpace ?? null;
    case 'dynamicRange':
      return asset.dynamicRange
        ? asset.dynamicRange === 'unknown'
          ? t('fieldUnknown', 'Unknown')
          : DYNAMIC_RANGE_LABEL[asset.dynamicRange]
        : null;
    case 'bitDepth':
      return present(asset.bitDepth) ? `${asset.bitDepth}-bit` : null;
    case 'hasAlpha':
      return present(asset.hasAlpha)
        ? asset.hasAlpha
          ? t('fieldYes', 'Yes')
          : t('fieldNo', 'No')
        : null;
    case 'startTimecode':
      return asset.startTimecode ?? null;
    case 'endTimecode':
      return asset.endTimecode ?? null;
    case 'audioCodec':
      return asset.audioCodec ?? null;
    case 'audioBitRate':
      return present(asset.audioBitRate) ? formatBitRate(asset.audioBitRate, locale) : null;
    case 'audioChannels':
      return present(asset.audioChannels)
        ? asset.audioChannels === 1
          ? t('fieldMono', 'Mono')
          : asset.audioChannels === 2
            ? t('fieldStereo', 'Stereo')
            : (CHANNEL_LABEL[asset.audioChannels] ??
              lookups.translate?.('fieldChannels', {
                count: asset.audioChannels,
              }) ??
              `${asset.audioChannels} channels`)
        : null;
    case 'audioSampleRate':
      return present(asset.audioSampleRate)
        ? `${displayNumber(asset.audioSampleRate / 1000, 1, locale)} kHz`
        : null;
    case 'audioBitDepth':
      return present(asset.audioBitDepth) ? `${asset.audioBitDepth}-bit` : null;
    case 'review':
      return lookups.reviewLabel?.(asset) ?? null;
    case 'tags':
      return asset.tags.length > 0 ? asset.tags.join(', ') : null;
    case 'comments': {
      const count = lookups.commentCount?.(asset.id);
      return present(count) ? displayNumber(count, 0, locale) : null;
    }
    case 'notes':
      return asset.notes?.trim() || null;
    case 'transcript':
      return present(asset.transcript)
        ? asset.transcript
          ? t('fieldAvailable', 'Available')
          : t('fieldNoSpeech', 'No speech')
        : null;
    case 'hasLocation':
      return present(asset.hasLocation)
        ? asset.hasLocation
          ? t('fieldGps', 'Has GPS')
          : t('fieldNone', 'None')
        : null;
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
      return cardFieldValue(asset, key, lookups)?.toLocaleLowerCase(lookups.locale) ?? null;
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
