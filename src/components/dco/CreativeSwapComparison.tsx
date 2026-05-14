"use client";

import { Badge } from "@/components/ui/badge";

export function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".mp4") || pathname.endsWith(".mov") || pathname.endsWith(".webm");
  } catch {
    return false;
  }
}

export function CreativeSwapComparison({
  originalUrl,
  newUrl,
}: {
  originalUrl: string;
  newUrl: string;
}) {
  return (
    <div>
      <p className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Creative Comparison
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Badge variant="outline">Original</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-[var(--gray-2)]">
            <div className="relative aspect-[16/9]">
              {isVideoUrl(originalUrl) ? (
                <video
                  src={originalUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={originalUrl}
                  alt="Original creative"
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <Badge variant="default">New</Badge>
          </div>
          <div className="overflow-hidden rounded-md border bg-[var(--gray-2)]">
            <div className="relative aspect-[16/9]">
              {isVideoUrl(newUrl) ? (
                <video
                  src={newUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-contain"
                />
              ) : (
                <img
                  src={newUrl}
                  alt="New creative"
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
