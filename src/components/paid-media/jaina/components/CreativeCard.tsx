"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreativeArtifact } from "@/lib/jaina/schemas";

interface CreativeCardProps {
  creative: CreativeArtifact;
}

export function CreativeCard({ creative }: CreativeCardProps) {
  const imageUrl = creative.thumbnail_url || creative.url;
  
  return (
    <Card className="max-w-md overflow-hidden border border-white/10 bg-black/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-white/90">
            {creative.headline || "Creative"}
          </CardTitle>
          {creative.platform && (
            <Badge variant="secondary" className="text-xs capitalize">
              {creative.platform}
            </Badge>
          )}
        </div>
        {creative.description && (
          <CardDescription className="text-xs text-white/60 mt-1">
            {creative.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="relative">
          <img
            src={imageUrl}
            alt={creative.headline || "Creative asset"}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
          {creative.format && (
            <Badge 
              className="absolute top-2 right-2 bg-black/60 text-white text-xs capitalize"
            >
              {creative.format}
            </Badge>
          )}
        </div>
        {creative.post_copy && (
          <div className="p-4 bg-white/5">
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
              {creative.post_copy}
            </p>
          </div>
        )}
        {creative.call_to_action && (
          <div className="px-4 pb-4 pt-2">
            <Badge variant="outline" className="text-xs text-white/70 border-white/20">
              CTA: {creative.call_to_action}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
