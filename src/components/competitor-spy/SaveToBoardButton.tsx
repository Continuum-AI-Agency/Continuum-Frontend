'use client';

import type { SaveItemRequest } from '@continuum/contracts';
import { useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const { data: boards } = useSavedBoards(brandId);
  const save = useSaveItemToBoard(brandId);
  const create = useCreateBoard(brandId);

  const list = boards ?? [];
  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 && !list.some((b) => b.name.toLowerCase() === trimmed.toLowerCase());

  async function saveTo(boardId: string): Promise<void> {
    setStatus('Saving…');
    try {
      await save.mutateAsync({ boardId, body: request });
      setOpen(false);
      setQuery('');
      setStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      setStatus(message.includes('409') ? 'Already on this board' : 'Save failed');
    }
  }

  async function createAndSave(name: string): Promise<void> {
    setStatus('Creating…');
    try {
      const board = await create.mutateAsync({ name });
      await save.mutateAsync({ boardId: board.id, body: request });
      setOpen(false);
      setQuery('');
      setStatus(null);
    } catch {
      setStatus('Create failed');
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
            <span className="text-sm leading-none">+</span> Save
          </button>
        }
      />
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Save to board…" />
          <CommandList>
            <CommandEmpty>Type a name to create a board.</CommandEmpty>
            {list.length > 0 ? (
              <CommandGroup heading="Boards">
                {list.map((board) => (
                  <CommandItem
                    key={board.id}
                    value={board.name}
                    onSelect={() => void saveTo(board.id)}
                  >
                    <span className="truncate">{board.name}</span>
                    <CommandShortcut className="font-mono tabular-nums">
                      {board.itemCount}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canCreate ? (
              <CommandGroup heading="Create">
                <CommandItem
                  value={`create ${trimmed}`}
                  onSelect={() => void createAndSave(trimmed)}
                >
                  <span className="text-sm leading-none">+</span>
                  <span className="truncate">Create “{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
        {status ? (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            {status}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
