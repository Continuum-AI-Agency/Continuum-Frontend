import { isPostPlatform, POST_PLATFORMS } from '@/lib/organic/postPlatforms';

// Sizing for the preview frame, read from the shared platform config. An unknown platform
// previews as Instagram, the frame every other one was modelled on.
function platformConfig(platform: string) {
  return POST_PLATFORMS[isPostPlatform(platform) ? platform : 'instagram'];
}

export function resolvePreviewAspectRatio(platform: string, format?: string): number {
  const f = (format ?? '').toLowerCase();
  const config = platformConfig(platform);
  if (f === 'reel' || f === 'video') return config.reelAspect;
  if (f === 'story') return 9 / 16;
  return config.mediaTemplate.width / config.mediaTemplate.height;
}

export function resolvePreviewMaxWidth(platform: string): number {
  const { width } = platformConfig(platform).mediaTemplate;
  if (width <= 1080) return 440;
  if (width <= 1200) return 500;
  return 560;
}
