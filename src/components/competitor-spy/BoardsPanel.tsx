'use client';

import type { SavedBoard, SavedItem } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { formatCompetitorNumber } from '@/components/competitor-spy/brandVisuals';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useUiErrorMessage } from '@/i18n/errors';
import {
  useBoardItems,
  useCreateBoard,
  useCreativeUrl,
  useDeleteBoard,
  useRemoveBoardItem,
  useSavedBoards,
} from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import { compactCount } from './brandVisuals';

const RAIL_CLASS = 'md:sticky md:top-0 md:w-60 md:shrink-0 md:self-start';

function SavedItemCard({ item, onRemove }: { item: SavedItem; onRemove: () => void }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');

  const isPaid = item.kind === 'paid';
  const needsSigned = isPaid && item.hasCreativeMedia && Boolean(item.adSnapshotId);
  const { data: signedUrl } = useCreativeUrl(item.adSnapshotId ?? '', needsSigned);
  const mediaUrl = signedUrl ?? item.payload.mediaUrl ?? null;
  const likes = compactCount(item.payload.likeCount ?? null, uiLocale);
  const comments = compactCount(item.payload.commentsCount ?? null, uiLocale);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/5] w-full bg-muted">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed / remote CDN URLs
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {uiText('no_creative_34a6e07')}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide text-white">
          {localizeCompetitorCopy(item.kind === 'paid' ? 'Paid' : 'Organic', uiText)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={uiText('remove_from_board_1c6124d')}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md bg-black/55 text-sm leading-none text-white transition-colors hover:bg-black/75"
        >
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">
          {item.competitorName ?? item.payload.title ?? uiText('saved_item_c98dd52')}
        </span>
        {item.payload.caption ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.payload.caption}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 font-mono text-2xs text-muted-foreground">
          <span>
            {isPaid
              ? `${(item.payload.observedActiveDays ?? 0).toLocaleString(uiLocale)}d · ${item.payload.status === 'active' ? localizeCompetitorCopy('Active', uiText) : item.payload.status === 'paused' ? localizeCompetitorCopy('Paused', uiText) : uiText('saved_d81c55f')}`
              : [
                  likes
                    ? uiText('m_e272abed60', { count: item.payload.likeCount ?? 0, amount: likes })
                    : null,
                  comments
                    ? uiText('m_49e5499419', {
                        count: item.payload.commentsCount ?? 0,
                        amount: comments,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Instagram'}
          </span>
          {item.payload.permalink ? (
            <a
              href={item.payload.permalink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 underline-offset-2 hover:underline"
            >
              {uiText('view_dcc839a')}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BoardRail({
  boards,
  selectedId,
  onSelect,
  brandId,
  className,
}: {
  boards: SavedBoard[];
  selectedId?: string;
  onSelect: (id: string) => void;
  brandId: string;
  className?: string;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const [creating, setCreating] = useState(false);
  const newBoardName = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creating) newBoardName.current?.focus();
  }, [creating]);
  const [name, setName] = useState('');
  const create = useCreateBoard(brandId);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const board = await create.mutateAsync({ name: trimmed });
      setName('');
      setCreating(false);
      onSelect(board.id);
    } catch {
      /* The mutation retains the diagnostic; its localized state renders below. */
    }
  }

  return (
    <aside className={cn('flex flex-col gap-1', className)}>
      <div className="mb-1 hidden items-baseline justify-between px-2.5 md:flex">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {uiText('boards_4fcd39d')}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatCompetitorNumber(boards.length, uiLocale)}
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
        {boards.map((board) => {
          const active = board.id === selectedId;
          return (
            <button
              key={board.id}
              type="button"
              onClick={() => onSelect(board.id)}
              aria-current={active}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                'min-w-44 md:min-w-0 md:w-full',
                active ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn('block truncate text-sm text-foreground', active && 'font-medium')}
                >
                  {board.name}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {uiText('m_8054321f35', { count: board.itemCount })}
                </span>
              </span>
            </button>
          );
        })}

        {creating ? (
          <div className="flex shrink-0 items-center gap-1 px-2.5 py-1 md:w-full">
            <input
              ref={newBoardName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setName('');
                }
              }}
              placeholder={uiText('board_name_6fec762')}
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30"
            />
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {uiText('add_9fd728c')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground md:w-full"
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none">
              +
            </span>
            <span className="truncate">{uiText('new_board_b342201')}</span>
          </button>
        )}
      </div>
      {create.error ? (
        <p role="alert" className="text-xs text-destructive">
          {formatUiError(create.error)}
        </p>
      ) : null}
    </aside>
  );
}

export function BoardsPanel({ brandId }: { brandId: string }) {
  const uiText = useTranslations('competitor');
  const formatUiError = useUiErrorMessage();
  const { data: boards } = useSavedBoards(brandId);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { data: items } = useBoardItems(selectedId);
  const del = useDeleteBoard(brandId);
  const removeItem = useRemoveBoardItem(brandId);

  useEffect(() => {
    if (!boards) return;
    if (selectedId && boards.some((b) => b.id === selectedId)) return;
    setSelectedId(boards[0]?.id);
  }, [boards, selectedId]);

  const list = boards ?? [];
  const selected = list.find((b) => b.id === selectedId);

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        <BoardRail
          boards={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          brandId={brandId}
          className={RAIL_CLASS}
        />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{uiText('no_boards_yet_15d9e27')}</p>
          <p className="text-xs text-muted-foreground">
            {uiText('create_a_board_then_save_competitor_ads_and_p_3434daf')}
          </p>
        </div>
      </div>
    );
  }

  const savedItems = items ?? [];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-5">
      <BoardRail
        boards={list}
        selectedId={selectedId}
        onSelect={setSelectedId}
        brandId={brandId}
        className={RAIL_CLASS}
      />
      <div className="min-w-0 flex-1 space-y-4">
        {del.error || removeItem.error ? (
          <p role="alert" className="text-xs text-destructive">
            {formatUiError(del.error ?? removeItem.error)}
          </p>
        ) : null}
        {selected ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{selected.name}</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {uiText('m_8054321f35', { count: selected.itemCount })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(uiText('m_07eb4d79fb', { name: selected.name }))) {
                  del.mutate(selected.id);
                  setSelectedId(undefined);
                }
              }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              {uiText('delete_board_e07a0c4')}
            </button>
          </div>
        ) : null}

        {savedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">{uiText('this_board_is_empty_5c97c22')}</p>
            <p className="text-xs text-muted-foreground">
              {uiText('use_save_on_an_ad_or_post_to_add_it_here_4248b0d')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {savedItems.map((item) => (
              <SavedItemCard
                key={item.id}
                item={item}
                onRemove={() => removeItem.mutate({ boardId: item.boardId, itemId: item.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
