import { buildFullCaption } from '@/lib/organic/publish-utils';
import type { OrganicCalendarDraft } from './types';

type MediaTemplate = {
  width: number;
  height: number;
  title: string;
};

const MEDIA_TEMPLATES: Record<string, MediaTemplate> = {
  instagram: { width: 1080, height: 1080, title: 'Add Instagram media' },
  facebook: { width: 1080, height: 1080, title: 'Add Facebook media' },
  linkedin: { width: 1200, height: 628, title: 'Add LinkedIn media' },
  youtube: { width: 1280, height: 720, title: 'Add YouTube media' },
  tiktok: { width: 1080, height: 1350, title: 'Add TikTok media' },
};

function buildPlaceholderDataUri(template: MediaTemplate) {
  const { width, height, title } = template;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="16" ry="16" fill="none" stroke="#94a3b8" stroke-width="4" stroke-dasharray="14 12" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="42" fill="#64748b" font-weight="600">${title}</text>
</svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PLACEHOLDER_MEDIA: Record<string, string> = Object.entries(MEDIA_TEMPLATES).reduce(
  (acc, [platform, template]) => {
    acc[platform] = buildPlaceholderDataUri(template);
    return acc;
  },
  {} as Record<string, string>,
);

export function resolveMediaTemplate(platform: string): MediaTemplate {
  return MEDIA_TEMPLATES[platform] ?? MEDIA_TEMPLATES.instagram;
}

export function resolvePreviewAspectRatio(platform: string, format?: string): number {
  const f = (format ?? '').toLowerCase();
  if (f === 'reel' || f === 'video') return 4 / 5;
  if (f === 'story') return 9 / 16;
  const template = resolveMediaTemplate(platform);
  return template.width / template.height;
}

export function resolvePreviewMaxWidth(platform: string): number {
  const template = resolveMediaTemplate(platform);
  if (template.width <= 1080) return 440;
  if (template.width <= 1200) return 500;
  return 560;
}

export function resolveMediaSource(platform: string, mediaUrl: string | undefined): string {
  const trimmed = mediaUrl?.trim();
  if (trimmed) return trimmed;
  return PLACEHOLDER_MEDIA[platform] ?? PLACEHOLDER_MEDIA.instagram;
}

export function buildInstagramPreviewData(draft: OrganicCalendarDraft, verified = true) {
  const platform = draft.platforms[0] || 'instagram';
  const handle = draft.target || 'continuum.ai';

  return {
    author: handle,
    avatar: handle.slice(0, 1).toUpperCase(),
    image: resolveMediaSource(platform, draft.location),
    likes: '2,847',
    caption: buildFullCaption(draft),
    time: draft.timeLabel,
    verified,
  };
}

export function buildLinkedInPreviewData(draft: OrganicCalendarDraft) {
  const handle = draft.target || 'Continuum';

  return {
    author: handle,
    headline: draft.tone || 'Brand team',
    avatar: handle.slice(0, 1).toUpperCase(),
    content: buildFullCaption(draft),
    time: draft.timeLabel,
    image: resolveMediaSource('linkedin', draft.location),
    reactions: '1,234',
    comments: '56',
    reposts: '12',
    topReactions: ['like', 'insightful', 'celebrate'] as (
      | 'like'
      | 'celebrate'
      | 'support'
      | 'love'
      | 'insightful'
      | 'funny'
    )[],
  };
}
