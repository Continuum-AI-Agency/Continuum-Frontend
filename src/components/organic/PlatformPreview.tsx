"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Badge, Flex, IconButton, Text } from "@radix-ui/themes";
import {
  DesktopIcon,
  MobileIcon,
  PlayIcon,
} from "@radix-ui/react-icons";

import type { DetailedPostTemplate } from "@/lib/organic/types";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import {
  CREATIVE_ASSET_DRAG_TYPE,
  type CreativeAssetDragPayload,
} from "@/lib/creative-assets/drag";

type PreviewMode = "mobile" | "desktop";

const LINKEDIN_DESKTOP_WIDTH = 520;
const MOBILE_FRAME_WIDTH = 320;
const MOBILE_ASPECT_RATIO = 16 / 9;

const PLATFORM_LABELS: Record<OrganicPlatformKey | "unknown", string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  unknown: "Organic",
};

type PlatformPreviewProps = {
  template: DetailedPostTemplate;
  onAssetDrop?: (
    payload: CreativeAssetDragPayload,
    template: DetailedPostTemplate
  ) => void | Promise<void>;
};

export function PlatformPreview({ template, onAssetDrop }: PlatformPreviewProps) {
  const platform = useMemo(() => detectPlatform(template), [template]);
  const [mode, setMode] = useState<PreviewMode>(() =>
    platform === "linkedin" ? "desktop" : "mobile"
  );
  const [isDragActive, setIsDragActive] = useState(false);

  const mediaUrl = useMemo(() => {
    if (Array.isArray(template.media_urls)) {
      const candidate = template.media_urls.find((url) => Boolean(url && url.trim()));
      if (candidate) return candidate;
    }
    return template.media_url ?? null;
  }, [template.media_url, template.media_urls]);

  const caption = useMemo(() => {
    const hashtags = collectHashtags(template);
    const hashtagText = hashtags.length ? `\n\n${hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}` : "";
    return `${template.caption_copy ?? ""}${hashtagText}`;
  }, [template]);

  const showToggle = platform === "linkedin";
  const handleMode = (next: PreviewMode) => {
    if (platform !== "linkedin") return;
    setMode(next);
  };

  const allowDrop = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(CREATIVE_ASSET_DRAG_TYPE)) {
      event.preventDefault();
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragActive(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(CREATIVE_ASSET_DRAG_TYPE)) return;
    event.preventDefault();
    setIsDragActive(false);
    const raw = event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE);
    try {
      const payload = JSON.parse(raw) as CreativeAssetDragPayload;
      if (payload?.path) {
        await onAssetDrop?.(payload, template);
      }
    } catch {
      // noop
    }
  };

  return (
    <div
      className={`space-y-3 rounded-lg transition ${
        isDragActive ? "ring-2 ring-violet-500 ring-offset-2" : ""
      }`}
      onDragOver={allowDrop}
      onDragEnter={allowDrop}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Flex align="center" justify="between">
        <Text size="2" weight="medium">
          {PLATFORM_LABELS[platform]} Preview
        </Text>
        {showToggle ? (
          <Flex gap="1">
            <IconButton
              size="1"
              variant={mode === "mobile" ? "solid" : "soft"}
              onClick={() => handleMode("mobile")}
              aria-label="Mobile preview"
            >
              <MobileIcon />
            </IconButton>
            <IconButton
              size="1"
              variant={mode === "desktop" ? "solid" : "soft"}
              onClick={() => handleMode("desktop")}
              aria-label="Desktop preview"
            >
              <DesktopIcon />
            </IconButton>
          </Flex>
        ) : (
          <Badge color="gray" size="1">
            Mobile
          </Badge>
        )}
      </Flex>
      {platform === "linkedin" && mode === "desktop" ? (
        <LinkedInDesktopPreview mediaUrl={mediaUrl} caption={caption} template={template} />
      ) : (
        <MobilePhonePreview platform={platform} mediaUrl={mediaUrl} caption={caption} template={template} />
      )}
    </div>
  );
}

