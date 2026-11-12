'use client';

import type { SaveItemRequest } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatCompetitorNumber } from '@/components/competitor-spy/brandVisuals';
import { boardSaveErrorState } from '@/components/competitors/competitorErrorCopy';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useCreateBoard, useSavedBoards, useSaveItemToBoard } from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';

// Minimalist "save this ad/post to a board" affordance: a hairline button that
// opens a board picker (filter existing boards or type a new name to create one).
export function SaveToBoardButton({
  brandId,
  request,
  className,
}: {
  brandId: string;
  request: SaveItemRequest;
  className?: string;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('competitor');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<
    'saving' | 'creating' | 'already_saved' | 'save_failed' | 'create_failed' | null
  >(null);
  const { data: boards } = useSavedBoards(brandId);
  const save = useSaveItemToBoard(brandId);
  const create = useCreateBoard(brandId);

  const list = boards ?? [];
  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 && !list.some((b) => b.name.toLowerCase() === trimmed.toLowerCase());

  async function saveTo(boardId: string): Promise<void> {
    setStatus('saving');
    try {
      await save.mutateAsync({ boardId, body: request });
      setOpen(false);
      setQuery('');
      setStatus(null);
    } catch (error) {
      setStatus(boardSaveErrorState(error));
    }
  }

  async function createAndSave(name: string): Promise<void> {
    setStatus('creating');
    try {
      const board = await create.mutateAsync({ name });
      await save.mutateAsync({ boardId: board.id, body: request });
      setOpen(false);
      setQuery('');
      setStatus(null);
    } catch {
      setStatus('create_failed');
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setStatus(null);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground',
              className,
            )}
          >
            <span className="text-sm leading-none">+</span>
            {uiText('m_efc007a393')}
          </button>
        }
      />
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={uiText('save_to_board_5ff03b5')}
          />
          <CommandList>
            <CommandEmpty>{uiText('type_a_name_to_create_a_board_3241ba8')}</CommandEmpty>
            {list.length > 0 ? (
              <CommandGroup heading={uiText('boards_4fcd39d')}>
                {list.map((board) => (
                  <CommandItem
                    key={board.id}
                    value={board.name}
                    onSelect={() => void saveTo(board.id)}
                  >
                    <span className="truncate">{board.name}</span>
                    <CommandShortcut className="font-mono tabular-nums">
                      {formatCompetitorNumber(board.itemCount, uiLocale)}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canCreate ? (
              <CommandGroup heading={uiText('m_6e157c5da4')}>
                <CommandItem
                  value={`create ${trimmed}`}
                  onSelect={() => void createAndSave(trimmed)}
                >
                  <span className="text-sm leading-none">+</span>
                  <span className="truncate">
                    {uiText.rich('sentence_2866d180a389', {
                      v0: () => trimmed,
                    })}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
        {status ? (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            {localizeCompetitorCopy(
              status === 'saving'
                ? 'Saving…'
                : status === 'creating'
                  ? 'Creating…'
                  : status === 'already_saved'
                    ? 'Already on this board'
                    : status === 'save_failed'
                      ? 'Save failed'
                      : 'Create failed',
              uiText,
            )}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
