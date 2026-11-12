'use client';

import { AlertCircle, CheckCircle2, Copy, MessageSquare, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { cn } from '@/lib/utils';
import { EditableLabel } from '../components/EditableLabel';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignNodeProps } from '../types';
import { OpenAiRecordBadge } from './openAiNodeShared';

/** The API's own ceilings. Shown live so nobody discovers them as a 400 at publish. */
const TITLE_MAX = 50;
const BODY_MAX = 100;

export const OpenAiAdNode = memo(({ id, data, selected }: CampaignNodeProps<'openai-ad'>) => {
  const uiText = useTranslations('scale');
  const updateNodeData = useCampaignStore((store) => store.updateNodeData);
  const removeNode = useCampaignStore((store) => store.removeNode);
  const duplicateNode = useCampaignStore((store) => store.duplicateNode);

  const handleLabelSave = useCallback(
    (label: string) => updateNodeData(id, { label }),
    [id, updateNodeData],
  );
  const handleTitleSave = useCallback(
    (title: string) => updateNodeData(id, { title }),
    [id, updateNodeData],
  );
  const handleBodySave = useCallback(
    (body: string) => updateNodeData(id, { body }),
    [id, updateNodeData],
  );
  const handleUrlSave = useCallback(
    (targetUrl: string) => updateNodeData(id, { targetUrl }),
    [id, updateNodeData],
  );

  const titleOver = (data.title?.length ?? 0) > TITLE_MAX;
  const bodyOver = (data.body?.length ?? 0) > BODY_MAX;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node
          handles={{ target: true, source: false }}
          selected={selected}
          className={cn(
            'hover:shadow-md transition-shadow cursor-pointer',
            (data.validationStatus === 'error' || titleOver || bodyOver) && 'border-destructive',
          )}
        >
          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {uiText('chat_card_9b0e291')}
                </NodeTitle>
              </div>
              <div className="flex items-center gap-1">
                {data.validationStatus === 'valid' && !titleOver && !bodyOver && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {data.validationStatus === 'warning' && (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
                {(data.validationStatus === 'error' || titleOver || bodyOver) && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1.5">
            <h3 className="font-semibold text-foreground leading-tight">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>

            {data.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: an OpenAI CDN URL resolved at
              // runtime; next/image would need the host in remotePatterns for every account.
              <img
                src={data.imageUrl}
                alt=""
                className="h-20 w-full rounded-md object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-20 w-full items-center justify-center rounded-md border border-dashed text-2xs text-muted-foreground">
                {uiText('no_image_the_ad_cannot_be_created_without_one_a61701d')}
              </div>
            )}

            <div className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {uiText('title_7e8cd20')}
                </span>
                <span className={cn('text-3xs', titleOver ? 'text-destructive' : 'opacity-50')}>
                  {data.title?.length ?? 0}/{TITLE_MAX}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground">
                <EditableLabel value={data.title ?? ''} onSave={handleTitleSave} />
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {uiText('body_6ccaa64')}
                </span>
                <span className={cn('text-3xs', bodyOver ? 'text-destructive' : 'opacity-50')}>
                  {data.body?.length ?? 0}/{BODY_MAX}
                </span>
              </div>
              <NodeDescription className="text-xs text-muted-foreground">
                <EditableLabel value={data.body ?? ''} onSave={handleBodySave} />
              </NodeDescription>
            </div>

            <div className="space-y-0.5">
              <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                {uiText('destination_293d404')}
              </span>
              <div className="truncate text-xs text-muted-foreground">
                <EditableLabel value={data.targetUrl ?? ''} onSave={handleUrlSave} />
              </div>
            </div>

            <OpenAiRecordBadge
              openAiId={data.openAiId}
              openAiStatus={data.openAiStatus}
              reviewStatus={data.reviewStatus}
            />
          </NodeContent>
        </Node>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-64">
        <ContextMenuLabel>{uiText('ad_actions_f066c13')}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            {uiText('duplicate_02cdaab')}
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => removeNode(id)}>
            {uiText.rich('sentence_23658db467b7', {
              v0: () => <Trash2 className="mr-2 h-4 w-4" />,
              v1: () => (
                <ContextMenuItemInfo
                  description={uiText('removing_a_live_ad_schedules_an_archive_on_th_5814a18')}
                />
              ),
            })}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
});

OpenAiAdNode.displayName = 'OpenAiAdNode';