function MobilePhonePreview({
  platform,
  mediaUrl,
  caption,
  template,
}: {
  platform: OrganicPlatformKey | "unknown";
  mediaUrl: string | null;
  caption: string;
  template: DetailedPostTemplate;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[var(--mobile-width)]"
      style={{ "--mobile-width": `${MOBILE_FRAME_WIDTH}px` } as React.CSSProperties}
    >
      <div className="rounded-[38px] border border-gray-300 bg-gray-950/90 p-3 shadow-lg shadow-gray-900/40 dark:border-gray-700">
        <div className="rounded-[28px] bg-white shadow-inner dark:bg-gray-900">
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
            <div className="flex-1">
              <Text size="2" weight="medium">
                {PLATFORM_LABELS[platform]}
              </Text>
              <Text size="1" color="gray">
                {template.day_platform}
              </Text>
            </div>
            <Badge color="gray" size="1">
              {template.format}
            </Badge>
          </div>
          <div
            className="relative w-full"
            style={{ aspectRatio: `${MOBILE_ASPECT_RATIO}` }}
          >
            {mediaUrl ? (
              mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".mov") ? (
                <VideoMock mediaUrl={mediaUrl} />
              ) : (
                <Image
                  src={mediaUrl}
                  alt="Generated media preview"
                  fill
                  className="rounded-none object-cover"
                  sizes="320px"
                  unoptimized
                />
              )
            ) : (
              <PlaceholderMedia platform={platform} />
            )}
          </div>
          <div className="space-y-2 px-4 py-3">
            <Text size="2" className="whitespace-pre-wrap">
              {caption || "Generated caption will appear here."}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkedInDesktopPreview({
  mediaUrl,
  caption,
  template,
}: {
  mediaUrl: string | null;
  caption: string;
  template: DetailedPostTemplate;
}) {
  return (
    <div
      className="w-full max-w-[var(--linkedin-width)] rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950"
      style={{ "--linkedin-width": `${LINKEDIN_DESKTOP_WIDTH}px` } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="h-10 w-10 rounded-full bg-blue-600 text-white grid place-items-center font-semibold">
          in
        </div>
        <div className="flex-1">
          <Text weight="medium">{template.day_platform}</Text>
          <Text size="1" color="gray">
            {template.format}
          </Text>
        </div>
        <Badge color="blue" size="1">
          Desktop
        </Badge>
      </div>
      {mediaUrl ? (
        <div className="relative h-64 w-full">
          <Image
            src={mediaUrl}
            alt="LinkedIn media preview"
            fill
            className="object-cover"
            sizes="520px"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-64 w-full items-center justify-center bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          Media preview
        </div>
      )}
      <div className="space-y-3 px-5 py-4">
        <Text size="2" className="whitespace-pre-wrap">
          {caption || "Generated caption will appear here."}
        </Text>
      </div>
    </div>
  );
}

function VideoMock({ mediaUrl }: { mediaUrl: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-black text-white">
      <PlayIcon width={36} height={36} />
      <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs font-medium">
        {mediaUrl.split(".").pop()?.toUpperCase() ?? "MP4"}
      </span>
    </div>
  );
}

function PlaceholderMedia({ platform }: { platform: OrganicPlatformKey | "unknown" }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-gray-400">
        <MobileIcon />
      </div>
      <Text size="1">Media preview for {PLATFORM_LABELS[platform]}</Text>
    </div>
  );
}

function detectPlatform(template: DetailedPostTemplate): OrganicPlatformKey | "unknown" {
  const haystack = [
    template.day_platform,
    template.format,
    template.type,
    template.objective,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("instagram")) return "instagram";
  if (haystack.includes("facebook") || haystack.includes("meta")) return "facebook";
  if (haystack.includes("tiktok")) return "tiktok";
  if (haystack.includes("linkedin")) return "linkedin";
  if (haystack.includes("youtube")) return "youtube";

  return "unknown";
}

function collectHashtags(template: DetailedPostTemplate): string[] {
  const { hashtags } = template;
  if (!hashtags) return [];
  return [
    ...(hashtags.high_competition ?? []),
    ...(hashtags.medium_competition ?? []),
    ...(hashtags.low_competition ?? []),
  ].filter(Boolean);
}
