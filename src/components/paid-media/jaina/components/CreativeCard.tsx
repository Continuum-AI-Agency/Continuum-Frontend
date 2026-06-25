"use client";

import { motion } from "motion/react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { ImageIcon } from "lucide-react";
import type { CreativeArtifact } from "@/lib/jaina/schemas";

interface CreativeCardProps {
  creative: CreativeArtifact;
  index: number;
}

export function CreativeCard({ creative, index }: CreativeCardProps) {
  const imageUrl = creative.thumbnail_url || creative.url;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.22, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-[76px] shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-border/50 transition-all duration-200 hover:scale-110 hover:ring-2 hover:ring-primary/50 hover:shadow-lg hover:z-10"
          style={{ transformOrigin: "bottom center" }}
        >
          <AspectRatio ratio={1}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={creative.headline || "Creative"}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted/40">
                <ImageIcon className="size-5 text-muted-foreground/30" />
              </div>
            )}
          </AspectRatio>
        </motion.div>
      </HoverCardTrigger>

      <HoverCardContent side="bottom" align="start" sideOffset={10} className="w-72 p-0 overflow-hidden">
        {/* Image preview */}
        {imageUrl && (
          <AspectRatio ratio={4 / 3}>
            <img
              src={imageUrl}
              alt={creative.headline || "Creative"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </AspectRatio>
        )}

        {/* Details */}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-foreground">
              {creative.headline || "Creative"}
            </p>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {creative.platform && (
                <Badge variant="secondary" className="text-2xs capitalize">
                  {creative.platform}
                </Badge>
              )}
              {creative.format && (
                <Badge variant="outline" className="text-2xs capitalize">
                  {creative.format}
                </Badge>
              )}
            </div>
          </div>

          {creative.description && (
            <p className="text-xs leading-snug text-muted-foreground">
              {creative.description}
            </p>
          )}

          {creative.post_copy && (
            <p className="line-clamp-4 border-l-2 border-border pl-2 text-xs leading-relaxed text-foreground/75">
              {creative.post_copy}
            </p>
          )}

          {creative.call_to_action && (
            <Badge variant="secondary" className="w-fit text-2xs">
              {creative.call_to_action}
            </Badge>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
