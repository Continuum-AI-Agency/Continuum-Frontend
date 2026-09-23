'use client';

// Saved dashboards, above the chat: a collapsed strip that opens into each saved report's
// blocks, rendered by the same block renderer. "Refresh" is a prepared question back to
// Jaina — the numbers on a dashboard are the numbers of the day it was saved, and the
// strip says so.

import type { JainaDashboard } from '@continuum/contracts';
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { orderDashboardBlocks } from '@/lib/jaina/dashboardBlocks';
import { deleteDashboard, listDashboards } from '@/lib/jaina/dashboards.client';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { checkpointBlockV2Schema, degradeToNarrativeBlockV2 } from '@/lib/jaina/schemas';
import { BlockRenderer } from '../blocks/BlockRenderer';

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function SavedDashboardsPanel() {
  const scope = useJainaBrandScope();
  const brandId = scope?.brandId ?? null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dashboards, setDashboards] = useState<JainaDashboard[]>([]);
  // A plain effect rather than a query hook: this strip must render inside any host,
  // including one with no query client, and an unreachable table simply shows nothing.
  const reload = useCallback(async () => {
    if (!brandId) return;
    try {
      setDashboards(await listDashboards(brandId));
    } catch {
      setDashboards([]);
    }
  }, [brandId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (!scope || dashboards.length === 0) return null;

  const remove = async (id: string) => {
    await deleteDashboard(id);
    if (openId === id) setOpenId(null);
    await reload();
  };

  return (
    <section
      className="mb-2 rounded-lg border border-border/60 bg-background/70 text-sm"
      data-testid="saved-dashboards"
    >
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        )}
        Saved dashboards
        <span className="text-muted-foreground text-xs">({dashboards.length})</span>
      </button>
      {/* The opened dashboard is a REPORT — five modules of charts and tables — and it lands
       *  inside a host that bounds its own height. Without a scroll of its own the list grew
       *  past the host, the host clipped it, and there was nowhere to scroll: the only way
       *  back to the page was to close the panel. The names stay put; the reading scrolls. */}
      {expanded ? (
        <ul className="max-h-[min(62vh,720px)] divide-y divide-border/50 overflow-y-auto overscroll-contain border-border/60 border-t">
          {dashboards.map((dashboard) => {
            const isOpen = openId === dashboard.id;
            const refreshPrompt =
              dashboard.source_prompt ??
              `Refresh the analysis "${dashboard.source_title ?? dashboard.name}" with today's data, same scope and window.`;
            return (
              <li className="px-3 py-2" key={dashboard.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    onClick={() => setOpenId(isOpen ? null : dashboard.id)}
                    type="button"
                  >
                    {dashboard.name}
                  </button>
                  <span className="text-muted-foreground text-xs">
                    saved {DATE_FMT.format(new Date(dashboard.created_at))} ·{' '}
                    {dashboard.blocks.length} module{dashboard.blocks.length === 1 ? '' : 's'}
                    {dashboard.window_label ? ` · covers ${dashboard.window_label}` : ''}
                  </span>
                  <a
                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                    href={jainaPromptHref(refreshPrompt)}
                  >
                    <RefreshCwIcon className="size-3" /> Ask Jaina to refresh
                  </a>
                  <Button
                    aria-label={`Delete dashboard ${dashboard.name}`}
                    onClick={() => void remove(dashboard.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                {isOpen ? (
                  <div className="mt-2 space-y-3">
                    <p className="text-muted-foreground text-xs">
                      Figures as of the day this was saved. Refresh to get today's.
                    </p>
                    {/* The scope frame first, as the live report reads: the window before
                     *  the figures, even on a row saved before the save kept it in front. */}
                    {orderDashboardBlocks(
                      dashboard.blocks.map((raw) => {
                        const parsed = checkpointBlockV2Schema.safeParse(raw);
                        return parsed.success ? parsed.data : degradeToNarrativeBlockV2(raw);
                      }),
                    ).map((block, index) => (
                      <BlockRenderer
                        block={block}
                        isStreaming={false}
                        key={`${dashboard.id}:${block.block_id}:${index}`}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
