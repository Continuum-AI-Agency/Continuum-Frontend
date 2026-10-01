'use client';

import { ImageIcon, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import { type ChatMedia, mediaListFromCreative } from '@/components/chat/media/media';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  buildCampaignCreativeRequest,
  scaffoldCreativeQuery,
} from '@/lib/campaign-canvas/creativeGeneration';
import type { CreativeArtifact } from '@/lib/jaina/schemas';

interface CreativeCardProps {
  creative: CreativeArtifact;
  index: number;
  onRequestCreative?: (query: string) => void;
  disabled?: boolean;
}

export function CreativeCard({ creative, index, onRequestCreative, disabled }: CreativeCardProps) {
  const { activeBrandId } = useActiveBrandContext();
  // A video ad used to render its video URL into an <img>. The shared primitive reads
  // `format: 'video'` and renders a real poster frame with a play glyph.
  //
  // The LIST form, not the single: a generated carousel arrives as one artifact whose
  // extra cards ride on `slides`. ChatMediaCarousel renders a one-item list as a bare
  // thumb with no chrome, so a single-asset creative is unchanged.
  const baseMedia = mediaListFromCreative(creative);

  // Signed storage URLs are hour-scale. Reopening a conversation the next day would
  // otherwise render the branded fallback tile with no way back — so a failed URL is
  // re-minted from the media.assets id the frame carries.
  const [recovered, setRecovered] = useState<Record<string, ChatMedia>>({});
  const media = baseMedia.map((item) => recovered[item.id] ?? item);

  const recover = useCallback(
    async (item: ChatMedia) => {
      // Only OUR assets are re-signable. A Meta-CDN creative has no media.assets row,
      // so there is nothing to re-mint and the fallback tile is the honest end state.
      const assetId = item.id.includes(':') ? null : item.id;
      if (!assetId || !activeBrandId || recovered[item.id]) return;
      try {
        const response = await fetch('/api/library/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId: activeBrandId, assetId }),
        });
        if (!response.ok) return;
        const { signedUrl, thumbnailUrl } = (await response.json()) as {
          signedUrl?: string;
          thumbnailUrl?: string | null;
        };
        if (!signedUrl) return;
        setRecovered((current) => ({
          ...current,
          [item.id]: {
            ...item,
            url: signedUrl,
            thumbnailUrl: thumbnailUrl ?? item.thumbnailUrl,
          },
        }));
      } catch {
        // A failed recovery leaves the fallback tile in place, which is already the
        // correct visual for "this media is gone".
      }
    },
    [recovered, activeBrandId],
  );

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const generate = async () => {
    setRequesting(true);
    setRequestError(null);
    try {
      const graph = useCampaignStore.getState();
      const node = creative.asset_id
        ? graph.nodes.find(
            (item) => item.type === 'creative' && item.data.mediaId === creative.asset_id,
          )
        : undefined;
      const account = creative.canvas_target?.ad_account_id ?? graph.hydration?.adAccountId;
      let query: string;
      if (node && activeBrandId && account)
        query = (
          await buildCampaignCreativeRequest({
            ...graph,
            nodeId: node.id,
            brandId: activeBrandId,
            adAccountId: account,
          })
        ).query;
      else if (creative.scaffold_target)
        query = scaffoldCreativeQuery(
          {
            ...creative.scaffold_target,
            expected_asset_id:
              creative.attachment_status === 'attached'
                ? (creative.asset_id ?? null)
                : creative.scaffold_target.expected_asset_id,
          },
          creative.format === 'video' ? 'video' : 'image',
        );
      else
        query = `Generate / Enrich a new ${creative.format === 'video' ? 'video' : 'image'} variation of Library creative ${creative.asset_id ?? creative.id}. Ground it in this brand's campaign data, audience and measured winning angles; retain its offer and use the source as an approved reference where available. Use paid_creative_generate, show its generation permission gate, save and preview the result in chat. Do not publish or enroll.`;
      onRequestCreative?.(query);
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : 'Creative request failed');
    } finally {
      setRequesting(false);
    }
  };
  const hasMedia = media.length > 0 && Boolean(media[0]?.url);

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger
        render={
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-[76px] shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-border/50 transition-all duration-200 hover:scale-110 hover:ring-2 hover:ring-primary/50 hover:shadow-lg hover:z-10"
            style={{ transformOrigin: 'bottom center' }}
          >
            <AspectRatio ratio={1}>
              {hasMedia ? (
                <ChatMediaCarousel
                  items={media}
                  className="rounded-none"
                  onRecoverItem={recover}
                  fallbackSeed={creative.headline ?? creative.id}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/40">
                  <ImageIcon className="size-5 text-muted-foreground/30" />
                </div>
              )}
            </AspectRatio>
          </motion.div>
        }
      />

      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={10}
        className="w-72 p-0 overflow-hidden"
      >
        {hasMedia && (
          <AspectRatio ratio={4 / 3}>
            <ChatMediaCarousel
              items={media}
              className="rounded-none"
              onRecoverItem={recover}
              fallbackSeed={creative.headline ?? creative.id}
            />
          </AspectRatio>
        )}

        {/* Details */}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-foreground">
              {creative.headline || 'Creative'}
            </p>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {creative.platform && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {creative.platform}
                </Badge>
              )}
              {creative.format && (
                <Badge variant="outline" className="text-xs capitalize">
                  {creative.format}
                </Badge>
              )}
            </div>
          </div>

          {creative.description && (
            <p className="text-xs leading-snug text-muted-foreground">{creative.description}</p>
          )}

          {creative.post_copy && (
            <p className="line-clamp-4 border-l-2 border-border pl-2 text-xs leading-relaxed text-foreground/75">
              {creative.post_copy}
            </p>
          )}

          {onRequestCreative ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || requesting}
              onClick={() => void generate()}
            >
              <Sparkles className="size-3.5" />
              Generate / Enrich
            </Button>
          ) : null}
          {requestError ? (
            <p role="alert" className="text-xs text-destructive">
              {requestError}
            </p>
          ) : null}
          {creative.scaffold_target && creative.attachment_status !== 'attached' ? (
            <p className="text-xs text-muted-foreground">
              Saved in Library; attachment needs review ({creative.attachment_status ?? 'unknown'}).
            </p>
          ) : null}
          {creative.call_to_action && (
            <Badge variant="secondary" className="w-fit text-xs">
              {creative.call_to_action}
            </Badge>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
